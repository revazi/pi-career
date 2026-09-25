// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const piCli = path.join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const extensionPath = path.join(repositoryRoot, "dist/index.js");
const ROOT_ID = "00000000-0000-4000-8000-000000000132";
const CATALOG_ID = "00000000-0000-4000-8000-000000000032";
const LEGACY_ID = "00000000-0000-4000-8000-000000000033";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const CATALOG_CREATED_AT = "2026-08-02T00:00:00.000Z";
const CATALOG_WORKSPACE_AT = "2026-08-04T00:00:00.000Z";
const LEGACY_CREATED_AT = "2026-08-02T00:00:00.000Z";
const LEGACY_WORKSPACE_AT = "2026-08-03T00:00:00.000Z";
const LEGACY_UPDATED_AT = "2026-08-03T00:00:01.000Z";
const CATALOG_COMPANY = "Synthetic Catalog Co";
const CATALOG_ROLE = "Synthetic Catalog Role";
const LEGACY_COMPANY = "Synthetic Legacy Co";
const LEGACY_ROLE = "Synthetic Legacy Role";
const CREATED_COMPANY = "Synthetic Created Co";
const CREATED_ROLE = "Synthetic Created Role";
const CATALOG_LABEL = `${CATALOG_COMPANY} — ${CATALOG_ROLE} — Preparing — Incomplete 0/3`;
const CREATED_LABEL = `${CREATED_COMPANY} — ${CREATED_ROLE} — Preparing — Incomplete 0/3`;
const LEGACY_LABEL = "Legacy application — preparing";
const DOCUMENT_SENTINEL = "SYNTHETIC_DOCUMENT_TEXT_32";
const TRANSIENT_NOTICE = "Transient session: pi-career workflow entries are not written to a session JSONL.";
const PREVIEW_TITLE = "Review exact application workspace mutation";
const APPLY_TITLE = "Apply application workspace mutation?";
const DETACH_TITLE = "Detach current application";
const DETACH_CANCELLED = "Detach cancelled; workspace and session application files were not changed.";
const DETACH_NOTICE = "Application detached from the session. Workspace files were not changed.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ATTACHMENT_TYPE = "career.application_attachment";
const ACTIVATION_TYPE = "career.application_assistance";
const WORKFLOW_TYPE = "career.workflow";
const FORBIDDEN_EVENTS = new Set([
  "agent_start", "agent_end", "before_agent_start", "turn_start", "turn_end",
  "message_start", "message_update", "message_end", "tool_execution_start",
  "tool_execution_end", "compaction_start", "auto_retry_start", "agent_settled",
  "extension_error",
]);

const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
  return bytes;
}

async function privateJson(file, value) {
  return privateFile(file, canonical(value));
}

async function treeSnapshot(root) {
  const walk = async (directory, relative = "") => {
    const result = [];
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relative === "" ? entry.name : path.posix.join(relative, entry.name);
      const target = path.join(directory, entry.name);
      const metadata = await stat(target);
      result.push({
        path: relativePath,
        kind: entry.isDirectory() ? "directory" : "file",
        mode: metadata.mode & 0o777,
        ...(entry.isDirectory() ? {} : { sha256: hash(await readFile(target)) }),
      });
      if (entry.isDirectory()) result.push(...await walk(target, relativePath));
    }
    return result;
  };
  return walk(root);
}

async function filesUnder(root) {
  const result = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else result.push(target);
    }
  };
  await walk(root);
  return result;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function probeTrap(port) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1", port, path: "/v1/chat/completions", method: "POST", timeout: 2_000,
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end("synthetic-provider-probe");
  });
}

class ProviderTrap {
  constructor() {
    this.requests = [];
    this.server = http.createServer((request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        this.requests.push({
          method: request.method,
          url: request.url,
          bytes: Buffer.concat(chunks).length,
        });
        response.writeHead(204);
        response.end();
      });
    });
  }

  async start() {
    this.port = await listen(this.server);
    this.baseUrl = `http://127.0.0.1:${this.port}/v1`;
    return this;
  }

  async stop() {
    await new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }
}

class RpcProcess {
  constructor(item) {
    this.item = item;
    this.buffer = "";
    this.pending = new Map();
    this.requestId = 0;
    this.ui = [];
    this.events = [];
    this.localEvents = [];
    this.editorTexts = [];
    this.stderr = "";
    this.steps = [];
    this.operations = [];
  }

