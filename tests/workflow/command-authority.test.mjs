// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MANAGED_OUTPUT_MAX_BYTES } from "../../src/managed/catalog.ts";
import { registerCareerRun } from "../../src/managed/tool.ts";
import { ApplicationWorkspaceWorkflow, loadAttachedApplicationSources } from "../../src/workflow/application-workspace.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { loadConfig } from "../../src/workflow/config.ts";
import { eligibleOriginals, scanLibrary } from "../../src/workflow/scan.ts";
import {
  CAREER_ASSISTANCE_HANDOFF,
  createApplicationAssistanceActivationEntry,
  createApplicationAttachmentEntry,
} from "../../src/workflow/session-attachment.ts";
import {
  makeContext,
  makeFakePi,
  matchResult,
  normalizationResult,
  prepareConfigDirectory,
  resumeResult,
  uuidSequence,
} from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000077";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const ORIGINAL_TEXT = "# Synthetic Original\n\nBuilt reliable APIs.\n";
const OTHER_TEXT = "# Synthetic Other\n\nOperated unrelated systems.\n";
const TAILORED_TEXT = "# Synthetic Tailored\n\nBuilt tailored APIs.\n";
const VACANCY_TEXT = "Synthetic workspace vacancy for Platform Engineer.\n";
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateJson(file, value) {
  await writeFile(file, canonical(value), { mode: 0o600 });
  await chmod(file, 0o600);
}

async function snapshot(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    result[entry.name] = entry.isDirectory() ? await snapshot(target) : (await readFile(target)).toString("hex");
  }
  return result;
}

function customEntry(customType, data, index) {
  return {
    type: "custom", customType, data, id: `authority-${index}`,
    parentId: index === 1 ? null : `authority-${index - 1}`, timestamp: WORKSPACE_CREATED_AT,
  };
}

async function materializePackage({ tailored = false } = {}) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-authority-")));
  const agentDir = path.join(temp, "agent");
  const library = path.join(temp, "library");
  const root = path.join(temp, "applications");
  await prepareConfigDirectory(agentDir);
  await mkdir(library);
  await writeFile(path.join(library, "original.md"), ORIGINAL_TEXT);
  await writeFile(path.join(library, "other.md"), OTHER_TEXT);
  const libraryPath = await realpath(library);
  const libraryRootId = createHash("sha256").update(libraryPath).digest("hex");
  await mkdir(root, { mode: 0o700 });
  await chmod(root, 0o700);
  await privateJson(path.join(agentDir, "career", "config.v1.json"), {
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: libraryRootId, path: libraryPath, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  });
  const config = await loadConfig(agentDir);
  const scan = await scanLibrary(config);
  const original = eligibleOriginals(scan).find((record) => record.relative_path === "original.md");
  const other = eligibleOriginals(scan).find((record) => record.relative_path === "other.md");
  assert.ok(original);
  assert.ok(other);
  await privateJson(path.join(root, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: ROOT_CREATED_AT,
  });
  const directory = path.join(root, `synthetic-company--synthetic-engineer--${APPLICATION_ID}`);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const manifest = {
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: APPLICATION_ID,
    root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT,
    workspace_created_at: WORKSPACE_CREATED_AT,
  };
  const manifestBytes = canonical(manifest);
  await writeFile(path.join(directory, "application.json"), manifestBytes, { mode: 0o600 });
  await chmod(path.join(directory, "application.json"), 0o600);
  await privateJson(path.join(directory, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: APPLICATION_ID,
    company_label: "Synthetic Company",
    role_label: "Synthetic Engineer",
    created_at: APPLICATION_CREATED_AT,
  });
  const vacancyBytes = Buffer.from(VACANCY_TEXT);
  await writeFile(path.join(directory, "vacancy.md"), vacancyBytes, { mode: 0o600 });
  await chmod(path.join(directory, "vacancy.md"), 0o600);
  const selectedOriginal = {
    document_id: original.id,
    library_root_id: original.root_id,
    text_sha256: original.text_sha256,
    format: original.format,
  };
  const resumeBytes = Buffer.from(TAILORED_TEXT);
  const sidecar = {
    schema_version: "pi.career.assisted_variant_meta.v2",
    kind: "assisted_variant",
    authority: "assisted_non_authoritative",
    base_document_id: selectedOriginal.document_id,
    base_text_sha256: selectedOriginal.text_sha256,
    artifact_sha256: hash(resumeBytes),
    created_at: "2026-08-03T00:00:01.000Z",
  };
  const sidecarBytes = canonical(sidecar);
  const resumeArtifact = {
    relative_path: "resume.md",
    artifact_sha256: hash(resumeBytes),
    sidecar_relative_path: "resume.pi-career.json",
    sidecar_sha256: hash(sidecarBytes),
  };
  if (tailored) {
    await writeFile(path.join(directory, "resume.md"), resumeBytes, { mode: 0o600 });
    await chmod(path.join(directory, "resume.md"), 0o600);
    await writeFile(path.join(directory, "resume.pi-career.json"), sidecarBytes, { mode: 0o600 });
    await chmod(path.join(directory, "resume.pi-career.json"), 0o600);
  }
  await privateJson(path.join(directory, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v2",
    kind: "application_state_revision",
    application_id: APPLICATION_ID,
    sequence: 1,
    parent_sha256: hash(manifestBytes),
    status: "preparing",
    vacancy: {
      relative_path: "vacancy.md",
      content_sha256: hash(vacancyBytes),
      utf8_bytes: vacancyBytes.length,
      source_state_id: "00000000-0000-4000-8000-000000000080",
    },
    selected_original: selectedOriginal,
    resume_artifact: tailored ? resumeArtifact : null,
    cover_letter_artifact: null,
    updated_at: WORKSPACE_CREATED_AT,
  });
  return { temp, agentDir, root, directory, original, other, tailored: resumeArtifact };
}

