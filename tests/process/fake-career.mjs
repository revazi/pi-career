#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// Adapted from career-core commit 100774ed8bb3b39c019d64ce105af1e3f209144f.

const args = process.argv.slice(2);
const inputChunks = [];

process.stdout.on("error", () => process.exit(0));
process.stderr.on("error", () => process.exit(1));

for await (const chunk of process.stdin) inputChunks.push(Buffer.from(chunk));
const stdin = Buffer.concat(inputChunks).toString("utf8");

if (args[0] === "capabilities") {
  process.stdout.write(`${JSON.stringify({ schema_version: "career.capabilities.v1", args })}\n`);
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