  start() {
    this.child = spawn(process.execPath, [
      piCli, "--mode", "rpc", "--offline", "--no-session", "--no-approve",
      "-e", extensionPath, "--session-dir", this.item.sessions,
    ], {
      cwd: this.item.cwd,
      env: this.item.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk) => this.#consume(chunk.toString("utf8")));
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk.toString("utf8"); });
    this.child.on("exit", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("RPC process exited before response"));
      this.pending.clear();
    });
    return this;
  }

  #consume(text) {
    this.buffer += text;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
      if (line.length === 0) continue;
      const message = JSON.parse(line);
      if (message.type === "extension_ui_request") {
        this.ui.push(message);
        if (message.method === "set_editor_text") {
          this.editorTexts.push(message.text ?? "");
          continue;
        }
        if (message.method !== "select" && message.method !== "confirm" && message.method !== "input" && message.method !== "editor") {
          continue;
        }
        const step = this.steps.shift();
        const cancel = () => {
          this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
        };
        if (step === undefined || step.method !== message.method) {
          cancel();
          this.#fail(new Error(`unexpected ${message.method} dialog`));
          return;
        }
        if (step.method === "select") {
          const value = step.only === true
            ? (message.options.length === 1 ? message.options[0] : undefined)
            : step.value;
          if (value === undefined || !message.options.includes(value)) {
            cancel();
            this.#fail(new Error(`select options did not include the expected local choice`));
            return;
          }
          this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, value })}\n`);
          return;
        }
        if (step.method === "editor") {
          if (message.title !== PREVIEW_TITLE || typeof message.prefill !== "string") {
            cancel();
            this.#fail(new Error("workspace preview dialog was not the approved local review"));
            return;
          }
          let operation;
          try {
            operation = JSON.parse(message.prefill).operation;
          } catch {
            cancel();
            this.#fail(new Error("workspace preview was not JSON"));
            return;
          }
          this.operations.push(operation);
          if (message.prefill.includes(DOCUMENT_SENTINEL)) {
            cancel();
            this.#fail(new Error("workspace preview contained the synthetic document sentinel"));
            return;
          }
          const response = step.cancel === true
            ? { type: "extension_ui_response", id: message.id, cancelled: true }
            : { type: "extension_ui_response", id: message.id, value: message.prefill };
          this.child.stdin.write(`${JSON.stringify(response)}\n`);
          return;
        }
        const response = step.method === "confirm"
          ? { type: "extension_ui_response", id: message.id, confirmed: step.confirmed }
          : { type: "extension_ui_response", id: message.id, value: step.value };
        this.child.stdin.write(`${JSON.stringify(response)}\n`);
      } else if (message.type === "response") {
        const pending = this.pending.get(message.id);
        if (pending !== undefined) {
          this.pending.delete(message.id);
          pending.resolve(message);
        }
      } else if (message.type === "entry_appended" || message.type === "session_info_changed") {
        this.localEvents.push(message.type);
      } else {
        this.events.push(message.type);
      }
    }
  }

  #fail(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request(command) {
    const id = `req-${++this.requestId}`;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for ${command.type}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
    this.child.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
    return response;
  }

  async prompt(message, steps) {
    const before = this.ui.length;
    this.steps = [...steps];
    const response = await this.request({ type: "prompt", message });
    assert.equal(response.success, true, response.error ?? `${message} failed`);
    assert.equal(this.steps.length, 0, `${message} left unused dialogs`);
    return this.ui.slice(before);
  }

  async close() {
    const exited = new Promise((resolve) => this.child.once("exit", () => resolve(true)));
    this.child.stdin.end();
    const ended = await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    if (ended === false && this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGKILL");
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  }
}

async function fixture(t, trap) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-provider-boundary-")));
  await chmod(base, 0o700);
  t.after(() => rm(base, { recursive: true, force: true }));
  const agentDir = path.join(base, "agent");
  const home = path.join(base, "home");
  const cwd = path.join(base, "cwd");
  const sessions = path.join(base, "sessions");
  const libraryPath = path.join(base, "library");
  const workspacePath = path.join(base, "applications");
  await mkdir(libraryPath, { mode: 0o700 });
  await mkdir(workspacePath, { mode: 0o700 });
  await chmod(libraryPath, 0o700);
  await chmod(workspacePath, 0o700);
  const libraryRoot = await realpath(libraryPath);
  const workspaceRoot = await realpath(workspacePath);
  for (const directory of [agentDir, home, cwd, sessions, path.join(agentDir, "career")]) {
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o700);
  }
  const document = Buffer.from(`# Synthetic original\n${DOCUMENT_SENTINEL}\n`);
  const documentPath = path.join(libraryRoot, "synthetic-original.md");
  await privateFile(documentPath, document);
  await privateJson(path.join(agentDir, "models.json"), {
    providers: {
      "synthetic-loopback": {
        baseUrl: trap.baseUrl,
        api: "openai-completions",
        apiKey: "synthetic-loopback-key",
        models: [{
          id: "synthetic-loopback-model",
          name: "Synthetic loopback model",
          reasoning: false,
          input: ["text"],
          contextWindow: 8192,
          maxTokens: 256,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }],
      },
    },
  });
  await privateJson(path.join(agentDir, "career", "config.v1.json"), {
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: hash(libraryRoot), path: libraryRoot, label: "Synthetic private library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: workspaceRoot },
  });
  await privateJson(path.join(workspaceRoot, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1", kind: "application_workspace_root",
    root_id: ROOT_ID, created_at: ROOT_CREATED_AT,
  });
  const catalogDir = path.join(workspaceRoot, `synthetic-catalog-co--synthetic-catalog-role--${CATALOG_ID}`);
  await mkdir(catalogDir, { mode: 0o700 });
  await chmod(catalogDir, 0o700);
  const catalogManifest = canonical({
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: CATALOG_ID, root_id: ROOT_ID,
    application_created_at: CATALOG_CREATED_AT, workspace_created_at: CATALOG_WORKSPACE_AT,
  });
  await privateFile(path.join(catalogDir, "application.json"), catalogManifest);
  await privateJson(path.join(catalogDir, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: CATALOG_ID, company_label: CATALOG_COMPANY,
    role_label: CATALOG_ROLE, created_at: CATALOG_CREATED_AT,
  });
  await privateJson(path.join(catalogDir, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v1", kind: "application_state_revision",
    application_id: CATALOG_ID, sequence: 1, parent_sha256: hash(catalogManifest), status: "preparing",
    vacancy: null, selected_original: null, resume_artifact: null, updated_at: CATALOG_WORKSPACE_AT,
  });
  const legacyDir = path.join(workspaceRoot, `synthetic-legacy-co--synthetic-legacy-role--${LEGACY_ID}`);
  await mkdir(legacyDir, { mode: 0o700 });
  await chmod(legacyDir, 0o700);
  const legacyManifest = canonical({
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: LEGACY_ID, root_id: ROOT_ID,
    application_created_at: LEGACY_CREATED_AT, workspace_created_at: LEGACY_WORKSPACE_AT,
  });
  await privateFile(path.join(legacyDir, "application.json"), legacyManifest);
  await privateJson(path.join(legacyDir, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v1", kind: "application_state_revision",
    application_id: LEGACY_ID, sequence: 1, parent_sha256: hash(legacyManifest), status: "preparing",
    vacancy: null, selected_original: null, resume_artifact: null, updated_at: LEGACY_UPDATED_AT,
  });
  const legacyIdentity = canonical({
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: LEGACY_ID, company_label: LEGACY_COMPANY,
    role_label: LEGACY_ROLE, created_at: LEGACY_CREATED_AT,
  });
  const coreTrap = path.join(base, "core-trap");
  await privateFile(coreTrap, Buffer.from("#!/bin/sh\ntouch \"$(dirname \"$0\")/core-was-invoked\"\nexit 97\n"));
  await chmod(coreTrap, 0o700);
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    TMPDIR: os.tmpdir(),
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: sessions,
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
    PI_SKIP_VERSION_CHECK: "1",
    CAREER_CLI_PATH: coreTrap,
  };
  return {
    base, agentDir, cwd, sessions, libraryRoot, workspaceRoot, catalogDir, legacyDir,
    documentPath, document, legacyIdentity, coreTrap, env,
  };
}

