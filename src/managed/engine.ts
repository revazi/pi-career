// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { CareerInvocationError } from "../process.ts";
import { loadConfig } from "../workflow/config.ts";
import { buildJobMatchInput, buildResumeInput, serializeCoreInput } from "../workflow/core-input.ts";
import {
  parseCoreJson,
  projectJobMatch,
  projectResumeAnalysis,
  type CoreResult,
} from "../workflow/result-projection.ts";
import { eligibleOriginals, scanLibrary } from "../workflow/scan.ts";
import { createConsentEntry, reconstructWorkflowState } from "../workflow/session-state.ts";
import {
  type ResumeRecord,
  type VacancyEntry,
  type WorkflowDependencies,
  WORKFLOW_CUSTOM_TYPE,
} from "../workflow/types.ts";
import {
  ManagedContractCache,
  MANAGED_INVOKE_OPTIONS,
  type ManagedInvoke,
} from "./catalog.ts";
import { CareerRunError, careerRunError, managedFailure } from "./errors.ts";
import {
  parseAnalysisReplacements,
  parseAnalysisSuggestions,
  parseSelectedChangeIds,
  parseVariantChanges,
} from "./proposals.ts";
import { ManagedRegistry, type ManagedEntry } from "./registry.ts";
import {
  DETAIL_SECTIONS,
  type CareerRunDetails,
  type CareerRunParams,
  type DetailRequest,
} from "./schema.ts";

const MODEL_DETAIL_MAX_BYTES = 50_000;

export interface CareerRunEngineOptions {
  pi: ExtensionAPI;
  agentDir: string;
  invoke: ManagedInvoke;
  now: () => Date;
  uuid: () => string;
}

export interface ManagedToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: CareerRunDetails;
}

export interface VariantSelectionChange {
  change_id: string;
  section: string;
  start_line: number;
  end_line: number;
  original_text: string;
  proposed_text: string;
  resume_evidence: string[];
  vacancy_evidence: string[];
}

export interface VariantSelectionReview {
  handle: string;
  authority: "assisted_non_authoritative";
  changes: VariantSelectionChange[];
  discarded_changes: unknown[];
  warnings: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validVariantSelectionChange(value: unknown, expectedId: string): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return [
    value.change_id === expectedId,
    typeof value.section === "string",
    Number.isSafeInteger(value.start_line),
    Number.isSafeInteger(value.end_line),
    typeof value.original_text === "string",
    typeof value.proposed_text === "string",
    stringArray(value.resume_evidence),
    stringArray(value.vacancy_evidence),
  ].every(Boolean);
}

function variantSelectionChange(value: unknown, expectedId: string): VariantSelectionChange | undefined {
  if (!validVariantSelectionChange(value, expectedId)) return undefined;
  return {
    change_id: expectedId,
    section: value.section as string,
    start_line: value.start_line as number,
    end_line: value.end_line as number,
    original_text: value.original_text as string,
    proposed_text: value.proposed_text as string,
    resume_evidence: [...value.resume_evidence as string[]],
    vacancy_evidence: [...value.vacancy_evidence as string[]],
  };
}

function arrayField(value: CoreResult, field: string): unknown[] {
  const found = value[field];
  if (!Array.isArray(found)) throw careerRunError("managed_result_invalid");
  return found;
}

function warnings(value: CoreResult): unknown[] {
  return arrayField(value, "warnings");
}

function exactDefinedKeys(params: CareerRunParams, allowed: readonly string[]): void {
  const keys = Object.entries(params).filter(([, value]) => value !== undefined).map(([key]) => key);
  if (keys.some((key) => !allowed.includes(key))) throw careerRunError("invalid_request");
}

function parseConsentDecision(payload: unknown): "approve" | "decline" {
  if (payload !== "approve" && payload !== "decline") throw careerRunError("invalid_request");
  return payload;
}

function parseMaterializeRequest(payload: unknown): string[] {
  if (!isRecord(payload) || Object.keys(payload).join("") !== "selected_change_ids") {
    throw careerRunError("invalid_request");
  }
  return parseSelectedChangeIds(payload.selected_change_ids);
}

