// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, writeFileSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readOverlayApplications } from "../../src/workflow/application-workspace.ts";
import { deriveApplicationReadiness } from "../../src/workflow/application-readiness.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { sha256 } from "../../src/workflow/scan.ts";
import { workflowErrorMessage } from "../../src/workflow/types.ts";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000330";
const LEGACY_ID = "00000000-0000-4000-8000-000000000331";
const CREATED_AT = "2026-08-12T00:00:00.000Z";
const LEGACY_CREATED_AT = "2026-07-01T00:00:00.000Z";
const LEGACY_WORKSPACE_AT = "2026-07-01T00:00:01.000Z";
const LEGACY_UPDATED_AT = "2026-07-01T00:00:02.000Z";
const COMPANY = "Synthetic Company";
const ROLE = "Synthetic Engineer";
const LEGACY_COMPANY = "Synthetic Legacy Company";
const LEGACY_ROLE = "Synthetic Legacy Engineer";
const LEGACY_DIRECTORY = `synthetic-legacy-company--synthetic-legacy-engineer--${LEGACY_ID}`;
const LEGACY_LABEL = "Legacy application — preparing";
const MIGRATED_LABEL = `${LEGACY_COMPANY} — ${LEGACY_ROLE} — Preparing — Incomplete 0/3`;
const CONSENT_CONTINUE = "Continue in this session";
const CONSENT_CANCEL = "Cancel and restart with --no-session";
const SENTINELS = {
  coreResult: "P3_33_CORE_RESULT_SENTINEL",
  coreError: "P3_33_CORE_ERROR_SENTINEL",
  providerRequest: "P3_33_PROVIDER_REQUEST_SENTINEL",
  providerResponse: "P3_33_PROVIDER_RESPONSE_SENTINEL",
  prompt: "P3_33_PROMPT_SENTINEL",
  editor: "P3_33_EDITOR_SENTINEL",
};
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function snapshot(directory) {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    const metadata = await lstat(target);
    assert.equal(metadata.isSymbolicLink(), false, target);
    result[entry.name] = entry.isDirectory()
      ? { type: "directory", mode: metadata.mode & 0o777, entries: await snapshot(target) }
      : { type: "file", mode: metadata.mode & 0o777, bytes: (await readFile(target)).toString("hex") };
  }
  return result;
}

function treeHas(tree, needle) {
  const hex = Buffer.from(needle).toString("hex");
  for (const [name, entry] of Object.entries(tree)) {
    if (name.includes(needle) || (entry.type === "file" ? entry.bytes.includes(hex) : treeHas(entry.entries, needle))) {
      return true;
    }
  }
  return false;
}

