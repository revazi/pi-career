#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-install-"));
const agentDir = path.join(temporaryRoot, "agent");
const home = path.join(temporaryRoot, "home");
const cwd = path.join(temporaryRoot, "cwd");
await Promise.all([mkdir(agentDir), mkdir(home), mkdir(cwd)]);

const maintainerSettings = path.join(os.homedir(), ".pi", "agent", "settings.json");
async function digestIfPresent(file) {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}
const maintainerBefore = await digestIfPresent(maintainerSettings);

const env = {
  ...process.env,
  HOME: home,
  PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: "1",
  PI_TELEMETRY: "0",
  PI_SKIP_VERSION_CHECK: "1",
};
function pi(args) {
  const result = spawnSync("pi", args, { cwd, env, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, `pi ${args[0]} failed without using maintainer settings`);
  return result.stdout;
}

try {
  pi(["install", root]);
  assert.ok(pi(["list"]).includes(root));

  const isolatedSettings = JSON.parse(await readFile(path.join(agentDir, "settings.json"), "utf8"));
  assert.ok(
    isolatedSettings.packages.some(
      (source) => typeof source === "string" && path.resolve(agentDir, source) === root,
    ),
  );
  const runtimeSmoke = spawnSync(process.execPath, [path.join(root, "scripts", "test-bundled-runtime.mjs")], {
    cwd,
    env: { ...env, PI_CAREER_PACKAGE_ROOT: root },
    encoding: "utf8",
    shell: false,
  });
  assert.equal(runtimeSmoke.status, 0, "registered local package bundled-runtime smoke failed");

  pi(["remove", root]);
  assert.equal(pi(["list"]).includes(root), false);
  const removedSettings = JSON.parse(await readFile(path.join(agentDir, "settings.json"), "utf8"));
  assert.equal(removedSettings.packages?.includes(root) ?? false, false);

  assert.equal(await digestIfPresent(maintainerSettings), maintainerBefore);
  process.stdout.write("Isolated pi install/list/bundled-runtime/remove acceptance passed\n");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