function parseDetailRequest(payload: unknown): DetailRequest {
  if (!isRecord(payload)) throw careerRunError("invalid_request");
  const keys = Object.keys(payload).sort().join("\0");
  if (keys !== "section" && keys !== "item\0section") throw careerRunError("invalid_request");
  if (!DETAIL_SECTIONS.includes(payload.section as DetailRequest["section"])) {
    throw careerRunError("invalid_request");
  }
  if (payload.item !== undefined &&
    (typeof payload.item !== "string" || !/^(change|suggestion|replacement)-[0-9]{4}$/.test(payload.item))) {
    throw careerRunError("invalid_request");
  }
  return {
    section: payload.section as DetailRequest["section"],
    ...(payload.item === undefined ? {} : { item: payload.item as string }),
  };
}

function resultEnvelope(
  command: string,
  body: Record<string, unknown>,
  details: Omit<CareerRunDetails, "schema_version" | "command">,
): ManagedToolResult {
  const text = JSON.stringify({ schema_version: "pi.career.run_result.v1", command, ...body });
  if (Buffer.byteLength(text, "utf8") > MODEL_DETAIL_MAX_BYTES) {
    throw careerRunError("detail_too_large");
  }
  return {
    content: [{ type: "text", text }],
    details: { schema_version: "pi.career.run_details.v1", command, ...details },
  };
}

function resumeHandles(records: ResumeRecord[]): Map<string, ResumeRecord> {
  const shortCounts = new Map<string, number>();
  for (const record of records) {
    const short = record.id.slice(0, 16);
    shortCounts.set(short, (shortCounts.get(short) ?? 0) + 1);
  }
  return new Map(records.map((record) => {
    const short = record.id.slice(0, 16);
    const suffix = shortCounts.get(short) === 1 ? short : record.id.slice(0, 24);
    return [`resume:${suffix}`, record];
  }));
}

function persisted(ctx: ExtensionContext): boolean {
  return ctx.sessionManager.getSessionFile() !== undefined;
}

function persistenceConsent(ctx: ExtensionContext): "not_required" | "approved" | "declined" | "required" {
  if (!persisted(ctx)) return "not_required";
  const consent = reconstructWorkflowState(ctx.sessionManager.getBranch()).consent;
  if (consent?.granted === true) return "approved";
  if (consent?.granted === false) return "declined";
  return "required";
}

function requireConsent(ctx: ExtensionContext): void {
  const consent = persistenceConsent(ctx);
  if (consent === "required") throw careerRunError("consent_required");
  if (consent === "declined") throw careerRunError("consent_declined");
}

async function currentResumes(agentDir: string): Promise<Map<string, ResumeRecord>> {
  const config = await loadConfig(agentDir);
  const scan = await scanLibrary(config);
  return resumeHandles(eligibleOriginals(scan));
}

async function resolveResume(
  agentDir: string,
  ctx: ExtensionContext,
  registry: ManagedRegistry,
  handle: string | undefined,
): Promise<ResumeRecord> {
  if (!registry.hasContext(ctx.sessionManager.getSessionId())) throw careerRunError("context_required");
  if (handle === undefined) throw careerRunError("invalid_request");
  const resume = (await currentResumes(agentDir)).get(handle);
  if (resume === undefined) throw careerRunError("resume_not_found");
  return resume;
}

function resolveVacancy(ctx: ExtensionContext): VacancyEntry {
  const vacancy = reconstructWorkflowState(ctx.sessionManager.getBranch()).vacancy;
  if (vacancy === undefined) throw careerRunError("vacancy_not_found");
  return vacancy;
}

function ensureSchema(value: CoreResult, schema: string): void {
  if (value.schema_version !== schema) throw careerRunError("managed_result_invalid");
}

function safeSummary(value: unknown): string {
  return typeof value === "number" || typeof value === "string" ? String(value) : "complete";
}

function compactAnalyze(result: CoreResult): Record<string, unknown> {
  const projection = projectResumeAnalysis(result);
  return {
    result_schema: result.schema_version,
    overall_score: projection.summary.overall_score,
    category_scores: projection.summary.category_scores,
    confidence_context: projection.summary.confidence_context,
    top_strengths: projection.summary.top_strengths,
    top_weaknesses: projection.summary.top_weaknesses,
    improvement_actions: projection.summary.improvement_actions,
    warnings: warnings(result),
  };
}

