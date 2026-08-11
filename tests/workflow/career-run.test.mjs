// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { KeybindingsManager, setKeybindings, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";

import { tokenBenchmarkParityCorpus } from "../../scripts/token-benchmark.mjs";
import { MANAGED_OUTPUT_MAX_BYTES } from "../../src/managed/catalog.ts";
import { CareerRunError } from "../../src/managed/errors.ts";
import { registerCareerRun } from "../../src/managed/tool.ts";
import { addLibraryRoot, emptyConfig, loadConfig, writeConfig } from "../../src/workflow/config.ts";
import { eligibleOriginals, scanLibrary } from "../../src/workflow/scan.ts";
import { createVacancyEntry } from "../../src/workflow/session-state.ts";
import {
  makeContext,
  makeFakePi,
  matchResult,
  resumeResult,
  syntheticTextPdf,
  uuidSequence,
} from "./helpers.mjs";

const now = () => new Date("2026-08-08T20:00:00.000Z");
const FILE_NAMES = {
  "career.resume_analysis_suggestion_review_input.v1": "resume-analysis-suggestion-review-input-v1.schema.json",
  "career.resume_analysis_replacement_review_input.v1": "resume-analysis-replacement-review-input-v1.schema.json",
  "career.resume_variant_review_input.v1": "resume-variant-review-input-v1.schema.json",
  "career.resume_variant_materialization_input.v1": "resume-variant-materialization-input-v1.schema.json",
};

const operationSpecs = [
  ["core.capabilities", ["capabilities"], null, "career.capabilities.v1", null],
  ["core.operations", ["operations"], null, "career.operation_catalog.v1", null],
  ["schema.list", ["schema", "list"], null, "career.schema_catalog.v1", null],
  ["schema.export", ["schema", "export"], null, "https://json-schema.org/draft/2020-12/schema", null],
  ["schema.bundle", ["schema", "bundle"], null, "https://json-schema.org/draft/2020-12/schema", null],
  ["resume.evaluate", ["resume", "evaluate"], "career.resume_input.v1", "career.resume_evaluation.v1", 262_144],
  ["resume.analyze", ["resume", "analyze"], "career.resume_input.v1", "career.resume_analysis.v1", 262_144],
  ["resume.normalize", ["resume", "normalize"], "career.resume_input.v1", "career.resume_normalization.v1", 262_144],
  ["resume.enrich", ["resume", "enrich"], "career.resume_enrichment_input.v1", "career.resume_enrichment_result.v1", 262_144],
  ["resume.analysis-suggestions.review", ["resume", "analysis-suggestions-review"], "career.resume_analysis_suggestion_review_input.v1", "career.resume_analysis_suggestion_review.v1", 262_144],
  ["resume.analysis-replacements.review", ["resume", "analysis-replacements-review"], "career.resume_analysis_replacement_review_input.v1", "career.resume_analysis_replacement_review.v1", 262_144],
  ["resume.variant.review", ["resume", "variant-review"], "career.resume_variant_review_input.v1", "career.resume_variant_review.v1", 1_048_576],
  ["resume.variant.materialize", ["resume", "variant-materialize"], "career.resume_variant_materialization_input.v1", "career.resume_variant.v1", 1_048_576],
  ["job.normalize", ["job", "normalize"], "career.job_input.v1", "career.job_normalization.v1", 262_144],
  ["job.match", ["job", "match"], "career.job_match_input.v1", "career.job_match.v1", 1_048_576],
];

function operationCatalog() {
  return {
    schema_version: "career.operation_catalog.v1",
    core_version: "0.1.1",
    operations: operationSpecs.map(([operation_id, cli_path, input_schema_id, output_schema_id, maximum_input_bytes]) => ({
      operation_id,
      capability_id: operation_id.startsWith("schema.") || operation_id === "core.operations" ? null : operation_id,
      availability: "available",
      cli_path,
      input_transport: input_schema_id !== null
        ? "json_file_or_stdin"
        : operation_id.startsWith("schema.") && operation_id !== "schema.list"
          ? "cli_arguments"
          : "none",
      input_schema_id,
      output_schema_id,
      maximum_input_bytes,
      maximum_successful_machine_output_bytes: MANAGED_OUTPUT_MAX_BYTES,
    })),
  };
}

function schemaBundle(schemaId) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://example.invalid/${FILE_NAMES[schemaId]}`,
    type: "object",
  };
}

async function configuredAgent(temp, fileName = "resume.md", content = [
  "Morgan Lee", "SUMMARY", "Backend engineer.", "EXPERIENCE",
  "Engineer at Example", "Built reliable APIs.", "SKILLS", "TypeScript, Testing",
].join("\n")) {
  const root = path.join(temp, "library");
  const agentDir = path.join(temp, "agent");
  await mkdir(root);
  await writeFile(path.join(root, fileName), content);
  const config = await addLibraryRoot(emptyConfig(), root, "Synthetic library");
  await writeConfig(agentDir, config, uuidSequence());
  return { agentDir, root: config.library_roots[0].path };
}

