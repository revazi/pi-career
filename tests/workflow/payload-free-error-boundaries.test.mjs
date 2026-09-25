// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CareerInvocationError } from "../../src/errors.ts";
import careerCoreExtension from "../../src/index.ts";
import { CareerRunError } from "../../src/managed/errors.ts";
import { registerCareerRun } from "../../src/managed/tool.ts";
import { clearRuntimeResolutionCache, resolveCareerRuntime } from "../../src/runtime.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { workflowErrorMessage } from "../../src/workflow/types.ts";
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

const repositoryRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
const piCli = path.join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const extensionPath = path.join(repositoryRoot, "dist/index.js");
const ROOT_ID = "00000000-0000-4000-8000-000000000037";
const CATALOG_ID = "00000000-0000-4000-8000-000000000137";
const COMPANY = "Synthetic Company";
const ROLE = "Synthetic Engineer";
const SENTINELS = {
  resolver: "P3_37_RESOLVER_SENTINEL",
  invoke: "P3_37_INVOKE_SENTINEL",
  source: "P3_37_SOURCE_SENTINEL",
  catalog: "P3_37_CATALOG_SENTINEL",
  session: "P3_37_SESSION_SENTINEL",
  ui: "P3_37_UI_SENTINEL",
  commit: "P3_37_COMMIT_SENTINEL",
  tool: "P3_37_TOOL_SENTINEL",
  host: "P3_37_HOST_STDERR_SENTINEL",
  env: "KEY=P3_37_ENV_SECRET",
  uuid: "9f3c2a10-1111-4111-8111-000000000037",
  hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  body: "P3_37_BODY_SENTINEL",
  schema: "P3_37_SCHEMA_BYTES",
  stack: "at payloadFreeLeak (synthetic/private.ts:1:1)",
  path: "/synthetic/private/resume",
  errno: "ENOENT: no such file or directory",
};
const LEAK_MARKERS = [
  ...Object.values(SENTINELS),
  "EACCES",
  "EPERM",
  "Error: P3_37",
];

function poison(marker) {
  const error = new Error(`${marker} ${SENTINELS.path} ${SENTINELS.env} ${SENTINELS.errno} ${SENTINELS.stack}`);
  error.stack = `${error.message}\n${SENTINELS.stack}\n${SENTINELS.uuid} ${SENTINELS.hash} ${SENTINELS.body} ${SENTINELS.schema}`;
  return error;
}

function foreignInvocation(code, marker) {
  return new CareerInvocationError({
    schema_version: "career.pi_error.v1",
    code,
    message: `${marker} ${SENTINELS.path} ${SENTINELS.env} ${SENTINELS.errno}`,
    career_error: {
      schema_version: "career.error.v1",
      code: "invalid_json",
      message: `${marker} ${SENTINELS.body} ${SENTINELS.schema} ${SENTINELS.uuid} ${SENTINELS.hash}`,
      field_path: "resume",
    },
  });
}

function assertClean(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of LEAK_MARKERS) {
    if (text.includes(marker)) throw new Error(`${label} contained a synthetic private sentinel`);
  }
  assert.doesNotMatch(text, /at payloadFreeLeak|\/synthetic\/private/);
}

function assertStableWorkflow(error, code) {
  assert.equal(error.code, code);
  assert.deepEqual(JSON.parse(error.message), {
    schema_version: "pi.career.workflow_error.v1",
    code,
    message: workflowErrorMessage(code),
  });
  assertClean("workflow error", error.message);
  assertClean("workflow stack", error.stack);
}

function assertStableAdapter(error, code, message) {
  assert.equal(error.payload.code, code);
  assert.equal(error.payload.career_error, undefined);
  assert.deepEqual(JSON.parse(error.message), {
    schema_version: "career.pi_error.v1",
    code,
    message,
  });
  assertClean("adapter error", `${error.message}\n${error.stack}`);
}

async function privateFile(file, bytes, mode = 0o600) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, bytes, { mode });
  await chmod(file, mode);
}

