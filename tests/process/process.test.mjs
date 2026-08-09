// SPDX-License-Identifier: MIT OR Apache-2.0
// Adapted without weakened cases from career-core commit 100774ed8bb3b39c019d64ce105af1e3f209144f.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, chmod, copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CareerInvocationError,
  COMPOSITE_INPUT_MAX_BYTES,
  invokeCareerCli,
  resolveCareerExecutable,
} from "../../src/process.ts";
import { clearRuntimeResolutionCache } from "../../src/runtime.ts";

const fixturePath = fileURLToPath(new URL("./fake-career.mjs", import.meta.url));
let temporaryDirectory;
let executable;
let shellLikeExecutable;
let shellMarker;

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "career-core-pi-test-"));
  executable = path.join(temporaryDirectory, "fake-career.mjs");
  shellMarker = `career-core-shell-marker-${randomUUID()}.mjs`;
  shellLikeExecutable = path.join(temporaryDirectory, `fake-career;touch ${shellMarker}`);
  await copyFile(fixturePath, executable);
  await copyFile(fixturePath, shellLikeExecutable);
  await chmod(executable, 0o700);
  await chmod(shellLikeExecutable, 0o700);
});

after(async () => {
  await rm(path.join(process.cwd(), shellMarker), { force: true });
  await rm(temporaryDirectory, { recursive: true, force: true });
});

async function expectAdapterError(promise, code) {
  try {
    await promise;
    assert.fail(`expected adapter error ${code}`);
  } catch (error) {
    assert.ok(error instanceof CareerInvocationError);
    const payload = JSON.parse(error.message);
    assert.equal(payload.schema_version, "career.pi_error.v1");
    assert.equal(payload.code, code);
    return payload;
  }
}

function resumeRequest(value) {
  return {
    kind: "resume",
    operation: "analyze",
    inputJson: JSON.stringify(value),
  };
}