function assertNoLeak(text, item) {
  assert.equal(text.includes(DOCUMENT_SENTINEL), false);
  assert.equal(text.includes(item.base), false);
  assert.equal(text.includes(item.workspaceRoot), false);
  assert.equal(text.includes(item.libraryRoot), false);
}

function localSurface(ui) {
  return ui.filter((request) => request.method !== "editor").map((request) => {
    const copy = { ...request };
    delete copy.id;
    return copy;
  });
}

function careerEntries(entries) {
  return entries.filter((entry) =>
    entry.customType === ATTACHMENT_TYPE || entry.customType === ACTIVATION_TYPE || entry.customType === WORKFLOW_TYPE);
}

async function assertBoundary(live, item, trap) {
  assert.equal(trap.requests.length, 0);
  assert.deepEqual(live.events.filter((type) => FORBIDDEN_EVENTS.has(type)), []);
  assert.deepEqual(live.events, []);
  assert.deepEqual(live.editorTexts, []);
  assert.equal(live.stderr, "");
  assert.equal(await readFile(item.documentPath).then((bytes) => bytes.equals(item.document)), true);
  const state = await live.request({ type: "get_state" });
  assert.equal(state.success, true);
  assert.equal(state.data.sessionFile ?? null, null);
  assert.equal(state.data.messageCount, 0);
  assert.equal(state.data.isStreaming, false);
  assert.equal(state.data.model?.id, "synthetic-loopback-model");
  assert.equal(state.data.model?.baseUrl, trap.baseUrl);
  const messages = await live.request({ type: "get_messages" });
  assert.deepEqual(messages.data.messages, []);
  const commands = await live.request({ type: "get_commands" });
  assert.equal(commands.data.commands.some((command) => command.name === "skill:career-core"), false);
  assert.equal((await filesUnder(item.base)).includes(path.join(item.base, "core-was-invoked")), false);
  assert.equal((await filesUnder(item.base)).some((file) => file.endsWith(".jsonl")), false);
  assertNoLeak(JSON.stringify(localSurface(live.ui)), item);
  assertNoLeak(live.stderr, item);
}

