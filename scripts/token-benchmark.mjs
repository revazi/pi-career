#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getEncoding } from "js-tiktoken";

import { writeJsonOutput } from "./lib/json-output.mjs";
import careerExtension from "../src/index.ts";
import { materializeEditorText } from "../src/managed/review-selector.ts";
import {
  buildWorkbenchPrompt,
  defaultWorkbenchQuestion,
} from "../src/workflow/workbench.ts";

function captureTools() {
  const tools = [];
  let active = [];
  const pi = {
    registerTool(tool) { tools.push(tool); active.push(tool.name); },
    registerCommand() {}, registerEntryRenderer() {}, on() {}, appendEntry() {},
    getSessionName() { return undefined; }, setSessionName() {},
    getActiveTools() { return [...active]; },
    setActiveTools(names) { active = names; }, getAllTools() { return tools; },
  };
  careerExtension(pi);
  return tools;
}

function toolContract(tool) {
  return {
    name: tool.name,
    description: tool.description,
    ...(tool.promptSnippet === undefined ? {} : { promptSnippet: tool.promptSnippet }),
    ...(tool.promptGuidelines === undefined ? {} : { promptGuidelines: tool.promptGuidelines }),
    parameters: tool.parameters,
  };
}

const CAREER_SKILL_URL = new URL("../skills/career-core/SKILL.md", import.meta.url);

function skillContextSurfaces() {
  const content = readFileSync(CAREER_SKILL_URL, "utf8");
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontmatter === null) throw new Error("career-core skill lost bounded frontmatter");
  const fields = Object.fromEntries(frontmatter[1].split("\n").flatMap((line) => {
    const match = line.match(/^([a-z][a-z0-9-]*):\s*(.+)$/);
    return match === null ? [] : [[match[1], match[2]]];
  }));
  if (fields.name !== "career-core" || typeof fields.description !== "string" ||
    fields.description.length === 0 || fields["disable-model-invocation"] === "true") {
    throw new Error("career-core skill lost model-visible discovery metadata");
  }
  const discovery = [
    "<available_skills>",
    "  <skill>",
    `    <name>${fields.name}</name>`,
    `    <description>${fields.description}</description>`,
    "  </skill>",
    "</available_skills>",
  ].join("\n");
  return { discovery, content };
}

