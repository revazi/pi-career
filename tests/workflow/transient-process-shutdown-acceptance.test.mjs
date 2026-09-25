// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CAREER_ASSISTANCE_HANDOFF } from "../../src/workflow/session-attachment.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const piCli = path.join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const extensionPath = path.join(repositoryRoot, "dist/index.js");
const APPLICATION_ID = "00000000-0000-4000-8000-000000000030";
const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const DOCUMENT_SENTINEL = "SYNTHETIC_DOCUMENT_TEXT_30";
const APPLICATION_LABEL = "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3";
const ATTACHMENT_TYPE = "career.application_attachment";
const ACTIVATION_TYPE = "career.application_assistance";
const FORBIDDEN_EVENTS = new Set([
  "agent_start", "agent_end", "turn_start", "turn_end", "message_start", "message_end",
  "tool_execution_start", "tool_execution_end", "compaction_start", "auto_retry_start",
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
        mode: metadata.mode & 0o7777,
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

function careerEntries(entries) {
  return entries.filter((entry) => entry.customType === ATTACHMENT_TYPE || entry.customType === ACTIVATION_TYPE);
}

class RpcProcess {
  constructor(item) {
    this.item = item;
    this.buffer = "";
    this.pending = new Map();
    this.requestId = 0;
    this.ui = [];
    this.events = [];
    this.stderr = "";
    this.steps = [];
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
        if (message.method === "select" || message.method === "confirm" || message.method === "input" || message.method === "editor") {
          const step = this.steps.shift();
          const cancel = () => {
            this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
          };
          if (step === undefined || step.method !== message.method) {
            cancel();
            this.#fail(new Error(`unexpected ${message.method} dialog`));
            return;
          }
          if (step.method === "select" && !message.options.includes(step.value)) {
            cancel();
            this.#fail(new Error(`select options did not include ${step.value}`));
            return;
          }
          const response = step.method === "confirm"
            ? { type: "extension_ui_response", id: message.id, confirmed: step.confirmed }
            : { type: "extension_ui_response", id: message.id, value: step.value };
          this.child.stdin.write(`${JSON.stringify(response)}\n`);
        }
      } else if (message.type === "response") {
        const pending = this.pending.get(message.id);
        if (pending !== undefined) {
          this.pending.delete(message.id);
          pending.resolve(message);
        }
      } else if (FORBIDDEN_EVENTS.has(message.type)) {
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
      }, 20_000);
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

  async stop() {
    const pid = this.child.pid;
    assert.equal(typeof pid, "number");
    const exited = new Promise((resolve) => this.child.once("exit", (code, signal) => resolve({ code, signal })));
    this.child.kill("SIGTERM");
    const result = await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve(undefined), 5_000)),
    ]);
    if (result === undefined) {
      this.child.kill("SIGKILL");
      throw new Error("RPC process did not exit after SIGTERM");
    }
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    assert.equal(alive, false);
    assert.ok(result.signal === "SIGTERM" || result.code === 143, "shutdown must be signal termination, not object disposal");
    return { pid, ...result };
  }
}