async function directoryNames(root) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("P3-49 installed/public browse-open-filter-clear-empty-repeated reads keep all five forbidden effects absent", { timeout: 180_000 }, async (t) => {
  const trap = await new ProviderTrap().start();
  t.after(() => trap.stop());
  const item = await fixture(t, trap);
  const before = {
    config: await treeSnapshot(path.join(item.agentDir, "career")),
    library: await treeSnapshot(item.libraryRoot),
    catalog: await treeSnapshot(item.catalogDir),
    workspace: await treeSnapshot(item.workspaceRoot),
  };
  const live = new RpcProcess(item).start();
  t.after(() => {
    if (live.child.exitCode === null && live.child.signalCode === null) live.child.kill("SIGKILL");
  });
  await assertBoundary(live, item, trap);

  const filtered = await live.prompt("/career", [
    { method: "select", value: CATALOG_LABEL },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.back },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.filterApplications },
    { method: "input", value: "Synthetic Catalog" },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.clearApplicationFilter },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.filterApplications },
    { method: "input", value: "no such application" },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.clearApplicationFilter },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(filtered.some((request) => request.method === "select" && String(request.title).includes("Opening does not attach")), true);
  const empty = filtered.find((request) => request.method === "select" && String(request.title).includes("Filter: no such application"));
  assert.ok(empty, "empty filtered catalog must be rendered publicly");
  assert.deepEqual(empty.options.includes(CAREER_UI_RPC_ACTIONS.clearApplicationFilter), true);

  const repeated = await live.prompt("/career", [
    { method: "select", value: CATALOG_LABEL },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.back },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(repeated.some((request) => request.method === "select" && String(request.title).includes("Opening does not attach")), true);
  const entries = await live.request({ type: "get_entries" });
  assert.deepEqual(careerEntries(entries.data.entries), []);
  assert.deepEqual(live.localEvents, []);
  assert.deepEqual(await treeSnapshot(path.join(item.agentDir, "career")), before.config);
  assert.deepEqual(await treeSnapshot(item.libraryRoot), before.library);
  assert.deepEqual(await treeSnapshot(item.catalogDir), before.catalog);
  assert.deepEqual(await treeSnapshot(item.workspaceRoot), before.workspace);
  assert.equal(trap.requests.length, 0);
  await assertBoundary(live, item, trap);

  const tools = await live.prompt("/career-tools status", []);
  assert.equal(tools.some((request) => request.message === "Career tools inactive."), true);
});