function compactMatch(result: CoreResult): Record<string, unknown> {
  const projection = projectJobMatch(result);
  return {
    result_schema: result.schema_version,
    overall_score: projection.summary.overall_score,
    category_scores: projection.summary.category_scores,
    confidence_context: projection.summary.confidence_context,
    top_strengths: projection.summary.top_strengths,
    top_gaps: projection.summary.top_gaps,
    recommendation: projection.summary.recommendation,
    warnings: warnings(result),
  };
}

function validateAuthority(result: CoreResult): void {
  if (result.authority !== "assisted_non_authoritative") {
    throw careerRunError("managed_result_invalid");
  }
}

function compactSuggestionReview(result: CoreResult): Record<string, unknown> {
  ensureSchema(result, "career.resume_analysis_suggestion_review.v1");
  validateAuthority(result);
  return {
    result_schema: result.schema_version,
    authority: result.authority,
    suggestions: arrayField(result, "suggestions"),
    discarded_suggestions: arrayField(result, "discarded_suggestions"),
    warnings: warnings(result),
  };
}

function compactReplacementReview(result: CoreResult): Record<string, unknown> {
  ensureSchema(result, "career.resume_analysis_replacement_review.v1");
  validateAuthority(result);
  return {
    result_schema: result.schema_version,
    authority: result.authority,
    replacements: arrayField(result, "replacements"),
    discarded_replacements: arrayField(result, "discarded_replacements"),
    warnings: warnings(result),
  };
}

function compactCanonicalChanges(changes: unknown[]): unknown[] {
  return changes.map((change) => isRecord(change) ? {
    change_id: change.change_id,
    section: change.section,
    start_line: change.start_line,
    end_line: change.end_line,
  } : change);
}

function compactVariantReview(result: CoreResult): Record<string, unknown> {
  ensureSchema(result, "career.resume_variant_review.v1");
  validateAuthority(result);
  const changes = arrayField(result, "changes");
  return {
    result_schema: result.schema_version,
    authority: result.authority,
    retained_change_count: changes.length,
    changes: compactCanonicalChanges(changes),
    discarded_changes: arrayField(result, "discarded_changes"),
    warnings: warnings(result),
    detail_guidance: "Use career_run detail with section=changes; add item=change-NNNN for one exact canonical change.",
  };
}

function compactVariant(result: CoreResult): Record<string, unknown> {
  ensureSchema(result, "career.resume_variant.v1");
  validateAuthority(result);
  const selected = arrayField(result, "selected_changes");
  return {
    result_schema: result.schema_version,
    authority: result.authority,
    selected_change_count: selected.length,
    selected_changes: compactCanonicalChanges(selected),
    warnings: warnings(result),
    detail_guidance: "Use career_run detail with section=document for assisted text or section=changes plus an item for one canonical change.",
  };
}

function evidenceDetail(value: CoreResult): unknown {
  const analysis = isRecord(value.baseline_analysis) ? value.baseline_analysis : value;
  const checks = isRecord(analysis) && Array.isArray(analysis.checks) ? analysis.checks : [];
  return checks.flatMap((check) => isRecord(check) && Array.isArray(check.evidence)
    ? [{ check_id: check.check_id, evidence: check.evidence }]
    : []);
}

const DETAIL_SUMMARIES: Readonly<Record<string, (value: CoreResult) => Record<string, unknown>>> = {
  "resume.analyze": compactAnalyze,
  "job.match": compactMatch,
  "resume.analysis-suggestions.review": compactSuggestionReview,
  "resume.analysis-replacements.review": compactReplacementReview,
  "resume.variant.review": compactVariantReview,
  "resume.variant.materialize": compactVariant,
};

function analysisChecks(value: CoreResult): unknown[] {
  const analysis = isRecord(value.baseline_analysis) ? value.baseline_analysis : value;
  return isRecord(analysis) && Array.isArray(analysis.checks) ? analysis.checks : [];
}

function reviewedItems(value: CoreResult): unknown[] {
  const items = value.changes ?? value.suggestions ?? value.replacements ?? value.selected_changes ?? [];
  if (!Array.isArray(items)) throw careerRunError("managed_result_invalid");
  return items;
}

function exactReviewedItem(items: unknown[], item: string): unknown {
  const found = items.find((candidate) => isRecord(candidate) &&
    (candidate.change_id === item || candidate.suggestion_id === item || candidate.replacement_id === item));
  if (found === undefined) throw careerRunError("result_not_found");
  return found;
}