function parsed(result) {
  return JSON.parse(result.content[0].text);
}

function managedInvoke(calls, operationResults = {}) {
  return async (invocation, signal, options) => {
    assert.equal(signal?.aborted, false);
    calls.push({ invocation, options });
    if (invocation.kind === "discovery" && invocation.operation === "operations") {
      return { operation: "core.operations", json: JSON.stringify(operationCatalog()) };
    }
    if (invocation.kind === "discovery" && invocation.operation === "schema-bundle") {
      return { operation: "schema.bundle", json: JSON.stringify(schemaBundle(invocation.schemaId)) };
    }
    const key = `${invocation.kind}.${invocation.operation}`;
    const result = operationResults[key];
    if (typeof result === "function") return result(invocation);
    if (result !== undefined) return { operation: key, json: JSON.stringify(result) };
    throw new Error(`Unexpected invocation: ${key}`);
  };
}

async function runTool(tool, params, ctx, updates = []) {
  return tool.execute("synthetic-tool-call", params, new AbortController().signal, (update) => updates.push(update), ctx);
}

function assertManagedSurfaceParity(result, expected, replacements = []) {
  let actual = result.content[0].text;
  for (const [from, to] of replacements) actual = actual.replaceAll(from, to);
  assert.equal(actual, expected);
}