test("uses direct argv and exact stdin without shell interpolation or payload files", async () => {
  const inputJson = ` {"schema_version":"synthetic.input.v1","text":"$(touch ${shellMarker})"} `;
  const beforeEntries = await readdir(temporaryDirectory);

  const result = await invokeCareerCli(
    { kind: "resume", operation: "analyze", inputJson },
    undefined,
    { executable: shellLikeExecutable },
  );
  const parsed = JSON.parse(result.json);

  assert.deepEqual(parsed.args, ["resume", "analyze", "--input", "-", "--format", "json-compact"]);
  assert.equal(parsed.stdin, inputJson);
  assert.equal(result.operation, "resume.analyze");
  assert.deepEqual(await readdir(temporaryDirectory), beforeEntries);
  await assert.rejects(access(path.join(process.cwd(), shellMarker)));

  const source = await readFile(
    fileURLToPath(new URL("../../src/process.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(source, /node:fs|mkdtemp|tmpdir|writeFile/);
  assert.match(source, /shell:\s*false/);
});

test("builds bounded discovery argv without document stdin", async () => {
  const capabilities = await invokeCareerCli(
    { kind: "discovery", operation: "capabilities" },
    undefined,
    { executable },
  );
  assert.deepEqual(JSON.parse(capabilities.json).args, ["capabilities", "--format", "json-compact"]);

  const operations = await invokeCareerCli(
    { kind: "discovery", operation: "operations" },
    undefined,
    { executable },
  );
  assert.deepEqual(JSON.parse(operations.json).args, ["operations", "--format", "json-compact"]);

  const schema = await invokeCareerCli(
    { kind: "discovery", operation: "schema-export", schemaId: "career.job_match.v1" },
    undefined,
    { executable },
  );
  assert.deepEqual(JSON.parse(schema.json).args, [
    "schema",
    "export",
    "--id",
    "career.job_match.v1",
    "--format",
    "json-compact",
  ]);

  const bundle = await invokeCareerCli(
    { kind: "discovery", operation: "schema-bundle", schemaId: "career.job_match_input.v1" },
    undefined,
    { executable },
  );
  assert.deepEqual(JSON.parse(bundle.json).args, [
    "schema",
    "bundle",
    "--id",
    "career.job_match_input.v1",
    "--format",
    "json-compact",
  ]);
});

test("returns one complete successful JSON object", async () => {
  const result = await invokeCareerCli(resumeRequest({ request_id: "success" }), undefined, { executable });
  assert.equal(result.json.endsWith("\n"), false);
  assert.equal(JSON.parse(result.json).request_id, "success");
});

test("exposes only a strictly validated known career.error.v1 failure", async () => {
  const payload = await expectAdapterError(
    invokeCareerCli(resumeRequest({ __test_mode: "known-error" }), undefined, { executable }),
    "career_cli_error",
  );
  assert.deepEqual(payload.career_error, {
    schema_version: "career.error.v1",
    code: "source_text_empty",
    message: "Resume text must not be empty.",
    field_path: "text",
  });
});

test("redacts unknown stderr and unexpected success diagnostics", async () => {
  const unknown = await expectAdapterError(
    invokeCareerCli(resumeRequest({ __test_mode: "unknown-stderr" }), undefined, { executable }),
    "cli_failure",
  );
  assert.doesNotMatch(JSON.stringify(unknown), /PRIVATE_SOURCE/);

  const success = await expectAdapterError(
    invokeCareerCli(resumeRequest({ __test_mode: "success-stderr" }), undefined, { executable }),
    "unexpected_stderr",
  );
  assert.doesNotMatch(JSON.stringify(success), /PRIVATE_SUCCESS_DIAGNOSTIC/);
});

test("maps a missing executable without exposing its path", async () => {
  const missingPath = path.join(temporaryDirectory, "private-missing-executable");
  const payload = await expectAdapterError(
    invokeCareerCli(resumeRequest({ request_id: "missing" }), undefined, { executable: missingPath }),
    "missing_executable",
  );
  assert.doesNotMatch(JSON.stringify(payload), /private-missing-executable/);
});

test("enforces timeout and waits for process cleanup", async () => {
  const started = Date.now();
  await expectAdapterError(
    invokeCareerCli(resumeRequest({ __test_mode: "timeout" }), undefined, {
      executable,
      timeoutMs: 75,
    }),
    "timeout",
  );
  assert.ok(Date.now() - started < 2_000);
});

test("propagates cancellation and cleans up the process", async () => {
  const controller = new AbortController();
  const pending = invokeCareerCli(resumeRequest({ __test_mode: "timeout" }), controller.signal, {
    executable,
    timeoutMs: 5_000,
  });
  setTimeout(() => controller.abort(), 50);
  await expectAdapterError(pending, "cancelled");
});

test("maps an independent child signal to a stable error", async () => {
  await expectAdapterError(
    invokeCareerCli(resumeRequest({ __test_mode: "signal" }), undefined, { executable }),
    "process_signalled",
  );
});

test("rejects malformed and multiple success JSON documents", async (t) => {
  await t.test("malformed", async () => {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ __test_mode: "malformed" }), undefined, { executable }),
      "malformed_result",
    );
  });
  await t.test("multiple", async () => {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ __test_mode: "multiple" }), undefined, { executable }),
      "malformed_result",
    );
  });
});

test("terminates on stdout and stderr capture overflow", async (t) => {
  await t.test("stdout", async () => {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ __test_mode: "stdout-overflow" }), undefined, { executable }),
      "stdout_overflow",
    );
  });
  await t.test("stderr", async () => {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ __test_mode: "stderr-overflow" }), undefined, { executable }),
      "stderr_overflow",
    );
  });
});

test("fails instead of truncating a complete result outside Pi context bounds", async (t) => {
  await t.test("bytes", async () => {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ __test_mode: "context-overflow" }), undefined, { executable }),
      "result_too_large",
    );
  });
  await t.test("lines", async () => {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ __test_mode: "line-overflow" }), undefined, {
        executable,
        toolResultMaxLines: 2,
      }),
      "result_too_many_lines",
    );
  });
});

test("rejects malformed and oversized input before spawn", async () => {
  const missing = path.join(temporaryDirectory, "not-created");
  await expectAdapterError(
    invokeCareerCli(
      { kind: "resume", operation: "analyze", inputJson: "[]" },
      undefined,
      { executable: missing },
    ),
    "invalid_request",
  );
  await expectAdapterError(
    invokeCareerCli(
      {
        kind: "job",
        operation: "match",
        inputJson: JSON.stringify({ value: "x".repeat(COMPOSITE_INPUT_MAX_BYTES) }),
      },
      undefined,
      { executable: missing },
    ),
    "invalid_request",
  );
});