async function snapshot(directory) {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) {
      result[entry.name] = { type: "symlink" };
      continue;
    }
    if (entry.isDirectory()) {
      result[entry.name] = { type: "directory", mode: metadata.mode & 0o777, entries: await snapshot(target) };
      continue;
    }
    let bytes = "";
    try {
      bytes = (await readFile(target)).toString("hex");
    } catch (error) {
      bytes = `unreadable:${error.code ?? "unknown"}`;
    }
    result[entry.name] = { type: "file", mode: metadata.mode & 0o777, bytes };
  }
  return result;
}

function treeHasLeak(tree, allow = new Set()) {
  for (const [name, entry] of Object.entries(tree)) {
    if (allow.has(name)) continue;
    if (LEAK_MARKERS.some((marker) => name.includes(marker))) return name;
    if (entry.type === "directory") {
      const nested = treeHasLeak(entry.entries, allow);
      if (nested !== undefined) return `${name}/${nested}`;
      continue;
    }
    if (entry.type !== "file" || entry.bytes.startsWith("unreadable:")) continue;
    const text = Buffer.from(entry.bytes, "hex").toString("utf8");
    if (LEAK_MARKERS.some((marker) => text.includes(marker))) return name;
  }
  return undefined;
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

async function workspaceFixture(prefix) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  await chmod(temp, 0o700);
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
  const libraryRoot = await realpath(library);
  await privateFile(path.join(libraryRoot, "synthetic-original.md"), Buffer.from("# Synthetic original\nSynthetic experience\n"));
  await privateFile(path.join(libraryRoot, "blocked.md"), Buffer.from(`${SENTINELS.source} ${SENTINELS.body}\n`), 0o000);
  await privateFile(path.join(libraryRoot, "broken.txt"), Buffer.from([0xff, 0xfe, ...Buffer.from(SENTINELS.source)]));
  await privateFile(path.join(libraryRoot, "note.pdf"), Buffer.from(`%PDF-1.1\n${SENTINELS.source} ${SENTINELS.body}\n`));
  await privateFile(configPath(agentDir), Buffer.from(`${JSON.stringify({
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: rootId(libraryRoot), path: libraryRoot, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: await realpath(root) },
  }, null, 2)}\n`));
  await privateFile(path.join(root, ".pi-career-applications.json"), Buffer.from(`${JSON.stringify({
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: "2026-08-01T00:00:00.000Z",
  }, null, 2)}\n`));
  await privateFile(path.join(sessions, "forged-session.jsonl"), Buffer.from(`{"data":"${SENTINELS.session}"}\n`));
  return { temp, agentDir, root, library: libraryRoot, sessions, packageCache };
}