test("token benchmark managed result/detail fixtures match career_run serialization", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-token-parity-"));
  try {
    const corpus = tokenBenchmarkParityCorpus();
    const { agentDir } = await configuredAgent(temp, "Synthetic Resume.md", corpus.resumeText);
    const fake = makeFakePi();
    const vacancy = {
      ...createVacancyEntry(corpus.vacancy.vacancy_text, "paste", { uuid: uuidSequence(), now }),
      vacancy_label: corpus.vacancy.vacancy_label,
    };
    fake.entries.push({
      type: "custom", customType: "career.workflow", data: vacancy,
      id: "vacancy", parentId: null, timestamp: vacancy.created_at,
    });
    let registryId = 0;
    registerCareerRun(fake.api, {
      agentDir,
      uuid: () => `${String(++registryId).padStart(8, "0")}-0000-4000-8000-000000000000`,
      now,
      invoke: managedInvoke([], {
        "resume.analyze": corpus.core.analyze,
        "job.match": corpus.core.match,
        "resume.analysis-suggestions-review": corpus.core.suggestionReview,
        "resume.analysis-replacements-review": corpus.core.replacementReview,
        "resume.variant-review": corpus.core.variantReview,
        "resume.variant-materialize": corpus.core.materialize,
      }),
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    const tool = fake.tools.get("career_run");

    const contextResult = await runTool(tool, { command: "context" }, rpc.ctx);
    const context = parsed(contextResult);
    const benchmarkResume = JSON.parse(corpus.managed.context).resumes[0].handle;
    assertManagedSurfaceParity(contextResult, corpus.managed.context, [
      [context.resumes[0].handle, benchmarkResume],
    ]);
    const resumeHandle = context.resumes[0].handle;

    const analyzeResult = await runTool(tool, {
      ...corpus.calls.analyze, handle: resumeHandle,
    }, rpc.ctx);
    const analyze = parsed(analyzeResult);
    const benchmarkAnalysis = JSON.parse(corpus.managed.analyze).result;
    assertManagedSurfaceParity(analyzeResult, corpus.managed.analyze, [
      [analyze.result, benchmarkAnalysis],
    ]);
    const evidenceResult = await runTool(tool, {
      command: "detail", handle: analyze.result, payload: { section: "evidence" },
    }, rpc.ctx);
    assertManagedSurfaceParity(evidenceResult, corpus.managed.evidenceDetail, [
      [analyze.result, benchmarkAnalysis],
    ]);

    const matchResultValue = await runTool(tool, {
      ...corpus.calls.match, handle: resumeHandle,
    }, rpc.ctx);
    const match = parsed(matchResultValue);
    assertManagedSurfaceParity(matchResultValue, corpus.managed.match, [
      [match.result, JSON.parse(corpus.managed.match).result],
    ]);

    const suggestionResult = await runTool(tool, {
      ...corpus.calls.suggestionReview, handle: resumeHandle,
    }, rpc.ctx);
    const suggestion = parsed(suggestionResult);
    assertManagedSurfaceParity(suggestionResult, corpus.managed.suggestionReview, [
      [suggestion.review, JSON.parse(corpus.managed.suggestionReview).review],
    ]);

    const replacementResult = await runTool(tool, {
      ...corpus.calls.replacementReview, handle: resumeHandle,
    }, rpc.ctx);
    const replacement = parsed(replacementResult);
    assertManagedSurfaceParity(replacementResult, corpus.managed.replacementReview, [
      [replacement.review, JSON.parse(corpus.managed.replacementReview).review],
    ]);

    const reviewResult = await runTool(tool, {
      ...corpus.calls.variantReview, handle: resumeHandle,
    }, rpc.ctx);
    const review = parsed(reviewResult);
    const benchmarkReview = JSON.parse(corpus.managed.variantReview).review;
    assertManagedSurfaceParity(reviewResult, corpus.managed.variantReview, [
      [review.review, benchmarkReview],
    ]);
    const changeOneResult = await runTool(tool, {
      command: "detail", handle: review.review,
      payload: { section: "changes", item: "change-0001" },
    }, rpc.ctx);
    assertManagedSurfaceParity(changeOneResult, corpus.managed.changeOneDetail, [
      [review.review, benchmarkReview],
    ]);
    const changeTwoResult = await runTool(tool, {
      command: "detail", handle: review.review,
      payload: { section: "changes", item: "change-0002" },
    }, rpc.ctx);
    assertManagedSurfaceParity(changeTwoResult, corpus.managed.changeTwoDetail, [
      [review.review, benchmarkReview],
    ]);

    const materializeResult = await runTool(tool, {
      ...corpus.calls.materialize, handle: review.review,
    }, rpc.ctx);
    const materialize = parsed(materializeResult);
    const benchmarkVariant = JSON.parse(corpus.managed.materialize).variant;
    assertManagedSurfaceParity(materializeResult, corpus.managed.materialize, [
      [materialize.variant, benchmarkVariant],
    ]);
    const documentResult = await runTool(tool, {
      command: "detail", handle: materialize.variant, payload: { section: "document" },
    }, rpc.ctx);
    assertManagedSurfaceParity(documentResult, corpus.managed.documentDetail, [
      [materialize.variant, benchmarkVariant],
    ]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("career_run hides schema discovery, uses ephemeral handles, and hydrates bounded detail", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-analyze-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    const calls = [];
    registerCareerRun(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: managedInvoke(calls, { "resume.analyze": resumeResult(89, true) }),
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    const tool = fake.tools.get("career_run");

    const context = parsed(await runTool(tool, { command: "context" }, rpc.ctx));
    assert.equal(context.persistence, "transient");
    assert.equal(context.resumes.length, 1);
    assert.match(context.resumes[0].handle, /^resume:/);
    assert.doesNotMatch(JSON.stringify(context), /Built reliable APIs/);

    const updates = [];
    const analysis = parsed(await runTool(tool, {
      command: "analyze", handle: context.resumes[0].handle,
    }, rpc.ctx, updates));
    assert.equal(analysis.overall_score, 89);
    assert.match(analysis.result, /^result:/);
    assert.equal(analysis.warnings.length, 1);
    assert.ok(updates.some((update) => update.content[0].text.includes("analyze")));

    const detail = parsed(await runTool(tool, {
      command: "detail", handle: analysis.result, payload: { section: "checks" },
    }, rpc.ctx));
    assert.equal(detail.complete, true);
    assert.equal(detail.value[0].check_id, "synthetic_check");

    assert.equal(calls.filter(({ invocation }) => invocation.kind === "discovery" && invocation.operation === "operations").length, 1);
    assert.equal(calls.filter(({ invocation }) => invocation.kind === "discovery" && invocation.operation === "schema-bundle").length, 4);
    const analysisCall = calls.find(({ invocation }) => invocation.kind === "resume" && invocation.operation === "analyze");
    assert.equal(analysisCall.options.toolResultMaxBytes, MANAGED_OUTPUT_MAX_BYTES);
    assert.match(JSON.parse(analysisCall.invocation.inputJson).text, /Built reliable APIs/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("career_run requires an explicit persistence decision before private context", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-consent-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    registerCareerRun(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: managedInvoke([], { "resume.analyze": resumeResult(89, false) }),
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: true });
    const tool = fake.tools.get("career_run");

    const first = parsed(await runTool(tool, { command: "context" }, rpc.ctx));
    assert.equal(first.consent, "consent_required");
    assert.deepEqual(first.resumes, []);

    const consent = parsed(await runTool(tool, {
      command: "consent", payload: "approve",
    }, rpc.ctx));
    assert.equal(consent.consent, "approved");
    assert.equal(fake.entries.at(-1).data.kind, "consent");

    const ready = parsed(await runTool(tool, { command: "context" }, rpc.ctx));
    assert.equal(ready.consent, "approved");
    assert.equal(ready.resumes.length, 1);
    const analysis = parsed(await runTool(tool, {
      command: "analyze", handle: ready.resumes[0].handle,
    }, rpc.ctx));

    const declined = parsed(await runTool(tool, {
      command: "consent", payload: "decline",
    }, rpc.ctx));
    assert.equal(declined.consent, "declined");
    await assert.rejects(
      runTool(tool, {
        command: "detail", handle: analysis.result, payload: { section: "summary" },
      }, rpc.ctx),
      (error) => error instanceof CareerRunError && error.code === "consent_declined",
    );

    await runTool(tool, { command: "consent", payload: "approve" }, rpc.ctx);
    await runTool(tool, { command: "context" }, rpc.ctx);
    await assert.rejects(
      runTool(tool, {
        command: "detail", handle: analysis.result, payload: { section: "summary" },
      }, rpc.ctx),
      (error) => error instanceof CareerRunError && error.code === "result_not_found",
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("career_run reviews advisory suggestions without exposing the repeated baseline", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-suggestion-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    let submitted;
    const result = {
      schema_version: "career.resume_analysis_suggestion_review.v1",
      policy_version: "resume_analysis_suggestion_review_v1",
      analysis_policy_version: "resume_analysis_v1",
      core_version: "0.1.1",
      authority: "assisted_non_authoritative",
      baseline_analysis: { schema_version: "career.resume_analysis.v1", checks: [] },
      suggestions: [{
        suggestion_id: "suggestion-0001", priority: 1, area: "experience_impact",
        basis_check_id: "measurable_impact_in_bullets", status: "confirmed",
        improvement_action: "Add grounded impact.", start_line: 6, end_line: 6,
        source_target: "Built reliable APIs.", source_evidence: ["Built reliable APIs."],
        suggestion: "Add a verified outcome if one is available.",
      }],
      discarded_suggestions: [],
      warnings: [
        { code: "assisted_suggestions_non_authoritative", message: "Advisory only." },
        { code: "evidence_occurrence_not_factual_or_rewrite_certification", message: "Verify." },
        { code: "deterministic_analysis_preserved", message: "Preserved." },
      ],
    };
    registerCareerRun(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: managedInvoke([], {
        "resume.analysis-suggestions-review": (invocation) => {
          submitted = JSON.parse(invocation.inputJson);
          return { operation: "resume.analysis-suggestions.review", json: JSON.stringify(result) };
        },
      }),
    });
    const rpc = makeContext(fake, { persisted: false });
    const tool = fake.tools.get("career_run");
    const context = parsed(await runTool(tool, { command: "context" }, rpc.ctx));
    const reviewed = await runTool(tool, {
      command: "suggestion-review",
      handle: context.resumes[0].handle,
      payload: { suggestions: [{
        basis_check_id: "measurable_impact_in_bullets", start_line: 6, end_line: 6,
        source_target: "Built reliable APIs.", source_evidence: ["Built reliable APIs."],
        suggestion: "Add a verified outcome if one is available.",
      }] },
    }, rpc.ctx);
    const value = parsed(reviewed);
    assert.equal(value.authority, "assisted_non_authoritative");
    assert.equal(value.suggestions[0].suggestion_id, "suggestion-0001");
    assert.equal(submitted.proposal.schema_version, "career.resume_analysis_suggestion_proposal.v1");
    assert.doesNotMatch(reviewed.content[0].text, /baseline_analysis/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("career_run reuses the exact reviewed variant envelope and saves only after user approval", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-variant-"));
  try {
    const { agentDir, root } = await configuredAgent(temp);
    const fake = makeFakePi();
    const calls = [];
    let reviewedInput;
    const vacancy = createVacancyEntry("Backend Engineer\nTypeScript required", "paste", {
      uuid: uuidSequence(), now,
    });
    fake.entries.push({ type: "custom", customType: "career.workflow", data: vacancy, id: "vacancy", parentId: null, timestamp: now().toISOString() });

    const variantReview = {
      schema_version: "career.resume_variant_review.v1",
      policy_version: "resume_variant_review_v1",
      core_version: "0.1.1",
      authority: "assisted_non_authoritative",
      baseline_resume: { schema_version: "career.resume_input.v1", text: "baseline", metadata: { document_id: "x" } },
      proposed_preview_text: "preview",
      changes: [{
        change_id: "change-0001", section: "experience", start_line: 6, end_line: 6,
        original_text: "Built reliable APIs.", proposed_text: "Built reliable TypeScript APIs.",
        resume_evidence: ["Built reliable APIs."], vacancy_evidence: ["TypeScript"],
      }, {
        change_id: "change-0002", section: "skills", start_line: 8, end_line: 8,
        original_text: "TypeScript, Testing", proposed_text: "TypeScript, Testing, APIs",
        resume_evidence: ["TypeScript, Testing", "Built reliable APIs."], vacancy_evidence: ["TypeScript"],
      }],
      discarded_changes: [],
      warnings: [
        { code: "assisted_content_non_authoritative", message: "Assisted." },
        { code: "evidence_occurrence_not_factual_certification", message: "Verify." },
        { code: "deterministic_baseline_preserved", message: "Preserved." },
      ],
    };
    const materialized = {
      schema_version: "career.resume_variant.v1",
      policy_version: "resume_variant_review_v1",
      core_version: "0.1.1",
      authority: "assisted_non_authoritative",
      baseline_resume: variantReview.baseline_resume,
      assisted_resume_text: "Built reliable TypeScript APIs.\nTypeScript, Testing, APIs",
      selected_changes: variantReview.changes,
      warnings: variantReview.warnings,
    };
    registerCareerRun(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: managedInvoke(calls, {
        "resume.variant-review": (invocation) => {
          reviewedInput = JSON.parse(invocation.inputJson);
          return { operation: "resume.variant.review", json: JSON.stringify(variantReview) };
        },
        "resume.variant-materialize": (invocation) => {
          const input = JSON.parse(invocation.inputJson);
          assert.deepEqual(input.review_input, reviewedInput);
          assert.deepEqual(input.selected_change_ids, ["change-0001", "change-0002"]);
          return { operation: "resume.variant.materialize", json: JSON.stringify(materialized) };
        },
      }),
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    const tool = fake.tools.get("career_run");
    const context = parsed(await runTool(tool, { command: "context" }, rpc.ctx));
    assert.equal(context.vacancy.handle, "vacancy:current");

    const reviewResult = await runTool(tool, {
      command: "variant-review",
      handle: context.resumes[0].handle,
      payload: { changes: [{
        section: "experience", start_line: 6, end_line: 6,
        original_text: "Built reliable APIs.", proposed_text: "Built reliable TypeScript APIs.",
        resume_evidence: ["Built reliable APIs."], vacancy_evidence: ["TypeScript"],
      }, {
        section: "skills", start_line: 8, end_line: 8,
        original_text: "TypeScript, Testing", proposed_text: "TypeScript, Testing, APIs",
        resume_evidence: ["TypeScript, Testing", "Built reliable APIs."], vacancy_evidence: ["TypeScript"],
      }] },
    }, rpc.ctx);
    const review = parsed(reviewResult);
    assert.equal(reviewResult.terminate, true, "variant review must stop before user selection");
    assert.equal(reviewResult.details.action, "review_select");
    const renderedReview = tool.renderResult(reviewResult, { expanded: false, isPartial: false }, {
      fg(_color, text) { return text; }, bold(text) { return text; },
    }).render(100).join("\n");
    assert.match(renderedReview, new RegExp(`/career-review ${review.review}`));
    assert.equal(review.authority, "assisted_non_authoritative");
    assert.match(review.review, /^review:/);
    assert.match(review.next_action, /\/career-review/);
    assert.equal(review.changes[0].proposed_text, undefined, "summary must not repeat proposal text");

    const keybindings = new KeybindingsManager(TUI_KEYBINDINGS);
    setKeybindings(keybindings);
    const components = [];
    const editorText = [];
    const entriesBeforeSelection = fake.entries.length;
    const tui = makeContext(fake, {
      mode: "tui", persisted: false, components, editorText, keybindings,
      terminal: { rows: 24, columns: 64 },
      selects: [
        "Continue with selected changes",
        "Warnings and discards • 3 warnings • 0 discarded • review required",
        "Continue with selected changes",
        "change-0001 • experience • line 6 • excluded",
        "Include",
        "change-0002 • skills • line 8 • excluded",
        "Include",
        "Continue with selected changes",
        "Back to reviewed changes",
        "Continue with selected changes",
        "Review selected 2/2 • change-0002 • skills • line 8",
        "Prepare 2 selected change IDs",
      ],
    });
    const selectionPending = fake.commands.get("career-review").handler(review.review, tui.ctx);
    await new Promise((resolve) => setImmediate(resolve));
    const noticesViewer = components[0];
    assert.ok(noticesViewer);
    const notices = noticesViewer.render(64);
    assert.ok(notices.every((line) => visibleWidth(line) <= 64));
    assert.ok(noticesViewer.render(32).every((line) => visibleWidth(line) <= 32));
    assert.match(notices.join("\n"), /assisted_content_non_authoritative/);
    assert.match(notices.join("\n"), /evidence_occurrence_not_factual_certification/);
    assert.match(notices.join("\n"), /deterministic_baseline_preserved/);
    noticesViewer.handleInput("\x1b");

    while (components.length < 2) await new Promise((resolve) => setImmediate(resolve));
    const exactViewer = components[1];
    const exactReview = exactViewer.render(64);
    assert.ok(exactReview.every((line) => visibleWidth(line) <= 64));
    assert.ok(exactViewer.render(32).every((line) => visibleWidth(line) <= 32));
    assert.match(exactReview.join("\n"), /Built reliable APIs/);
    assert.match(exactReview.join("\n"), /Built reliable TypeScript APIs/);
    assert.match(exactReview.join("\n"), /TypeScript/);
    exactViewer.handleInput("\x1b");

    while (components.length < 3) await new Promise((resolve) => setImmediate(resolve));
    const secondExactViewer = components[2];
    const secondExactReview = secondExactViewer.render(64);
    assert.match(secondExactReview.join("\n"), /TypeScript, Testing/);
    assert.match(secondExactReview.join("\n"), /TypeScript, Testing, APIs/);
    secondExactViewer.handleInput("\x1b");

    while (components.length < 4) await new Promise((resolve) => setImmediate(resolve));
    const finalViewer = components[3];
    const finalReview = finalViewer.render(64);
    assert.ok(finalReview.every((line) => visibleWidth(line) <= 64));
    assert.ok(finalViewer.render(32).every((line) => visibleWidth(line) <= 32));
    assert.match(finalReview.join("\n"), /Authority: assisted_non_authoritative/);
    assert.match(finalReview.join("\n"), /Selected changes: 2/);
    assert.match(finalReview.join("\n"), /Change 1 of 2/);
    assert.match(finalReview.join("\n"), /ID: "change-0001"/);
    assert.match(finalReview.join("\n"), /Before: "Built reliable APIs\."/);
    assert.match(finalReview.join("\n"), /After: "Built reliable TypeScript APIs\."/);
    assert.match(finalReview.join("\n"), /Resume evidence \(1\)/);
    assert.doesNotMatch(finalReview.join("\n"), /selected_change_count|selected_changes/);
    finalViewer.handleInput("\x1b[F");
    const finalReviewEnd = finalViewer.render(64).join("\n");
    assert.match(finalReviewEnd, /Change 2 of 2/);
    assert.match(finalReviewEnd, /ID: "change-0002"/);
    assert.match(finalReviewEnd, /Before: "TypeScript, Testing"/);
    assert.match(finalReviewEnd, /After: "TypeScript, Testing, APIs"/);
    assert.match(finalReviewEnd, /Vacancy evidence \(1\)/);
    finalViewer.handleInput("\x1b");

    while (components.length < 5) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(editorText, [], "back from final review must not prepare editor text");
    const confirmedViewer = components[4];
    assert.ok(confirmedViewer.render(32).every((line) => visibleWidth(line) <= 32));
    confirmedViewer.handleInput("\x1b");

    while (components.length < 6) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(editorText, [], "selected-record navigation must not prepare editor text");
    const selectedViewer = components[5];
    const selectedReview = selectedViewer.render(64).join("\n");
    assert.ok(selectedViewer.render(32).every((line) => visibleWidth(line) <= 32));
    assert.match(selectedReview, /Change 2 of 2/);
    assert.match(selectedReview, /ID: "change-0002"/);
    assert.match(selectedReview, /After: "TypeScript, Testing, APIs"/);
    selectedViewer.handleInput("\x1b");

    await selectionPending;
    assert.equal(editorText.length, 1);
    assert.ok(tui.notifications.some(({ message }) => message.includes("Review all Career Core warnings")));
    assert.ok(tui.notifications.some(({ message }) => message.includes("Include at least one")));
    assert.match(editorText[0], /"selected_change_ids":\["change-0001","change-0002"\]/);
    assert.match(editorText[0], new RegExp(review.review));
    assert.doesNotMatch(editorText[0], /Built reliable APIs/);
    assert.doesNotMatch(editorText[0], /Built reliable TypeScript APIs/);
    assert.doesNotMatch(editorText[0], /TypeScript, Testing, APIs/);
    assert.equal(calls.some(({ invocation }) => invocation.operation === "variant-materialize"), false);
    assert.equal(fake.entries.length, entriesBeforeSelection, "selection must not persist a session entry");

    const cancelledComponents = [];
    const cancelledEditor = [];
    const cancelled = makeContext(fake, {
      mode: "tui", persisted: false, components: cancelledComponents,
      editorText: cancelledEditor, keybindings, selects: ["Cancel"],
    });
    await fake.commands.get("career-review").handler(review.review, cancelled.ctx);
    assert.deepEqual(cancelledComponents, []);
    assert.deepEqual(cancelledEditor, []);
    assert.equal(fake.entries.length, entriesBeforeSelection);

    const exactChange = parsed(await runTool(tool, {
      command: "detail", handle: review.review,
      payload: { section: "changes", item: "change-0001" },
    }, rpc.ctx));
    assert.equal(exactChange.value.proposed_text, "Built reliable TypeScript APIs.");

    await assert.rejects(
      runTool(tool, {
        command: "materialize", handle: review.review,
        payload: { selected_change_ids: ["change-9999"] },
      }, rpc.ctx),
      (error) => error instanceof CareerRunError && error.code === "selection_invalid",
    );

    const variant = parsed(await runTool(tool, {
      command: "materialize", handle: review.review,
      payload: { selected_change_ids: ["change-0001", "change-0002"] },
    }, rpc.ctx));
    assert.equal(variant.authority, "assisted_non_authoritative");
    assert.match(variant.variant, /^variant:/);
    assert.match(variant.next_action, new RegExp(`/career-save ${variant.variant}`));

    const document = parsed(await runTool(tool, {
      command: "detail", handle: variant.variant, payload: { section: "document" },
    }, rpc.ctx));
    assert.equal(document.value, "Built reliable TypeScript APIs.\nTypeScript, Testing, APIs");

    let preview;
    const entriesBeforeSave = fake.entries.length;
    const callsBeforeSave = calls.length;
    const saveContext = makeContext(fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, prefill) => {
        preview = JSON.parse(prefill);
        return prefill;
      }],
      confirms: [true],
    });
    await fake.commands.get("career-save").handler(variant.variant, saveContext.ctx);
    assert.equal(preview.schema_version, "pi.career.variant_save_preview.v1");
    assert.equal(preview.artifact.text, materialized.assisted_resume_text);
    assert.equal(preview.artifact.format, "markdown");
    assert.equal(preview.initialize_directory, true);
    assert.equal(calls.length, callsBeforeSave, "saving must not invoke Career Core");
    assert.equal(fake.entries.length, entriesBeforeSave, "saving must not append session state");

    const variantsRoot = path.join(root, "variants");
    const names = (await readdir(variantsRoot)).sort();
    assert.equal(names.length, 3);
    assert.ok(names.includes(".pi-career-variants.json"));
    const artifactName = names.find((name) => name.endsWith(".md"));
    const sidecarName = names.find((name) => name.endsWith(".pi-career.json"));
    assert.ok(artifactName);
    assert.ok(sidecarName);
    const artifactPath = path.join(variantsRoot, artifactName);
    const sidecarPath = path.join(variantsRoot, sidecarName);
    assert.equal(await readFile(artifactPath, "utf8"), materialized.assisted_resume_text);
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    assert.equal(sidecar.schema_version, "pi.career.assisted_variant_meta.v2");
    assert.equal(sidecar.authority, "assisted_non_authoritative");
    assert.equal((await lstat(variantsRoot)).mode & 0o777, 0o700);
    assert.equal((await lstat(artifactPath)).mode & 0o777, 0o600);
    assert.equal((await lstat(sidecarPath)).mode & 0o777, 0o600);

    const scan = await scanLibrary(await loadConfig(agentDir));
    const saved = scan.records.find((record) => record.path === artifactPath);
    assert.ok(saved, JSON.stringify({ records: scan.records, warnings: scan.warnings }));
    assert.equal(saved.kind, "assisted_variant");
    assert.equal(saved.variant_group_id, sidecar.base_document_id);
    assert.equal(eligibleOriginals(scan).some((record) => record.path === artifactPath), false);
    assert.ok(saveContext.notifications.some(({ message }) => message.includes("Saved assisted variant")));

    const repeated = makeContext(fake, { mode: "tui", persisted: false });
    await fake.commands.get("career-save").handler(variant.variant, repeated.ctx);
    assert.deepEqual((await readdir(variantsRoot)).sort(), names);
    assert.ok(repeated.notifications.some(({ message }) => message.includes("Verified existing")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("PDF variant review remains manual guidance and cannot enter selection or materialization", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-pdf-variant-"));
  try {
    const { agentDir } = await configuredAgent(temp, "resume.pdf", syntheticTextPdf([
      "Morgan Lee", "Built reliable APIs.", "TypeScript, Testing",
    ]));
    const fake = makeFakePi();
    const calls = [];
    fake.entries.push({
      type: "custom", customType: "career.workflow",
      data: createVacancyEntry("Backend Engineer\nTypeScript required", "paste", { uuid: uuidSequence(), now }),
      id: "vacancy", parentId: null, timestamp: now().toISOString(),
    });
    const reviewedPdf = {
      schema_version: "career.resume_variant_review.v1",
      policy_version: "resume_variant_review_v1",
      core_version: "0.1.1",
      authority: "assisted_non_authoritative",
      baseline_resume: { schema_version: "career.resume_input.v1", text: "baseline", metadata: { document_id: "x" } },
      proposed_preview_text: "preview",
      changes: [{
        change_id: "change-0001", section: "experience", start_line: 2, end_line: 2,
        original_text: "Built reliable APIs.", proposed_text: "Built reliable TypeScript APIs.",
        resume_evidence: ["Built reliable APIs."], vacancy_evidence: ["TypeScript"],
      }],
      discarded_changes: [],
      warnings: [{ code: "assisted_content_non_authoritative", message: "Assisted." }],
    };
    registerCareerRun(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: managedInvoke(calls, { "resume.variant-review": reviewedPdf }),
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    const tool = fake.tools.get("career_run");
    const context = parsed(await runTool(tool, { command: "context" }, rpc.ctx));
    assert.equal(context.resumes[0].format, "pdf");
    const result = await runTool(tool, {
      command: "variant-review", handle: context.resumes[0].handle,
      payload: { changes: [{
        section: "experience", start_line: 2, end_line: 2,
        original_text: "Built reliable APIs.", proposed_text: "Built reliable TypeScript APIs.",
        resume_evidence: ["Built reliable APIs."], vacancy_evidence: ["TypeScript"],
      }] },
    }, rpc.ctx);
    const review = parsed(result);
    assert.equal(result.terminate, true);
    assert.equal(result.details.action, "pdf_manual");
    assert.match(review.next_action, /manual-application guidance only/);
    assert.doesNotMatch(review.next_action, /\/career-review/);

    const components = [];
    const editorText = [];
    const tui = makeContext(fake, { mode: "tui", persisted: false, components, editorText });
    await fake.commands.get("career-review").handler(review.review, tui.ctx);
    assert.deepEqual(components, []);
    assert.deepEqual(editorText, []);
    assert.ok(tui.notifications.some(({ message }) => message.includes("manual-application guidance")));

    await assert.rejects(
      runTool(tool, {
        command: "materialize", handle: review.review,
        payload: { selected_change_ids: ["change-0001"] },
      }, rpc.ctx),
      (error) => error instanceof CareerRunError && error.code === "pdf_materialization_unsupported",
    );
    assert.equal(calls.some(({ invocation }) => invocation.operation === "variant-materialize"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("career-tools keeps raw tools available but inactive by default", async () => {
  const fake = makeFakePi();
  for (const name of ["career_core_discover", "career_core_resume", "career_core_job"]) {
    fake.api.registerTool({ name, description: name, parameters: {}, execute() {} });
  }
  registerCareerRun(fake.api, { invoke: managedInvoke([]), uuid: uuidSequence(), now });
  const rpc = makeContext(fake, { persisted: false });
  for (const handler of fake.events.get("session_start") ?? []) await handler({}, rpc.ctx);
  assert.deepEqual(fake.activeTools, ["career_run"]);
  assert.ok(fake.commands.has("career-review"));
  assert.ok(fake.commands.has("career-save"));
  await fake.commands.get("career-review").handler("review:00000000", rpc.ctx);
  assert.ok(rpc.notifications.some(({ message }) => message.includes("requires TUI mode")));
  await fake.commands.get("career-save").handler("not-a-variant", rpc.ctx);
  assert.ok(rpc.notifications.some(({ message }) => message.includes("Usage: /career-save")));
  const print = makeContext(fake, { mode: "print", hasUI: false, persisted: false });
  await fake.commands.get("career-save").handler("variant:00000000", print.ctx);
  assert.ok(print.notifications.some(({ message }) => message.includes("requires TUI or RPC")));

  await fake.commands.get("career-tools").handler("raw", rpc.ctx);
  assert.deepEqual(new Set(fake.activeTools), new Set([
    "career_run", "career_core_discover", "career_core_resume", "career_core_job",
  ]));
  await fake.commands.get("career-tools").handler("managed", rpc.ctx);
  assert.deepEqual(fake.activeTools, ["career_run"]);
});

test("career_run rejects malformed proposals and fails oversized hydration without partial output", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-bounds-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    const oversized = resumeResult(84, false);
    oversized.checks[0].explanation = "x".repeat(50_000);
    registerCareerRun(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: managedInvoke([], { "resume.analyze": oversized }),
    });
    const rpc = makeContext(fake, { persisted: false });
    const tool = fake.tools.get("career_run");
    const context = parsed(await runTool(tool, { command: "context" }, rpc.ctx));

    await assert.rejects(
      runTool(tool, {
        command: "suggestion-review",
        handle: context.resumes[0].handle,
        payload: { suggestions: [{ unexpected: "private text" }] },
      }, rpc.ctx),
      (error) => error instanceof CareerRunError && error.code === "invalid_request",
    );

    const analysis = parsed(await runTool(tool, {
      command: "analyze", handle: context.resumes[0].handle,
    }, rpc.ctx));
    await assert.rejects(
      runTool(tool, {
        command: "detail", handle: analysis.result, payload: { section: "checks" },
      }, rpc.ctx),
      (error) => error instanceof CareerRunError && error.code === "detail_too_large",
    );
    const summary = parsed(await runTool(tool, {
      command: "detail", handle: analysis.result, payload: { section: "summary" },
    }, rpc.ctx));
    assert.equal(summary.complete, true);
    assert.equal(summary.value.overall_score, 84);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("career_run rejects incompatible managed-adapter catalogs", async () => {
  const fake = makeFakePi();
  const incompatibleInvoke = async (invocation) => {
    assert.equal(invocation.kind, "discovery");
    assert.equal(invocation.operation, "operations");
    const catalog = operationCatalog();
    catalog.operations[0].maximum_successful_machine_output_bytes -= 1;
    return { operation: "core.operations", json: JSON.stringify(catalog) };
  };
  registerCareerRun(fake.api, { invoke: incompatibleInvoke, uuid: uuidSequence(), now });
  const rpc = makeContext(fake, { persisted: false });
  await assert.rejects(
    runTool(fake.tools.get("career_run"), { command: "context" }, rpc.ctx),
    (error) => error instanceof CareerRunError && error.code === "managed_contract_invalid",
  );
});

test("career_run returns conservative deterministic match summaries", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-run-match-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    const vacancy = createVacancyEntry("Backend Engineer\nTesting required", "paste", {
      uuid: uuidSequence(), now,
    });
    fake.entries.push({ type: "custom", customType: "career.workflow", data: vacancy, id: "vacancy", parentId: null, timestamp: now().toISOString() });
    registerCareerRun(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: managedInvoke([], { "job.match": matchResult(77, "apply_after_small_edits", true, true) }),
    });
    const rpc = makeContext(fake, { persisted: false });
    const tool = fake.tools.get("career_run");
    const context = parsed(await runTool(tool, { command: "context" }, rpc.ctx));
    const match = parsed(await runTool(tool, {
      command: "match", handle: context.resumes[0].handle,
    }, rpc.ctx));
    assert.equal(match.overall_score, 77);
    assert.equal(match.recommendation.label, "apply_after_small_edits");
    assert.equal(match.confidence_context.is_uncertain, true);
    assert.equal(match.warnings.length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