async function fixture(t) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-shutdown-")));
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
  await privateJson(path.join(agentDir, "models.json"), {
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
  });
  await privateJson(path.join(agentDir, "career", "config.v1.json"), {
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: hash(libraryRoot), path: libraryRoot, label: "Synthetic private library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: workspaceRoot },
  });
  await privateFile(path.join(libraryRoot, "private-resume.md"), Buffer.from(`${DOCUMENT_SENTINEL}\n`));
  await privateJson(path.join(workspaceRoot, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1", kind: "application_workspace_root",
    root_id: ROOT_ID, created_at: ROOT_CREATED_AT,
  });
  const applicationDir = path.join(workspaceRoot, `synthetic-company--synthetic-engineer--${APPLICATION_ID}`);
  await mkdir(applicationDir, { mode: 0o700 });
  await chmod(applicationDir, 0o700);
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: APPLICATION_ID, root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT, workspace_created_at: WORKSPACE_CREATED_AT,
  });
  await privateFile(path.join(applicationDir, "application.json"), manifest);
  await privateJson(path.join(applicationDir, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: APPLICATION_ID, company_label: "Synthetic Company",
    role_label: "Synthetic Engineer", created_at: APPLICATION_CREATED_AT,
  });
  await privateJson(path.join(applicationDir, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v1", kind: "application_state_revision",
    application_id: APPLICATION_ID, sequence: 1, parent_sha256: hash(manifest), status: "preparing",
    vacancy: null, selected_original: null, resume_artifact: null, updated_at: WORKSPACE_CREATED_AT,
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
  return { base, agentDir, home, cwd, sessions, libraryRoot, workspaceRoot, coreTrap, env };
}

async function approvedSnapshot(item) {
  return {
    config: await treeSnapshot(path.join(item.agentDir, "career")),
    workspace: await treeSnapshot(item.workspaceRoot),
    library: await treeSnapshot(item.libraryRoot),
  };
}

async function assertNoPersistedPrivateBytes(item) {
  const files = await filesUnder(item.base);
  assert.equal(files.some((file) => file.endsWith(".jsonl")), false);
  assert.equal(files.includes(path.join(item.base, "core-was-invoked")), false);
  const resume = path.join(item.libraryRoot, "private-resume.md");
  for (const file of files) {
    if (file === resume || file === item.coreTrap) continue;
    const bytes = await readFile(file);
    const text = bytes.toString("utf8");
    assert.equal(text.includes(DOCUMENT_SENTINEL), false, path.basename(file));
    assert.equal(text.includes(CAREER_ASSISTANCE_HANDOFF), false, path.basename(file));
    assert.equal(text.includes(ATTACHMENT_TYPE), false, path.basename(file));
    assert.equal(text.includes(ACTIVATION_TYPE), false, path.basename(file));
  }
}

function skillPresent(commands) {
  return commands.some((command) => command.name === "skill:career-core" && command.source === "skill");
}

test("P3-30 live transient process loses the in-memory attachment after shutdown while approved workspace bytes remain", { timeout: 60_000 }, async (t) => {
  const item = await fixture(t);
  const before = await approvedSnapshot(item);
  for (const tree of Object.values(before)) {
    for (const entry of tree) assert.equal(entry.mode, entry.kind === "directory" ? 0o700 : 0o600, entry.path);
  }
  const live = new RpcProcess(item).start();
  t.after(() => {
    if (live.child.exitCode === null && live.child.signalCode === null) live.child.kill("SIGKILL");
  });

  const state = await live.request({ type: "get_state" });
  assert.equal(state.success, true);
  assert.equal(state.data.sessionFile ?? null, null);
  assert.equal(state.data.model?.id, "synthetic-offline-model");
  assert.equal(state.data.messageCount, 0);
  const initialCommands = await live.request({ type: "get_commands" });
  assert.equal(skillPresent(initialCommands.data.commands), false);
  assert.equal(initialCommands.data.commands.some((command) => command.name === "reload"), false);

  const attachedUi = await live.prompt("/career", [
    { method: "select", value: "Attach" },
    { method: "confirm", confirmed: true },
    { method: "select", value: "Close" },
  ]);
  assert.equal(attachedUi.some((request) => request.method === "notify" && request.message === "Application attached. Career assistance remains inactive."), true);
  const attached = await live.request({ type: "get_entries" });
  const attachedCareer = careerEntries(attached.data.entries);
  assert.deepEqual(attachedCareer.map((entry) => entry.data?.kind), ["application_attachment"]);
  assert.equal(attachedCareer[0].data.application_id, APPLICATION_ID);
  assert.equal(JSON.stringify(attachedCareer).includes(DOCUMENT_SENTINEL), false);
  const inactiveTools = await live.prompt("/career-tools status", []);
  assert.equal(inactiveTools.some((request) => request.message === "Career tools inactive."), true);

  const activationUi = await live.prompt("/career", [
    { method: "select", value: "Switch view" },
    { method: "select", value: "Workbench" },
    { method: "select", value: "Ask Pi" },
    { method: "confirm", confirmed: true },
  ]);
  assert.equal(activationUi.some((request) => request.method === "set_editor_text" && request.text === CAREER_ASSISTANCE_HANDOFF), true);
  assert.equal(activationUi.some((request) => request.message === "Career assistance prepared in the editor. Review and submit manually."), true);
  const activated = await live.request({ type: "get_entries" });
  assert.deepEqual(careerEntries(activated.data.entries).map((entry) => entry.data?.kind), [
    "application_attachment", "application_assistance_activation",
  ]);
  const activatedCommands = await live.request({ type: "get_commands" });
  assert.equal(skillPresent(activatedCommands.data.commands), true);
  assert.equal(activatedCommands.data.commands.some((command) => command.name === "reload"), false);
  const activeTools = await live.prompt("/career-tools status", []);
  assert.equal(activeTools.some((request) => request.message === "Career tools: career_run active; raw Career Core tools inactive."), true);
  const stillTransient = await live.request({ type: "get_state" });
  assert.equal(stillTransient.data.sessionFile ?? null, null);
  assert.equal(stillTransient.data.messageCount, 0);
  const messages = await live.request({ type: "get_messages" });
  assert.deepEqual(messages.data.messages, []);
  assert.deepEqual(live.events, []);
  assert.equal(live.stderr, "");
  assert.deepEqual(await approvedSnapshot(item), before);

  // Same-pid retention above includes activation's ctx.reload(). Built-in TUI /reload
  // is absent from RPC get_commands and must not be sent: the host would not execute
  // it and the text could fall through to model authentication. Shutdown is separate.
  const stopped = await live.stop();
  await assertNoPersistedPrivateBytes(item);
  assert.deepEqual(await approvedSnapshot(item), before);

  const fresh = new RpcProcess(item).start();
  t.after(() => {
    if (fresh.child.exitCode === null && fresh.child.signalCode === null) fresh.child.kill("SIGKILL");
  });
  assert.notEqual(fresh.child.pid, stopped.pid);
  const freshState = await fresh.request({ type: "get_state" });
  assert.equal(freshState.data.sessionFile ?? null, null);
  assert.equal(freshState.data.messageCount, 0);
  const freshEntries = await fresh.request({ type: "get_entries" });
  assert.deepEqual(careerEntries(freshEntries.data.entries), []);
  const freshCommands = await fresh.request({ type: "get_commands" });
  assert.equal(skillPresent(freshCommands.data.commands), false);
  const freshTools = await fresh.prompt("/career-tools status", []);
  assert.equal(freshTools.some((request) => request.message === "Career tools inactive."), true);
  const catalog = await fresh.prompt("/career", [
    { method: "select", value: "Close" },
  ]);
  assert.equal(catalog.some((request) => request.method === "select" && request.options.includes(APPLICATION_LABEL)), true);
  assert.equal(catalog.some((request) => request.method === "notify" && request.message === "Application attached. Career assistance remains inactive."), false);
  const afterCatalog = await fresh.request({ type: "get_entries" });
  assert.deepEqual(careerEntries(afterCatalog.data.entries), []);
  const freshMessages = await fresh.request({ type: "get_messages" });
  assert.deepEqual(freshMessages.data.messages, []);
  assert.deepEqual(fresh.events, []);
  assert.equal(fresh.stderr, "");
  await fresh.stop();
  await assertNoPersistedPrivateBytes(item);
  assert.deepEqual(await approvedSnapshot(item), before);
});