function gitTreeAtCommit(commit, treePath) {
  try {
    const value = execFileSync(
      "git",
      ["rev-parse", `${commit}:${treePath}`],
      { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (!/^[a-f0-9]{40}$/.test(value)) throw new Error("invalid tree");
    return value;
  } catch {
    throw new Error(`snapshot source ${treePath} tree is unavailable`);
  }
}

const SYNTHETIC_RESUME_TEXT = [
  "# Synthetic Resume",
  "",
  "## Summary",
  "Synthetic engineer focused on reliable systems.",
  "",
  "## Experience",
  "- Built reliable APIs.",
  "- Improved deterministic tests.",
  "",
  "## Skills",
  "TypeScript, testing, APIs",
].join("\n");

const SYNTHETIC_VACANCY_TEXT = [
  "# Synthetic Vacancy",
  "",
  "Build reliable TypeScript services.",
  "Testing and API experience required.",
].join("\n");

const SYNTHETIC_RESUME = {
  id: "1".repeat(64), root_id: "2".repeat(64), path: "/synthetic/resume.md",
  relative_path: "resume.md", label: "Synthetic Resume", kind: "original",
  format: "markdown", modified_at: "2026-01-01T00:00:00Z", size_bytes: 240,
  text: SYNTHETIC_RESUME_TEXT, text_sha256: "3".repeat(64),
};

const SYNTHETIC_VACANCY = {
  schema_version: "pi.career.workflow_state.v1", kind: "vacancy",
  state_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-01-01T00:00:00Z", vacancy_label: "Synthetic vacancy",
  vacancy_text: SYNTHETIC_VACANCY_TEXT, vacancy_text_sha256: "4".repeat(64),
  source: "paste",
};

function syntheticWorkbenchPrompt(mode) {
  const prompt = buildWorkbenchPrompt(
    SYNTHETIC_RESUME,
    mode === "tailor" ? SYNTHETIC_VACANCY : undefined,
    undefined,
    mode,
    defaultWorkbenchQuestion(mode),
    "~/career/variants",
  );
  if (prompt === undefined) throw new Error(`synthetic ${mode} workbench prompt is invalid`);
  return prompt;
}

function benchmarkToolCall(argumentsValue) {
  return { name: "career_run", arguments: argumentsValue };
}

const syntheticContextCall = benchmarkToolCall({ command: "context" });
const syntheticAnalyzeCall = benchmarkToolCall({
  command: "analyze", handle: "resume:synthetic-resume",
});
const syntheticMatchCall = benchmarkToolCall({
  command: "match", handle: "resume:synthetic-resume",
});
const syntheticSuggestionReviewCall = benchmarkToolCall({
  command: "suggestion-review",
  handle: "resume:synthetic-resume",
  payload: { suggestions: [{
    basis_check_id: "measurable_impact_in_bullets", start_line: 7, end_line: 7,
    source_target: "- Built reliable APIs.",
    source_evidence: ["- Built reliable APIs."],
    suggestion: "Add a verified outcome if one is available.",
  }] },
});
const syntheticReplacementReviewCall = benchmarkToolCall({
  command: "replacement-review",
  handle: "resume:synthetic-resume",
  payload: { replacements: [{
    basis_check_id: "measurable_impact_in_bullets", start_line: 7, end_line: 7,
    source_target: "- Built reliable APIs.",
    source_evidence: ["- Built reliable APIs.", "TypeScript, testing, APIs"],
    proposed_replacement: "- Built reliable TypeScript APIs.",
  }] },
});
const syntheticVariantReviewCall = benchmarkToolCall({
  command: "variant-review",
  handle: "resume:synthetic-resume",
  payload: { changes: [{
    section: "summary", start_line: 4, end_line: 4,
    original_text: "Synthetic engineer focused on reliable systems.",
    proposed_text: "Synthetic TypeScript engineer focused on reliable systems.",
    resume_evidence: ["Synthetic engineer focused on reliable systems."],
    vacancy_evidence: ["Build reliable TypeScript services."],
  }, {
    section: "experience", start_line: 7, end_line: 7,
    original_text: "- Built reliable APIs.",
    proposed_text: "- Built reliable TypeScript APIs.",
    resume_evidence: ["- Built reliable APIs.", "TypeScript, testing, APIs"],
    vacancy_evidence: ["Testing and API experience required."],
  }] },
});
const syntheticMaterializeCall = benchmarkToolCall({
  command: "materialize",
  handle: "review:00000000-0000-4000",
  payload: { selected_change_ids: ["change-0001", "change-0002"] },
});
const syntheticEvidenceDetailCall = benchmarkToolCall({
  command: "detail", handle: "result:00000000-0000-4000", payload: { section: "evidence" },
});
const syntheticChangeOneDetailCall = benchmarkToolCall({
  command: "detail", handle: "review:00000000-0000-4000",
  payload: { section: "changes", item: "change-0001" },
});
const syntheticChangeTwoDetailCall = benchmarkToolCall({
  command: "detail", handle: "review:00000000-0000-4000",
  payload: { section: "changes", item: "change-0002" },
});
const syntheticDocumentDetailCall = benchmarkToolCall({
  command: "detail", handle: "variant:00000000-0000-4000", payload: { section: "document" },
});

const syntheticMaterializeHandoff = materializeEditorText(
  "review:00000000-0000-4000",
  ["change-0001", "change-0002"],
);

const syntheticManagedContext = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "context",
  core_version: "0.2.0",
  persistence: "transient",
  consent: "not_required",
  resume_count: 1,
  resumes: [{ handle: "resume:synthetic-resume", label: "Synthetic Resume", format: "markdown" }],
  resumes_omitted: 0,
  vacancy: { handle: "vacancy:current", label: "Synthetic vacancy" },
  application: null,
  notices: 0,
});

const syntheticManagedAnalyze = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "analyze",
  result: "result:00000000-0000-4000",
  result_schema: "career.resume_analysis.v1",
  overall_score: 82,
  category_scores: { completeness: 82 },
  confidence_context: { parse_confidence: { label: "high", score: 95 } },
  top_strengths: [{ area: "content", title: "Synthetic strength", status: "confirmed" }],
  top_weaknesses: [{ area: "impact", title: "Synthetic weakness", status: "confirmed" }],
  improvement_actions: [{
    priority: 1, area: "impact", action: "Add grounded detail.",
    basis_check_id: "synthetic_check", status: "confirmed",
  }],
  warnings: [{ code: "synthetic_warning", message: "Synthetic warning.", related_fields: [] }],
});

const syntheticManagedMatch = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "match",
  result: "result:00000000-0000-4000",
  result_schema: "career.job_match.v1",
  overall_score: 78,
  category_scores: { skills_match: 84, experience_alignment: 72 },
  confidence_context: {
    resume_parse_confidence: { label: "high", score: 94 },
    job_parse_confidence: { label: "high", score: 93 },
    is_uncertain: false,
  },
  top_strengths: [{
    category: "skills_match", item: "TypeScript", status: "confirmed",
    match_type: "normalized_exact",
  }],
  top_gaps: [{ category: "skills_match", item: "Operations", status: "unverified" }],
  recommendation: { label: "apply_after_small_edits", status: "deterministic" },
  warnings: [{ code: "synthetic_warning", message: "Synthetic warning.", related_categories: [] }],
});