test("P3-32 installed browsing and confirmed no-Core application mutations make no provider request", { timeout: 180_000 }, async (t) => {
  const trap = await new ProviderTrap().start();
  t.after(() => trap.stop());
  assert.equal(await probeTrap(trap.port), 204);
  assert.equal(trap.requests.length, 1);
  assert.equal(trap.requests[0].url, "/v1/chat/completions");
  trap.requests.length = 0;

  const item = await fixture(t, trap);
  const before = {
    config: await treeSnapshot(path.join(item.agentDir, "career")),
    library: await treeSnapshot(item.libraryRoot),
    catalog: await treeSnapshot(item.catalogDir),
    legacy: await treeSnapshot(item.legacyDir),
    workspace: await treeSnapshot(item.workspaceRoot),
  };
  for (const tree of [before.catalog, before.legacy, before.library, before.workspace]) {
    for (const entry of tree) assert.equal(entry.mode, entry.kind === "directory" ? 0o700 : 0o600, entry.path);
  }
  const live = new RpcProcess(item).start();
  t.after(() => {
    if (live.child.exitCode === null && live.child.signalCode === null) live.child.kill("SIGKILL");
  });
  await assertBoundary(live, item, trap);

  const browsed = await live.prompt("/career", [
    { method: "select", value: CATALOG_LABEL },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.back },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  const detail = browsed.find((request) => request.method === "select" && String(request.title).includes("Opening does not attach"));
  assert.ok(detail, "local open must show the non-attachment detail");
  assert.equal(detail.options.includes(CAREER_UI_RPC_ACTIONS.attach), true);
  assert.equal(browsed.some((request) => request.method === "notify"), false);
  const browsedEntries = await live.request({ type: "get_entries" });
  assert.deepEqual(careerEntries(browsedEntries.data.entries), []);
  assert.deepEqual(live.localEvents, []);
  assert.deepEqual(await treeSnapshot(item.workspaceRoot), before.workspace);
  await assertBoundary(live, item, trap);

  const migrationCancelled = await live.prompt("/career", [
    { method: "select", value: LEGACY_LABEL },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.migrate },
    { method: "input", value: LEGACY_COMPANY },
    { method: "input", value: LEGACY_ROLE },
    { method: "editor", cancel: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.back },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(migrationCancelled.some((request) => request.method === "confirm"), false);
  assert.deepEqual(live.operations, ["finish_application_migration"]);
  assert.equal((await readdir(item.legacyDir)).includes(".pi-career-identity.json"), false);
  assert.deepEqual(live.localEvents, []);
  assert.deepEqual(await treeSnapshot(item.workspaceRoot), before.workspace);
  await assertBoundary(live, item, trap);

  const migrated = await live.prompt("/career", [
    { method: "select", value: LEGACY_LABEL },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.migrate },
    { method: "input", value: LEGACY_COMPANY },
    { method: "input", value: LEGACY_ROLE },
    { method: "editor", echo: true },
    { method: "confirm", confirmed: false },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.back },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(migrated.filter((request) => request.method === "confirm" && request.title === APPLY_TITLE).length, 1);
  assert.equal((await readdir(item.legacyDir)).includes(".pi-career-identity.json"), false);
  assert.deepEqual(live.localEvents, []);
  assert.deepEqual(await treeSnapshot(item.workspaceRoot), before.workspace);
  await assertBoundary(live, item, trap);

  const migrationCommitted = await live.prompt("/career", [
    { method: "select", value: LEGACY_LABEL },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.migrate },
    { method: "input", value: LEGACY_COMPANY },
    { method: "input", value: LEGACY_ROLE },
    { method: "editor", echo: true },
    { method: "confirm", confirmed: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(migrationCommitted.some((request) => request.method === "notify" && request.message === "Finished application identity migration. Existing workspace bytes remain unchanged."), true);
  assert.deepEqual(live.operations.slice(0, 3), [
    "finish_application_migration", "finish_application_migration", "finish_application_migration",
  ]);
  const legacyNow = await treeSnapshot(item.legacyDir);
  assert.deepEqual(legacyNow.filter((entry) => entry.path !== ".pi-career-identity.json"), before.legacy);
  assert.equal(legacyNow.find((entry) => entry.path === ".pi-career-identity.json")?.sha256, hash(item.legacyIdentity));
  assert.deepEqual(await treeSnapshot(item.catalogDir), before.catalog);
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries), []);
  assert.deepEqual(live.localEvents, []);
  await assertBoundary(live, item, trap);

  const createCancelled = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.create },
    { method: "input", value: CREATED_COMPANY },
    { method: "input", value: CREATED_ROLE },
    { method: "editor", cancel: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(createCancelled.filter((request) => request.method === "notify" && request.message === TRANSIENT_NOTICE).length, 1);
  assert.equal(createCancelled.some((request) => request.method === "confirm"), false);
  assert.deepEqual(await directoryNames(item.workspaceRoot), [
    `synthetic-catalog-co--synthetic-catalog-role--${CATALOG_ID}`,
    `synthetic-legacy-co--synthetic-legacy-role--${LEGACY_ID}`,
  ].sort());
  await assertBoundary(live, item, trap);

  const createDenied = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.create },
    { method: "input", value: CREATED_COMPANY },
    { method: "input", value: CREATED_ROLE },
    { method: "editor", echo: true },
    { method: "confirm", confirmed: false },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(createDenied.filter((request) => request.method === "confirm" && request.title === APPLY_TITLE).length, 1);
  assert.deepEqual(await directoryNames(item.workspaceRoot), [
    `synthetic-catalog-co--synthetic-catalog-role--${CATALOG_ID}`,
    `synthetic-legacy-co--synthetic-legacy-role--${LEGACY_ID}`,
  ].sort());
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries), []);
  await assertBoundary(live, item, trap);

  const created = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.create },
    { method: "input", value: CREATED_COMPANY },
    { method: "input", value: CREATED_ROLE },
    { method: "editor", echo: true },
    { method: "confirm", confirmed: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(created.some((request) => request.method === "notify" && request.message === TRANSIENT_NOTICE), false);
  assert.equal(created.filter((request) => request.method === "confirm" && request.title === APPLY_TITLE).length, 1);
  assert.deepEqual(live.operations.slice(3, 6), [
    "initialize_application", "initialize_application", "initialize_application",
  ]);
  const names = await directoryNames(item.workspaceRoot);
  const createdName = names.find((name) => name.startsWith("synthetic-created-co--synthetic-created-role--"));
  assert.equal(typeof createdName, "string");
  assert.deepEqual(names.filter((name) => name !== createdName).sort(), [
    `synthetic-catalog-co--synthetic-catalog-role--${CATALOG_ID}`,
    `synthetic-legacy-co--synthetic-legacy-role--${LEGACY_ID}`,
  ].sort());
  const createdDir = path.join(item.workspaceRoot, createdName);
  const createdFiles = (await readdir(createdDir)).sort();
  assert.deepEqual(createdFiles, [".pi-career-identity.json", ".pi-career-state-000001.json", "application.json"]);
  const manifest = JSON.parse(await readFile(path.join(createdDir, "application.json"), "utf8"));
  const identity = JSON.parse(await readFile(path.join(createdDir, ".pi-career-identity.json"), "utf8"));
  const initialState = JSON.parse(await readFile(path.join(createdDir, ".pi-career-state-000001.json"), "utf8"));
  assert.equal(manifest.application_id, createdName.slice(createdName.lastIndexOf("--") + 2));
  assert.equal(manifest.root_id, ROOT_ID);
  assert.equal(identity.company_label, CREATED_COMPANY);
  assert.equal(identity.role_label, CREATED_ROLE);
  assert.equal(identity.application_id, manifest.application_id);
  assert.equal(identity.created_at, manifest.application_created_at);
  assert.equal(initialState.sequence, 1);
  assert.equal(initialState.status, "preparing");
  assert.equal(initialState.parent_sha256, hash(await readFile(path.join(createdDir, "application.json"))));
  assert.equal(initialState.vacancy, null);
  assert.equal(initialState.selected_original, null);
  assert.equal(initialState.resume_artifact, null);
  const createdEntries = careerEntries((await live.request({ type: "get_entries" })).data.entries);
  assert.deepEqual(createdEntries.map((entry) => entry.data?.kind), ["application"]);
  assert.equal(createdEntries[0].data.application_id, manifest.application_id);
  assert.equal(createdEntries[0].data.status, "preparing");
  assert.equal(JSON.stringify(createdEntries).includes(DOCUMENT_SENTINEL), false);
  assert.deepEqual(live.localEvents, ["entry_appended", "session_info_changed"]);
  assert.deepEqual(await treeSnapshot(item.catalogDir), before.catalog);
  assert.deepEqual(await treeSnapshot(item.libraryRoot), before.library);
  assert.deepEqual(await treeSnapshot(path.join(item.agentDir, "career")), before.config);
  await assertBoundary(live, item, trap);

  const attached = await live.prompt("/career", [
    { method: "select", value: CREATED_LABEL },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.attach },
    { method: "confirm", confirmed: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(attached.some((request) => request.method === "notify" && request.message === "Application attached. Career assistance remains inactive."), true);
  assert.equal(attached.some((request) => request.method === "editor"), false);
  const attachedEntries = careerEntries((await live.request({ type: "get_entries" })).data.entries);
  assert.deepEqual(attachedEntries.map((entry) => [entry.customType, entry.data?.kind]), [
    [WORKFLOW_TYPE, "application"],
    [ATTACHMENT_TYPE, "application_attachment"],
  ]);
  assert.equal(attachedEntries[1].data.application_id, manifest.application_id);
  assert.deepEqual(live.localEvents, ["entry_appended", "session_info_changed", "entry_appended"]);
  assert.deepEqual((await readdir(createdDir)).sort(), createdFiles);
  await assertBoundary(live, item, trap);

  const status = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.updateStatus },
    { method: "select", value: "Applied" },
    { method: "editor", cancel: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.updateStatus },
    { method: "select", value: "Applied" },
    { method: "editor", echo: true },
    { method: "confirm", confirmed: false },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.updateStatus },
    { method: "select", value: "Applied" },
    { method: "editor", echo: true },
    { method: "confirm", confirmed: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(status.filter((request) => request.method === "confirm" && request.title === APPLY_TITLE).length, 2);
  assert.equal(status.some((request) => request.method === "notify" && String(request.message).startsWith("Recorded immutable workspace status revision ")), true);
  assert.deepEqual(live.operations.slice(6, 9), ["record_state", "record_state", "record_state"]);
  const state1 = await readFile(path.join(createdDir, ".pi-career-state-000001.json"));
  const state2 = await readFile(path.join(createdDir, ".pi-career-state-000002.json"));
  const state3 = await readFile(path.join(createdDir, ".pi-career-state-000003.json"));
  const parsed2 = JSON.parse(state2.toString("utf8"));
  const parsed3 = JSON.parse(state3.toString("utf8"));
  assert.equal(parsed2.schema_version, "pi.career.application_state.v2");
  assert.equal(parsed2.sequence, 2);
  assert.equal(parsed2.status, "preparing");
  assert.equal(parsed2.parent_sha256, hash(state1));
  assert.equal(parsed2.cover_letter_artifact, null);
  assert.equal(parsed3.schema_version, "pi.career.application_state.v2");
  assert.equal(parsed3.sequence, 3);
  assert.equal(parsed3.status, "applied");
  assert.equal(parsed3.parent_sha256, hash(state2));
  assert.equal(parsed3.vacancy, null);
  assert.equal(parsed3.selected_original, null);
  assert.equal(parsed3.resume_artifact, null);
  assert.equal(parsed3.cover_letter_artifact, null);
  assert.deepEqual(Object.keys(parsed3), [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
    "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
  ]);
  assert.deepEqual((await readdir(createdDir)).sort(), [
    ".pi-career-identity.json", ".pi-career-state-000001.json", ".pi-career-state-000002.json",
    ".pi-career-state-000003.json", "application.json",
  ]);
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries).map((entry) => entry.data?.kind), [
    "application", "application_attachment",
  ]);
  assert.deepEqual(live.localEvents, ["entry_appended", "session_info_changed", "entry_appended"]);
  await assertBoundary(live, item, trap);

  const selected = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.switchView },
    { method: "select", value: "Library" },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.selectOriginal },
    { method: "select", only: true },
    { method: "editor", echo: true },
    { method: "confirm", confirmed: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(selected.some((request) => request.method === "notify" && String(request.message).includes("no original bytes were copied or changed")), true);
  assert.deepEqual(live.operations.slice(9), ["select_original"]);
  const state4 = JSON.parse(await readFile(path.join(createdDir, ".pi-career-state-000004.json"), "utf8"));
  assert.equal(state4.sequence, 4);
  assert.equal(state4.status, "applied");
  assert.equal(state4.parent_sha256, hash(state3));
  assert.equal(state4.selected_original.text_sha256, hash(item.document));
  assert.equal(state4.selected_original.format, "markdown");
  assert.equal(state4.selected_original.library_root_id, hash(item.libraryRoot));
  assert.equal(state4.selected_original.document_id, hash(await realpath(item.documentPath)));
  assert.equal(state4.resume_artifact, null);
  assert.deepEqual(await treeSnapshot(item.libraryRoot), before.library);
  assert.deepEqual(await treeSnapshot(item.catalogDir), before.catalog);
  assert.deepEqual(await treeSnapshot(path.join(item.agentDir, "career")), before.config);
  assert.deepEqual(live.localEvents, ["entry_appended", "session_info_changed", "entry_appended"]);
  const beforeDetach = await treeSnapshot(createdDir);
  const attachedBeforeDetach = careerEntries((await live.request({ type: "get_entries" })).data.entries);
  const detachCancelled = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.detach },
    { method: "confirm", confirmed: false },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(detachCancelled.filter((request) => request.method === "confirm" && request.title === DETACH_TITLE && request.message === "Detach this application from the Pi session? Workspace files are not changed.").length, 1);
  assert.equal(detachCancelled.some((request) => request.method === "notify" && request.message === DETACH_CANCELLED), true);
  assert.equal(detachCancelled.some((request) => request.method === "editor"), false);
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries), attachedBeforeDetach);
  assert.deepEqual(await treeSnapshot(createdDir), beforeDetach);
  assert.deepEqual(live.localEvents, ["entry_appended", "session_info_changed", "entry_appended"]);
  await assertBoundary(live, item, trap);

  const detached = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.detach },
    { method: "confirm", confirmed: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(detached.filter((request) => request.method === "confirm" && request.title === DETACH_TITLE && request.message === "Detach this application from the Pi session? Workspace files are not changed.").length, 1);
  assert.equal(detached.some((request) => request.method === "notify" && request.message === DETACH_NOTICE), true);
  assert.equal(detached.some((request) => request.method === "editor"), false);
  const detachedEntries = careerEntries((await live.request({ type: "get_entries" })).data.entries);
  assert.deepEqual(detachedEntries.slice(0, 2), attachedBeforeDetach);
  assert.equal(detachedEntries.length, 3);
  const detachment = detachedEntries[2].data;
  assert.equal(detachedEntries[2].customType, ATTACHMENT_TYPE);
  assert.deepEqual(detachment, {
    schema_version: "pi.career.application_attachment.v1",
    kind: "application_detachment",
    detachment_id: detachment.detachment_id,
    attachment_id: attachedBeforeDetach[1].data.attachment_id,
  });
  assert.match(detachment.detachment_id, UUID);
  assert.notEqual(detachment.detachment_id, detachment.attachment_id);
  assert.equal(detachedEntries.some((entry) =>
    entry.data?.kind === "application_clear" || entry.data?.kind === "vacancy_clear" || entry.customType === ACTIVATION_TYPE), false);
  assert.equal(JSON.stringify(detachedEntries).includes(DOCUMENT_SENTINEL), false);
  assert.deepEqual(await treeSnapshot(createdDir), beforeDetach);
  assert.deepEqual(await treeSnapshot(item.catalogDir), before.catalog);
  assert.deepEqual(await treeSnapshot(item.libraryRoot), before.library);
  assert.deepEqual(await treeSnapshot(path.join(item.agentDir, "career")), before.config);
  assert.deepEqual(live.localEvents.slice(0, 3), ["entry_appended", "session_info_changed", "entry_appended"]);
  assert.equal(live.localEvents.filter((type) => type === "entry_appended").length, 3);
  assert.equal(live.localEvents.every((type) => type === "entry_appended" || type === "session_info_changed"), true);
  const repeatDetach = await live.prompt("/career", [
    { method: "select", value: CAREER_UI_RPC_ACTIONS.detach },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(repeatDetach.some((request) => request.method === "confirm" || request.method === "notify" || request.method === "editor"), false);
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries), detachedEntries);
  await assertBoundary(live, item, trap);

  const tools = await live.prompt("/career-tools status", []);
  assert.equal(tools.some((request) => request.message === "Career tools inactive."), true);
  const residue = (await filesUnder(item.workspaceRoot)).filter((file) => file.includes(".tmp") || file.endsWith(".lock"));
  assert.deepEqual(residue, []);
  await assertBoundary(live, item, trap);
  await live.close();
  assert.equal(trap.requests.length, 0);
});