async function residueNames(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.name.includes(".tmp") || entry.name.endsWith(".lock")) found.push(entry.name);
    if (entry.isDirectory()) found.push(...(await residueNames(target)).map((name) => `${entry.name}/${name}`));
  }
  return found;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-p3-33-")));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  const library = path.join(temp, "library");
  const sessions = path.join(temp, "sessions");
  const packageCache = path.join(temp, "package-cache");
  await prepareConfigDirectory(agentDir);
  for (const directory of [root, library, sessions, packageCache]) {
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o700);
  }
  const libraryRoot = rootId(await realpath(library));
  await privateFile(path.join(library, "synthetic-original.md"), Buffer.from("# Synthetic original\nNo private document.\n"));
  const sessionFile = path.join(sessions, "active-session.jsonl");
  const sessionMeta = path.join(sessions, "active-session.meta.json");
  await privateFile(sessionFile, Buffer.from("synthetic unrelated session bytes\n"));
  await privateFile(configPath(agentDir), canonical({
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: libraryRoot, path: library, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  }));
  await privateFile(path.join(root, ".pi-career-applications.json"), canonical({
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: "2026-06-01T00:00:00.000Z",
  }));
  const legacyDirectory = path.join(root, LEGACY_DIRECTORY);
  await mkdir(legacyDirectory, { mode: 0o700 });
  await chmod(legacyDirectory, 0o700);
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: LEGACY_ID,
    root_id: ROOT_ID,
    application_created_at: LEGACY_CREATED_AT,
    workspace_created_at: LEGACY_WORKSPACE_AT,
  });
  await privateFile(path.join(legacyDirectory, "application.json"), manifest);
  await privateFile(path.join(legacyDirectory, ".pi-career-state-000001.json"), canonical({
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: LEGACY_ID,
    sequence: 1,
    parent_sha256: hash(manifest),
    status: "preparing",
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    updated_at: LEGACY_UPDATED_AT,
  }));

  const coreResult = {
    schema_version: "career.resume_analysis.v1",
    checks: [{ explanation: SENTINELS.coreResult }],
  };
  const coreError = new Error(SENTINELS.coreError);
  const providerExchange = {
    request: { method: "POST", body: SENTINELS.providerRequest },
    response: { body: SENTINELS.providerResponse },
  };
  const editorBuffer = [SENTINELS.editor];
  const promptBuffer = [SENTINELS.prompt];
  const trapRequests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      trapRequests.push(Buffer.concat(chunks).toString("utf8"));
      response.end("probe");
    });
  });
  const port = await listen(server);
  const probe = await fetch(`http://127.0.0.1:${port}/probe`, { method: "POST", body: "probe" });
  assert.equal(probe.status, 200);
  assert.deepEqual(trapRequests, ["probe"]);
  trapRequests.length = 0;

  const resultCard = {
    schema_version: "pi.career.workflow_state.v1",
    kind: "result_card",
    state_id: "00000000-0000-4000-8000-0000000000c1",
    created_at: CREATED_AT,
    workflow: "analyze",
    run_id: "00000000-0000-4000-8000-0000000000c2",
    resume_id: hash(Buffer.from("synthetic-resume")),
    resume_label: SENTINELS.coreResult,
    resume_path_fingerprint: hash(Buffer.from("synthetic-path")),
    input_digests: {
      resume_text_sha256: hash(Buffer.from("synthetic-resume-text")),
      vacancy_text_sha256: hash(Buffer.from("synthetic-vacancy-text")),
    },
    projection: {
      schema_version: "pi.career.result_projection.v1",
      core_schema_version: "career.resume_analysis.v1",
      summary: { overall_score: 1 },
      ui_flags: { adjusted: false, provisional: false, close_cluster: false, stale: false },
    },
  };
  const fake = makeFakePi();
  fake.entries.push(
    {
      type: "custom", customType: "career.workflow", data: resultCard, id: "memory-card",
      parentId: null, timestamp: CREATED_AT,
    },
    {
      type: "message", id: "memory-provider", parentId: "memory-card", timestamp: CREATED_AT,
      message: { role: "assistant", content: providerExchange.response.body, request: providerExchange.request },
    },
    {
      type: "message", id: "memory-prompt", parentId: "memory-provider", timestamp: CREATED_AT,
      message: { role: "user", content: promptBuffer[0] },
    },
  );
  const persistedEntries = [];
  const appendEntry = fake.api.appendEntry.bind(fake.api);
  const setSessionName = fake.api.setSessionName.bind(fake.api);
  fake.api.appendEntry = (customType, data) => {
    appendEntry(customType, data);
    persistedEntries.push({ customType, data });
    appendFileSync(sessionFile, `${JSON.stringify({ customType, data })}\n`);
    chmodSync(sessionFile, 0o600);
  };
  fake.api.setSessionName = (value) => {
    setSessionName(value);
    writeFileSync(sessionMeta, canonical({ name: value }));
    chmodSync(sessionMeta, 0o600);
  };
  const workflowCoreCalls = [];
  const sends = [];
  const newSessions = [];
  let race = false;
  fake.api.sendMessage = (...args) => sends.push(args);
  fake.api.sendUserMessage = (...args) => sends.push(args);
  registerCareerCommands(fake.api, {
    agentDir,
    uuid: (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`;
    })(),
    now: () => new Date(CREATED_AT),
    invoke: async () => {
      workflowCoreCalls.push("core");
      throw coreError;
    },
    beforeWorkspaceLockAcquire: async (operation) => {
      if (race && operation === "initialize_application") {
        await mkdir(path.join(root, "synthetic-race-child"), { mode: 0o700 });
      }
    },
    afterWorkspaceLockAcquired: async () => {
      await assertDiskClean(temp);
      assert.equal((await residueNames(temp)).some((name) => name.endsWith(".pi-career-workspace.lock")), true);
    },
  });
  const theme = { fg(_color, text) { return text; }, bold(text) { return text; } };
  const rendered = fake.renderers.get("career.workflow")(
    { type: "custom", customType: "career.workflow", data: resultCard },
    {},
    theme,
  ).render(80).join("\n");
  assert.match(rendered, new RegExp(SENTINELS.coreResult));
  const sentinelResume = `Synthetic in-memory resume\n${SENTINELS.coreResult}\n`;
  const readinessEvidence = {
    vacancy: "valid",
    resume_artifact: "valid",
    cover_letter_artifact: "valid",
    library_scan: {
      records: [{
        id: hash(Buffer.from("synthetic-doc")),
        root_id: libraryRoot,
        path: "/synthetic/in-memory-only.md",
        relative_path: "in-memory-only.md",
        label: "Synthetic in-memory original",
        kind: "original",
        format: "markdown",
        modified_at: CREATED_AT,
        size_bytes: Buffer.byteLength(sentinelResume),
        text: sentinelResume,
        text_sha256: sha256(sentinelResume),
      }],
      warnings: [],
      roots: [{
        root_id: libraryRoot, original_count: 1, assisted_variant_count: 0,
        too_large_count: 0, stale: false, capped: false,
      }],
      total_capped: false,
    },
  };
  return {
    temp, agentDir, root, library, sessions, packageCache, sessionFile, sessionMeta, legacyDirectory,
    fake, sends, newSessions, workflowCoreCalls, persistedEntries, coreResult, coreError,
    providerExchange, editorBuffer, promptBuffer, trapRequests, server, port, readinessEvidence,
    setRace: (value) => { race = value; },
  };
}

async function assertDiskClean(directory) {
  const tree = await snapshot(directory);
  for (const sentinel of Object.values(SENTINELS)) assert.equal(treeHas(tree, sentinel), false, sentinel);
  return tree;
}

function assertMemoryLive(value) {
  const entries = JSON.stringify(value.fake.entries);
  assert.match(entries, new RegExp(SENTINELS.coreResult));
  assert.match(entries, new RegExp(SENTINELS.providerRequest));
  assert.match(entries, new RegExp(SENTINELS.providerResponse));
  assert.match(entries, new RegExp(SENTINELS.prompt));
  assert.equal(value.editorBuffer[0], SENTINELS.editor);
  assert.equal(value.promptBuffer[0], SENTINELS.prompt);
  assert.match(JSON.stringify(value.coreResult), new RegExp(SENTINELS.coreResult));
  assert.match(value.coreError.message, new RegExp(SENTINELS.coreError));
  assert.match(JSON.stringify(value.providerExchange), new RegExp(SENTINELS.providerRequest));
  assert.match(JSON.stringify(value.providerExchange), new RegExp(SENTINELS.providerResponse));
  assert.equal(value.workflowCoreCalls.length, 0);
  assert.equal(value.trapRequests.length, 0);
  assert.equal(value.sends.length, 0);
  assert.equal(value.newSessions.length, 0);
  assert.equal(value.fake.tools.size, 0);
}

async function deriveWhileSentinelsAreLive(value) {
  const before = await snapshot(value.temp);
  const selected = value.readinessEvidence.library_scan.records[0];
  const derived = deriveApplicationReadiness({
    vacancy: null,
    selected_original: {
      document_id: selected.id,
      library_root_id: selected.root_id,
      text_sha256: selected.text_sha256,
      format: "markdown",
    },
    resume_artifact: null,
    cover_letter_artifact: null,
  }, value.readinessEvidence);
  assert.equal(derived.readiness, "Incomplete 1/3");
  assert.equal(derived.effective_resume, "original");
  assert.equal(JSON.stringify(derived).includes(SENTINELS.coreResult), false);
  assert.throws(() => deriveApplicationReadiness({
    vacancy: null,
    selected_original: null,
    resume_artifact: { artifact_sha256: hash(Buffer.from("synthetic-artifact")) },
    cover_letter_artifact: null,
  }, value.readinessEvidence), /invalid validated readiness snapshot/);
  assert.deepEqual(await snapshot(value.temp), before);
}

function bind(value, script) {
  const context = makeContext(value.fake, { mode: "rpc", persisted: true, editorText: value.editorBuffer });
  context.ctx.cwd = value.temp;
  context.ctx.sessionManager.getSessionFile = () => value.sessionFile;
  context.ctx.sendMessage = (...args) => value.sends.push(args);
  context.ctx.sendUserMessage = (...args) => value.sends.push(args);
  context.ctx.newSession = async (request) => {
    value.newSessions.push(request);
    return { cancelled: true };
  };
  const dialogs = [];
  const selects = [...script.selects];
  const inputs = [...(script.inputs ?? [])];
  const editors = [...(script.editors ?? [])];
  const confirms = [...(script.confirms ?? [])];
  context.ctx.ui.select = async (title, options) => {
    dialogs.push({ select: title, options: [...options] });
    const next = selects.shift();
    return typeof next === "function" ? next(title, options) : next;
  };
  context.ctx.ui.input = async (title, placeholder) => {
    dialogs.push({ input: title, placeholder });
    return inputs.shift();
  };
  context.ctx.ui.editor = async (title, prefill) => {
    assert.equal(prefill.includes(SENTINELS.editor), false);
    for (const sentinel of Object.values(SENTINELS)) assert.equal(prefill.includes(sentinel), false);
    const next = editors.shift();
    const returned = typeof next === "function" ? next(title, prefill) : next;
    dialogs.push({ editor: title, prefill, returned });
    return returned;
  };
  context.ctx.ui.confirm = async (title, message) => {
    dialogs.push({ confirm: title, message });
    const next = confirms.shift();
    return typeof next === "function" ? next(title, message) : next;
  };
  return { context, dialogs };
}

function assertLocalSurface(dialogs, notifications, allowed = []) {
  const text = JSON.stringify({ dialogs, notifications });
  for (const sentinel of Object.values(SENTINELS)) {
    if (!allowed.includes(sentinel)) assert.equal(text.includes(sentinel), false, sentinel);
  }
  assert.equal(JSON.stringify(notifications).includes("P3_33_"), false);
}

test("P3-33 registered create, migrate, list, and readiness derivation leave in-memory Core, provider, and prompt sentinels unpersisted", async () => {
  const value = await fixture();
  try {
    const baseline = await assertDiskClean(value.temp);
    assert.deepEqual(await residueNames(value.temp), []);
    await deriveWhileSentinelsAreLive(value);
    const listed = bind(value, {
      selects: [LEGACY_LABEL, CAREER_UI_RPC_ACTIONS.back, CAREER_UI_RPC_ACTIONS.switchView, "Analyze", CAREER_UI_RPC_ACTIONS.close],
    });
    await value.fake.commands.get("career").handler("", listed.context.ctx);
    const analyze = listed.dialogs.find((dialog) => dialog.select?.startsWith("Career • Analyze"));
    assert.ok(analyze.options.some((option) => option.includes(SENTINELS.coreResult)));
    assertLocalSurface(listed.dialogs, listed.context.notifications, [SENTINELS.coreResult]);
    const overlay = await readOverlayApplications(value.agentDir, value.readinessEvidence.library_scan);
    assert.equal(overlay.length, 1);
    assert.equal(overlay[0].readiness, "Incomplete 0/3");
    assert.equal(JSON.stringify(overlay).includes("P3_33_"), false);
    assert.deepEqual(await snapshot(value.temp), baseline);
    assert.equal(value.persistedEntries.length, 0);
    assertMemoryLive(value);

    const migrateCancel = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.migrate, CAREER_UI_RPC_ACTIONS.close],
      inputs: [LEGACY_COMPANY, LEGACY_ROLE],
      editors: [undefined],
    });
    await value.fake.commands.get("career").handler("", migrateCancel.context.ctx);
    assert.equal(migrateCancel.dialogs.some((dialog) => dialog.confirm !== undefined), false);
    assertLocalSurface(migrateCancel.dialogs, migrateCancel.context.notifications);
    assert.deepEqual(await snapshot(value.temp), baseline);
    assert.equal(value.persistedEntries.length, 0);
    assertMemoryLive(value);

    const migrateChanged = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.migrate, CAREER_UI_RPC_ACTIONS.close],
      inputs: [LEGACY_COMPANY, LEGACY_ROLE],
      editors: [(_title, prefill) => `${prefill}\n${SENTINELS.editor}`],
    });
    await value.fake.commands.get("career").handler("", migrateChanged.context.ctx);
    assert.equal(migrateChanged.dialogs.some((dialog) => dialog.confirm !== undefined), false);
    assert.match(JSON.stringify(migrateChanged.dialogs), new RegExp(SENTINELS.editor));
    assert.equal(JSON.stringify(migrateChanged.context.notifications).includes(SENTINELS.editor), false);
    assert.deepEqual(await snapshot(value.temp), baseline);
    assertMemoryLive(value);

    const migrated = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.migrate, MIGRATED_LABEL, CAREER_UI_RPC_ACTIONS.back, CAREER_UI_RPC_ACTIONS.close],
      inputs: [LEGACY_COMPANY, LEGACY_ROLE],
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", migrated.context.ctx);
    const migratedDetail = migrated.dialogs.find((dialog) => dialog.select?.includes("Readiness:"));
    assert.match(migratedDetail.select, /Readiness: Incomplete 0\/3/);
    assertLocalSurface(migrated.dialogs, migrated.context.notifications);
    const migratedTree = await assertDiskClean(value.temp);
    assert.deepEqual(await residueNames(value.temp), []);
    const identity = canonical({
      schema_version: "pi.career.application_identity.v1",
      kind: "application_identity",
      application_id: LEGACY_ID,
      company_label: LEGACY_COMPANY,
      role_label: LEGACY_ROLE,
      created_at: LEGACY_CREATED_AT,
    });
    assert.equal(migratedTree.applications.entries[LEGACY_DIRECTORY].entries[".pi-career-identity.json"].bytes, identity.toString("hex"));
    const withoutIdentity = structuredClone(migratedTree);
    delete withoutIdentity.applications.entries[LEGACY_DIRECTORY].entries[".pi-career-identity.json"];
    assert.deepEqual(withoutIdentity, baseline);
    assert.equal(value.persistedEntries.length, 0);
    assertMemoryLive(value);

    const denied = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CONSENT_CANCEL, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
    });
    await value.fake.commands.get("career").handler("", denied.context.ctx);
    assert.ok(denied.context.notifications.some(({ message }) => message === workflowErrorMessage("consent_required")));
    assert.equal(value.persistedEntries.length, 1);
    assert.equal(value.persistedEntries[0].data.kind, "consent");
    assert.equal(value.persistedEntries[0].data.granted, false);
    assert.deepEqual(Object.keys(value.persistedEntries[0].data).sort(), [
      "created_at", "granted", "kind", "schema_version", "scope", "state_id",
    ]);
    assertLocalSurface(denied.dialogs, denied.context.notifications);
    const deniedTree = await assertDiskClean(value.temp);
    assert.notDeepEqual(deniedTree.sessions, baseline.sessions);
    assert.deepEqual(deniedTree.applications, migratedTree.applications);
    assert.deepEqual(deniedTree.library, baseline.library);
    assert.deepEqual(deniedTree.agent, baseline.agent);
    assert.deepEqual(deniedTree["package-cache"], baseline["package-cache"]);
    assert.deepEqual(await residueNames(value.temp), []);
    assertMemoryLive(value);

    const cancelled = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CONSENT_CONTINUE, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [undefined],
    });
    await value.fake.commands.get("career").handler("", cancelled.context.ctx);
    assert.equal(cancelled.dialogs.some((dialog) => dialog.confirm !== undefined), false);
    assert.equal(value.persistedEntries.at(-1).data.granted, true);
    assert.equal(value.persistedEntries.length, 2);
    assertLocalSurface(cancelled.dialogs, cancelled.context.notifications);
    const cancelledTree = await assertDiskClean(value.temp);
    assert.deepEqual(cancelledTree.applications, migratedTree.applications);
    assert.deepEqual(await residueNames(value.temp), []);
    assertMemoryLive(value);

    const changed = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [(_title, prefill) => `${prefill}\n${SENTINELS.editor}`],
    });
    await value.fake.commands.get("career").handler("", changed.context.ctx);
    assert.ok(changed.context.notifications.some(({ message }) => message === workflowErrorMessage("workspace_preview_changed")));
    assert.match(JSON.stringify(changed.dialogs), new RegExp(SENTINELS.editor));
    assert.equal(JSON.stringify(changed.context.notifications).includes("P3_33_"), false);
    assert.equal(value.persistedEntries.length, 2);
    assert.deepEqual(await snapshot(value.temp), cancelledTree);
    assertMemoryLive(value);

    value.setRace(true);
    const raced = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", raced.context.ctx);
    value.setRace(false);
    assert.ok(raced.context.notifications.some(({ message }) => message === workflowErrorMessage("workspace_drift")));
    assert.equal(value.persistedEntries.length, 2);
    assert.equal(value.fake.api.getSessionName(), undefined);
    await assertDiskClean(value.temp);
    assert.deepEqual(await residueNames(value.temp), []);
    await rm(path.join(value.root, "synthetic-race-child"), { recursive: true });
    assert.deepEqual(await snapshot(value.temp), cancelledTree);
    assertLocalSurface(raced.dialogs, raced.context.notifications);
    assertMemoryLive(value);

    const created = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", created.context.ctx);
    const preview = JSON.parse(created.dialogs.find((dialog) => dialog.editor !== undefined).prefill);
    assert.equal(preview.operation, "initialize_application");
    assert.equal(preview.mutation_class, "workspace_file");
    const application = value.persistedEntries.at(-1).data;
    assert.equal(application.kind, "application");
    assert.deepEqual(Object.keys(application).sort(), [
      "application_id", "company_label", "created_at", "kind", "role_label", "schema_version", "state_id", "status",
    ]);
    assert.equal(application.company_label, COMPANY);
    assert.equal(application.role_label, ROLE);
    assert.equal(application.status, "preparing");
    assert.equal(value.fake.api.getSessionName(), `${COMPANY} — ${ROLE}`);
    assert.equal(value.persistedEntries.filter((entry) => entry.data.kind === "result_card").length, 0);
    const createdLabel = `${COMPANY} — ${ROLE} — Preparing — Incomplete 0/3`;
    assert.ok(created.dialogs.some((dialog) => dialog.options?.includes(createdLabel)));
    assertLocalSurface(created.dialogs, created.context.notifications);
    const createdTree = await assertDiskClean(value.temp);
    assert.deepEqual(await residueNames(value.temp), []);
    const createdDirectory = `synthetic-company--synthetic-engineer--${application.application_id}`;
    const createdManifest = canonical({
      schema_version: "pi.career.application_manifest.v1",
      kind: "career_application",
      application_id: application.application_id,
      root_id: ROOT_ID,
      application_created_at: CREATED_AT,
      workspace_created_at: CREATED_AT,
    });
    const createdIdentity = canonical({
      schema_version: "pi.career.application_identity.v1",
      kind: "application_identity",
      application_id: application.application_id,
      company_label: COMPANY,
      role_label: ROLE,
      created_at: CREATED_AT,
    });
    const createdState = canonical({
      schema_version: "pi.career.application_state.v1",
      kind: "application_state_revision",
      application_id: application.application_id,
      sequence: 1,
      parent_sha256: hash(createdManifest),
      status: "preparing",
      vacancy: null,
      selected_original: null,
      resume_artifact: null,
      updated_at: CREATED_AT,
    });
    const createdEntries = createdTree.applications.entries[createdDirectory].entries;
    assert.equal(createdEntries["application.json"].bytes, createdManifest.toString("hex"));
    assert.equal(createdEntries[".pi-career-identity.json"].bytes, createdIdentity.toString("hex"));
    assert.equal(createdEntries[".pi-career-state-000001.json"].bytes, createdState.toString("hex"));
    assert.deepEqual(Object.keys(createdEntries).sort(), [
      ".pi-career-identity.json", ".pi-career-state-000001.json", "application.json",
    ]);
    assert.equal(createdTree.sessions.entries["active-session.meta.json"].bytes, canonical({ name: `${COMPANY} — ${ROLE}` }).toString("hex"));
    assert.deepEqual(createdTree.library, baseline.library);
    assert.deepEqual(createdTree.agent, baseline.agent);
    assert.deepEqual(createdTree["package-cache"], baseline["package-cache"]);
    assertMemoryLive(value);

    const hidden = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.switchView, "Analyze", CAREER_UI_RPC_ACTIONS.close],
    });
    await value.fake.commands.get("career").handler("", hidden.context.ctx);
    const hiddenAnalyze = hidden.dialogs.find((dialog) => dialog.select?.startsWith("Career • Analyze"));
    assert.equal(hiddenAnalyze.options.some((option) => option.includes(SENTINELS.coreResult)), false);
    assertLocalSurface(hidden.dialogs, hidden.context.notifications);
    assert.deepEqual(await snapshot(value.temp), createdTree);

    const restarted = makeFakePi();
    const restartCalls = [];
    registerCareerCommands(restarted.api, {
      agentDir: value.agentDir,
      uuid: () => "00000000-0000-4000-8000-0000000000aa",
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      invoke: async () => {
        restartCalls.push("core");
        throw new Error(SENTINELS.coreError);
      },
    });
    const restartContext = makeContext(restarted, { mode: "rpc", persisted: true });
    restartContext.ctx.sessionManager.getSessionFile = () => value.sessionFile;
    const restartDialogs = [];
    let openedRestartDetail = false;
    restartContext.ctx.ui.select = async (title, options) => {
      restartDialogs.push({ select: title, options: [...options] });
      if (!openedRestartDetail && title.startsWith("Career • Applications") && options.includes(MIGRATED_LABEL)) {
        openedRestartDetail = true;
        return MIGRATED_LABEL;
      }
      if (title.includes("Readiness:")) return CAREER_UI_RPC_ACTIONS.back;
      return CAREER_UI_RPC_ACTIONS.close;
    };
    const beforeRestart = await snapshot(value.temp);
    await restarted.commands.get("career").handler("", restartContext.ctx);
    assert.equal(restarted.entries.length, 0);
    assert.equal(restartCalls.length, 0);
    assert.match(restartDialogs.find((dialog) => dialog.select?.includes("Readiness:")).select, /Readiness: Incomplete 0\/3/);
    assert.ok(restartDialogs[0].options.includes(createdLabel));
    assert.equal(JSON.stringify(restartDialogs).includes("P3_33_"), false);
    assert.equal(JSON.stringify(restartContext.notifications).includes("P3_33_"), false);
    const restartOverlay = await readOverlayApplications(value.agentDir, {
      records: [], warnings: [], roots: [], total_capped: false,
    });
    assert.deepEqual(restartOverlay.map((item) => item.readiness), ["Incomplete 0/3", "Incomplete 0/3"]);
    assert.equal(JSON.stringify(restartOverlay).includes("P3_33_"), false);
    assert.equal((await readFile(value.sessionFile, "utf8")).includes("P3_33_"), false);
    assert.deepEqual(await snapshot(value.temp), beforeRestart);
    assert.deepEqual(await residueNames(value.temp), []);
    assertMemoryLive(value);
  } finally {
    value.server.closeAllConnections?.();
    await new Promise((resolve, reject) => value.server.close((error) => error ? reject(error) : resolve()));
    await rm(value.temp, { recursive: true, force: true });
  }
});