const syntheticManagedSuggestionReview = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "suggestion-review",
  review: "review:00000000-0000-4000",
  result_schema: "career.resume_analysis_suggestion_review.v1",
  authority: "assisted_non_authoritative",
  suggestions: [{
    suggestion_id: "suggestion-0001", priority: 1, area: "experience_impact",
    basis_check_id: "measurable_impact_in_bullets", status: "confirmed",
    improvement_action: "Add grounded impact.", start_line: 7, end_line: 7,
    source_target: "- Built reliable APIs.", source_evidence: ["- Built reliable APIs."],
    suggestion: "Add a verified outcome if one is available.",
  }],
  discarded_suggestions: [],
  warnings: [
    { code: "assisted_suggestions_non_authoritative", message: "Advisory only." },
    { code: "evidence_occurrence_not_factual_or_rewrite_certification", message: "Verify." },
    { code: "deterministic_analysis_preserved", message: "Preserved." },
  ],
});

const syntheticManagedReplacementReview = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "replacement-review",
  review: "review:00000000-0000-4000",
  result_schema: "career.resume_analysis_replacement_review.v1",
  authority: "assisted_non_authoritative",
  replacements: [{
    replacement_id: "replacement-0001", priority: 1, area: "experience_impact",
    basis_check_id: "measurable_impact_in_bullets", status: "confirmed",
    improvement_action: "Add grounded impact.", start_line: 7, end_line: 7,
    source_target: "- Built reliable APIs.",
    source_evidence: ["- Built reliable APIs.", "TypeScript, testing, APIs"],
    proposed_replacement: "- Built reliable TypeScript APIs.",
  }],
  discarded_replacements: [],
  warnings: [
    { code: "assisted_replacements_non_authoritative", message: "Advisory only." },
    { code: "evidence_occurrence_not_factual_or_rewrite_certification", message: "Verify." },
    { code: "deterministic_analysis_preserved", message: "Preserved." },
  ],
});

const syntheticManagedReview = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "variant-review",
  review: "review:00000000-0000-4000",
  result_schema: "career.resume_variant_review.v1",
  authority: "assisted_non_authoritative",
  retained_change_count: 2,
  changes: [
    { change_id: "change-0001", section: "summary", start_line: 4, end_line: 4 },
    { change_id: "change-0002", section: "experience", start_line: 7, end_line: 7 },
  ],
  discarded_changes: [],
  warnings: [
    { code: "assisted_content_non_authoritative", message: "Assisted content is non-authoritative." },
    { code: "evidence_occurrence_not_factual_certification", message: "Evidence occurrence is not factual certification." },
    { code: "deterministic_baseline_preserved", message: "The deterministic baseline is preserved." },
  ],
  detail_guidance: "Use career_run detail with section=changes; add item=change-NNNN for one exact canonical change.",
  next_action: "Stop this turn. In TUI, ask the user to run /career-review review:00000000-0000-4000; otherwise show exact change details and ask for explicit canonical IDs. Only a later user turn may materialize the selected IDs.",
});

const syntheticManagedMaterialize = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "materialize",
  variant: "variant:00000000-0000-4000",
  result_schema: "career.resume_variant.v1",
  authority: "assisted_non_authoritative",
  selected_change_count: 2,
  selected_changes: [
    { change_id: "change-0001", section: "summary", start_line: 4, end_line: 4 },
    { change_id: "change-0002", section: "experience", start_line: 7, end_line: 7 },
  ],
  warnings: [
    { code: "assisted_content_non_authoritative", message: "Assisted content is non-authoritative." },
    { code: "evidence_occurrence_not_factual_certification", message: "Evidence occurrence is not factual certification." },
    { code: "deterministic_baseline_preserved", message: "The deterministic baseline is preserved." },
  ],
  detail_guidance: "Use career_run detail with section=document for assisted text or section=changes plus an item for one canonical change.",
  next_action: "This assisted/non-authoritative result remains in memory. To review and save it locally, the user may run /career-save variant:00000000-0000-4000; never invoke saving as a model action.",
});

const syntheticEvidenceDetail = JSON.stringify({
  schema_version: "pi.career.run_detail.v1",
  result: "result:00000000-0000-4000",
  operation: "resume.analyze",
  section: "evidence",
  complete: true,
  value: [{
    check_id: "measurable_impact_in_bullets",
    evidence: [{
      evidence_id: "resume.analysis.measurable_impact_in_bullets.source_lines",
      kind: "source_lines",
      source: {
        start_line: 7, end_line: 7, excerpt: "- Built reliable APIs.",
        transformation: "verbatim",
      },
      value: "quantified_bullets=0; total_bullets=1",
    }],
  }],
});

const syntheticChangeOneDetail = JSON.stringify({
  schema_version: "pi.career.run_detail.v1",
  result: "review:00000000-0000-4000",
  operation: "resume.variant.review",
  section: "changes",
  item: "change-0001",
  complete: true,
  value: {
    change_id: "change-0001", section: "summary", start_line: 4, end_line: 4,
    original_text: "Synthetic engineer focused on reliable systems.",
    proposed_text: "Synthetic TypeScript engineer focused on reliable systems.",
    resume_evidence: ["Synthetic engineer focused on reliable systems."],
    vacancy_evidence: ["Build reliable TypeScript services."],
  },
});

