// SPDX-License-Identifier: MIT OR Apache-2.0

import { sha256 } from "./scan.ts";
import {
  RESULT_PROJECTION_SCHEMA,
  type ResultCardEntry,
  type ResultProjection,
  type ResumeRecord,
  type VacancyEntry,
  WORKFLOW_STATE_SCHEMA,
  workflowError,
} from "./types.ts";

export type CoreResult = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberField(value: Record<string, unknown>, field: string): number {
  const found = value[field];
  if (typeof found !== "number" || !Number.isFinite(found)) throw workflowError("core_result_invalid");
  return found;
}

function recordField(value: Record<string, unknown>, field: string): Record<string, unknown> {
  const found = value[field];
  if (!isRecord(found)) throw workflowError("core_result_invalid");
  return found;
}

function arrayField(value: Record<string, unknown>, field: string): unknown[] {
  const found = value[field];
  if (!Array.isArray(found)) throw workflowError("core_result_invalid");
  return found;
}

function compactObjects(value: unknown[], fields: string[], maximum: number): Record<string, unknown>[] {
  return value.slice(0, maximum).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const selected: Record<string, unknown> = {};
    for (const field of fields) {
      if (candidate[field] !== undefined) selected[field] = candidate[field];
    }
    return [selected];
  });
}

function compactWarnings(value: unknown[]): Record<string, unknown>[] {
  return compactObjects(value, ["code", "message", "related_fields", "related_categories"], 3);
}

function parseConfidencePreview(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || typeof value.label !== "string" || typeof value.score !== "number") {
    throw workflowError("core_result_invalid");
  }
  return { label: value.label, score: value.score };
}

export function parseCoreJson(json: string): CoreResult {
  try {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value)) throw workflowError("core_result_invalid");
    return value;
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("core_result_invalid");
  }
}

export function projectResumeAnalysis(result: CoreResult): ResultProjection {
  if (result.schema_version !== "career.resume_analysis.v1") throw workflowError("core_result_invalid");
  const checks = arrayField(result, "checks");
  const confidence = recordField(result, "confidence_context");
  const parseConfidence = parseConfidencePreview(confidence.parse_confidence);
  const adjusted = checks.some((check) => isRecord(check) && check.score_adjusted === true);

  return {
    schema_version: RESULT_PROJECTION_SCHEMA,
    core_schema_version: "career.resume_analysis.v1",
    summary: {
      overall_score: numberField(result, "overall_score"),
      category_scores: recordField(result, "category_scores"),
      confidence_context: { parse_confidence: parseConfidence },
      top_strengths: compactObjects(arrayField(result, "top_strengths"), ["area", "title", "status"], 2),
      top_weaknesses: compactObjects(arrayField(result, "top_weaknesses"), ["area", "title", "status"], 2),
      improvement_actions: compactObjects(
        arrayField(result, "improvement_actions"),
        ["priority", "area", "action", "basis_check_id", "status"],
        2,
      ),
      warnings: compactWarnings(arrayField(result, "warnings")),
    },
    ui_flags: { adjusted, provisional: false, close_cluster: false, stale: false },
  };
}

export function projectJobMatch(result: CoreResult): ResultProjection {
  if (result.schema_version !== "career.job_match.v1") throw workflowError("core_result_invalid");
  const categories = arrayField(result, "category_results");
  const confidence = recordField(result, "confidence_context");
  const recommendation = recordField(result, "recommendation");
  if (typeof recommendation.label !== "string") throw workflowError("core_result_invalid");
  const provisional = confidence.is_uncertain === true;
  const adjusted = categories.some((category) => isRecord(category) && category.score_adjusted === true);

  return {
    schema_version: RESULT_PROJECTION_SCHEMA,
    core_schema_version: "career.job_match.v1",
    summary: {
      overall_score: numberField(result, "overall_score"),
      category_scores: recordField(result, "category_scores"),
      confidence_context: {
        resume_parse_confidence: parseConfidencePreview(confidence.resume_parse_confidence),
        job_parse_confidence: parseConfidencePreview(confidence.job_parse_confidence),
        is_uncertain: provisional,
      },
      top_strengths: compactObjects(
        arrayField(result, "top_strengths"),
        ["category", "item", "status", "match_type"],
        2,
      ),
      top_gaps: compactObjects(arrayField(result, "top_gaps"), ["category", "item", "status"], 2),
      recommendation: compactObjects([recommendation], ["label", "status"], 1)[0] ?? {},
      warnings: compactWarnings(arrayField(result, "warnings")),
    },
    ui_flags: { adjusted, provisional, close_cluster: false, stale: false },
  };
}

