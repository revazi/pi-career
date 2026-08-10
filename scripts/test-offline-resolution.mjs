#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = process.env.PI_CAREER_PACKAGE_ROOT ?? harnessRoot;
assert.ok(path.isAbsolute(packageRoot), "PI_CAREER_PACKAGE_ROOT must be absolute when supplied");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-offline-resolution-"));
const emptyPath = path.join(temporaryRoot, "empty-path");
await mkdir(emptyPath);

const previousCareerPath = process.env.CAREER_CLI_PATH;
const previousOffline = process.env.PI_OFFLINE;
const previousPath = process.env.PATH;
delete process.env.CAREER_CLI_PATH;
process.env.PI_OFFLINE = "1";
process.env.PATH = emptyPath;
let networkAttempted = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkAttempted = true;
  throw new Error("network access is forbidden in the offline resolver smoke");
};

try {
  const loader = new DefaultResourceLoader({
    cwd: temporaryRoot,
    agentDir: path.join(temporaryRoot, "agent"),
    settingsManager: SettingsManager.inMemory({ packages: [packageRoot] }),
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const extensionResult = loader.getExtensions();
  assert.deepEqual(extensionResult.errors, []);
  const extension = extensionResult.extensions.find(
    ({ path: extensionPath }) => path.resolve(extensionPath) === path.join(packageRoot, "dist", "index.js"),
  );
  assert.ok(extension, "built package extension must load through its manifest");
  const discover = [...extension.tools.values()]
    .map(({ definition }) => definition)
    .find(({ name }) => name === "career_core_discover");
  assert.ok(discover);

  await assert.rejects(
    discover.execute("offline-resolution-smoke", { operation: "capabilities" }, undefined),
    (error) => {
      const payload = JSON.parse(error.message);
      assert.deepEqual(Object.keys(payload).sort(), ["code", "message", "schema_version"]);
      assert.equal(payload.schema_version, "career.pi_error.v1");
      assert.equal(payload.code, "runtime_unavailable");
      assert.match(payload.message, /@revazi\/career@0\.1\.1/);
      return true;
    },
  );
  assert.equal(networkAttempted, false);
  assert.equal(process.env.CAREER_CLI_PATH, undefined);
  process.stdout.write("Offline resolver failed closed with stable installation guidance\n");
} finally {
  globalThis.fetch = originalFetch;
  if (previousCareerPath === undefined) delete process.env.CAREER_CLI_PATH;
  else process.env.CAREER_CLI_PATH = previousCareerPath;
  if (previousOffline === undefined) delete process.env.PI_OFFLINE;
  else process.env.PI_OFFLINE = previousOffline;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  await rm(temporaryRoot, { recursive: true, force: true });
}
