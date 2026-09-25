// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import { CAREER_UI_RPC_ACTIONS, buildCareerUiModel } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { reconstructWorkflowState } from "../../src/workflow/session-state.ts";
import { workflowErrorMessage } from "../../src/workflow/types.ts";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000161";
const CREATED_AT = "2026-08-12T00:00:00.000Z";
const COMPANY = "Synthetic Company";
const ROLE = "Synthetic Engineer";
const RESUME_SENTINEL = "SYNTHETIC_RESUME_SENTINEL_P3_16";
const ROW_LABEL = `${COMPANY} — ${ROLE} — Preparing — Incomplete 0/3`;
const CONSENT_CONTINUE = "Continue in this session";
const CONSENT_CANCEL = "Cancel and restart with --no-session";
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
    result[entry.name] = entry.isDirectory()
      ? { type: "directory", mode: metadata.mode & 0o777, entries: await snapshot(target) }
      : { type: "file", mode: metadata.mode & 0o777, bytes: (await readFile(target)).toString("hex") };
  }
  return result;
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

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-p3-16-")));
  const agentDir = path.join(temp, "agent");
  const root = await realpath(await mkdir(path.join(temp, "applications"), { mode: 0o700 }).then(() => path.join(temp, "applications")));
  const library = await realpath(await mkdir(path.join(temp, "library"), { mode: 0o700 }).then(() => path.join(temp, "library")));
  const sessions = await realpath(await mkdir(path.join(temp, "sessions"), { mode: 0o700 }).then(() => path.join(temp, "sessions")));
  await chmod(root, 0o700);
  await chmod(library, 0o700);
  await chmod(sessions, 0o700);
  await prepareConfigDirectory(agentDir);
  await privateFile(path.join(library, "synthetic-original.md"), Buffer.from(`# Synthetic original\n${RESUME_SENTINEL}\n`));
  await privateFile(path.join(sessions, "unrelated-session.jsonl"), Buffer.from("synthetic unrelated session bytes\n"));
  await privateFile(configPath(agentDir), canonical({
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: rootId(library), path: library, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  }));
  await privateFile(path.join(root, ".pi-career-applications.json"), canonical({
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: "2026-08-01T00:00:00.000Z",
  }));
  const calls = [];
  const sends = [];
  const newSessions = [];
  const order = [];
  let race = false;
  let hookCalls = 0;
  const fake = makeFakePi();
  registerCareerCommands(fake.api, {
    agentDir,
    uuid: (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`;
    })(),
    now: () => new Date(CREATED_AT),
    invoke: async (invocation) => {
      calls.push(invocation.kind);
      throw new Error("Career Core must not be invoked");
    },
    beforeWorkspaceLockAcquire: async (operation) => {
      hookCalls += 1;
      order.push("before-lock");
      assert.equal(operation, "initialize_application");
      if (!race) return;
      await mkdir(path.join(root, "synthetic-race-child"), { mode: 0o700 });
    },
  });
  fake.api.sendMessage = (...args) => sends.push(args);
  fake.api.sendUserMessage = (...args) => sends.push(args);
  return { temp, agentDir, root, library, sessions, fake, calls, sends, newSessions, order, hookCalls: () => hookCalls, setRace: (value) => { race = value; } };
}

function bind(value, script) {
  const context = makeContext(value.fake, { mode: "rpc", persisted: true });
  const dialogs = [];
  context.ctx.sendMessage = (...args) => value.sends.push(args);
  context.ctx.sendUserMessage = (...args) => value.sends.push(args);
  context.ctx.newSession = async (request) => {
    value.newSessions.push(request);
    return { cancelled: true };
  };
  context.ctx.ui.select = async (title, options) => {
    dialogs.push({ select: title, options: [...options] });
    const next = script.selects.shift();
    return typeof next === "function" ? next(title, options) : next;
  };
  context.ctx.ui.input = async (title) => {
    dialogs.push({ input: title });
    return script.inputs.shift();
  };
  context.ctx.ui.editor = async (title, prefill) => {
    value.order.push("editor");
    dialogs.push({ editor: title, prefill });
    const next = script.editors.shift();
    return typeof next === "function" ? next(title, prefill) : next;
  };
  context.ctx.ui.confirm = async (title, message) => {
    value.order.push("confirm");
    dialogs.push({ confirm: title, message });
    const next = script.confirms.shift();
    return typeof next === "function" ? next(title, message) : next;
  };
  return { context, dialogs };
}

function applicationEntries(entries) {
  return entries.filter((entry) => entry.customType === "career.workflow" && entry.data?.kind === "application");
}

function assertNoForbidden(value, dialogs, notifications) {
  const projection = dialogs.map((dialog) => dialog.editor === undefined ? dialog : { editor: dialog.editor });
  const text = JSON.stringify({ projection, notifications, entries: value.fake.entries, sends: value.sends });
  assert.equal(JSON.stringify({ dialogs, notifications, entries: value.fake.entries }).includes(RESUME_SENTINEL), false);
  assert.equal(text.includes(value.temp), false);
  assert.equal(value.calls.length, 0);
  assert.equal(value.sends.length, 0);
  assert.equal(value.newSessions.length, 0);
  assert.equal(value.fake.entries.some((entry) => entry.customType === "career.application_attachment"), false);
  assert.equal(value.fake.entries.some((entry) => entry.customType === "career.application_assistance"), false);
  assert.equal(value.fake.entries.some((entry) => entry.data?.kind === "result_card"), false);
  assert.equal(value.fake.activeTools.length, 0);
}

test("P3-16 configured-root Applications create resolves consent before exact preview, commits one canonical package, and renders Preparing Incomplete 0/3 after restart-like reconstruction", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    const tools = value.fake.activeTools;
    const denied = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CONSENT_CANCEL, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [],
      confirms: [],
    });
    await value.fake.commands.get("career").handler("", denied.context.ctx);
    assert.equal(denied.dialogs.some((dialog) => dialog.editor !== undefined), false);
    assert.equal(denied.dialogs.some((dialog) => dialog.confirm !== undefined), false);
    assert.equal(applicationEntries(value.fake.entries).length, 0);
    assert.equal(value.fake.api.getSessionName(), undefined);
    assert.equal(value.fake.entries.length, 1);
    assert.equal(value.fake.entries[0].data.kind, "consent");
    assert.equal(value.fake.entries[0].data.granted, false);
    assert.ok(denied.context.notifications.some(({ message }) => message === workflowErrorMessage("consent_required")));
    assert.deepEqual(await snapshot(value.temp), before);
    assert.deepEqual(await residueNames(value.temp), []);
    assertNoForbidden(value, denied.dialogs, denied.context.notifications);

    value.order.length = 0;
    const cancelled = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CONSENT_CONTINUE, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [undefined],
      confirms: [],
    });
    await value.fake.commands.get("career").handler("", cancelled.context.ctx);
    assert.deepEqual(value.order, ["editor"]);
    assert.equal(cancelled.dialogs.some((dialog) => dialog.confirm !== undefined), false);
    assert.equal(cancelled.dialogs.find((dialog) => dialog.editor)?.editor, "Review exact application workspace mutation");
    assert.ok(cancelled.dialogs.findIndex((dialog) => dialog.select === CONSENT_COPY_TITLE(cancelled.dialogs)) <
      cancelled.dialogs.findIndex((dialog) => dialog.editor !== undefined) ||
      cancelled.dialogs.some((dialog) => dialog.select?.includes("Pi may save private")));
    assert.ok(cancelled.dialogs.some((dialog) => String(dialog.select).includes("Pi may save private")));
    assert.equal(applicationEntries(value.fake.entries).length, 0);
    assert.equal(value.fake.api.getSessionName(), undefined);
    assert.equal(value.fake.entries.filter((entry) => entry.data?.kind === "consent" && entry.data.granted === true).length, 1);
    assert.deepEqual(await snapshot(value.temp), before);
    assert.deepEqual(await residueNames(value.temp), []);
    assertNoForbidden(value, cancelled.dialogs, cancelled.context.notifications);

    value.order.length = 0;
    const changed = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [(_title, prefill) => `${prefill}\n`],
      confirms: [],
    });
    await value.fake.commands.get("career").handler("", changed.context.ctx);
    assert.deepEqual(value.order, ["editor"]);
    assert.ok(changed.context.notifications.some(({ message }) => message === workflowErrorMessage("workspace_preview_changed")));
    assert.equal(applicationEntries(value.fake.entries).length, 0);
    assert.equal(value.fake.api.getSessionName(), undefined);
    assert.deepEqual(await snapshot(value.temp), before);
    assert.deepEqual(await residueNames(value.temp), []);
    assertNoForbidden(value, changed.dialogs, changed.context.notifications);

    value.order.length = 0;
    value.setRace(true);
    const raced = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", raced.context.ctx);
    value.setRace(false);
    assert.deepEqual(value.order, ["editor", "confirm", "before-lock"]);
    assert.equal(value.hookCalls(), 1);
    assert.ok(raced.context.notifications.some(({ message }) => message === workflowErrorMessage("workspace_drift")));
    assert.equal(applicationEntries(value.fake.entries).length, 0);
    assert.equal(value.fake.api.getSessionName(), undefined);
    const racedRoot = await snapshot(value.root);
    assert.deepEqual(Object.keys(racedRoot).sort(), [".pi-career-applications.json", "synthetic-race-child"]);
    assert.equal(racedRoot["synthetic-race-child"].type, "directory");
    assert.deepEqual(racedRoot["synthetic-race-child"].entries, {});
    assert.deepEqual(await snapshot(value.library), before.library.entries);
    assert.deepEqual(await snapshot(value.agentDir), before.agent.entries);
    assert.deepEqual(await snapshot(value.sessions), before.sessions.entries);
    assert.deepEqual(await residueNames(value.temp), []);
    assertNoForbidden(value, raced.dialogs, raced.context.notifications);
    await rm(path.join(value.root, "synthetic-race-child"), { recursive: true });
    assert.deepEqual(await snapshot(value.temp), before);

    value.order.length = 0;
    const created = bind(value, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", created.context.ctx);
    assert.deepEqual(value.order.slice(0, 3), ["editor", "confirm", "before-lock"]);
    assert.equal(value.hookCalls(), 2);
    const previewDialog = created.dialogs.find((dialog) => dialog.editor !== undefined);
    const preview = JSON.parse(previewDialog.prefill);
    assert.equal(preview.operation, "initialize_application");
    assert.equal(preview.mutation_class, "workspace_file");
    assert.deepEqual(preview.deletes, []);
    assert.deepEqual(preview.replaces, []);
    assert.equal(created.dialogs.some((dialog) => dialog.confirm === "Create application"), false);
    assert.equal(created.dialogs.some((dialog) => dialog.confirm === "Apply application workspace mutation?"), true);
    const listed = created.dialogs.filter((dialog) => dialog.select?.startsWith("Career • Applications"));
    assert.ok(listed.at(-1).options.includes(ROW_LABEL));
    assert.equal(listed.at(-1).options.some((option) => option.includes("Not persisted")), false);

    const applications = applicationEntries(value.fake.entries);
    assert.equal(applications.length, 1);
    const entry = applications[0].data;
    assert.equal(entry.company_label, COMPANY);
    assert.equal(entry.role_label, ROLE);
    assert.equal(entry.status, "preparing");
    assert.equal(entry.created_at, CREATED_AT);
    assert.equal(value.fake.api.getSessionName(), `${COMPANY} — ${ROLE}`);
    assert.equal(value.fake.entries.filter((item) => item.data?.kind === "consent").length, 2);
    assert.deepEqual(await snapshot(value.library), before.library.entries);
    assert.deepEqual(await snapshot(value.agentDir), before.agent.entries);
    assert.deepEqual(await snapshot(value.sessions), before.sessions.entries);
    assert.deepEqual(await residueNames(value.temp), []);

    const directoryName = `synthetic-company--synthetic-engineer--${entry.application_id}`;
    const directory = path.join(value.root, directoryName);
    const manifest = canonical({
      schema_version: "pi.career.application_manifest.v1",
      kind: "career_application",
      application_id: entry.application_id,
      root_id: ROOT_ID,
      application_created_at: CREATED_AT,
      workspace_created_at: CREATED_AT,
    });
    const identity = canonical({
      schema_version: "pi.career.application_identity.v1",
      kind: "application_identity",
      application_id: entry.application_id,
      company_label: COMPANY,
      role_label: ROLE,
      created_at: CREATED_AT,
    });
    const state = canonical({
      schema_version: "pi.career.application_state.v1",
      kind: "application_state_revision",
      application_id: entry.application_id,
      sequence: 1,
      parent_sha256: hash(manifest),
      status: "preparing",
      vacancy: null,
      selected_original: null,
      resume_artifact: null,
      updated_at: CREATED_AT,
    });
    assert.equal((await lstat(directory)).mode & 0o777, 0o700);
    assert.deepEqual(await readFile(path.join(directory, "application.json")), manifest);
    assert.deepEqual(await readFile(path.join(directory, ".pi-career-identity.json")), identity);
    assert.deepEqual(await readFile(path.join(directory, ".pi-career-state-000001.json")), state);
    for (const name of ["application.json", ".pi-career-identity.json", ".pi-career-state-000001.json"]) {
      assert.equal((await lstat(path.join(directory, name))).mode & 0o777, 0o600);
    }
    assert.deepEqual((await readdir(directory)).sort(), [
      ".pi-career-identity.json", ".pi-career-state-000001.json", "application.json",
    ]);
    assert.deepEqual((await readdir(value.root)).sort(), [".pi-career-applications.json", directoryName]);
    for (const createdFile of preview.creates) {
      if (createdFile.object_type === "directory") {
        assert.equal(createdFile.path, directory);
        assert.equal((await lstat(createdFile.path)).mode & 0o777, 0o700);
      } else {
        const bytes = await readFile(createdFile.path);
        assert.equal(hash(bytes), createdFile.sha256);
        assert.equal(bytes.toString("utf8"), createdFile.text);
        assert.equal(bytes.length, createdFile.utf8_bytes);
        assert.equal((await lstat(createdFile.path)).mode & 0o777, Number.parseInt(createdFile.mode, 8));
      }
    }
    const catalog = await readApplicationCatalog(value.root, ROOT_ID);
    assert.equal(catalog.applications.length, 1);
    assert.equal(catalog.applications[0].application_id, entry.application_id);
    assert.equal(catalog.applications[0].status, "preparing");
    assert.equal(catalog.applications[0].identity.company_label, COMPANY);
    assertNoForbidden(value, created.dialogs, created.context.notifications);

    const restarted = makeFakePi();
    const restartCalls = [];
    registerCareerCommands(restarted.api, {
      agentDir: value.agentDir,
      uuid: () => "00000000-0000-4000-8000-0000000000aa",
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      invoke: async () => {
        restartCalls.push("core");
        throw new Error("restart listing must not invoke Career Core");
      },
    });
    const restartContext = makeContext(restarted, { mode: "rpc", persisted: true });
    const restartSends = [];
    restartContext.ctx.sendMessage = (...args) => restartSends.push(args);
    restartContext.ctx.sendUserMessage = (...args) => restartSends.push(args);
    const restartDialogs = [];
    restartContext.ctx.ui.select = async (title, options) => {
      restartDialogs.push({ title, options: [...options] });
      return CAREER_UI_RPC_ACTIONS.close;
    };
    const beforeRestart = await snapshot(value.temp);
    await restarted.commands.get("career").handler("", restartContext.ctx);
    const model = await buildCareerUiModel(value.agentDir, restartContext.ctx);
    assert.equal(restarted.entries.length, 0);
    assert.equal(model.applications.items.length, 1);
    assert.equal(model.applications.items[0].label, ROW_LABEL);
    assert.match(model.applications.items[0].detail, /Status: Preparing\nReadiness: Incomplete 0\/3/);
    assert.equal(model.applications.items[0].pointer === undefined, false);
    assert.ok(restartDialogs[0].options.includes(ROW_LABEL));
    assert.equal(restartDialogs[0].options.some((option) => option.includes("Not persisted")), false);
    assert.equal(JSON.stringify(restartDialogs).includes(value.temp), false);
    assert.equal(JSON.stringify(restartDialogs).includes(RESUME_SENTINEL), false);
    assert.equal(restartCalls.length, 0);
    assert.equal(restartSends.length, 0);
    assert.deepEqual(await snapshot(value.temp), beforeRestart);
    assert.deepEqual(value.fake.activeTools, tools);
    assert.equal(reconstructWorkflowState(restarted.entries).application, undefined);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

function CONSENT_COPY_TITLE(dialogs) {
  return dialogs.find((dialog) => String(dialog.select).includes("Pi may save private"))?.select;
}