const syntheticChangeTwoDetail = JSON.stringify({
  schema_version: "pi.career.run_detail.v1",
  result: "review:00000000-0000-4000",
  operation: "resume.variant.review",
  section: "changes",
  item: "change-0002",
  complete: true,
  value: {
    change_id: "change-0002", section: "experience", start_line: 7, end_line: 7,
    original_text: "- Built reliable APIs.",
    proposed_text: "- Built reliable TypeScript APIs.",
    resume_evidence: ["- Built reliable APIs.", "TypeScript, testing, APIs"],
    vacancy_evidence: ["Testing and API experience required."],
  },
});

const syntheticDocumentDetail = JSON.stringify({
  schema_version: "pi.career.run_detail.v1",
  result: "variant:00000000-0000-4000",
  operation: "resume.variant.materialize",
  section: "document",
  complete: true,
  value: [
    "# Synthetic Resume",
    "",
    "## Summary",
    "Synthetic TypeScript engineer focused on reliable systems.",
    "",
    "## Experience",
    "- Built reliable TypeScript APIs.",
    "- Improved deterministic tests.",
    "",
    "## Skills",
    "TypeScript, testing, APIs",
  ].join("\n"),
});

function coreProjectionFixture(managedText, omitted, additions = {}) {
  const managedValue = JSON.parse(managedText);
  return {
    ...Object.fromEntries(Object.entries(managedValue).filter(([key]) => !omitted.includes(key))),
    ...additions,
  };
}

const syntheticCoreAnalyze = coreProjectionFixture(
  syntheticManagedAnalyze,
  ["schema_version", "command", "result", "result_schema"],
  {
    schema_version: "career.resume_analysis.v1",
    checks: JSON.parse(syntheticEvidenceDetail).value.map(({ check_id: checkId, evidence }) => ({
      check_id: checkId,
      raw_score: 82,
      score: 82,
      score_adjusted: false,
      passed: true,
      outcome: "passed",
      detection_status: "detected",
      explanation: "Synthetic deterministic explanation.",
      evidence,
    })),
  },
);

const syntheticCoreMatch = coreProjectionFixture(
  syntheticManagedMatch,
  ["schema_version", "command", "result", "result_schema"],
  {
    schema_version: "career.job_match.v1",
    category_results: [{
      category: "skills_match", weight: 30, raw_score: 84, score: 84,
      score_adjusted: false, explanation: "Synthetic match.", items: [], metrics: [],
    }],
  },
);

function coreReviewFixture(managedText, schemaVersion, additions) {
  return coreProjectionFixture(
    managedText,
    ["schema_version", "command", "review", "result_schema", "retained_change_count",
      "selected_change_count", "detail_guidance", "next_action"],
    { schema_version: schemaVersion, core_version: "0.2.0", ...additions },
  );
}

const syntheticCoreSuggestionReview = coreReviewFixture(
  syntheticManagedSuggestionReview,
  "career.resume_analysis_suggestion_review.v1",
  {
    policy_version: "resume_analysis_suggestion_review_v1",
    analysis_policy_version: "resume_analysis_v1",
    baseline_analysis: syntheticCoreAnalyze,
  },
);
const syntheticCoreReplacementReview = coreReviewFixture(
  syntheticManagedReplacementReview,
  "career.resume_analysis_replacement_review.v1",
  {
    policy_version: "resume_analysis_replacement_review_v1",
    analysis_policy_version: "resume_analysis_v1",
    baseline_analysis: syntheticCoreAnalyze,
  },
);
const syntheticCoreVariantReview = coreReviewFixture(
  syntheticManagedReview,
  "career.resume_variant_review.v1",
  {
    policy_version: "resume_variant_review_v1",
    baseline_resume: { schema_version: "career.resume_input.v1", text: SYNTHETIC_RESUME_TEXT },
    proposed_preview_text: JSON.parse(syntheticDocumentDetail).value,
    changes: [
      JSON.parse(syntheticChangeOneDetail).value,
      JSON.parse(syntheticChangeTwoDetail).value,
    ],
  },
);
const syntheticCoreMaterialize = coreProjectionFixture(
  syntheticManagedMaterialize,
  ["schema_version", "command", "variant", "result_schema", "selected_change_count",
    "detail_guidance", "next_action"],
  {
    schema_version: "career.resume_variant.v1",
    policy_version: "resume_variant_review_v1",
    core_version: "0.2.0",
    baseline_resume: syntheticCoreVariantReview.baseline_resume,
    assisted_resume_text: JSON.parse(syntheticDocumentDetail).value,
    selected_changes: syntheticCoreVariantReview.changes,
  },
);

