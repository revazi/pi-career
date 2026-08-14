#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suppliedRoot = process.env.CAREER_CORE_FIXTURE_ROOT;
if (!suppliedRoot) {
  process.stdout.write("Skipped Career package fixture parity: set CAREER_CORE_FIXTURE_ROOT explicitly\n");
  process.exit(0);
}
assert.ok(path.isAbsolute(suppliedRoot), "CAREER_CORE_FIXTURE_ROOT must be absolute");
await stat(path.join(suppliedRoot, "fixtures"));

const temporaryCwd = await mkdtemp(path.join(os.tmpdir(), "pi-career-runtime-compat-"));
const emptyPath = path.join(temporaryCwd, "empty-path");
await mkdir(emptyPath);
const loader = new DefaultResourceLoader({
  cwd: temporaryCwd,
  agentDir: path.join(temporaryCwd, "agent"),
  settingsManager: SettingsManager.inMemory({ packages: [packageRoot] }),
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
});
const previousCareerPath = process.env.CAREER_CLI_PATH;
const previousOffline = process.env.PI_OFFLINE;
const previousPath = process.env.PATH;
delete process.env.CAREER_CLI_PATH;
process.env.PATH = emptyPath;
delete process.env.PI_OFFLINE;
process.env.PI_TELEMETRY = "0";
process.env.PI_SKIP_VERSION_CHECK = "1";

const operations = [
  ["career_core_resume", "evaluate", "fixtures/resume/phase1/complete-sections.input.json", "career.resume_evaluation.v1"],
  ["career_core_resume", "analyze", "fixtures/resume/phase3/complete-analysis.input.json", "career.resume_analysis.v1"],
  ["career_core_resume", "analysis-suggestions-review", "fixtures/resume/phase7/complete-analysis-suggestion-review.input.json", "career.resume_analysis_suggestion_review.v1"],
  ["career_core_resume", "analysis-replacements-review", "fixtures/resume/phase7/complete-analysis-replacement-review.input.json", "career.resume_analysis_replacement_review.v1"],
  ["career_core_resume", "normalize", "fixtures/resume/phase2/complete-normalization.input.json", "career.resume_normalization.v1"],
  ["career_core_resume", "enrich", "fixtures/resume/phase2/messy-unlabeled.enrichment-input.json", "career.resume_enrichment_result.v1"],
  ["career_core_resume", "variant-review", "fixtures/resume/phase7/complete-variant-review.input.json", "career.resume_variant_review.v1"],
  ["career_core_resume", "variant-materialize", "fixtures/resume/phase7/selected-variant-materialization.input.json", "career.resume_variant.v1"],
  ["career_core_job", "normalize", "fixtures/job/phase4a/complete-normalization.input.json", "career.job_normalization.v1"],
  ["career_core_job", "match", "fixtures/job/phase4b/complete-match.input.json", "career.job_match.v1"],
];

try {
  await loader.reload();
  const extensionResult = loader.getExtensions();
  assert.deepEqual(extensionResult.errors, []);
  const extension = extensionResult.extensions.find(
    ({ path: extensionPath }) => path.resolve(extensionPath) === path.join(packageRoot, "dist", "index.js"),
  );
  assert.ok(extension, "built package extension must load through its manifest");
  const tools = new Map([...extension.tools.values()].map(({ definition }) => [definition.name, definition]));
  assert.deepEqual([...tools.keys()].sort(), ["career_core_discover", "career_core_job", "career_core_resume", "career_run"]);

  async function execute(toolName, params) {
    const result = await tools.get(toolName).execute("career-package-compat", params, undefined);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    return JSON.parse(result.content[0].text);
  }

  const capabilities = await execute("career_core_discover", { operation: "capabilities" });
  assert.equal(capabilities.schema_version, "career.capabilities.v1");
  const available = new Set(capabilities.capabilities.filter(({ status }) => status === "available").map(({ id }) => id));
  for (const id of [
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
  ]) assert.ok(available.has(id), `Career package lacks ${id}`);

  const operationCatalog = await execute("career_core_discover", { operation: "operations" });
  assert.equal(operationCatalog.schema_version, "career.operation_catalog.v1");
  assert.equal(operationCatalog.core_version, "0.2.0");
  assert.equal(operationCatalog.operations.length, 15);

  const catalog = await execute("career_core_discover", { operation: "schema-list" });
  assert.equal(catalog.schema_version, "career.schema_catalog.v1");
  const exported = await execute("career_core_discover", {
    operation: "schema-export",
    schema_id: "career.job_match_input.v1",
  });
  assert.equal(exported.$schema, "https://json-schema.org/draft/2020-12/schema");
  const bundled = await execute("career_core_discover", {
    operation: "schema-bundle",
    schema_id: "career.resume_variant_materialization_input.v1",
  });
  assert.equal(bundled.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(JSON.stringify(bundled).includes("careerSchemaBundle"));

  for (const [toolName, operation, relativeInput, expectedSchema] of operations) {
    const inputJson = await readFile(path.join(suppliedRoot, relativeInput), "utf8");
    const result = await execute(toolName, { operation, input_json: inputJson });
    assert.equal(result.schema_version, expectedSchema, `${toolName}.${operation}`);
  }
  assert.equal(process.env.CAREER_CLI_PATH, undefined);
  process.stdout.write("Career package compatibility passed through managed discovery and all raw operation tools\n");
} finally {
  if (previousCareerPath === undefined) delete process.env.CAREER_CLI_PATH;
  else process.env.CAREER_CLI_PATH = previousCareerPath;
  if (previousOffline === undefined) delete process.env.PI_OFFLINE;
  else process.env.PI_OFFLINE = previousOffline;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  await rm(temporaryCwd, { recursive: true, force: true });
}