function detailValue(entry: ManagedEntry, request: DetailRequest): unknown {
  const value = entry.value;
  if (request.section === "summary") {
    return DETAIL_SUMMARIES[entry.operation]?.(value) ?? { schema_version: value.schema_version };
  }
  if (request.section === "warnings") return warnings(value);
  if (request.section === "checks") return analysisChecks(value);
  if (request.section === "evidence") return evidenceDetail(value);
  if (request.section === "changes") {
    const items = reviewedItems(value);
    return request.item === undefined ? items : exactReviewedItem(items, request.item);
  }
  if (request.section === "document") {
    return value.assisted_resume_text ?? value.proposed_preview_text ?? null;
  }
  if (request.section === "raw") return value;
  throw careerRunError("invalid_request");
}

function mapInternalError(error: unknown): never {
  if (error instanceof CareerRunError || error instanceof CareerInvocationError) throw error;
  if (error instanceof Error && error.message === "session_changed") throw careerRunError("session_changed");
  if (error instanceof Error && error.message === "managed_result_capacity") {
    throw careerRunError("managed_result_capacity");
  }
  throw managedFailure(error);
}

interface SelectableVariantReviewEntry extends ManagedEntry {
  retainedChangeIds: string[];
}

function selectableVariantReview(review: ManagedEntry | undefined): SelectableVariantReviewEntry {
  if (review === undefined) throw careerRunError("review_not_found");
  if (![review.operation === "resume.variant.review", review.retainedChangeIds !== undefined].every(Boolean)) {
    throw careerRunError("review_not_found");
  }
  if (review.materializationAllowed !== true) throw careerRunError("pdf_materialization_unsupported");
  ensureSchema(review.value, "career.resume_variant_review.v1");
  validateAuthority(review.value);
  return review as SelectableVariantReviewEntry;
}

function selectableVariantChanges(review: SelectableVariantReviewEntry): VariantSelectionChange[] {
  const values = arrayField(review.value, "changes");
  if (values.length !== review.retainedChangeIds.length) throw careerRunError("managed_result_invalid");
  const changes = values.map((value, index) =>
    variantSelectionChange(value, review.retainedChangeIds[index]!));
  if (changes.some((change) => change === undefined)) throw careerRunError("managed_result_invalid");
  return changes as VariantSelectionChange[];
}

export class CareerRunEngine {
  private readonly registry: ManagedRegistry;
  private readonly contracts = new ManagedContractCache();
  private readonly dependencies: WorkflowDependencies;

  constructor(private readonly options: CareerRunEngineOptions) {
    this.registry = new ManagedRegistry(options.uuid, options.now);
    this.dependencies = {
      agentDir: options.agentDir,
      invoke: options.invoke,
      uuid: options.uuid,
      now: options.now,
    };
  }

  enterSession(sessionId: string): void {
    this.registry.enterSession(sessionId);
  }

  resetSession(sessionId: string): void {
    this.registry.resetSession(sessionId);
  }

  shutdown(): void {
    this.registry.clear();
  }

  variantSelectionReview(handle: string, ctx: ExtensionContext): VariantSelectionReview {
    try {
      const sessionId = ctx.sessionManager.getSessionId();
      this.registry.enterSession(sessionId);
      requireConsent(ctx);
      if (!this.registry.hasContext(sessionId)) throw careerRunError("context_required");
      const review = selectableVariantReview(this.registry.get(handle, "review"));
      return {
        handle: review.handle,
        authority: "assisted_non_authoritative",
        changes: selectableVariantChanges(review),
        discarded_changes: arrayField(review.value, "discarded_changes"),
        warnings: warnings(review.value),
      };
    } catch (error) {
      mapInternalError(error);
    }
  }

  async run(params: CareerRunParams, signal: AbortSignal | undefined, ctx: ExtensionContext): Promise<ManagedToolResult> {
    try {
      this.registry.enterSession(ctx.sessionManager.getSessionId());
      exactDefinedKeys(params, ["command", "handle", "payload"]);
      const managed = await this.contracts.load(this.options.invoke, signal);
      switch (params.command) {
        case "context": return await this.context(params, ctx, managed.coreVersion);
        case "consent": return this.consent(params, ctx);
        case "analyze": return await this.analyze(params, signal, ctx);
        case "match": return await this.match(params, signal, ctx);
        case "suggestion-review": return await this.suggestionReview(params, signal, ctx);
        case "replacement-review": return await this.replacementReview(params, signal, ctx);
        case "variant-review": return await this.variantReview(params, signal, ctx);
        case "materialize": return await this.materialize(params, signal, ctx);
        case "detail": return this.detail(params, ctx);
      }
    } catch (error) {
      mapInternalError(error);
    }
  }

