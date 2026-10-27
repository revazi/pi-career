// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { HANDOFF } from "../fixtures/issue-66-rpc-probe-extension.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const piCli = path.join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const extensionPath = path.join(repositoryRoot, "tests/fixtures/issue-66-rpc-probe-extension.mjs");
const AGENT_EVENTS = new Set(["agent_start", "agent_end", "agent_settled", "turn_start", "turn_end"]);

async function privateJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

class RpcProbe {
  constructor({ cwd, agentDir, sessions, home }) {
    this.cwd = cwd;
    this.agentDir = agentDir;
    this.sessions = sessions;
    this.home = home;
    this.buffer = "";
    this.pending = new Map();
    this.requests = [];
    this.events = [];
    this.stderr = "";
    this.nextId = 0;
  }

  start() {
    this.child = spawn(process.execPath, [
      piCli,
      "--mode", "rpc",
      "--offline",
      "--no-session",
      "--no-approve",
      "--no-tools",
      "-e", extensionPath,
      "--session-dir", this.sessions,
    ], {
      cwd: this.cwd,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: this.home,
        PI_CODING_AGENT_DIR: this.agentDir,
        PI_CODING_AGENT_SESSION_DIR: this.sessions,
        PI_OFFLINE: "1",
        PI_TELEMETRY: "0",
        PI_SKIP_VERSION_CHECK: "1",
      },
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
        this.requests.push(message);
        if (message.method === "editor") {
          this.child.stdin.write(`${JSON.stringify({
            type: "extension_ui_response",
            id: message.id,
            value: message.prefill,
          })}\n`);
        }
      } else if (message.type === "response") {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          pending.resolve(message);
        }
      } else {
        this.events.push(message.type);
      }
    }
  }

  request(command) {
    const id = `probe-${++this.nextId}`;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for ${command.type}; stderr=${this.stderr}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
    this.child.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
    return response;
  }

  async prompt(message) {
    const before = this.requests.length;
    const response = await this.request({ type: "prompt", message });
    assert.equal(response.success, true, response.error ?? `prompt failed: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return this.requests.slice(before);
  }

  async stop() {
    if (this.child.exitCode !== null) return;
    const exited = new Promise((resolve) => this.child.once("exit", resolve));
    this.child.kill("SIGTERM");
    let timer;
    try {
      await Promise.race([
        exited,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("RPC process did not stop")), 10_000); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

test("#66 probe: RPC editor return and later prompt have no authenticated human-action marker", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-issue-66-rpc-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agentDir = path.join(root, "agent");
  const sessions = path.join(root, "sessions");
  const home = path.join(root, "home");
  const cwd = path.join(root, "cwd");
  await Promise.all([agentDir, sessions, home, cwd].map((directory) => mkdir(directory, { recursive: true, mode: 0o700 })));
  await privateJson(path.join(agentDir, "models.json"), {
    providers: {
      "synthetic-unreachable": {
        baseUrl: "http://127.0.0.1:9/v1",
        api: "openai-completions",
        apiKey: "synthetic-not-a-credential",
        models: [{
          id: "synthetic-probe",
          name: "Synthetic probe",
          reasoning: false,
          input: ["text"],
          contextWindow: 8192,
          maxTokens: 64,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        }],
      },
    },
  });

  const rpc = new RpcProbe({ cwd, agentDir, sessions, home }).start();
  t.after(() => rpc.stop());
  const state = await rpc.request({ type: "get_state" });
  assert.equal(state.success, true, state.error ?? "RPC startup failed");

  const setEditor = await rpc.prompt("/issue66-probe-set-editor");
  assert.equal(setEditor.some((request) => request.method === "set_editor_text" && request.text === HANDOFF), true);
  assert.equal(setEditor.some((request) => request.method === "editor"), false);
  assert.equal(setEditor.some((request) => request.method === "notify" && request.message === "ISSUE_66_SET_EDITOR_RETURNED"), true);

  const blockingEditor = await rpc.prompt("/issue66-probe-editor");
  assert.equal(blockingEditor.some((request) => request.method === "editor" && request.prefill === HANDOFF), true);
  assert.equal(blockingEditor.some((request) => request.method === "notify" && request.message === "ISSUE_66_EDITOR_ECHOED"), true);
  assert.equal(
    rpc.requests.some((request) => request.method === "notify" && request.message.startsWith("ISSUE_66_INPUT_SOURCE_")),
    false,
    "returning the editor response must not itself submit an ordinary prompt",
  );

  // This harness is automatic, yet Pi exposes the same source value a human-controlled RPC client would.
  const submitted = await rpc.prompt(HANDOFF);
  assert.equal(submitted.some((request) => request.method === "notify" && request.message === "ISSUE_66_INPUT_SOURCE_rpc"), true);
  assert.deepEqual(rpc.events.filter((event) => AGENT_EVENTS.has(event)), []);
  assert.equal(rpc.stderr, "");
});