export function tokenBenchmarkParityCorpus() {
  return structuredClone({
    resumeText: SYNTHETIC_RESUME_TEXT,
    vacancy: SYNTHETIC_VACANCY,
    calls: {
      analyze: syntheticAnalyzeCall.arguments,
      match: syntheticMatchCall.arguments,
      suggestionReview: syntheticSuggestionReviewCall.arguments,
      replacementReview: syntheticReplacementReviewCall.arguments,
      variantReview: syntheticVariantReviewCall.arguments,
      materialize: syntheticMaterializeCall.arguments,
    },
    core: {
      analyze: syntheticCoreAnalyze,
      match: syntheticCoreMatch,
      suggestionReview: syntheticCoreSuggestionReview,
      replacementReview: syntheticCoreReplacementReview,
      variantReview: syntheticCoreVariantReview,
      materialize: syntheticCoreMaterialize,
    },
    managed: {
      context: syntheticManagedContext,
      analyze: syntheticManagedAnalyze,
      match: syntheticManagedMatch,
      suggestionReview: syntheticManagedSuggestionReview,
      replacementReview: syntheticManagedReplacementReview,
      variantReview: syntheticManagedReview,
      materialize: syntheticManagedMaterialize,
      evidenceDetail: syntheticEvidenceDetail,
      changeOneDetail: syntheticChangeOneDetail,
      changeTwoDetail: syntheticChangeTwoDetail,
      documentDetail: syntheticDocumentDetail,
    },
  });
}

function requireIncludes(value, expected, label) {
  if (!value.includes(expected)) throw new Error(`${label} lost required semantic marker ${expected}`);
}

