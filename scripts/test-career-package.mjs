#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = process.env.PI_CAREER_PACKAGE_ROOT ?? repositoryRoot;
assert.ok(path.isAbsolute(packageRoot), "PI_CAREER_PACKAGE_ROOT must be absolute when supplied");
const fixtureRoot = path.join(repositoryRoot, "tests", "runtime", "fixtures");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-package-smoke-"));
const emptyPath = path.join(temporaryRoot, "empty-path");
await mkdir(emptyPath);

const previousCareerPath = process.env.CAREER_CLI_PATH;
const previousOffline = process.env.PI_OFFLINE;
const previousPath = process.env.PATH;
delete process.env.CAREER_CLI_PATH;
delete process.env.PI_OFFLINE;
process.env.PATH = emptyPath;
process.env.PI_TELEMETRY = "0";
process.env.PI_SKIP_VERSION_CHECK = "1";

assert.ok(["darwin", "linux"].includes(process.platform), "pi-career package acceptance requires macOS or Linux");
if (process.env.EXPECTED_RUNTIME_TARGET !== undefined) {
  const glibcRuntime = process.platform === "linux"
    ? process.report.getReport()?.header?.glibcVersionRuntime
    : undefined;
  const libc = process.platform === "linux"
    ? typeof glibcRuntime === "string" && glibcRuntime.length > 0 ? "gnu" : "musl"
    : undefined;
  const currentTarget = process.platform === "darwin" && ["arm64", "x64"].includes(process.arch)
    ? `darwin-${process.arch}`
    : process.platform === "linux" && ["arm64", "x64"].includes(process.arch)
      ? `linux-${process.arch}-${libc}`
      : undefined;
  assert.equal(currentTarget, process.env.EXPECTED_RUNTIME_TARGET, "runner does not match claimed target");
}

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
  assert.deepEqual([...tools.keys()].sort(), [
    "career_core_discover", "career_core_job", "career_core_resume", "career_run",
  ]);

  async function execute(toolName, params) {
    const result = await tools.get(toolName).execute("career-package-smoke", params, undefined);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    return JSON.parse(result.content[0].text);
  }

  const capabilities = await execute("career_core_discover", { operation: "capabilities" });
  assert.equal(capabilities.schema_version, "career.capabilities.v1");
  const available = new Set(
    capabilities.capabilities.filter(({ status }) => status === "available").map(({ id }) => id),
  );
  for (const operation of [
    "resume.evaluate",
    "resume.analyze",
    "resume.analysis-suggestions.review",
    "resume.analysis-replacements.review",
    "resume.normalize",
    "resume.enrich",
    "resume.variant.review",
    "resume.variant.materialize",
    "job.normalize",
    "job.match",
  ]) assert.ok(available.has(operation), `Career package lacks ${operation}`);

  const operations = await execute("career_core_discover", { operation: "operations" });
  assert.equal(operations.schema_version, "career.operation_catalog.v1");
  assert.equal(operations.core_version, "0.1.1");
  assert.equal(operations.operations.length, 15);

  const schema = await execute("career_core_discover", {
    operation: "schema-bundle",
    schema_id: "career.resume_variant_materialization_input.v1",
  });
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(JSON.stringify(schema).includes("careerSchemaBundle"));

  const resumeInput = await readFile(path.join(fixtureRoot, "resume-analyze.input.json"), "utf8");
  const resume = await execute("career_core_resume", { operation: "analyze", input_json: resumeInput });
  assert.equal(resume.schema_version, "career.resume_analysis.v1");

  const matchInput = await readFile(path.join(fixtureRoot, "job-match.input.json"), "utf8");
  const match = await execute("career_core_job", { operation: "match", input_json: matchInput });
  assert.equal(match.schema_version, "career.job_match.v1");

  const managedContext = await tools.get("career_run").execute(
    "career-package-managed-smoke",
    { command: "context" },
    undefined,
    undefined,
    {
      sessionManager: {
        getSessionId: () => "career-package-transient",
        getSessionFile: () => undefined,
        getBranch: () => [],
      },
    },
  );
  const managed = JSON.parse(managedContext.content[0].text);
  assert.equal(managed.schema_version, "pi.career.run_result.v1");
  assert.equal(managed.command, "context");
  assert.equal(managed.core_version, "0.1.1");
  assert.equal(managed.persistence, "transient");

  assert.equal(process.env.CAREER_CLI_PATH, undefined);
  process.stdout.write(
    `@revazi/career@0.1.1 passed managed contracts and representative resume/job operations on ${process.env.EXPECTED_RUNTIME_TARGET ?? "the local target"} through acquisition\n`,
  );
} finally {
  if (previousCareerPath === undefined) delete process.env.CAREER_CLI_PATH;
  else process.env.CAREER_CLI_PATH = previousCareerPath;
  if (previousOffline === undefined) delete process.env.PI_OFFLINE;
  else process.env.PI_OFFLINE = previousOffline;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  await rm(temporaryRoot, { recursive: true, force: true });
}
