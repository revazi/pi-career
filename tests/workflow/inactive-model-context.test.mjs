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

import { careerRunErrorMessage } from "../../src/managed/errors.ts";
import { CAREER_ASSISTANCE_HANDOFF } from "../../src/workflow/session-attachment.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const piCli = path.join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const extensionPath = path.join(repositoryRoot, "dist/index.js");
const skillSource = await readFile(path.join(repositoryRoot, "skills/career-core/SKILL.md"), "utf8");
const skillBody = skillSource.slice(skillSource.indexOf("# Career Core through pi-career"));
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-04T00:00:00.000Z";
const ASSISTANCE_INACTIVE = careerRunErrorMessage("assistance_required");
const ATTACHED_NOTICE = "Application attached. Career assistance remains inactive.";
const ATTACHMENT_TYPE = "career.application_attachment";
const ACTIVATION_TYPE = "career.application_assistance";
const ATTACHMENT_SCHEMA = "pi.career.application_attachment.v1";
const HOST_TOOLS = ["bash", "edit", "read", "write"];
const CAREER_TOOL_NAMES = ["career_run", "career_core_discover", "career_core_resume", "career_core_job"];
const SKILL_DISCOVERY_MARKERS = [
  "<name>career-core</name>",
  "career-core/SKILL.md",
  "Resolves and invokes a compatible deterministic Career Core runtime",
];
const TOOL_SCHEMA_MARKERS = [
  ...CAREER_TOOL_NAMES,
  "Run managed local Career Core workflows with ephemeral handles",
  "Discover deterministic Career Core capabilities and embedded JSON schemas",
  "Run one bounded compatible Career Core resume operation",
  "Run compatible Career Core job normalization",
  "Discover compatible Career Core capabilities and exact embedded schemas before document operations",
  "Evaluate, analyze, normalize, or review bounded resume inputs through the compatible deterministic runtime",
  "Normalize job text or conservatively match original resume and job inputs through the compatible deterministic runtime",
];
const TURN_EVENTS = new Set([
  "agent_start", "agent_end", "before_agent_start", "turn_start", "turn_end",
  "message_start", "message_update", "message_end", "tool_execution_start",
  "tool_execution_end", "compaction_start", "auto_retry_start",
]);
const SYNTHETIC_ACK = "synthetic-ordinary-ack";
const RELOAD_PROBE = "synthetic-reload-probe";
const RELOAD_PROBE_SENTINEL = "SYNTHETIC_RELOAD_PROBE";

const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