function parseSurface(value, label) {
  const parsed = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function requireExactValues(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} lost required canonical values`);
  }
}

function requireWarningCodes(result, expected, label) {
  if (!Array.isArray(result.warnings)) throw new Error(`${label} lost warnings`);
  const codes = result.warnings.map((warning) => warning?.code);
  for (const code of expected) {
    if (!codes.includes(code)) throw new Error(`${label} lost required warning ${code}`);
  }
}

function requireCompleteDetail(detail, label) {
  if (detail.complete !== true || detail.value === undefined) {
    throw new Error(`${label} is no longer complete`);
  }
}

function countOccurrences(value, expected) {
  if (expected.length === 0) throw new Error("empty occurrence marker");
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(expected, offset)) >= 0) {
    count += 1;
    offset += expected.length;
  }
  return count;
}

function workflowRollup(measurements, components, metadata) {
  const componentTokens = components.map(([measurement, occurrences = 1]) => {
    const each = measurements[measurement];
    if (!Number.isSafeInteger(each) || each < 0) throw new Error(`unknown measurement ${measurement}`);
    return { measurement, occurrences, tokens: each * occurrences };
  });
  return {
    model_visible_tokens: componentTokens.reduce((sum, value) => sum + value.tokens, 0),
    components: componentTokens,
    ...metadata,
  };
}

export function collectTokenBenchmark() {
  const encoder = getEncoding("o200k_base");
  const tokens = (value) => encoder.encode(
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  ).length;
  const tools = captureTools();
  const managed = tools.find(({ name }) => name === "career_run");
  const raw = tools.filter(({ name }) => name.startsWith("career_core_"));
  if (!managed || raw.length !== 3) throw new Error("unexpected career tool surface");

  const prompts = Object.fromEntries(
    ["explain", "plan", "rewrite", "replacements", "tailor", "question"]
      .map((mode) => [mode, syntheticWorkbenchPrompt(mode)]),
  );
  const skillContext = skillContextSurfaces();
  const encodedResumeText = JSON.stringify(SYNTHETIC_RESUME_TEXT).slice(1, -1);
  for (const [mode, prompt] of Object.entries(prompts)) {
    const occurrences = countOccurrences(prompt, encodedResumeText);
    if (occurrences !== 1) {
      throw new Error(`${mode} workbench benchmark contains complete private source ${occurrences} times`);
    }
  }
  const managedContract = toolContract(managed);
  const rawNames = raw.map(({ name }) => name);
  requireExactValues(
    rawNames,
    ["career_core_discover", "career_core_resume", "career_core_job"],
    "raw compatibility tools",
  );
  const normalActiveToolNames = tools.map(({ name }) => name)
    .filter((name) => !rawNames.includes(name));
  requireExactValues(normalActiveToolNames, ["career_run"], "normal active model tools");

  const analyzeResult = parseSurface(syntheticManagedAnalyze, "analysis result");
  const matchResult = parseSurface(syntheticManagedMatch, "match result");
  const suggestionResult = parseSurface(syntheticManagedSuggestionReview, "suggestion review");
  const replacementResult = parseSurface(syntheticManagedReplacementReview, "replacement review");
  const variantReviewResult = parseSurface(syntheticManagedReview, "variant review");
  const materializeResult = parseSurface(syntheticManagedMaterialize, "materialization result");
  const evidenceDetail = parseSurface(syntheticEvidenceDetail, "evidence detail");
  const changeOneDetail = parseSurface(syntheticChangeOneDetail, "first change detail");
  const changeTwoDetail = parseSurface(syntheticChangeTwoDetail, "second change detail");
  const documentDetail = parseSurface(syntheticDocumentDetail, "document detail");

  for (const [label, result] of [
    ["suggestion review", suggestionResult],
    ["replacement review", replacementResult],
    ["variant review", variantReviewResult],
    ["materialization", materializeResult],
  ]) {
    if (result.authority !== "assisted_non_authoritative") {
      throw new Error(`${label} lost assisted/non-authoritative authority`);
    }
  }
  for (const [label, result, warnings] of [
    ["analysis result", analyzeResult, ["synthetic_warning"]],
    ["match result", matchResult, ["synthetic_warning"]],
    ["suggestion review", suggestionResult, [
      "assisted_suggestions_non_authoritative",
      "evidence_occurrence_not_factual_or_rewrite_certification",
      "deterministic_analysis_preserved",
    ]],
    ["replacement review", replacementResult, [
      "assisted_replacements_non_authoritative",
      "evidence_occurrence_not_factual_or_rewrite_certification",
      "deterministic_analysis_preserved",
    ]],
    ["variant review", variantReviewResult, [
      "assisted_content_non_authoritative",
      "evidence_occurrence_not_factual_certification",
      "deterministic_baseline_preserved",
    ]],
    ["materialization", materializeResult, [
      "assisted_content_non_authoritative",
      "evidence_occurrence_not_factual_certification",
      "deterministic_baseline_preserved",
    ]],
  ]) requireWarningCodes(result, warnings, label);

  if (analyzeResult.confidence_context?.parse_confidence === undefined ||
    matchResult.confidence_context?.resume_parse_confidence === undefined ||
    matchResult.confidence_context?.job_parse_confidence === undefined ||
    matchResult.confidence_context?.is_uncertain === undefined) {
    throw new Error("analysis/match benchmark lost confidence or uncertainty context");
  }
  requireCompleteDetail(evidenceDetail, "evidence detail");
  if (!Array.isArray(evidenceDetail.value) || !Array.isArray(evidenceDetail.value[0]?.evidence)) {
    throw new Error("evidence detail lost complete evidence records");
  }
  for (const [label, detail, expectedId] of [
    ["first change detail", changeOneDetail, "change-0001"],
    ["second change detail", changeTwoDetail, "change-0002"],
  ]) {
    requireCompleteDetail(detail, label);
    if (detail.item !== expectedId || !Array.isArray(detail.value?.resume_evidence) ||
      !Array.isArray(detail.value?.vacancy_evidence)) {
      throw new Error(`${label} lost exact evidence hydration`);
    }
  }
  requireCompleteDetail(documentDetail, "document detail");
  if (typeof documentDetail.value !== "string") throw new Error("document detail lost complete text");

  const selectedChangeIds = ["change-0001", "change-0002"];
  requireExactValues(
    variantReviewResult.changes.map(({ change_id: changeId }) => changeId),
    selectedChangeIds,
    "variant review IDs",
  );
  requireExactValues(
    syntheticMaterializeCall.arguments.payload.selected_change_ids,
    selectedChangeIds,
    "materialization call IDs",
  );
  requireExactValues(
    materializeResult.selected_changes.map(({ change_id: changeId }) => changeId),
    selectedChangeIds,
    "materialization result IDs",
  );
  for (const changeId of selectedChangeIds) {
    requireIncludes(syntheticMaterializeHandoff, changeId, "materialization handoff");
  }

  const normalToolCalls = [
    syntheticContextCall,
    syntheticAnalyzeCall,
    syntheticMatchCall,
    syntheticSuggestionReviewCall,
    syntheticReplacementReviewCall,
    syntheticVariantReviewCall,
    syntheticMaterializeCall,
    syntheticEvidenceDetailCall,
    syntheticChangeOneDetailCall,
    syntheticChangeTwoDetailCall,
    syntheticDocumentDetailCall,
  ];
  const modelVisibleSchemaDiscoveryCalls = normalToolCalls.filter(({ name, arguments: args }) =>
    name !== "career_run" || String(args.command).includes("schema"));
  if (modelVisibleSchemaDiscoveryCalls.length !== 0) {
    throw new Error("managed workflow regained model-visible schema discovery");
  }
  for (const [mode, prompt] of Object.entries(prompts)) {
    if (!/(?:do not|never)[^.\n]{0,100}(?:raw )?schema/i.test(prompt)) {
      throw new Error(`${mode} workbench prompt lost normal-workflow schema-discovery suppression`);
    }
  }

  const surfaces = {
    "skill-discovery/career-core-metadata": skillContext.discovery,
    "skill-content/career-core-full": skillContext.content,
    "tool-contract/career-run-active": managedContract,
    "tool-contract/raw-three-inactive": raw.map(toolContract),
    "tool-contract/all-registered": tools.map(toolContract),
    "tool-call/context": syntheticContextCall,
    "tool-call/analyze": syntheticAnalyzeCall,
    "tool-call/match": syntheticMatchCall,
    "tool-call/suggestion-review": syntheticSuggestionReviewCall,
    "tool-call/replacement-review": syntheticReplacementReviewCall,
    "tool-call/variant-review": syntheticVariantReviewCall,
    "tool-call/materialize": syntheticMaterializeCall,
    "tool-call/detail-evidence": syntheticEvidenceDetailCall,
    "tool-call/detail-change-0001": syntheticChangeOneDetailCall,
    "tool-call/detail-change-0002": syntheticChangeTwoDetailCall,
    "tool-call/detail-document": syntheticDocumentDetailCall,
    "tool-result/synthetic-context": syntheticManagedContext,
    "tool-result/synthetic-analyze": syntheticManagedAnalyze,
    "tool-result/synthetic-match": syntheticManagedMatch,
    "tool-result/synthetic-suggestion-review": syntheticManagedSuggestionReview,
    "tool-result/synthetic-replacement-review": syntheticManagedReplacementReview,
    "tool-result/synthetic-variant-review": syntheticManagedReview,
    "tool-result/synthetic-materialize": syntheticManagedMaterialize,
    "tool-detail/synthetic-evidence": syntheticEvidenceDetail,
    "tool-detail/synthetic-change-0001": syntheticChangeOneDetail,
    "tool-detail/synthetic-change-0002": syntheticChangeTwoDetail,
    "tool-detail/synthetic-document": syntheticDocumentDetail,
    "editor-handoff/synthetic-materialize-selection": syntheticMaterializeHandoff,
    "editor-prompt/synthetic-workbench": prompts.tailor,
    "editor-prompt/synthetic-workbench-explain": prompts.explain,
    "editor-prompt/synthetic-workbench-plan": prompts.plan,
    "editor-prompt/synthetic-workbench-rewrite": prompts.rewrite,
    "editor-prompt/synthetic-workbench-replacements": prompts.replacements,
    "editor-prompt/synthetic-workbench-tailor": prompts.tailor,
    "editor-prompt/synthetic-workbench-question": prompts.question,
  };
  const normalSurfaceEntries = Object.entries(surfaces)
    .filter(([name]) => name !== "tool-contract/raw-three-inactive" &&
      name !== "tool-contract/all-registered");
  const nestedInputJson = normalSurfaceEntries.some(([, value]) =>
    (typeof value === "string" ? value : JSON.stringify(value)).includes('"input_json"'));
  if (nestedInputJson) throw new Error("managed workflow regained nested input_json");

  const measurements = Object.fromEntries(
    Object.entries(surfaces).map(([name, value]) => [name, tokens(value)]),
  );

  const skillContextComponents = [
    ["skill-discovery/career-core-metadata"],
    ["skill-content/career-core-full"],
  ];
  const commonWorkflowMetadata = {
    model_visible_schema_discovery_calls: 0,
    nested_input_json: false,
    repeated_complete_private_source_bytes: 0,
    skill_discovery_metadata_occurrences: 1,
    matching_skill_full_content_occurrences: 1,
    skill_reference_content_occurrences: 0,
  };
  const workflows = {
    "managed-analysis-with-evidence": workflowRollup(measurements, [
      ...skillContextComponents,
      ["tool-contract/career-run-active"],
      ["tool-call/context"], ["tool-result/synthetic-context"],
      ["tool-call/analyze"], ["tool-result/synthetic-analyze"],
      ["tool-call/detail-evidence"], ["tool-detail/synthetic-evidence"],
    ], {
      ...commonWorkflowMetadata,
      tool_calls: 3,
      user_model_submissions: 1,
      complete_private_source_occurrences: 0,
    }),
    "managed-match": workflowRollup(measurements, [
      ...skillContextComponents,
      ["tool-contract/career-run-active"],
      ["tool-call/context"], ["tool-result/synthetic-context"],
      ["tool-call/match"], ["tool-result/synthetic-match"],
    ], {
      ...commonWorkflowMetadata,
      tool_calls: 2,
      user_model_submissions: 1,
      complete_private_source_occurrences: 0,
    }),
    "reviewed-suggestion-plan": workflowRollup(measurements, [
      ...skillContextComponents,
      ["editor-prompt/synthetic-workbench-plan"],
      ["tool-contract/career-run-active"],
      ["tool-call/context"], ["tool-result/synthetic-context"],
      ["tool-call/analyze"], ["tool-result/synthetic-analyze"],
      ["tool-call/suggestion-review"], ["tool-result/synthetic-suggestion-review"],
      ["tool-call/detail-evidence"], ["tool-detail/synthetic-evidence"],
    ], {
      ...commonWorkflowMetadata,
      tool_calls: 4,
      user_model_submissions: 1,
      complete_private_source_occurrences: 1,
    }),
    "reviewed-replacements": workflowRollup(measurements, [
      ...skillContextComponents,
      ["editor-prompt/synthetic-workbench-replacements"],
      ["tool-contract/career-run-active"],
      ["tool-call/context"], ["tool-result/synthetic-context"],
      ["tool-call/analyze"], ["tool-result/synthetic-analyze"],
      ["tool-call/replacement-review"], ["tool-result/synthetic-replacement-review"],
    ], {
      ...commonWorkflowMetadata,
      tool_calls: 3,
      user_model_submissions: 1,
      complete_private_source_occurrences: 1,
    }),
    "tailored-variant-materialization": workflowRollup(measurements, [
      ...skillContextComponents,
      ["editor-prompt/synthetic-workbench-tailor"],
      ["tool-contract/career-run-active"],
      ["tool-call/context"], ["tool-result/synthetic-context"],
      ["tool-call/analyze"], ["tool-result/synthetic-analyze"],
      ["tool-call/match"], ["tool-result/synthetic-match"],
      ["tool-call/variant-review"], ["tool-result/synthetic-variant-review"],
      ["tool-call/detail-change-0001"], ["tool-detail/synthetic-change-0001"],
      ["tool-call/detail-change-0002"], ["tool-detail/synthetic-change-0002"],
      ["editor-handoff/synthetic-materialize-selection"],
      ["tool-call/materialize"], ["tool-result/synthetic-materialize"],
      ["tool-call/detail-document"], ["tool-detail/synthetic-document"],
    ], {
      ...commonWorkflowMetadata,
      tool_calls: 8,
      user_model_submissions: 2,
      complete_private_source_occurrences: 1,
    }),
  };

  const tailoredTranscript = [
    skillContext.discovery,
    skillContext.content,
    prompts.tailor,
    JSON.stringify(syntheticContextCall), syntheticManagedContext,
    JSON.stringify(syntheticAnalyzeCall), syntheticManagedAnalyze,
    JSON.stringify(syntheticMatchCall), syntheticManagedMatch,
    JSON.stringify(syntheticVariantReviewCall), syntheticManagedReview,
    JSON.stringify(syntheticChangeOneDetailCall), syntheticChangeOneDetail,
    JSON.stringify(syntheticChangeTwoDetailCall), syntheticChangeTwoDetail,
    syntheticMaterializeHandoff,
    JSON.stringify(syntheticMaterializeCall), syntheticManagedMaterialize,
    JSON.stringify(syntheticDocumentDetailCall), syntheticDocumentDetail,
  ].join("\n");
  const completeSourceOccurrences = countOccurrences(tailoredTranscript, encodedResumeText);
  if (completeSourceOccurrences !== 1) {
    throw new Error(`tailored benchmark contains complete private source ${completeSourceOccurrences} times`);
  }
  const repeatedCompleteSourceBytes = Math.max(0, completeSourceOccurrences - 1) *
    Buffer.byteLength(SYNTHETIC_RESUME_TEXT, "utf8");
  const handoffSourceOccurrences = countOccurrences(syntheticMaterializeHandoff, encodedResumeText);
  if (handoffSourceOccurrences !== 0) {
    throw new Error("materialization handoff repeated complete private source");
  }

  return {
    schema_version: "pi.career.token_benchmark.v2",
    corpus_version: "pi.career.synthetic_model_surfaces.v2",
    surface_sha256: createHash("sha256").update(JSON.stringify(surfaces)).digest("hex"),
    encoding: "o200k_base",
    tokenizer: { implementation: "js-tiktoken", version: "1.0.21" },
    measurements,
    workflows,
    invariants: {
      model_visible_schema_discovery_calls: modelVisibleSchemaDiscoveryCalls.length,
      nested_input_json: nestedInputJson,
      raw_compatibility_tool_contract_count: rawNames.length,
      normal_active_model_tool_count: normalActiveToolNames.length,
      complete_private_source_occurrences_in_tailored_workflow: completeSourceOccurrences,
      repeated_complete_private_source_bytes_in_tailored_workflow: repeatedCompleteSourceBytes,
      materialization_handoff_complete_private_source_occurrences: handoffSourceOccurrences,
      all_workbench_prompts_include_complete_private_source_once: true,
      assisted_authority_retained: true,
      required_warning_codes_retained: true,
      confidence_uncertainty_and_evidence_retained: true,
      exact_selected_change_ids_retained: true,
      complete_detail_hydration_measured: true,
      skill_discovery_metadata_always_visible: true,
      full_skill_content_loaded_for_matching_tasks: true,
      skill_reference_content_excluded_until_requested: true,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = collectTokenBenchmark();
  const snapshotIndex = process.argv.indexOf("--snapshot");
  let outputValue = result;
  if (snapshotIndex >= 0) {
    const phase = process.argv[snapshotIndex + 1];
    const sourceCommitIndex = process.argv.indexOf("--source-commit");
    const sourceCommit = process.argv[sourceCommitIndex + 1];
    if ((phase !== "before" && phase !== "after") || !/^[a-f0-9]{40}$/.test(sourceCommit ?? "")) {
      throw new Error("--snapshot requires before|after and --source-commit with a full lowercase Git SHA");
    }
    outputValue = {
      schema_version: "pi.career.token_benchmark_snapshot.v1",
      phase,
      phase_id: "career-run-token-optimization-v1",
      source_commit: sourceCommit,
      source_trees: {
        src: gitTreeAtCommit(sourceCommit, "src"),
        skills: gitTreeAtCommit(sourceCommit, "skills"),
      },
      benchmark: result,
    };
  }
  await writeJsonOutput(outputValue);
}
