#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.env.PI_CAREER_PACKAGE_ROOT ?? repositoryRoot;
assert.ok(path.isAbsolute(root), "PI_CAREER_PACKAGE_ROOT must be absolute when supplied");
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.deepEqual(manifest.pi, {
  extensions: ["./dist/index.js"],
  skills: ["./skills/career-core"],
});
assert.equal(manifest.dependencies, undefined);
assert.ok(manifest.files.includes("runtime"));
for (const lifecycle of ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack"]) {
  assert.equal(manifest.scripts?.[lifecycle], undefined);
}
assert.deepEqual(Object.keys(manifest.peerDependencies).sort(), [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
]);

const extensionPaths = manifest.pi.extensions.map((entry) => path.resolve(root, entry));
const skillPaths = manifest.pi.skills.map((entry) => path.resolve(root, entry));
await access(path.join(root, "runtime", "manifest.json"));
await access(path.join(root, "runtime", "darwin-arm64", "career"));
await access(path.join(root, "runtime", "linux-x64-gnu", "career"));
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-load-"));
const agentDir = path.join(temporaryRoot, "agent");
const cwd = path.join(temporaryRoot, "cwd");
let networkAttempted = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkAttempted = true;
  throw new Error("network access is forbidden in the no-model resource smoke");
};
process.env.PI_OFFLINE = "1";
process.env.PI_TELEMETRY = "0";
process.env.PI_SKIP_VERSION_CHECK = "1";

try {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: SettingsManager.inMemory({ packages: [root] }),
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();

  const extensionResult = loader.getExtensions();
  assert.deepEqual(extensionResult.errors, []);
  const loaded = extensionResult.extensions.filter((extension) =>
    extensionPaths.includes(path.resolve(extension.path)),
  );
  assert.equal(loaded.length, 1);

  const tools = [...loaded[0].tools.values()].map(({ definition }) => definition);
  const names = tools.map(({ name }) => name).sort();
  assert.deepEqual(names, ["career_core_discover", "career_core_job", "career_core_resume", "career_run"]);
  assert.deepEqual([...loaded[0].commands.keys()].sort(), [
    "career-analyze",
    "career-application",
    "career-library",
    "career-match",
    "career-setup",
    "career-tools",
    "career-vacancy",
    "career-workbench",
  ]);
  assert.ok(loaded[0].entryRenderers?.has("career.workflow"));
  for (const tool of tools) {
    assert.equal(tool.parameters.type, "object");
    assert.equal(tool.parameters.additionalProperties, false);
    assert.ok(Array.isArray(tool.parameters.required));
    assert.ok(tool.parameters.properties[tool.name === "career_run" ? "command" : "operation"]);
  }

  const schemas = new Map(tools.map((tool) => [tool.name, tool.parameters]));
  assert.deepEqual(schemas.get("career_core_discover").required, ["operation"]);
  assert.deepEqual([...schemas.get("career_core_resume").required].sort(), ["input_json", "operation"]);
  assert.deepEqual([...schemas.get("career_core_job").required].sort(), ["input_json", "operation"]);
  assert.deepEqual(schemas.get("career_run").required, ["command"]);
  const serialized = JSON.stringify(Object.fromEntries(schemas));
  for (const operation of [
    "capabilities",
    "operations",
    "schema-list",
    "schema-export",
    "schema-bundle",
    "evaluate",
    "analyze",
    "analysis-suggestions-review",
    "analysis-replacements-review",
    "normalize",
    "enrich",
    "variant-review",
    "variant-materialize",
    "match",
  ]) {
    assert.ok(serialized.includes(`\"${operation}\"`));
  }

  const { skills, diagnostics } = loader.getSkills();
  assert.deepEqual(diagnostics, []);
  const careerSkills = skills.filter((skill) => skill.name === "career-core");
  assert.equal(careerSkills.length, 1);
  assert.equal(path.resolve(careerSkills[0].filePath), path.join(skillPaths[0], "SKILL.md"));

  assert.equal(networkAttempted, false);
  await assert.rejects(access(path.join(agentDir, "auth.json")));
  process.stdout.write(`Loaded built tools: ${names.join(", ")}\nLoaded bundled skill: career-core\n`);
} finally {
  globalThis.fetch = originalFetch;
  await rm(temporaryRoot, { recursive: true, force: true });
}
