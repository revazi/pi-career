// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MANAGED_OUTPUT_MAX_BYTES } from "../../src/managed/catalog.ts";
import { registerCareerRun } from "../../src/managed/tool.ts";
import { ApplicationWorkspaceWorkflow, loadAttachedApplicationSources, readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_UI_RPC_ACTIONS, CareerUiSession, buildCareerUiModel, careerPreviewLoader } from "../../src/workflow/career-ui.ts";
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
  // Independent byte/path oracles: scanning must not manufacture the binding being tested.
  assert.equal(original.id, hash(Buffer.from(await realpath(path.join(library, "original.md")))));
  assert.equal(original.text_sha256, hash(Buffer.from(ORIGINAL_TEXT)));
  assert.equal(other.id, hash(Buffer.from(await realpath(path.join(library, "other.md")))));
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
    document_id: hash(Buffer.from(await realpath(path.join(library, "original.md")))),
    library_root_id: libraryRootId,
    text_sha256: hash(Buffer.from(ORIGINAL_TEXT)),
    format: "markdown",
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
    // A library-visible copy of the same linked artifact challenges the original picker.
    const variants = path.join(library, "variants");
    await mkdir(variants, { mode: 0o700 });
    await privateJson(path.join(variants, ".pi-career-variants.json"), {
      schema_version: "pi.career.variants_directory.v1",
      kind: "managed_variants_directory",
      library_root_id: libraryRootId,
      created_at: WORKSPACE_CREATED_AT,
    });
    await writeFile(path.join(variants, "linked.md"), resumeBytes, { mode: 0o600 });
    await writeFile(path.join(variants, "linked.pi-career.json"), sidecarBytes, { mode: 0o600 });
  }
  const state = {
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
  };
  if (tailored) {
    // Existing v1 head followed by the exact null-cover v2 transition that links the artifact.
    const legacy = { ...state, schema_version: "pi.career.application_state.v1", resume_artifact: null };
    delete legacy.cover_letter_artifact;
    const legacyBytes = canonical(legacy);
    await writeFile(path.join(directory, ".pi-career-state-000001.json"), legacyBytes, { mode: 0o600 });
    const transition = { ...state, sequence: 2, parent_sha256: hash(legacyBytes), resume_artifact: null,
      updated_at: "2026-08-03T00:00:01.000Z" };
    await privateJson(path.join(directory, ".pi-career-state-000002.json"), transition);
    await privateJson(path.join(directory, ".pi-career-state-000003.json"), {
      ...state, sequence: 3, parent_sha256: hash(canonical(transition)),
      updated_at: "2026-08-03T00:00:02.000Z",
    });
  } else await privateJson(path.join(directory, ".pi-career-state-000001.json"), state);
  return { temp, agentDir, library, root, directory, original, other, tailored: resumeArtifact };
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