test("validates CAREER_CLI_PATH as a bounded absolute override", async () => {
  assert.equal(resolveCareerExecutable({}), undefined);
  assert.equal(resolveCareerExecutable({ CAREER_CLI_PATH: executable }), executable);
  assert.throws(
    () => resolveCareerExecutable({ CAREER_CLI_PATH: "relative/career" }),
    (error) => error instanceof CareerInvocationError && JSON.parse(error.message).code === "invalid_executable_override",
  );

  const result = await invokeCareerCli(
    { kind: "discovery", operation: "capabilities" },
    undefined,
    { executable },
  );
  assert.deepEqual(JSON.parse(result.json).args, ["capabilities", "--format", "json-compact"]);
});

test("an invalid explicit runtime never retries another route after prelaunch failure", async () => {
  const explicitRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-explicit-prelaunch-"));
  const fallbackRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-explicit-fallback-"));
  const explicit = path.join(explicitRoot, "career");
  const fallback = path.join(fallbackRoot, "career");
  await copyFile(fixturePath, explicit);
  await copyFile(fixturePath, fallback);
  await chmod(explicit, 0o700);
  await chmod(fallback, 0o700);
  const previous = {
    career: process.env.CAREER_CLI_PATH,
    compatible: process.env.FAKE_CAREER_MANAGED_COMPATIBLE,
    deletion: process.env.FAKE_CAREER_DELETE_AFTER_COMPAT,
    offline: process.env.PI_OFFLINE,
    path: process.env.PATH,
  };
  clearRuntimeResolutionCache();
  process.env.CAREER_CLI_PATH = explicit;
  process.env.FAKE_CAREER_MANAGED_COMPATIBLE = "1";
  process.env.FAKE_CAREER_DELETE_AFTER_COMPAT = "1";
  process.env.PI_OFFLINE = "1";
  process.env.PATH = [fallbackRoot, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter);
  try {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ request_id: "must-not-fallback" })),
      "missing_executable",
    );
  } finally {
    clearRuntimeResolutionCache();
    for (const [key, value] of Object.entries({
      CAREER_CLI_PATH: previous.career,
      FAKE_CAREER_MANAGED_COMPATIBLE: previous.compatible,
      FAKE_CAREER_DELETE_AFTER_COMPAT: previous.deletion,
      PI_OFFLINE: previous.offline,
      PATH: previous.path,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(explicitRoot, { recursive: true, force: true });
    await rm(fallbackRoot, { recursive: true, force: true });
  }
});

test("an automatic prelaunch failure advances once without opening private stdin", async () => {
  const pathRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-auto-prelaunch-"));
  const selected = path.join(pathRoot, "career");
  await copyFile(fixturePath, selected);
  await chmod(selected, 0o700);
  const previous = {
    career: process.env.CAREER_CLI_PATH,
    compatible: process.env.FAKE_CAREER_MANAGED_COMPATIBLE,
    deletion: process.env.FAKE_CAREER_DELETE_AFTER_COMPAT,
    offline: process.env.PI_OFFLINE,
    path: process.env.PATH,
  };
  clearRuntimeResolutionCache();
  delete process.env.CAREER_CLI_PATH;
  process.env.FAKE_CAREER_MANAGED_COMPATIBLE = "1";
  process.env.FAKE_CAREER_DELETE_AFTER_COMPAT = "1";
  process.env.PI_OFFLINE = "1";
  process.env.PATH = [pathRoot, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter);
  try {
    await expectAdapterError(
      invokeCareerCli(resumeRequest({ request_id: "private-not-opened" })),
      "runtime_unavailable",
    );
  } finally {
    clearRuntimeResolutionCache();
    for (const [key, value] of Object.entries({
      CAREER_CLI_PATH: previous.career,
      FAKE_CAREER_MANAGED_COMPATIBLE: previous.compatible,
      FAKE_CAREER_DELETE_AFTER_COMPAT: previous.deletion,
      PI_OFFLINE: previous.offline,
      PATH: previous.path,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(pathRoot, { recursive: true, force: true });
  }
});

test("keeps concurrent calls independent", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      invokeCareerCli(resumeRequest({ request_id: `request-${index}` }), undefined, { executable }),
    ),
  );
  assert.deepEqual(
    results.map((result) => JSON.parse(result.json).request_id),
    Array.from({ length: 12 }, (_, index) => `request-${index}`),
  );
});