function attach(fake, { activate = false } = {}) {
  const uuid = uuidSequence();
  const attachment = createApplicationAttachmentEntry({
    applicationId: APPLICATION_ID,
    rootId: ROOT_ID,
    rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT,
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
  }, { uuid });
  fake.entries.push(customEntry("career.application_attachment", attachment, 1));
  if (activate) {
    const activation = createApplicationAssistanceActivationEntry(attachment, { uuid });
    fake.entries.push(customEntry("career.application_assistance", activation, 2));
  }
  return attachment;
}

function registerCommands(fake, agentDir, invoke) {
  let tick = 10;
  const now = () => new Date(`2026-08-12T00:00:${String(tick++).padStart(2, "0")}.000Z`);
  const uuid = uuidSequence();
  registerCareerCommands(fake.api, { agentDir, now, uuid, invoke });
  return new ApplicationWorkspaceWorkflow({
    agentDir, now, uuid,
    appendEntry: (customType, data) => fake.api.appendEntry(customType, data),
  });
}

test("P3-45 attached vacancy writes workspace files and cancelled saves change neither authority", async () => {
  const value = await materializePackage();
  try {
    const fake = makeFakePi();
    attach(fake);
    const calls = [];
    const workspace = registerCommands(fake, value.agentDir, async (invocation) => {
      calls.push(invocation);
      throw new Error("attached vacancy writes must not invoke Career Core");
    });
    const beforeRoot = await snapshot(value.root);
    const beforeEntries = structuredClone(fake.entries);
    const browse = makeContext(fake, {
      mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close],
    });
    await fake.commands.get("career-vacancy").handler("", browse.ctx);
    assert.deepEqual(fake.entries, beforeEntries);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
    assert.equal(calls.length, 0);

    const cancelledPreview = makeContext(fake, {
      mode: "rpc", persisted: false, editors: [undefined],
    });
    assert.equal(await workspace.writeAttachedVacancy(cancelledPreview.ctx, "Replacement vacancy text\n"), "cancelled");
    assert.deepEqual(fake.entries, beforeEntries);
    assert.deepEqual(await snapshot(value.root), beforeRoot);

    const cancelledConfirm = makeContext(fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, preview) => preview],
      confirms: [false],
    });
    assert.equal(await workspace.writeAttachedVacancy(cancelledConfirm.ctx, "Replacement vacancy text\n"), "cancelled");
    assert.deepEqual(fake.entries, beforeEntries);
    assert.deepEqual(await snapshot(value.root), beforeRoot);

    const saved = makeContext(fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, preview) => preview],
      confirms: [true],
    });
    assert.equal(await workspace.writeAttachedVacancy(saved.ctx, "Replacement vacancy text\n"), "written");
    assert.deepEqual(fake.entries, beforeEntries);
    assert.equal(fake.entries.some((entry) => entry.data?.kind === "vacancy"), false);
    const after = await snapshot(value.directory);
    assert.notEqual(after[".pi-career-state-000002.json"], undefined);
    assert.notEqual(after["vacancy-000002.md"], undefined);
    assert.equal(after["vacancy.md"], beforeRoot[path.basename(value.directory)]["vacancy.md"]);
    assert.match(Buffer.from(after["vacancy-000002.md"], "hex").toString("utf8"), /Replacement vacancy text/);
    assert.doesNotMatch(JSON.stringify(saved.notifications), /Replacement vacancy text/);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-45 print/JSON attached vacancy clear fails closed without mutation", async () => {
  const value = await materializePackage();
  try {
    const fake = makeFakePi();
    attach(fake);
    registerCommands(fake, value.agentDir, async () => {
      throw new Error("print vacancy clear must not invoke Career Core");
    });
    const beforeRoot = await snapshot(value.root);
    const beforeEntries = structuredClone(fake.entries);
    const nonUi = makeContext(fake, { mode: "print", hasUI: false });
    await assert.rejects(fake.commands.get("career-vacancy").handler("clear", nonUi.ctx), /interactive_mode_required/);
    assert.deepEqual(fake.entries, beforeEntries);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-48 attached analyze command opens the shared UI without running Core", async () => {
  const value = await materializePackage({ tailored: true });
  try {
    const fake = makeFakePi();
    attach(fake);
    const texts = [];
    registerCommands(fake, value.agentDir, async (invocation) => {
      texts.push(JSON.parse(invocation.inputJson).text);
      return { operation: "resume.analyze", json: JSON.stringify(resumeResult(81)) };
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close] });
    await fake.commands.get("career-analyze").handler("", rpc.ctx);
    assert.deepEqual(texts, []);
    assert.equal(rpc.customCalls, 0);
    assert.equal(fake.entries.some((entry) => entry.data?.kind === "result_card"), false);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-48 attached match command opens the shared UI without running Core", async () => {
  const value = await materializePackage({ tailored: true });
  try {
    const fake = makeFakePi();
    attach(fake);
    const payloads = [];
    registerCommands(fake, value.agentDir, async (invocation) => {
      payloads.push({ operation: invocation.operation, input: JSON.parse(invocation.inputJson) });
      if (invocation.operation === "normalize") {
        return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
      }
      if (invocation.operation === "analyze") {
        return { operation: "resume.analyze", json: JSON.stringify(resumeResult(80)) };
      }
      return { operation: "job.match", json: JSON.stringify(matchResult(77)) };
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close] });
    await fake.commands.get("career-match").handler("", rpc.ctx);
    assert.deepEqual(payloads, []);
    assert.equal(rpc.customCalls, 0);
    assert.equal(fake.entries.some((entry) => entry.data?.kind === "vacancy"), false);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-51 attached workbench command opens the shared UI without activating assistance", async () => {
  const value = await materializePackage();
  try {
    const fake = makeFakePi();
    attach(fake);
    registerCommands(fake, value.agentDir, async () => {
      throw new Error("workbench assistance must not invoke Career Core");
    });
    const browse = makeContext(fake, {
      mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close],
    });
    await fake.commands.get("career-workbench").handler("", browse.ctx);
    assert.equal(browse.customCalls, 0);
    assert.equal(fake.entries.some((entry) => entry.customType === "career.application_assistance"), false);
    assert.doesNotMatch(CAREER_ASSISTANCE_HANDOFF, /Synthetic|resume\.md|vacancy/);
    assert.equal(fake.entries.filter((entry) => entry.customType === "career.application_attachment").length, 1);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

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
    core_version: "0.2.0",
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

test("career_run context resolves attached workspace sources after activation", async () => {
  const value = await materializePackage({ tailored: true });
  try {
    const fake = makeFakePi();
    const attachment = attach(fake, { activate: true });
    const calls = [];
    registerCareerRun(fake.api, {
      agentDir: value.agentDir,
      uuid: randomUUID,
      now: () => new Date("2026-08-12T00:00:20.000Z"),
      invoke: async (invocation) => {
        calls.push(invocation);
        if (invocation.kind === "discovery" && invocation.operation === "operations") {
          return { operation: "core.operations", json: JSON.stringify(operationCatalog()) };
        }
        if (invocation.kind === "discovery" && invocation.operation === "schema-bundle") {
          return {
            operation: "schema.bundle",
            json: JSON.stringify({
              $schema: "https://json-schema.org/draft/2020-12/schema",
              $id: `https://example.invalid/${FILE_NAMES[invocation.schemaId]}`,
              type: "object",
            }),
          };
        }
        if (invocation.operation === "analyze") {
          return { operation: "resume.analyze", json: JSON.stringify(resumeResult(70)) };
        }
        return { operation: "job.match", json: JSON.stringify(matchResult(71)) };
      },
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    for (const handler of fake.events.get("session_start") ?? []) await handler({}, rpc.ctx);
    const tool = fake.tools.get("career_run");
    const sources = await loadAttachedApplicationSources(value.agentDir, attachment);
    assert.equal(sources.vacancy?.vacancy_text, VACANCY_TEXT);
    assert.equal(sources.selected_original?.text, ORIGINAL_TEXT);
    assert.equal(sources.effective_resume?.text, TAILORED_TEXT);
    const context = JSON.parse((await tool.execute(
      "synthetic-tool-call", { command: "context" }, new AbortController().signal, undefined, rpc.ctx,
    )).content[0].text);
    assert.equal(context.vacancy.label, "Synthetic workspace vacancy for Platform Engineer.");
    assert.equal(context.application.company, "Synthetic Company");
    assert.equal(context.resume_count, 2);
    assert.equal(context.resumes.some((resume) => resume.label.includes("Other")), false);
    assert.doesNotMatch(JSON.stringify(context), /applications|original\.md|Built reliable/);
    const originalHandle = context.resumes[0].handle;
    const effectiveHandle = context.resumes.at(-1).handle;
    await tool.execute(
      "synthetic-tool-call",
      { command: "analyze", handle: originalHandle },
      new AbortController().signal,
      undefined,
      rpc.ctx,
    );
    const analyzeCall = calls.find((invocation) => invocation.operation === "analyze");
    assert.equal(JSON.parse(analyzeCall.inputJson).text, ORIGINAL_TEXT);
    await tool.execute(
      "synthetic-tool-call",
      { command: "match", handle: effectiveHandle },
      new AbortController().signal,
      undefined,
      rpc.ctx,
    );
    const matchCall = calls.find((invocation) => invocation.operation === "match");
    assert.equal(JSON.parse(matchCall.inputJson).resume.text, TAILORED_TEXT);
    assert.equal(JSON.parse(matchCall.inputJson).job.text, VACANCY_TEXT);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