  private consent(params: CareerRunParams, ctx: ExtensionContext): ManagedToolResult {
    exactDefinedKeys(params, ["command", "payload"]);
    if (!persisted(ctx)) throw careerRunError("invalid_request");
    const granted = parseConsentDecision(params.payload) === "approve";
    this.options.pi.appendEntry(
      WORKFLOW_CUSTOM_TYPE,
      createConsentEntry(granted, this.dependencies),
    );
    if (!granted) this.registry.resetSession(ctx.sessionManager.getSessionId());
    return resultEnvelope("consent", {
      persistence: "persistent",
      consent: granted ? "approved" : "declined",
      next_action: granted ? "Run career_run context." : "Start a new `pi --no-session` run.",
    }, {
      status: "complete",
      summary: granted ? "Session persistence approved" : "Session persistence declined",
    });
  }

  private async context(
    params: CareerRunParams,
    ctx: ExtensionContext,
    coreVersion: string,
  ): Promise<ManagedToolResult> {
    exactDefinedKeys(params, ["command"]);
    const consent = persistenceConsent(ctx);
    if (consent === "required" || consent === "declined") {
      return this.consentRequiredContext(coreVersion, consent);
    }
    const config = await loadConfig(this.options.agentDir);
    const scan = await scanLibrary(config);
    const resumes = resumeHandles(eligibleOriginals(scan));
    const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
    this.registry.markContextReady(ctx.sessionManager.getSessionId());
    return resultEnvelope("context", {
      core_version: coreVersion,
      persistence: persisted(ctx) ? "persistent" : "transient",
      consent,
      resume_count: resumes.size,
      resumes: [...resumes].slice(0, 100).map(([handle, resume]) => ({
        handle, label: resume.label, format: resume.format,
      })),
      resumes_omitted: Math.max(0, resumes.size - 100),
      vacancy: state.vacancy === undefined
        ? null
        : { handle: "vacancy:current", label: state.vacancy.vacancy_label },
      application: state.application === undefined
        ? null
        : { company: state.application.company_label, role: state.application.role_label },
      notices: scan.warnings.length,
    }, {
      status: "ready",
      summary: `${resumes.size} original resume${resumes.size === 1 ? "" : "s"}`,
    });
  }

  private consentRequiredContext(
    coreVersion: string,
    consent: "required" | "declined",
  ): ManagedToolResult {
    return resultEnvelope("context", {
      core_version: coreVersion,
      persistence: "persistent",
      consent: consent === "required" ? "consent_required" : "declined",
      resumes: [],
      next_action: consent === "required"
        ? "Ask whether this Pi session may persist private career content, then call career_run consent. Recommend `pi --no-session` when persistence is unwanted."
        : "Start a new `pi --no-session` run.",
    }, {
      status: "consent_required",
      summary: consent === "required" ? "Persistence decision required" : "Persistence declined",
    });
  }

  private preparePrivateCommand(params: CareerRunParams, ctx: ExtensionContext): void {
    requireConsent(ctx);
    if (!this.registry.hasContext(ctx.sessionManager.getSessionId())) {
      throw careerRunError("context_required");
    }
  }