test("P3-37 registered and installed payload-free errors omit synthetic sentinels across resolver, source, catalog, session, UI, persistence, and public tools", async () => {
  const fixture = await workspaceFixture("pi-career-p337-");
  try {
    clearRuntimeResolutionCache();
    const resolverPath = path.join(fixture.temp, SENTINELS.resolver);
    await assert.rejects(
      resolveCareerRuntime({
        environment: { CAREER_CLI_PATH: resolverPath, PATH: "", PI_OFFLINE: "1" },
        probe: async () => { throw foreignInvocation("missing_executable", SENTINELS.resolver); },
        dependencies: { resolvePackageManifest: () => undefined },
      }),
      (error) => {
        assertStableAdapter(error, "missing_executable", "The selected Career Core runtime was not found.");
        return true;
      },
    );
    clearRuntimeResolutionCache();
    await assert.rejects(
      resolveCareerRuntime({
        environment: { CAREER_CLI_PATH: resolverPath, PATH: "", PI_OFFLINE: "1" },
        probe: async () => { throw poison(SENTINELS.resolver); },
        dependencies: { resolvePackageManifest: () => undefined },
      }),
      (error) => {
        assertStableAdapter(error, "managed_contract_invalid", "The selected Career Core runtime has incompatible managed contracts.");
        return true;
      },
    );
    clearRuntimeResolutionCache();
    await assert.rejects(
      resolveCareerRuntime({
        environment: { CAREER_CLI_PATH: resolverPath, PATH: "", PI_OFFLINE: "1" },
        probe: async () => { throw foreignInvocation("cancelled", SENTINELS.resolver); },
        dependencies: { resolvePackageManifest: () => undefined },
      }),
      (error) => {
        assertStableAdapter(error, "cancelled", "The Career Core operation was cancelled.");
        assert.notEqual(error.payload.code, "workflow_failed");
        return true;
      },
    );

    const source = makeFakePi();
    registerCareerCommands(source.api, {
      agentDir: fixture.agentDir,
      uuid: uuidSequence(),
      invoke: async () => { throw poison(SENTINELS.invoke); },
    });
    const sourceCtx = makeContext(source, { mode: "rpc", persisted: false });
    await source.commands.get("career-library").handler("status", sourceCtx.ctx);
    assert.ok(sourceCtx.notifications.some((item) => item.message.includes("file or directory could not be read")));
    assert.ok(sourceCtx.notifications.some((item) => item.message.includes("text file is not valid UTF-8")));
    assert.ok(sourceCtx.notifications.some((item) => item.message.includes("PDF text could not be extracted")));
    assert.equal(sourceCtx.notifications.some((item) => item.message.includes(fixture.library)), false);
    assertClean("source status", sourceCtx.notifications);
    assert.deepEqual(source.entries, []);

    const catalogDir = path.join(fixture.root, `synthetic-co--synthetic-role--${CATALOG_ID}`);
    await mkdir(catalogDir, { mode: 0o700 });
    await privateFile(path.join(catalogDir, "application.json"), Buffer.from(`{"schema":"${SENTINELS.catalog}","body":"${SENTINELS.body}","uuid":"${SENTINELS.uuid}","hash":"${SENTINELS.hash}"}\n`));
    const catalog = makeFakePi();
    registerCareerCommands(catalog.api, {
      agentDir: fixture.agentDir,
      uuid: uuidSequence(),
      invoke: async () => { throw poison(SENTINELS.catalog); },
    });
    const catalogSelects = [];
    const catalogCtx = makeContext(catalog, {
      mode: "rpc",
      persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.close],
    });
    const originalSelect = catalogCtx.ctx.ui.select;
    catalogCtx.ctx.ui.select = async (title, options) => {
      catalogSelects.push({ title, options });
      return originalSelect(title, options);
    };
    await catalog.commands.get("career").handler("", catalogCtx.ctx);
    assert.equal(catalogSelects.some((dialog) => dialog.options?.some((option) => String(option).includes(SENTINELS.catalog))), false);
    assertClean("catalog dialogs", catalogSelects);
    assertClean("catalog notices", catalogCtx.notifications);
    assert.deepEqual(catalog.entries, []);
    await rm(catalogDir, { recursive: true, force: true });

    const configAgent = path.join(fixture.temp, "invalid-config-agent");
    await prepareConfigDirectory(configAgent);
    await privateFile(configPath(configAgent), Buffer.from(`{"broken":"${SENTINELS.catalog}","errno":"${SENTINELS.errno}"}\n`));
    const configFake = makeFakePi();
    registerCareerCommands(configFake.api, { agentDir: configAgent, invoke: async () => { throw poison(SENTINELS.catalog); } });
    const configCtx = makeContext(configFake, { mode: "rpc", persisted: false });
    await configFake.commands.get("career-setup").handler("status", configCtx.ctx);
    assert.deepEqual(configCtx.notifications.at(-1), { message: workflowErrorMessage("config_invalid"), type: "error" });
    assertClean("config error", configCtx.notifications);
    assert.deepEqual(configFake.entries, []);

    const session = makeFakePi();
    session.entries.push({
      type: "custom",
      customType: "career.workflow",
      data: { kind: "result_card", body: SENTINELS.session, schema: SENTINELS.schema, stack: SENTINELS.stack },
      id: "forged",
      parentId: null,
      timestamp: "2026-08-12T00:00:00.000Z",
    });
    registerCareerCommands(session.api, {
      agentDir: fixture.agentDir,
      loadLibrary: async () => { throw poison(SENTINELS.session); },
    });
    const sessionCtx = makeContext(session, { mode: "rpc", persisted: false });
    let widgetThrew = 0;
    sessionCtx.ctx.ui.setWidget = () => { widgetThrew += 1; throw poison(SENTINELS.session); };
    sessionCtx.ctx.sessionManager.getBranch = () => { throw poison(SENTINELS.session); };
    for (const handler of session.events.get("session_start") ?? []) await handler({}, sessionCtx.ctx);
    assert.equal(widgetThrew, 1);
    assert.deepEqual(session.entries.length, 1);
    const replay = makeContext(session, { mode: "rpc", persisted: false });
    await session.commands.get("career-application").handler("status", replay.ctx);
    assert.deepEqual(replay.notifications, [{ message: "No active career application.", type: "info" }]);
    const rendered = session.renderers.get("career.workflow")(
      { type: "custom", customType: "career.workflow", data: session.entries[0].data },
      {},
      { fg(_color, text) { return text; }, bold(text) { return text; } },
    );
    assert.equal(rendered, undefined);
    assertClean("session replay", replay.notifications);

    const ui = makeFakePi();
    registerCareerCommands(ui.api, { agentDir: fixture.agentDir, uuid: uuidSequence(), invoke: async () => { throw poison(SENTINELS.ui); } });
    const uiCtx = makeContext(ui, { mode: "rpc", persisted: false });
    uiCtx.ctx.ui.select = async () => { throw poison(SENTINELS.ui); };
    uiCtx.ctx.ui.notify = (message, type = "info") => {
      uiCtx.notifications.push({ message, type });
      if (type === "error") throw poison(SENTINELS.ui);
    };
    await assert.rejects(ui.commands.get("career").handler("", uiCtx.ctx), (error) => {
      assertStableWorkflow(error, "workflow_failed");
      return true;
    });
    assertClean("ui select", uiCtx.notifications);

    const editor = makeFakePi();
    registerCareerCommands(editor.api, {
      agentDir: fixture.agentDir,
      uuid: uuidSequence(),
      now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async () => { throw poison(SENTINELS.ui); },
    });
    const editorCtx = makeContext(editor, {
      mode: "rpc",
      persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [() => { throw poison(SENTINELS.ui); }],
    });
    const beforeEditor = await snapshot(fixture.temp);
    await editor.commands.get("career").handler("", editorCtx.ctx);
    assert.deepEqual(editorCtx.notifications.at(-1), { message: workflowErrorMessage("workflow_failed"), type: "error" });
    assertClean("editor failure", editorCtx.notifications);
    assert.deepEqual(editor.entries, []);
    assert.deepEqual(await snapshot(fixture.temp), beforeEditor);

    const commit = makeFakePi();
    registerCareerCommands(commit.api, {
      agentDir: fixture.agentDir,
      uuid: uuidSequence(),
      now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async () => { throw poison(SENTINELS.commit); },
      beforeWorkspaceLockAcquire: async () => { throw poison(SENTINELS.commit); },
    });
    const commitCtx = makeContext(commit, {
      mode: "rpc",
      persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: [COMPANY, ROLE],
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    const beforeCommit = await snapshot(fixture.temp);
    await commit.commands.get("career").handler("", commitCtx.ctx);
    assert.deepEqual(commitCtx.notifications.at(-1), { message: workflowErrorMessage("workflow_failed"), type: "error" });
    assert.equal(commit.entries.some((entry) => entry.data?.kind === "application"), false);
    assert.deepEqual(await residueNames(fixture.root), []);
    assertClean("commit failure", commitCtx.notifications);
    assert.deepEqual(await snapshot(fixture.temp), beforeCommit);

    const cancelled = makeFakePi();
    registerCareerCommands(cancelled.api, {
      agentDir: fixture.agentDir,
      uuid: uuidSequence(),
      invoke: async () => { throw foreignInvocation("cancelled", SENTINELS.invoke); },
    });
    const cancelledCtx = makeContext(cancelled, {
      mode: "rpc",
      persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    });
    await cancelled.commands.get("career-analyze").handler("", cancelledCtx.ctx);
    assert.ok(cancelledCtx.notifications.some((item) => item.message === "cancelled: The Career Core operation was cancelled."));
    assert.equal(cancelledCtx.notifications.some((item) => item.message === workflowErrorMessage("workflow_failed")), false);
    assert.deepEqual(cancelled.entries, []);
    assertClean("cancellation", cancelledCtx.notifications);

    const raw = makeFakePi();
    const trap = path.join(fixture.temp, "core-trap");
    await privateFile(trap, Buffer.from(`#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({
      schema_version: "career.error.v1",
      code: "invalid_json",
      message: `${SENTINELS.tool} ${SENTINELS.path} ${SENTINELS.env} ${SENTINELS.stack}`,
      field_path: null,
    })}' >&2\nexit 4\n`), 0o700);
    await chmod(trap, 0o700);
    const previousCli = process.env.CAREER_CLI_PATH;
    const previousOffline = process.env.PI_OFFLINE;
    process.env.CAREER_CLI_PATH = trap;
    process.env.PI_OFFLINE = "1";
    clearRuntimeResolutionCache();
    try {
      careerCoreExtension(raw.api);
      await assert.rejects(raw.tools.get("career_core_resume").execute("call", {
        operation: "analyze",
        input_json: "{\"schema_version\":\"career.resume_input.v1\"}",
      }, new AbortController().signal), (error) => {
        assertStableAdapter(error, "managed_contract_invalid", "The selected Career Core runtime has incompatible managed contracts.");
        return true;
      });
      assert.deepEqual(raw.entries, []);
    } finally {
      if (previousCli === undefined) delete process.env.CAREER_CLI_PATH;
      else process.env.CAREER_CLI_PATH = previousCli;
      if (previousOffline === undefined) delete process.env.PI_OFFLINE;
      else process.env.PI_OFFLINE = previousOffline;
      clearRuntimeResolutionCache();
    }

    const managed = makeFakePi();
    registerCareerRun(managed.api, {
      agentDir: fixture.agentDir,
      uuid: uuidSequence(),
      invoke: async () => { throw foreignInvocation("career_cli_error", SENTINELS.tool); },
    });
    const managedCtx = makeContext(managed, { mode: "rpc", persisted: false });
    await assert.rejects(
      managed.tools.get("career_run").execute("call", { command: "context" }, new AbortController().signal, undefined, managedCtx.ctx),
      (error) => {
        assertStableAdapter(error, "career_cli_error", "The Career Core runtime rejected the request with a validated error.");
        return true;
      },
    );
    registerCareerRun(managed.api, {
      agentDir: fixture.agentDir,
      uuid: uuidSequence(),
      invoke: async () => { throw poison(SENTINELS.tool); },
    });
    await assert.rejects(
      managed.tools.get("career_run").execute("call", { command: "context" }, new AbortController().signal, undefined, managedCtx.ctx),
      (error) => {
        assert.ok(error instanceof CareerRunError);
        assert.equal(error.code, "managed_result_invalid");
        assertClean("managed raw failure", `${error.message}\n${error.stack}`);
        return true;
      },
    );

    const allow = new Set(["blocked.md", "broken.txt", "note.pdf", "application.json", "core-trap", "forged-session.jsonl"]);
    assert.equal(treeHasLeak(await snapshot(fixture.agentDir), allow), undefined);
    assert.equal(treeHasLeak(await snapshot(fixture.sessions), allow), undefined);
    assert.equal(treeHasLeak(await snapshot(fixture.packageCache), allow), undefined);
    assert.deepEqual(await residueNames(fixture.root), []);

    await installedHost(fixture);
  } finally {
    await chmod(path.join(fixture.library, "blocked.md"), 0o600).catch(() => undefined);
    await rm(fixture.temp, { recursive: true, force: true });
  }
});

async function installedHost(fixture) {
  const hostHome = path.join(fixture.temp, "host-home");
  const hostCwd = path.join(fixture.temp, "host-cwd");
  await mkdir(hostHome, { mode: 0o700 });
  await mkdir(hostCwd, { mode: 0o700 });
  await privateFile(path.join(fixture.agentDir, "models.json"), Buffer.from(`${JSON.stringify({
    providers: {
      "synthetic-offline": {
        baseUrl: "http://127.0.0.1:9/v1",
        api: "openai-completions",
        apiKey: "synthetic-offline-key",
        models: [{
          id: "synthetic-offline-model",
          name: "Synthetic offline model",
          reasoning: false,
          input: ["text"],
          contextWindow: 8192,
          maxTokens: 256,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }],
      },
    },
  })}\n`));
  const trap = path.join(fixture.temp, "core-trap");
  await privateFile(trap, Buffer.from(`#!/bin/sh\nprintf '%s\\n' '${SENTINELS.host} ${SENTINELS.path} ${SENTINELS.env} ${SENTINELS.stack} ${SENTINELS.errno}' >&2\nexit 4\n`), 0o700);
  await chmod(trap, 0o700);
  const child = spawn(process.execPath, [
    piCli, "--mode", "rpc", "--offline", "--no-session", "--no-approve",
    "-e", extensionPath, "--session-dir", fixture.sessions,
  ], {
    cwd: hostCwd,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: hostHome,
      TMPDIR: fixture.temp,
      PI_CODING_AGENT_DIR: fixture.agentDir,
      PI_CODING_AGENT_SESSION_DIR: fixture.sessions,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      PI_SKIP_VERSION_CHECK: "1",
      CAREER_CLI_PATH: trap,
      LANG: "C",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const ui = [];
  const pending = new Map();
  let requestId = 0;
  let steps = [];
  let buffer = "";
  const fail = (error) => {
    for (const item of pending.values()) item.reject(error);
    pending.clear();
  };
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (line.length === 0) continue;
      const message = JSON.parse(line);
      if (message.type === "extension_ui_request") {
        ui.push(message);
        if (message.method !== "select" && message.method !== "confirm") continue;
        const step = steps.shift();
        if (step === undefined || step.method !== message.method) {
          child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
          fail(new Error(`unexpected ${message.method} dialog`));
          return;
        }
        const response = step.method === "confirm"
          ? { type: "extension_ui_response", id: message.id, confirmed: step.confirmed }
          : { type: "extension_ui_response", id: message.id, value: step.value };
        child.stdin.write(`${JSON.stringify(response)}\n`);
      } else if (message.type === "response") {
        pending.get(message.id)?.resolve(message);
        pending.delete(message.id);
      }
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  child.on("exit", (code, signal) => fail(new Error(`installed child exited ${code ?? signal}`)));
  const request = (command) => {
    const id = `req-${++requestId}`;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for ${command.type}`));
      }, 8_000);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
    child.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
    return response;
  };
  try {
    const library = await request({ type: "prompt", message: "/career-library status" });
    assert.equal(library.success, true);
    steps = [{ method: "select", value: CAREER_UI_RPC_ACTIONS.close }];
    const listed = await request({ type: "prompt", message: "/career" });
    assert.equal(listed.success, true);
    assert.equal(steps.length, 0);
    steps = [
      { method: "select", value: CAREER_UI_RPC_ACTIONS.analyze },
      { method: "confirm", confirmed: true },
      { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
    ];
    const analyzed = await request({ type: "prompt", message: "/career-analyze" });
    assert.equal(analyzed.success, true);
    assert.equal(steps.length, 0);
    assertClean("installed stdout", stdout);
    assertClean("installed stderr", stderr);
    assertClean("installed rpc", ui);
    assert.equal(ui.some((message) => message.method === "notify" && message.message === "managed_contract_invalid: The selected Career Core runtime has incompatible managed contracts."), true);
  } finally {
    const exited = new Promise((resolve) => child.once("exit", () => resolve(true)));
    child.stdin.end();
    const ended = await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    if (ended === false) child.kill("SIGKILL");
  }
}
