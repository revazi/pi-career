#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = process.env.PI_CAREER_PACKAGE_ROOT ?? repositoryRoot;
assert.ok(path.isAbsolute(packageRoot), "PI_CAREER_PACKAGE_ROOT must be absolute when supplied");
const manifest = JSON.parse(await readFile(path.join(packageRoot, "runtime", "manifest.json"), "utf8"));
const fixtureRoot = path.join(repositoryRoot, "tests", "runtime", "fixtures");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-bundled-smoke-"));
const emptyPath = path.join(temporaryRoot, "empty-path");
await mkdir(emptyPath);

function currentTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "linux" && process.arch === "x64") {
    const report = process.report?.getReport();
    if (typeof report?.header?.glibcVersionRuntime === "string") return "linux-x64-gnu";
  }
  return undefined;
}

function digestFramedJson(text) {
  return createHash("sha256").update(`${text}\n`).digest("hex");
}

const target = currentTarget();
assert.ok(target, "bundled runtime smoke must execute only on a claimed native target");
if (process.env.EXPECTED_RUNTIME_TARGET !== undefined) {
  assert.equal(target, process.env.EXPECTED_RUNTIME_TARGET, "native runner does not match its claimed runtime target");
}

const previousCareerPath = process.env.CAREER_CLI_PATH;
const previousPath = process.env.PATH;
delete process.env.CAREER_CLI_PATH;
process.env.PATH = emptyPath;
process.env.PI_OFFLINE = "1";
process.env.PI_TELEMETRY = "0";
process.env.PI_SKIP_VERSION_CHECK = "1";
let networkAttempted = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkAttempted = true;
  throw new Error("network access is forbidden in the bundled-runtime smoke");
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
  const tools = new Map([...extension.tools.values()].map(({ definition }) => [definition.name, definition]));
  assert.deepEqual([...tools.keys()].sort(), ["career_core_discover", "career_core_job", "career_core_resume"]);

  async function execute(toolName, params) {
    const result = await tools.get(toolName).execute("bundled-runtime-smoke", params, undefined);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    return { parsed: JSON.parse(result.content[0].text), text: result.content[0].text };
  }

  const capabilities = await execute("career_core_discover", { operation: "capabilities" });
  assert.equal(capabilities.parsed.schema_version, "career.capabilities.v1");
  assert.equal(digestFramedJson(capabilities.text), manifest.contracts.capabilities.sha256);

  const catalog = await execute("career_core_discover", { operation: "schema-list" });
  assert.equal(catalog.parsed.schema_version, "career.schema_catalog.v1");
  assert.equal(catalog.parsed.schemas.length, manifest.contracts.schema_catalog.schema_count);
  assert.equal(digestFramedJson(catalog.text), manifest.contracts.schema_catalog.sha256);

  const schema = await execute("career_core_discover", {
    operation: "schema-export",
    schema_id: manifest.contracts.schema_export.schema_id,
  });
  assert.equal(schema.parsed.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(digestFramedJson(schema.text), manifest.contracts.schema_export.sha256);

  const resumeInput = await readFile(path.join(fixtureRoot, "resume-analyze.input.json"), "utf8");
  const resume = await execute("career_core_resume", { operation: "analyze", input_json: resumeInput });
  assert.equal(resume.parsed.schema_version, "career.resume_analysis.v1");

  const matchInput = await readFile(path.join(fixtureRoot, "job-match.input.json"), "utf8");
  const match = await execute("career_core_job", { operation: "match", input_json: matchInput });
  assert.equal(match.parsed.schema_version, "career.job_match.v1");

  assert.equal(networkAttempted, false);
  assert.equal(process.env.CAREER_CLI_PATH, undefined);
  process.stdout.write(
    `Bundled runtime ${target} passed discovery contracts and representative resume/job operations with no external career\n`,
  );
} finally {
  globalThis.fetch = originalFetch;
  if (previousCareerPath === undefined) delete process.env.CAREER_CLI_PATH;
  else process.env.CAREER_CLI_PATH = previousCareerPath;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  await rm(temporaryRoot, { recursive: true, force: true });
}