class LoopbackProvider {
  constructor() {
    this.modelTurns = [];
    this.probeCount = 0;
    this.rejectedCount = 0;
    this.server = http.createServer((request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (text === "synthetic-provider-probe") {
          this.probeCount += 1;
          response.writeHead(204);
          response.end();
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          this.rejectedCount += 1;
          response.writeHead(400);
          response.end();
          return;
        }
        if (text.length > 1_500_000 || parsed?.stream !== true) {
          this.rejectedCount += 1;
          response.writeHead(413);
          response.end();
          return;
        }
        this.modelTurns.push({ method: request.method, url: request.url, body: text, parsed });
        const model = typeof parsed.model === "string" ? parsed.model : "synthetic-loopback-model";
        const chunk = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        });
        response.end([
          chunk({
            id: "chatcmpl-synthetic",
            object: "chat.completion.chunk",
            created: 1,
            model,
            choices: [{ index: 0, delta: { role: "assistant", content: SYNTHETIC_ACK }, finish_reason: null }],
          }),
          chunk({
            id: "chatcmpl-synthetic",
            object: "chat.completion.chunk",
            created: 1,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          "data: [DONE]\n\n",
        ].join(""));
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
    this.events = [];
    this.notices = [];
    this.editorSeen = false;
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
        if (message.method === "notify") {
          this.notices.push({ notifyType: message.notifyType, message: message.message });
          continue;
        }
        if (message.method === "set_editor_text" || message.method === "editor") {
          this.editorSeen = true;
          if (message.method === "editor") {
            this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
          }
          this.#fail(new Error("unexpected editor handoff"));
          return;
        }
        if (message.method !== "select" && message.method !== "confirm" && message.method !== "input") return;
        const step = this.steps.shift();
        if (step === undefined || step.method !== message.method) {
          this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
          this.#fail(new Error(`unexpected ${message.method} dialog`));
          return;
        }
        if (step.method === "select" && (step.value === undefined || !message.options.includes(step.value))) {
          this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
          this.#fail(new Error("select options did not include the expected local choice"));
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
      }, 90_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
    this.child.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
    return response;
  }

  async command(message, steps = []) {
    this.steps = [...steps];
    const response = await this.request({ type: "prompt", message });
    assert.equal(response.success, true, "command preflight failed");
    assert.equal(this.steps.length, 0, "command left unused dialogs");
  }

  async ordinaryTurn(message) {
    const before = this.events.length;
    const response = await this.request({ type: "prompt", message });
    assert.equal(response.success, true, "ordinary prompt preflight failed");
    await this.#waitFor("agent_end", before);
    await this.#waitFor("agent_settled", before);
  }

  #waitFor(type, index) {
    const found = () => this.events.slice(index).includes(type);
    if (found()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timed out waiting for ${type}`));
      }, 90_000);
      const interval = setInterval(() => {
        if (this.events.slice(index).includes("extension_error")) {
          cleanup();
          reject(new Error("extension_error during model turn"));
          return;
        }
        if (found()) {
          cleanup();
          resolve();
        }
      }, 20);
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    });
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
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
}

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

async function fixture(t, trap, spec) {
  const { id, applicationId, rootId } = spec;
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), `pi-career-inactive-context-${id}-`)));
  await chmod(base, 0o700);
  t.after(() => rm(base, { recursive: true, force: true }));
  const agentDir = path.join(base, "agent");
  const home = path.join(base, "home");
  const cwd = path.join(base, "cwd");
  const sessions = path.join(base, "sessions");
  const libraryRoot = await realpath(await mkdirPrivate(path.join(base, "library")));
  const workspaceRoot = await realpath(await mkdirPrivate(path.join(base, "applications")));
  for (const directory of [agentDir, home, cwd, sessions, path.join(agentDir, "career")]) {
    await mkdirPrivate(directory);
  }
  const company = `SynthCo${id}`;
  const role = `SynthRole${id}`;

  const documentSentinel = `SYNTHETIC_DOCUMENT_TEXT_${id}`;
  const document = Buffer.from(`# Synthetic original\n${documentSentinel}\n`);
  const documentPath = path.join(libraryRoot, "synthetic-original.md");
  await privateFile(documentPath, document);
  const catalogDir = path.join(
    workspaceRoot,
    `synthco${id}--synthrole${id}--${applicationId}`,
  );
  await mkdirPrivate(catalogDir);
  const applicationDocumentPath = path.join(catalogDir, "synthetic-application-document.md");
  await privateFile(applicationDocumentPath, Buffer.from(`${documentSentinel}\n`));
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
    application_workspace: { root_id: rootId, root_path: workspaceRoot },
  });
  await privateJson(path.join(workspaceRoot, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1", kind: "application_workspace_root",
    root_id: rootId, created_at: ROOT_CREATED_AT,
  });
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: applicationId, root_id: rootId,
    application_created_at: APPLICATION_CREATED_AT, workspace_created_at: WORKSPACE_CREATED_AT,
  });
  await privateFile(path.join(catalogDir, "application.json"), manifest);
  await privateJson(path.join(catalogDir, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: applicationId, company_label: company,
    role_label: role, created_at: APPLICATION_CREATED_AT,
  });
  await privateJson(path.join(catalogDir, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v1", kind: "application_state_revision",
    application_id: applicationId, sequence: 1, parent_sha256: hash(manifest), status: "preparing",
    vacancy: null, selected_original: null, resume_artifact: null, updated_at: WORKSPACE_CREATED_AT,
  });
  const coreTrap = path.join(base, "core-trap");
  await privateFile(coreTrap, Buffer.from("#!/bin/sh\ntouch \"$(dirname \"$0\")/core-was-invoked\"\nexit 97\n"));
  await chmod(coreTrap, 0o700);
  return {
    base, agentDir, cwd, sessions, libraryRoot, workspaceRoot, catalogDir, documentPath,
    applicationDocumentPath, company, role, applicationId, documentSentinel, coreTrap,
    label: `${company} — ${role} — Preparing — Incomplete 0/3`,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      TMPDIR: os.tmpdir(),
      PI_CODING_AGENT_DIR: agentDir,
      PI_CODING_AGENT_SESSION_DIR: sessions,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      PI_SKIP_VERSION_CHECK: "1",
      CAREER_CLI_PATH: coreTrap,
    },
  };
}

async function mkdirPrivate(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}

async function plantReloadProbe(agentDir) {
  const directory = path.join(agentDir, "skills", RELOAD_PROBE);
  await mkdirPrivate(directory);
  await privateFile(path.join(directory, "SKILL.md"), Buffer.from(
    `---\nname: ${RELOAD_PROBE}\ndescription: Synthetic undiscovered reload probe.\n---\n\n# Synthetic reload probe\n${RELOAD_PROBE_SENTINEL}\n`,
  ));
}

function commandNames(response) {
  return response.data.commands.map((command) => command.name).sort();
}

