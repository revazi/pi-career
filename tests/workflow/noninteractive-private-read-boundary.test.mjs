// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
const piCli = path.join(repositoryRoot, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
const extensionPath = path.join(repositoryRoot, "dist/index.js");
const SENTINEL = "SYNTHETIC_PRIVATE_READ_BOUNDARY_36";
const WORKFLOW_ERROR = {
  schema_version: "pi.career.workflow_error.v1",
  code: "interactive_mode_required",
  message: "This career command requires TUI or RPC mode.",
};
const FORBIDDEN_EVENTS = new Set([
  "agent_start", "agent_end", "turn_start", "turn_end", "message_start", "message_end",
  "tool_execution_start", "tool_execution_end",
]);
const HOST_AGENT_NAMES = [
  "APPEND_SYSTEM.md",
  "SYSTEM.md",
  "auth.json",
  "auth.json.lock",
  "bin",
  "commands",
  "extensions",
  "hooks",
  "keybindings.json",
  "models-store.json",
  "models.json",
  "oauth.json",
  "pi-debug.log",
  "prompts",
  "settings.json",
  "skills",
  "themes",
  "tools",
  "trust.json",
];

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function coveredBy(allow, target) {
  const prefix = allow.endsWith(path.sep) ? allow : `${allow}${path.sep}`;
  return target === allow || target.startsWith(prefix);
}

function skillProbes(start) {
  const probes = [];
  let current = realpathSync(start);
  while (true) {
    probes.push(path.join(current, ".agents", "skills"));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return probes;
}

function nodeReadRoots() {
  const roots = new Set();
  for (const executable of [process.execPath, realpathSync(process.execPath)]) {
    let current = path.dirname(executable);
    roots.add(current);
    roots.add(path.resolve(current, ".."));
  }
  return [...roots];
}

function systemReadRoots() {
  return ["/usr", "/bin", "/etc", "/opt", "/System", "/Library", "/private/etc", "/proc", "/dev"]
    .filter((directory) => existsSync(directory));
}

async function privateFile(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
  return bytes;
}

function run(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timed out: ${args.at(-1) ?? "child"}`));
    }, 25_000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test("P3-36 installed print and JSON /career reject before denied private config, session, root, library, and document reads", async () => {
  const base = realpathSync(await mkdtemp(path.join(os.tmpdir(), "pi-career-p336-")));
  await chmod(base, 0o700);
  const hostHome = path.join(base, "host", "home");
  const hostCwd = path.join(base, "host", "cwd");
  const hostTmp = path.join(base, "host", "tmp");
  const agentDir = path.join(base, "host", "agent");
  const privateRoot = path.join(base, "private");
  const sessionDir = path.join(privateRoot, "sessions");
  const libraryDir = path.join(privateRoot, "library");
  const workspaceRoot = path.join(privateRoot, "workspace");
  const careerDir = path.join(agentDir, "career");
  const configFile = path.join(careerDir, "config.v1.json");
  const sessionFile = path.join(sessionDir, "private-session.jsonl");
  const rootMarker = path.join(workspaceRoot, ".pi-career-applications.json");
  const libraryDocument = path.join(libraryDir, "private-resume.md");
  const workspaceDocument = path.join(workspaceRoot, "private-application-document.md");
  const coreTrap = path.join(privateRoot, "core", "career");
  const coreMarker = path.join(privateRoot, "core-was-invoked");
  const privateTargets = {
    config: configFile,
    session: sessionFile,
    root: rootMarker,
    library: libraryDir,
    document: libraryDocument,
    workspaceDocument,
    coreTrap,
  };
  try {
    for (const directory of [hostHome, hostCwd, hostTmp, agentDir, careerDir, sessionDir, libraryDir, workspaceRoot, path.dirname(coreTrap)]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
    }
    const configBytes = await privateFile(configFile, Buffer.from(`${JSON.stringify({
      schema_version: "pi.career.config.v2",
      library_roots: [{ id: "synthetic", path: libraryDir, label: SENTINEL }],
      generated_variants_root: null,
      application_workspace: { root_id: "00000000-0000-4000-8000-000000000036", root_path: workspaceRoot },
    }, null, 2)}\n`));
    const sessionBytes = await privateFile(sessionFile, Buffer.from(`{"type":"synthetic","body":"${SENTINEL}"}\n`));
    const rootBytes = await privateFile(rootMarker, Buffer.from(`{"schema_version":"pi.career.application_root.v1","body":"${SENTINEL}"}\n`));
    const documentBytes = await privateFile(libraryDocument, Buffer.from(`${SENTINEL}\n`));
    const workspaceDocumentBytes = await privateFile(workspaceDocument, Buffer.from(`${SENTINEL}\n`));
    const trapBytes = await privateFile(coreTrap, Buffer.from(`#!/bin/sh\necho invoked > "${coreMarker}"\nexit 97\n`));
    await chmod(coreTrap, 0o700);
    await privateFile(path.join(agentDir, "models.json"), Buffer.from(`${JSON.stringify({
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

    const allows = [
      `${repositoryRoot}${path.sep}`,
      ...nodeReadRoots().map((directory) => `${directory}${path.sep}`),
      ...systemReadRoots().map((directory) => `${directory}${path.sep}`),
      `${hostHome}${path.sep}`,
      `${hostCwd}${path.sep}`,
      `${hostTmp}${path.sep}`,
      ...HOST_AGENT_NAMES.map((name) => path.join(agentDir, name)),
      ...skillProbes(hostCwd),
    ];
    for (const target of Object.values(privateTargets)) {
      assert.equal(allows.some((allow) => coveredBy(allow, target)), false, `${target} must stay outside the read allowlist`);
    }
    assert.equal(allows.some((allow) => coveredBy(allow, extensionPath)), true);
    assert.equal(allows.some((allow) => coveredBy(allow, piCli)), true);

    const permissionArgs = ["--permission", ...allows.map((allow) => `--allow-fs-read=${allow}`)];
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: hostHome,
      TMPDIR: hostTmp,
      PI_CODING_AGENT_DIR: agentDir,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      PI_SKIP_VERSION_CHECK: "1",
      CAREER_CLI_PATH: coreTrap,
      LANG: "C",
    };
    const control = await run([
      ...permissionArgs,
      "-e",
      `const fs = require("node:fs");
       const checks = JSON.parse(process.argv[1]);
       const results = checks.map((check) => {
         try {
           if (check.op === "read") fs.readFileSync(check.path);
           else fs.readdirSync(check.path);
           return { name: check.name, op: check.op, denied: false };
         } catch (error) {
           return { name: check.name, op: check.op, denied: true, code: error.code, resource: error.resource };
         }
       });
       process.stdout.write(JSON.stringify(results));`,
      JSON.stringify([
        { name: "config", op: "read", path: configFile },
        { name: "config-directory", op: "readdir", path: careerDir },
        { name: "session", op: "read", path: sessionFile },
        { name: "session-directory", op: "readdir", path: sessionDir },
        { name: "root", op: "read", path: rootMarker },
        { name: "root-directory", op: "readdir", path: workspaceRoot },
        { name: "library", op: "readdir", path: libraryDir },
        { name: "document", op: "read", path: libraryDocument },
        { name: "workspace-document", op: "read", path: workspaceDocument },
        { name: "core", op: "read", path: coreTrap },
        { name: "extension", op: "read", path: extensionPath },
      ]),
    ], { cwd: hostCwd, env });
    assert.equal(control.code, 0, control.stderr);
    const denials = JSON.parse(control.stdout);
    for (const result of denials.filter((result) => result.name !== "extension")) {
      assert.equal(result.denied, true, `${result.name} was readable under the private-read policy`);
      assert.equal(result.code, "ERR_ACCESS_DENIED");
      assert.equal(result.resource, result.name === "config" ? configFile
        : result.name === "config-directory" ? careerDir
        : result.name === "session" ? sessionFile
        : result.name === "session-directory" ? sessionDir
        : result.name === "root" ? rootMarker
        : result.name === "root-directory" ? workspaceRoot
        : result.name === "library" ? libraryDir
        : result.name === "document" ? libraryDocument
        : result.name === "workspace-document" ? workspaceDocument
        : coreTrap);
    }
    assert.equal(denials.find((result) => result.name === "extension").denied, false);

    for (const mode of ["print", "json"]) {
      const args = [
        ...permissionArgs,
        piCli,
        "--print",
        "--offline",
        "--no-session",
        "--no-approve",
        "--no-context-files",
        "--no-skills",
        "--no-extensions",
        "--no-prompt-templates",
        "--no-themes",
        "-e", extensionPath,
        "--session-dir", sessionDir,
        "--provider", "synthetic-offline",
        "--model", "synthetic-offline-model",
      ];
      if (mode === "json") args.push("--mode", "json");
      args.push("--", "/career");
      const result = await run(args, { cwd: hostCwd, env });
      assert.equal(result.signal, null);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stderr, `Extension error (command:career): ${JSON.stringify(WORKFLOW_ERROR)}\n`);
      assert.deepEqual(JSON.parse(result.stderr.slice(result.stderr.indexOf("{"))), WORKFLOW_ERROR);
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SENTINEL));
      assert.doesNotMatch(result.stdout + result.stderr, /ERR_ACCESS_DENIED|career_cli_error|at stack/);
      if (mode === "json") {
        const events = result.stdout.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
        assert.equal(events.length, 1);
        assert.equal(events[0].type, "session");
        assert.equal(FORBIDDEN_EVENTS.has(events[0].type), false);
        assert.equal(JSON.stringify(events).includes("career_run"), false);
        assert.equal(JSON.stringify(events).includes("career_core_"), false);
      } else {
        assert.equal(result.stdout, "");
      }
    }

    assert.equal(existsSync(coreMarker), false);
    assert.equal(hash(await readFile(configFile)), hash(configBytes));
    assert.equal(hash(await readFile(sessionFile)), hash(sessionBytes));
    assert.equal(hash(await readFile(rootMarker)), hash(rootBytes));
    assert.equal(hash(await readFile(libraryDocument)), hash(documentBytes));
    assert.equal(hash(await readFile(workspaceDocument)), hash(workspaceDocumentBytes));
    assert.equal(hash(await readFile(coreTrap)), hash(trapBytes));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