  private async analyze(
    params: CareerRunParams,
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ): Promise<ManagedToolResult> {
    exactDefinedKeys(params, ["command", "handle"]);
    this.preparePrivateCommand(params, ctx);
    const resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle);
    const invocation = await this.options.invoke(
      { kind: "resume", operation: "analyze", inputJson: serializeCoreInput(buildResumeInput(resume)) },
      signal,
      MANAGED_INVOKE_OPTIONS,
    );
    const value = parseCoreJson(invocation.json);
    ensureSchema(value, "career.resume_analysis.v1");
    const entry = this.registry.store({
      kind: "result", operation: "resume.analyze", json: invocation.json, value,
    });
    const summary = compactAnalyze(value);
    return resultEnvelope("analyze", { result: entry.handle, ...summary }, {
      status: "complete", handle: entry.handle,
      summary: `Score ${safeSummary(summary.overall_score)}`,
    });
  }

  private async match(
    params: CareerRunParams,
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ): Promise<ManagedToolResult> {
    exactDefinedKeys(params, ["command", "handle"]);
    this.preparePrivateCommand(params, ctx);
    const resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle);
    const vacancy = resolveVacancy(ctx);
    const invocation = await this.options.invoke(
      { kind: "job", operation: "match", inputJson: serializeCoreInput(buildJobMatchInput(resume, vacancy)) },
      signal,
      MANAGED_INVOKE_OPTIONS,
    );
    const value = parseCoreJson(invocation.json);
    ensureSchema(value, "career.job_match.v1");
    const entry = this.registry.store({
      kind: "result", operation: "job.match", json: invocation.json, value,
    });
    const summary = compactMatch(value);
    return resultEnvelope("match", { result: entry.handle, ...summary }, {
      status: "complete", handle: entry.handle,
      summary: `Match ${safeSummary(summary.overall_score)}`,
    });
  }

  private async suggestionReview(
    params: CareerRunParams,
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ): Promise<ManagedToolResult> {
    exactDefinedKeys(params, ["command", "handle", "payload"]);
    this.preparePrivateCommand(params, ctx);
    const resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle);
    const input = {
      schema_version: "career.resume_analysis_suggestion_review_input.v1",
      expected_analysis_policy_version: "resume_analysis_v1",
      resume: buildResumeInput(resume),
      proposal: {
        schema_version: "career.resume_analysis_suggestion_proposal.v1",
        suggestions: parseAnalysisSuggestions(params.payload),
      },
    };
    const invocation = await this.options.invoke(
      { kind: "resume", operation: "analysis-suggestions-review", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS,
    );
    const value = parseCoreJson(invocation.json);
    const summary = compactSuggestionReview(value);
    const entry = this.registry.store({
      kind: "review", operation: "resume.analysis-suggestions.review", json: invocation.json, value,
    });
    return resultEnvelope("suggestion-review", { review: entry.handle, ...summary }, {
      status: "complete", handle: entry.handle,
      summary: `${arrayField(value, "suggestions").length} retained suggestion(s)`,
    });
  }

  private async replacementReview(
    params: CareerRunParams,
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ): Promise<ManagedToolResult> {
    exactDefinedKeys(params, ["command", "handle", "payload"]);
    this.preparePrivateCommand(params, ctx);
    const resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle);
    const input = {
      schema_version: "career.resume_analysis_replacement_review_input.v1",
      expected_analysis_policy_version: "resume_analysis_v1",
      resume: buildResumeInput(resume),
      proposal: {
        schema_version: "career.resume_analysis_replacement_proposal.v1",
        replacements: parseAnalysisReplacements(params.payload),
      },
    };
    const invocation = await this.options.invoke(
      { kind: "resume", operation: "analysis-replacements-review", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS,
    );
    const value = parseCoreJson(invocation.json);
    const summary = compactReplacementReview(value);
    const entry = this.registry.store({
      kind: "review", operation: "resume.analysis-replacements.review", json: invocation.json, value,
    });
    return resultEnvelope("replacement-review", { review: entry.handle, ...summary }, {
      status: "complete", handle: entry.handle,
      summary: `${arrayField(value, "replacements").length} retained replacement(s)`,
    });
  }

  private async variantReview(
    params: CareerRunParams,
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ): Promise<ManagedToolResult> {
    exactDefinedKeys(params, ["command", "handle", "payload"]);
    this.preparePrivateCommand(params, ctx);
    const resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle);
    const vacancy = resolveVacancy(ctx);
    const input = {
      schema_version: "career.resume_variant_review_input.v1",
      resume: buildResumeInput(resume),
      vacancy: {
        schema_version: "career.job_input.v1",
        text: vacancy.vacancy_text,
        metadata: { document_id: vacancy.state_id },
      },
      proposal: {
        schema_version: "career.resume_variant_proposal.v1",
        changes: parseVariantChanges(params.payload),
      },
    };
    const invocation = await this.options.invoke(
      { kind: "resume", operation: "variant-review", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS,
    );
    const value = parseCoreJson(invocation.json);
    const summary = compactVariantReview(value);
    const retainedChangeIds = this.retainedChangeIds(value);
    const entry = this.registry.store({
      kind: "review", operation: "resume.variant.review", json: invocation.json, value,
      reviewInput: input, retainedChangeIds,
      materializationAllowed: resume.format !== "pdf",
    });
    return resultEnvelope("variant-review", {
      review: entry.handle,
      ...summary,
      next_action: resume.format === "pdf"
        ? "Stop this turn. Present the reviewed changes as manual-application guidance only; extracted PDF text cannot be materialized as a styled resume."
        : `Stop this turn. In TUI, ask the user to run /career-review ${entry.handle}; otherwise show exact change details and ask for explicit canonical IDs. Only a later user turn may materialize the selected IDs.`,
    }, {
      status: "complete", handle: entry.handle,
      action: resume.format === "pdf" ? "pdf_manual" : "review_select",
      summary: resume.format === "pdf"
        ? `${retainedChangeIds.length} retained change(s) • PDF manual application only`
        : `${retainedChangeIds.length} retained change(s) • explicit selection required`,
    });
  }

  private retainedChangeIds(value: CoreResult): string[] {
    const changes = arrayField(value, "changes");
    const ids = changes.flatMap((change) =>
      isRecord(change) && typeof change.change_id === "string" ? [change.change_id] : [],
    );
    if (ids.length !== changes.length || new Set(ids).size !== ids.length ||
      ids.some((id) => !/^change-[0-9]{4}$/.test(id))) throw careerRunError("managed_result_invalid");
    return ids;
  }

  private async materialize(
    params: CareerRunParams,
    signal: AbortSignal | undefined,
    ctx: ExtensionContext,
  ): Promise<ManagedToolResult> {
    exactDefinedKeys(params, ["command", "handle", "payload"]);
    this.preparePrivateCommand(params, ctx);
    if (params.handle === undefined) throw careerRunError("invalid_request");
    const review = this.registry.get(params.handle, "review");
    if (review === undefined || review.operation !== "resume.variant.review" ||
      review.reviewInput === undefined || review.retainedChangeIds === undefined) {
      throw careerRunError("review_not_found");
    }
    if (review.materializationAllowed !== true) throw careerRunError("pdf_materialization_unsupported");
    const selected = parseMaterializeRequest(params.payload);
    const retained = new Set(review.retainedChangeIds);
    if (selected.some((id) => !retained.has(id))) throw careerRunError("selection_invalid");
    const input = {
      schema_version: "career.resume_variant_materialization_input.v1",
      expected_review_policy_version: "resume_variant_review_v1",
      review_input: review.reviewInput,
      selected_change_ids: selected,
    };
    const invocation = await this.options.invoke(
      { kind: "resume", operation: "variant-materialize", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS,
    );
    const value = parseCoreJson(invocation.json);
    const summary = compactVariant(value);
    const entry = this.registry.store({
      kind: "variant", operation: "resume.variant.materialize", json: invocation.json, value,
    });
    return resultEnvelope("materialize", { variant: entry.handle, ...summary }, {
      status: "complete", handle: entry.handle,
      summary: `${selected.length} selected change(s) materialized`,
    });
  }

  private detail(params: CareerRunParams, ctx: ExtensionContext): ManagedToolResult {
    exactDefinedKeys(params, ["command", "handle", "payload"]);
    this.preparePrivateCommand(params, ctx);
    if (params.handle === undefined) throw careerRunError("invalid_request");
    const entry = this.registry.get(params.handle);
    if (entry === undefined) throw careerRunError("result_not_found");
    const request = parseDetailRequest(params.payload);
    if (request.item !== undefined && request.section !== "changes") {
      throw careerRunError("invalid_request");
    }
    const text = JSON.stringify({
      schema_version: "pi.career.run_detail.v1",
      result: entry.handle,
      operation: entry.operation,
      section: request.section,
      ...(request.item === undefined ? {} : { item: request.item }),
      complete: true,
      value: detailValue(entry, request),
    });
    if (Buffer.byteLength(text, "utf8") > MODEL_DETAIL_MAX_BYTES) {
      throw careerRunError("detail_too_large");
    }
    return {
      content: [{ type: "text", text }],
      details: {
        schema_version: "pi.career.run_details.v1",
        command: "detail",
        status: "complete",
        handle: entry.handle,
        summary: `${entry.operation} ${request.section}`,
      },
    };
  }
}