function careerEntries(entries) {
  return entries.filter((entry) => entry.customType === ATTACHMENT_TYPE || entry.customType === ACTIVATION_TYPE)
    .map((entry) => ({
      customType: entry.customType,
      kind: entry.data?.kind,
      applicationId: entry.data?.application_id,
      attachmentId: entry.data?.attachment_id,
    }));
}

function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("");
}

function boundedTurn(turn) {
  const messages = Array.isArray(turn.parsed.messages) ? turn.parsed.messages : [];
  const toolNames = Array.isArray(turn.parsed.tools)
    ? turn.parsed.tools.map((tool) => tool?.function?.name ?? tool?.custom?.name).filter((name) => typeof name === "string").sort()
    : [];
  return {
    method: turn.method,
    url: turn.url,
    model: turn.parsed.model,
    stream: turn.parsed.stream,
    roles: messages.map((message) => message?.role),
    userTexts: messages.filter((message) => message?.role === "user").map((message) => textContent(message.content)),
    toolNames,
  };
}

function assertAbsent(body, value, label) {
  assert.equal(typeof value, "string");
  assert.equal(value.length > 0, true, label);
  assert.equal(body.includes(value), false, `${label} leaked`);
}

function assertInactiveContext(body, item, sessionSecrets) {
  assert.equal(skillBody.length > 40, true);
  assertAbsent(body, skillBody, "Career Skill content");
  for (const marker of SKILL_DISCOVERY_MARKERS) assertAbsent(body, marker, "Career Skill discovery metadata");
  for (const marker of TOOL_SCHEMA_MARKERS) assertAbsent(body, marker, "Career tool schema");
  for (const value of [
    item.documentSentinel, item.company, item.role, item.applicationId, item.workspaceRoot,
    item.libraryRoot, item.catalogDir, item.documentPath, item.applicationDocumentPath,
    ATTACHMENT_SCHEMA, ATTACHMENT_TYPE, ACTIVATION_TYPE, CAREER_ASSISTANCE_HANDOFF,
    RELOAD_PROBE, RELOAD_PROBE_SENTINEL, ...sessionSecrets,
  ]) assertAbsent(body, value, "private context");
}

async function assertNoCore(item) {
  assert.equal((await readdir(item.base)).includes("core-was-invoked"), false);
}

async function assertQuiet(live, trap) {
  assert.equal(trap.modelTurns.length, 0);
  assert.equal(trap.rejectedCount, 0);
  assert.equal(live.editorSeen, false);
  assert.equal(live.stderr.length, 0, "child stderr was not empty");
  assert.deepEqual(live.events.filter((type) => TURN_EVENTS.has(type)), []);
  const state = await live.request({ type: "get_state" });
  assert.equal(state.success, true);
  assert.equal(state.data.sessionFile ?? null, null);
  assert.equal(state.data.isStreaming, false);
  assert.equal(state.data.model?.id, "synthetic-loopback-model");
  assert.equal(state.data.model?.baseUrl, trap.baseUrl);
  const commands = await live.request({ type: "get_commands" });
  const names = commandNames(commands);
  assert.equal(names.includes("career-tools"), true);
  assert.equal(names.includes("skill:career-core"), false);
  assert.equal(names.includes(`skill:${RELOAD_PROBE}`), false);
  return names;
}

async function settledMessages(live) {
  const messages = await live.request({ type: "get_messages" });
  assert.equal(messages.success, true);
  return messages.data.messages;
}

function assertPositiveControl(turn, prompt) {
  const view = boundedTurn(turn);
  assert.equal(view.method, "POST");
  assert.equal(view.url, "/v1/chat/completions");
  assert.equal(view.model, "synthetic-loopback-model");
  assert.equal(view.stream, true);
  assert.equal(view.roles.includes("system") || view.roles.includes("developer"), true);
  assert.deepEqual(view.userTexts, [prompt]);
  assert.equal(view.toolNames.includes("read"), true);
  assert.deepEqual(view.toolNames, HOST_TOOLS);
  assert.deepEqual(view.toolNames.filter((name) => CAREER_TOOL_NAMES.includes(name)), []);
  return view;
}

async function startChild(t, spec) {
  const trap = await new LoopbackProvider().start();
  t.after(() => trap.stop());
  assert.equal(await probeTrap(trap.port), 204);
  assert.equal(trap.probeCount, 1);
  assert.equal(trap.modelTurns.length, 0);
  const item = await fixture(t, trap, spec);
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
  const commands = await assertQuiet(live, trap);
  await plantReloadProbe(item.agentDir);
  return { trap, item, live, before, commands };
}