interface CardOptions {
  workflow: "analyze" | "match";
  applicationId?: string;
  runId: string;
  resume: ResumeRecord;
  vacancy?: VacancyEntry;
  projection: ResultProjection;
  uuid: () => string;
  now: () => Date;
}

export function createResultCard(options: CardOptions): ResultCardEntry {
  return {
    schema_version: WORKFLOW_STATE_SCHEMA,
    kind: "result_card",
    ...(options.applicationId === undefined ? {} : { application_id: options.applicationId }),
    state_id: options.uuid(),
    created_at: options.now().toISOString(),
    workflow: options.workflow,
    run_id: options.runId,
    resume_id: options.resume.id,
    resume_label: options.resume.label,
    resume_path_fingerprint: sha256(options.resume.path),
    input_digests: {
      resume_text_sha256: options.resume.text_sha256,
      vacancy_text_sha256: options.vacancy?.vacancy_text_sha256 ?? sha256(""),
    },
    projection: options.projection,
  };
}

export interface RankedMatch {
  resume: ResumeRecord;
  result: CoreResult;
  projection: ResultProjection;
  overallScore: number;
  recommendation: "apply_now" | "apply_after_small_edits" | "improve_first";
  tie: boolean;
  closeCluster: boolean;
}

const RECOMMENDATION_BUCKET: Readonly<Record<RankedMatch["recommendation"], number>> = {
  apply_now: 3,
  apply_after_small_edits: 2,
  improve_first: 1,
};

function recommendationLabel(result: CoreResult): RankedMatch["recommendation"] {
  const recommendation = recordField(result, "recommendation").label;
  if (
    recommendation !== "apply_now" &&
    recommendation !== "apply_after_small_edits" &&
    recommendation !== "improve_first"
  ) throw workflowError("core_result_invalid");
  return recommendation;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function rankMatches(
  values: Array<{ resume: ResumeRecord; result: CoreResult; projection?: ResultProjection }>,
): RankedMatch[] {
  const ranked = values.map(({ resume, result, projection }) => ({
    resume,
    result,
    projection: projection ?? projectJobMatch(result),
    overallScore: numberField(result, "overall_score"),
    recommendation: recommendationLabel(result),
    tie: false,
    closeCluster: false,
  }));
  ranked.sort((left, right) => {
    if (left.overallScore !== right.overallScore) return right.overallScore - left.overallScore;
    const bucket = RECOMMENDATION_BUCKET[right.recommendation] - RECOMMENDATION_BUCKET[left.recommendation];
    if (bucket !== 0) return bucket;
    const pathOrder = compareText(left.resume.path, right.resume.path);
    return pathOrder !== 0 ? pathOrder : compareText(left.resume.id, right.resume.id);
  });

  const topScore = ranked[0]?.overallScore;
  const secondScore = ranked[1]?.overallScore;
  const tie = topScore !== undefined && secondScore === topScore;
  const close = topScore !== undefined && secondScore !== undefined && topScore - secondScore <= 3;
  for (const [index, item] of ranked.entries()) {
    item.tie = tie && item.overallScore === topScore;
    item.closeCluster = close && index < 2;
    item.projection = {
      ...item.projection,
      ui_flags: { ...item.projection.ui_flags, close_cluster: item.closeCluster },
    };
  }
  return ranked;
}
