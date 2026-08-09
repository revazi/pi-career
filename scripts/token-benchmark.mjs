#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { getEncoding } from "js-tiktoken";

import careerExtension from "../src/index.ts";
import { buildWorkbenchPrompt } from "../src/workflow/workbench.ts";

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

function syntheticWorkbenchPrompt() {
  const resume = {
    id: "1".repeat(64), root_id: "2".repeat(64), path: "/synthetic/resume.md",
    relative_path: "resume.md", label: "Synthetic Resume", kind: "original",
    format: "markdown", modified_at: "2026-01-01T00:00:00Z", size_bytes: 100,
    text: "Synthetic resume content\nTypeScript testing", text_sha256: "3".repeat(64),
  };
  const vacancy = {
    schema_version: "pi.career.workflow_state.v1", kind: "vacancy",
    state_id: "00000000-0000-4000-8000-000000000001",
    created_at: "2026-01-01T00:00:00Z", vacancy_label: "Synthetic vacancy",
    vacancy_text: "Synthetic vacancy\nTesting required", vacancy_text_sha256: "4".repeat(64),
    source: "paste",
  };
  return buildWorkbenchPrompt(
    resume, vacancy, undefined, "tailor", "Create a variation.", "~/career/variants",
  );
}

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

const syntheticManagedReview = JSON.stringify({
  schema_version: "pi.career.run_result.v1",
  command: "variant-review",
  review: "review:00000000-0000-4000",
  result_schema: "career.resume_variant_review.v1",
  authority: "assisted_non_authoritative",
  retained_change_count: 2,
  changes: [
    { change_id: "change-0001", section: "summary", start_line: 3, end_line: 3 },
    { change_id: "change-0002", section: "experience", start_line: 6, end_line: 6 },
  ],
  discarded_changes: [],
  warnings: [
    { code: "assisted_content_non_authoritative", message: "Assisted content is non-authoritative." },
    { code: "evidence_occurrence_not_factual_certification", message: "Evidence occurrence is not factual certification." },
    { code: "deterministic_baseline_preserved", message: "The deterministic baseline is preserved." },
  ],
  detail_guidance: "Use career_run detail with section=changes; add item=change-NNNN for one exact canonical change.",
});

export function collectTokenBenchmark() {
  const encoder = getEncoding("o200k_base");
  const tokens = (value) => encoder.encode(typeof value === "string" ? value : JSON.stringify(value, null, 2)).length;
  const tools = captureTools();
  const managed = tools.find(({ name }) => name === "career_run");
  const raw = tools.filter(({ name }) => name.startsWith("career_core_"));
  if (!managed || raw.length !== 3) throw new Error("unexpected career tool surface");
  return {
    schema_version: "pi.career.token_benchmark.v1",
    encoding: "o200k_base",
    tokenizer: { implementation: "js-tiktoken", version: "1.0.21" },
    measurements: {
      "tool-contract/career-run-active": tokens(toolContract(managed)),
      "tool-contract/raw-three-inactive": tokens(raw.map(toolContract)),
      "tool-contract/all-registered": tokens(tools.map(toolContract)),
      "tool-result/synthetic-analyze": tokens(syntheticManagedAnalyze),
      "tool-result/synthetic-variant-review": tokens(syntheticManagedReview),
      "editor-prompt/synthetic-workbench": tokens(syntheticWorkbenchPrompt()),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = collectTokenBenchmark();
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error("--output requires a path");
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