test("tailored effective Resume previews as assisted only and drift fails closed without Core or writes", async () => {
  const value = await materializePackage({ tailored: true });
  try {
    const fake = makeFakePi();
    attach(fake);
    const calls = [];
    registerCommands(fake, value.agentDir, async (invocation) => {
      calls.push(invocation);
      throw new Error("preview cannot invoke Core");
    });
    const beforeFiles = await snapshot(value.root);
    const beforeEntries = JSON.stringify(fake.entries);
    const dialogs = [];
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    rpc.ctx.sendMessage = () => assert.fail("preview cannot send");
    rpc.ctx.sendUserMessage = () => assert.fail("preview cannot send");
    const choices = [null, CAREER_UI_RPC_ACTIONS.preview, CAREER_UI_RPC_ACTIONS.back, CAREER_UI_RPC_ACTIONS.close];
    rpc.ctx.ui.select = async (title, options) => {
      dialogs.push([title, options]);
      const next = choices.shift();
      return next === null ? options.find((option) => option.includes(value.original.label)) : next;
    };
    await fake.commands.get("career-match").handler("", rpc.ctx);
    assert.equal(dialogs.length, 4);
    assert.match(dialogs[1][0], /Effective Resume \(tailored assisted\)/);
    assert.ok(dialogs[1][1].includes(CAREER_UI_RPC_ACTIONS.preview));
    assert.ok(dialogs.filter((_, index) => index !== 2).every((dialog) => !JSON.stringify(dialog).includes("Built tailored APIs")));
    assert.equal(dialogs[2][0].split("\n").slice(1).join("\n"), TAILORED_TEXT);
    const original = makeContext(fake, { mode: "rpc", persisted: false });
    const originalDialogs = [];
    const originalChoices = [null, CAREER_UI_RPC_ACTIONS.preview, CAREER_UI_RPC_ACTIONS.close];
    original.ctx.ui.select = async (title, options) => {
      originalDialogs.push([title, options]);
      const next = originalChoices.shift();
      return next === null ? options.find((option) => option.includes(value.original.label)) : next;
    };
    await fake.commands.get("career-analyze").handler("", original.ctx);
    assert.equal(originalDialogs[2][0].split("\n").slice(1).join("\n"), ORIGINAL_TEXT);
    const library = makeContext(fake, { mode: "rpc", persisted: false });
    const rows = [];
    library.ctx.ui.select = async (title, options) => { rows.push([title, options]); return CAREER_UI_RPC_ACTIONS.close; };
    await fake.commands.get("career-library").handler("", library.ctx);
    const assistedOption = rows[0][1].find((option) => option.includes("assisted variant"));
    assert.ok(assistedOption);
    assert.ok(!JSON.stringify(rows).includes("Built tailored APIs"));
    const assisted = makeContext(fake, { mode: "rpc", persisted: false,
      selects: [assistedOption, CAREER_UI_RPC_ACTIONS.close] });
    const assistedDialogs = [];
    assisted.ctx.ui.select = async (title, options) => {
      assistedDialogs.push([title, options]);
      return assistedDialogs.length === 1 ? assistedOption : CAREER_UI_RPC_ACTIONS.close;
    };
    await fake.commands.get("career-library").handler("", assisted.ctx);
    assert.equal(assistedDialogs[1][1].includes(CAREER_UI_RPC_ACTIONS.preview), false);
    assert.deepEqual(await snapshot(value.root), beforeFiles);
    assert.equal(JSON.stringify(fake.entries), beforeEntries);
    assert.equal(calls.length, 0);
    const model = await buildCareerUiModel(value.agentDir, rpc.ctx);
    const session = new CareerUiSession("match", model, {}, undefined, careerPreviewLoader(value.agentDir, rpc.ctx));
    assert.equal(session.open(), true);
    const artifact = path.join(value.directory, "resume.md");
    await writeFile(artifact, `${TAILORED_TEXT}changed\n`);
    assert.equal(await session.openPreview(), false);
    assert.equal(session.preview, undefined);
    assert.match(session.previewError, /unavailable or changed/);
    assert.doesNotMatch(session.previewError, /Built tailored APIs/);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

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

test("P3-48 linked assisted artifact stays out of Analyze/Match original authority while attached Match uses effective Resume", async () => {
  const value = await materializePackage({ tailored: true });
  try {
    const fake = makeFakePi();
    const attachment = attach(fake);
    const calls = [];
    const workspace = registerCommands(fake, value.agentDir, async (invocation) => {
      calls.push({ operation: invocation.operation, input: JSON.parse(invocation.inputJson) });
      if (invocation.operation === "analyze") return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
      if (invocation.operation === "normalize") return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
      return { operation: "job.match", json: JSON.stringify(matchResult()) };
    });
    const config = await loadConfig(value.agentDir);
    const scan = await scanLibrary(config);
    const variant = scan.records.find((record) => record.relative_path === "variants/linked.md");
    assert.equal(variant?.kind, "assisted_variant");
    assert.equal(variant.text, TAILORED_TEXT);
    assert.deepEqual(eligibleOriginals(scan).map((record) => record.id).sort(),
      [value.original.id, value.other.id].sort());
    const unattached = makeFakePi();
    const unattachedCalls = [];
    registerCommands(unattached, value.agentDir, async (invocation) => {
      unattachedCalls.push(invocation);
      if (invocation.operation === "analyze") return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
      if (invocation.operation === "normalize") return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
      return { operation: "job.match", json: JSON.stringify(matchResult()) };
    });
    await unattached.commands.get("career-vacancy").handler("", makeContext(unattached, {
      mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
      editors: [VACANCY_TEXT],
    }).ctx);
    for (const [command, action] of [["career-analyze", CAREER_UI_RPC_ACTIONS.analyze],
      ["career-match", CAREER_UI_RPC_ACTIONS.match]]) {
      const picker = makeContext(unattached, { mode: "rpc", persisted: false, confirms: [true] });
      let selected = false;
      picker.ctx.ui.select = async (title, choices) => {
        if (title === "Choose an original resume") {
          selected = true;
          assert.equal(choices.length, 2);
          assert.doesNotMatch(JSON.stringify(choices), /linked\.md|Synthetic Tailored|resume\.md/);
          return choices.find((choice) => choice.includes("original.md"));
        }
        return selected ? CAREER_UI_RPC_ACTIONS.close : action;
      };
      await unattached.commands.get(command).handler("", picker.ctx);
      assert.equal(selected, true);
    }
    assert.ok(unattachedCalls.every((invocation) => !invocation.inputJson.includes("Synthetic Tailored")));
    const sources = await loadAttachedApplicationSources(value.agentDir, attachment);
    assert.equal(sources.selected_original?.text, ORIGINAL_TEXT);
    assert.equal(sources.effective_resume?.text, TAILORED_TEXT);
    const before = { library: await snapshot(value.library), root: await snapshot(value.root), entries: structuredClone(fake.entries) };
    const options = [];
    const bound = makeContext(fake, { mode: "rpc", persisted: false });
    bound.ctx.ui.select = async (title, choices) => {
      options.push([title, ...choices]);
      if (title === "Select original resume") return undefined;
      return options.length === 1 ? CAREER_UI_RPC_ACTIONS.selectOriginal : CAREER_UI_RPC_ACTIONS.close;
    };
    await fake.commands.get("career-analyze").handler("", bound.ctx);
    // Once an artifact is bound, no original rebinding action or picker is offered.
    assert.equal(options.some(([title]) => title === "Select original resume"), false);
    await assert.rejects(workspace.selectAttachedOriginal(bound.ctx), /workspace_unavailable/);
    assert.doesNotMatch(JSON.stringify(bound.notifications), /linked\.md|Synthetic Tailored|resume\.md/);
    assert.deepEqual(await snapshot(value.root), before.root);
    const components = [];
    const tui = makeContext(fake, { mode: "tui", persisted: false, components,
      keybindings: { matches(_data, action) { return action === "tui.select.cancel"; } } });
    const pending = fake.commands.get("career-analyze").handler("", tui.ctx);
    const deadline = Date.now() + 2_000;
    while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(components.length, 1);
    assert.doesNotMatch(components[0].render(80).join("\n"), /linked\.md|Synthetic Tailored|resume\.md/);
    components[0].handleInput("esc");
    await pending;

    const analyze = makeContext(fake, { mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, CAREER_UI_RPC_ACTIONS.close], confirms: [true] });
    await fake.commands.get("career-analyze").handler("", analyze.ctx);
    assert.deepEqual(calls.filter((call) => call.operation === "analyze").map((call) => call.input.text), [ORIGINAL_TEXT]);
    assert.doesNotMatch(JSON.stringify(calls), /Synthetic Tailored/);

    const match = makeContext(fake, { mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.match, CAREER_UI_RPC_ACTIONS.close], confirms: [true] });
    await fake.commands.get("career-match").handler("", match.ctx);
    assert.ok(calls.some((call) => call.operation === "match" && JSON.stringify(call.input).includes("Synthetic Tailored")));
    assert.equal(calls.filter((call) => call.operation === "match").length, 1);
    assert.deepEqual(await snapshot(value.library), before.library);
    assert.deepEqual(await snapshot(value.root), before.root);
    assert.deepEqual(fake.entries.filter((entry) => entry.customType === "career.application_attachment"),
      before.entries.filter((entry) => entry.customType === "career.application_attachment"));
    assert.equal(fake.entries.filter((entry) => entry.data?.kind === "result_card").length, 2);
    assert.doesNotMatch(JSON.stringify([analyze.notifications, match.notifications]), /Synthetic Tailored|Built reliable APIs/);

    // Changed artifact bytes cannot be silently adopted or replaced by the original.
    await writeFile(path.join(value.directory, "resume.md"), `${TAILORED_TEXT}DRIFT_SENTINEL_48\n`);
    const driftBytes = await snapshot(value.root);
    const previousCalls = calls.length;
    const failed = makeContext(fake, { mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.match, CAREER_UI_RPC_ACTIONS.close], confirms: [true] });
    await fake.commands.get("career-match").handler("", failed.ctx);
    assert.equal(calls.length, previousCalls);
    assert.deepEqual(await snapshot(value.root), driftBytes);
    assert.deepEqual((await readApplicationCatalog(value.root, ROOT_ID)).reconciliation,
      { interrupted: 0, drifted: 1, duplicate_id: 0, unsupported: 0, over_limit: 0 });
    await assert.rejects(loadAttachedApplicationSources(value.agentDir, attachment),
      (error) => error.code === "attachment_unavailable" && !/DRIFT_SENTINEL_48|Synthetic Tailored|resume\.md/.test(error.message));
    assert.doesNotMatch(JSON.stringify(failed.notifications), /DRIFT_SENTINEL_48|Synthetic Tailored|resume\.md/);
    assert.equal(fake.entries.filter((entry) => entry.data?.kind === "result_card").length, 2);

    // A self-consistent artifact reference with a sidecar bound to another original
    // is still invalid; it must not silently fall back to the selected original.
    await writeFile(path.join(value.directory, "resume.md"), TAILORED_TEXT);
    const sidecarPath = path.join(value.directory, "resume.pi-career.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    sidecar.base_document_id = value.other.id;
    sidecar.base_text_sha256 = value.other.text_sha256;
    const mismatchedBytes = canonical(sidecar);
    await writeFile(sidecarPath, mismatchedBytes);
    const headPath = path.join(value.directory, ".pi-career-state-000003.json");
    const head = JSON.parse(await readFile(headPath, "utf8"));
    head.resume_artifact.sidecar_sha256 = hash(mismatchedBytes);
    await writeFile(headPath, canonical(head));
    const mismatchBytes = await snapshot(value.root);
    const mismatch = makeContext(fake, { mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.match, CAREER_UI_RPC_ACTIONS.close], confirms: [true] });
    await fake.commands.get("career-match").handler("", mismatch.ctx);
    assert.equal(calls.length, previousCalls);
    assert.deepEqual(await snapshot(value.root), mismatchBytes);
    assert.deepEqual((await readApplicationCatalog(value.root, ROOT_ID)).reconciliation,
      { interrupted: 0, drifted: 1, duplicate_id: 0, unsupported: 0, over_limit: 0 });
    await assert.rejects(loadAttachedApplicationSources(value.agentDir, attachment),
      (error) => error.code === "attachment_unavailable" && !/Synthetic Tailored|resume\.md/.test(error.message));
    assert.equal(fake.entries.filter((entry) => entry.data?.kind === "result_card").length, 2);
    assert.doesNotMatch(JSON.stringify(mismatch.notifications), /Synthetic Tailored|Built reliable APIs|resume\.md/);
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