test("P3-50 attached inactive session ordinary model turn omits Career Skill metadata, Skill content, and Career tool schemas", { timeout: 240_000 }, async (t) => {
  const prompt = "SYNTHETIC_ORDINARY_TURN_50";
  const { trap, item, live, before, commands } = await startChild(t, {
    id: "150", applicationId: "00000000-0000-4000-8000-000000000150", rootId: "00000000-0000-4000-8000-000000000250",
  });
  await live.command("/career", [
    { method: "select", value: item.label },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.attach },
    { method: "confirm", confirmed: true },
    { method: "select", value: CAREER_UI_RPC_ACTIONS.close },
  ]);
  assert.equal(live.notices.some((notice) => notice.message === ATTACHED_NOTICE && notice.notifyType === "info"), true);
  assert.equal(live.notices.some((notice) => notice.message === ASSISTANCE_INACTIVE), false);
  const attached = careerEntries((await live.request({ type: "get_entries" })).data.entries);
  assert.equal(attached.length, 1);
  assert.equal(attached[0].customType, ATTACHMENT_TYPE);
  assert.equal(attached[0].kind, "application_attachment");
  assert.equal(attached[0].applicationId, item.applicationId);
  assert.equal(typeof attached[0].attachmentId, "string");
  assert.deepEqual(await treeSnapshot(item.workspaceRoot), before.workspace);
  assert.deepEqual(await treeSnapshot(item.libraryRoot), before.library);
  assert.deepEqual(await treeSnapshot(path.join(item.agentDir, "career")), before.config);
  const afterAttach = await assertQuiet(live, trap);
  assert.deepEqual(afterAttach, commands);
  await assertNoCore(item);

  await live.ordinaryTurn(prompt);
  assert.equal(trap.modelTurns.length, 1);
  assert.equal(trap.rejectedCount, 0);
  const turn = trap.modelTurns[0];
  assertPositiveControl(turn, prompt);
  assert.equal(turn.body.split(prompt).length, 2);
  assertInactiveContext(turn.body, item, [attached[0].attachmentId]);
  const messages = await settledMessages(live);
  assert.equal(messages.some((message) => message.role === "user" && textContent(message.content) === prompt), true);
  assert.equal(messages.filter((message) => message.role === "assistant" && textContent(message.content) === SYNTHETIC_ACK).length, 1);
  assert.equal(live.events.includes("tool_execution_start"), false);
  assert.equal(live.editorSeen, false);
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries), attached);
  assert.equal(commandNames(await live.request({ type: "get_commands" })).includes("skill:career-core"), false);
  assert.equal(commandNames(await live.request({ type: "get_commands" })).includes(`skill:${RELOAD_PROBE}`), false);
  const state = await live.request({ type: "get_state" });
  assert.equal(state.data.messageCount, 2);
  assert.equal(state.data.isStreaming, false);
  assert.equal(live.stderr.length, 0, "child stderr was not empty");
  await assertNoCore(item);
  await live.close();
});

test("P3-57 inactive raw-tool request is rejected and the following ordinary model turn omits all four Career tool schemas", { timeout: 240_000 }, async (t) => {
  const prompt = "SYNTHETIC_ORDINARY_TURN_57";
  const { trap, item, live, commands } = await startChild(t, {
    id: "157", applicationId: "00000000-0000-4000-8000-000000000157", rootId: "00000000-0000-4000-8000-000000000257",
  });
  const noticesBefore = live.notices.length;
  await live.command("/career-tools raw");
  const rejection = live.notices.slice(noticesBefore);
  assert.deepEqual(rejection, [{ notifyType: "warning", message: ASSISTANCE_INACTIVE }]);
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries), []);
  const afterRejection = await assertQuiet(live, trap);
  assert.deepEqual(afterRejection, commands);
  assert.equal(live.editorSeen, false);
  await assertNoCore(item);

  await live.ordinaryTurn(prompt);
  assert.equal(trap.modelTurns.length, 1);
  assert.equal(trap.rejectedCount, 0);
  const turn = trap.modelTurns[0];
  const view = assertPositiveControl(turn, prompt);
  assert.equal(turn.body.split(prompt).length, 2);
  assert.deepEqual(view.toolNames.filter((name) => CAREER_TOOL_NAMES.includes(name)), []);
  assertInactiveContext(turn.body, item, []);
  const messages = await settledMessages(live);
  assert.equal(messages.some((message) => message.role === "user" && textContent(message.content) === prompt), true);
  assert.equal(messages.filter((message) => message.role === "assistant" && textContent(message.content) === SYNTHETIC_ACK).length, 1);
  assert.equal(live.events.includes("tool_execution_start"), false);
  assert.deepEqual(careerEntries((await live.request({ type: "get_entries" })).data.entries), []);
  assert.equal(commandNames(await live.request({ type: "get_commands" })).includes("skill:career-core"), false);
  assert.equal(commandNames(await live.request({ type: "get_commands" })).includes(`skill:${RELOAD_PROBE}`), false);
  assert.equal(live.stderr.length, 0, "child stderr was not empty");
  await assertNoCore(item);
  await live.close();
});
