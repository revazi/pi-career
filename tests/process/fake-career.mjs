#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// Adapted from career-core commit 100774ed8bb3b39c019d64ce105af1e3f209144f.

import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const inputChunks = [];

process.stdout.on("error", () => process.exit(0));
process.stderr.on("error", () => process.exit(1));

for await (const chunk of process.stdin) inputChunks.push(Buffer.from(chunk));
const stdin = Buffer.concat(inputChunks).toString("utf8");

const OPERATION_SPECS = [
  ["core.capabilities", "core.capabilities", ["capabilities"], "none", null, "career.capabilities.v1", null],
  ["core.operations", null, ["operations"], "none", null, "career.operation_catalog.v1", null],
  ["schema.list", null, ["schema", "list"], "none", null, "career.schema_catalog.v1", null],
  ["schema.export", null, ["schema", "export"], "cli_arguments", null, "https://json-schema.org/draft/2020-12/schema", null],
  ["schema.bundle", null, ["schema", "bundle"], "cli_arguments", null, "https://json-schema.org/draft/2020-12/schema", null],
  ["resume.evaluate", "resume.evaluate", ["resume", "evaluate"], "json_file_or_stdin", "career.resume_input.v1", "career.resume_evaluation.v1", 262144],
  ["resume.analyze", "resume.analyze", ["resume", "analyze"], "json_file_or_stdin", "career.resume_input.v1", "career.resume_analysis.v1", 262144],
  ["resume.normalize", "resume.normalize", ["resume", "normalize"], "json_file_or_stdin", "career.resume_input.v1", "career.resume_normalization.v1", 262144],
  ["resume.enrich", "resume.enrich", ["resume", "enrich"], "json_file_or_stdin", "career.resume_enrichment_input.v1", "career.resume_enrichment_result.v1", 262144],
  ["resume.analysis-suggestions.review", "resume.analysis-suggestions.review", ["resume", "analysis-suggestions-review"], "json_file_or_stdin", "career.resume_analysis_suggestion_review_input.v1", "career.resume_analysis_suggestion_review.v1", 262144],
  ["resume.analysis-replacements.review", "resume.analysis-replacements.review", ["resume", "analysis-replacements-review"], "json_file_or_stdin", "career.resume_analysis_replacement_review_input.v1", "career.resume_analysis_replacement_review.v1", 262144],
  ["resume.variant.review", "resume.variant.review", ["resume", "variant-review"], "json_file_or_stdin", "career.resume_variant_review_input.v1", "career.resume_variant_review.v1", 1048576],
  ["resume.variant.materialize", "resume.variant.materialize", ["resume", "variant-materialize"], "json_file_or_stdin", "career.resume_variant_materialization_input.v1", "career.resume_variant.v1", 1048576],
  ["job.normalize", "job.normalize", ["job", "normalize"], "json_file_or_stdin", "career.job_input.v1", "career.job_normalization.v1", 262144],
  ["job.match", "job.match", ["job", "match"], "json_file_or_stdin", "career.job_match_input.v1", "career.job_match.v1", 1048576],
];
const BUNDLE_FILES = {
  "career.resume_analysis_suggestion_review_input.v1": "resume-analysis-suggestion-review-input-v1.schema.json",
  "career.resume_analysis_replacement_review_input.v1": "resume-analysis-replacement-review-input-v1.schema.json",
  "career.resume_variant_review_input.v1": "resume-variant-review-input-v1.schema.json",
  "career.resume_variant_materialization_input.v1": "resume-variant-materialization-input-v1.schema.json",
};

if (process.env.FAKE_CAREER_MANAGED_COMPATIBLE === "1" && args[0] === "operations") {
  process.stdout.write(`${JSON.stringify({
    schema_version: "career.operation_catalog.v1",
    core_version: "0.1.0",
    operations: OPERATION_SPECS.map(([
      operation_id, capability_id, cli_path, input_transport, input_schema_id,
      output_schema_id, maximum_input_bytes,
    ]) => ({
      operation_id,
      capability_id,
      availability: "available",
      cli_path,
      input_transport,
      input_schema_id,
      output_schema_id,
      maximum_input_bytes,
      maximum_successful_machine_output_bytes: 33554432,
    })),
  })}\n`);
  process.exit(0);
}
if (process.env.FAKE_CAREER_MANAGED_COMPATIBLE === "1" && args[0] === "schema" && args[1] === "bundle") {
  const schemaId = args[args.indexOf("--id") + 1];
  const fileName = BUNDLE_FILES[schemaId];
  if (fileName === undefined) process.exit(2);
  if (process.env.FAKE_CAREER_DELETE_AFTER_COMPAT === "1") {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try { await unlink(fileURLToPath(import.meta.url)); } catch {}
  }
  process.stdout.write(`${JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://career.example/schemas/${fileName}`,
    careerSchemaBundle: true,
    type: "object",
  })}\n`);
  process.exit(0);
}

if (args[0] === "capabilities") {
  process.stdout.write(`${JSON.stringify({ schema_version: "career.capabilities.v1", args })}\n`);
  process.exit(0);
}
if (args[0] === "operations") {
  process.stdout.write(`${JSON.stringify({ schema_version: "career.operation_catalog.v1", args })}\n`);
  process.exit(0);
}
if (args[0] === "schema") {
  process.stdout.write(`${JSON.stringify({ schema_version: "career.schema_catalog.v1", args })}\n`);
  process.exit(0);
}

let input;
try {
  input = JSON.parse(stdin);
} catch {
  process.stderr.write(
    `${JSON.stringify({
      schema_version: "career.error.v1",
      code: "invalid_json",
      message: "Input is not valid JSON.",
      field_path: null,
    })}\n`,
  );
  process.exit(4);
}

switch (input.__test_mode) {
  case "known-error":
    process.stderr.write(
      `${JSON.stringify({
        schema_version: "career.error.v1",
        code: "source_text_empty",
        message: "Resume text must not be empty.",
        field_path: "text",
      })}\n`,
    );
    process.exit(5);
    break;
  case "unknown-stderr":
    process.stderr.write("PRIVATE_SOURCE must never cross the adapter boundary\n");
    process.exit(5);
    break;
  case "success-stderr":
    process.stderr.write("PRIVATE_SUCCESS_DIAGNOSTIC\n");
    process.stdout.write('{"schema_version":"synthetic.success.v1"}\n');
    process.exit(0);
    break;
  case "malformed":
    process.stdout.write("not-json\n");
    process.exit(0);
    break;
  case "multiple":
    process.stdout.write("{}\n{}\n");
    process.exit(0);
    break;
  case "stdout-overflow":
    process.stdout.write(JSON.stringify({ data: "x".repeat(1_100_000) }));
    break;
  case "stderr-overflow":
    process.stderr.write("PRIVATE".repeat(3_000));
    setTimeout(() => process.exit(5), 100);
    break;
  case "context-overflow":
    process.stdout.write(`${JSON.stringify({ data: "x".repeat(60_000) })}\n`);
    break;
  case "line-overflow":
    process.stdout.write(`${JSON.stringify({ data: "x" })}\n\n\n`);
    break;
  case "timeout":
    setTimeout(() => process.exit(0), 10_000);
    break;
  case "signal":
    process.kill(process.pid, "SIGTERM");
    break;
  default:
    process.stdout.write(
      `${JSON.stringify({
        schema_version: "synthetic.success.v1",
        args,
        stdin,
        request_id: input.request_id ?? null,
      })}\n`,
    );
}
