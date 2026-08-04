// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CareerInvocationError } from "../../src/errors.ts";
import {
  resolveBundledRuntime,
  selectRuntimeTarget,
  verifyRuntimeBinary,
} from "../../src/runtime.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceManifest = JSON.parse(await readFile(path.join(repositoryRoot, "runtime", "manifest.json"), "utf8"));

function expectedError(code) {
  return (error) => {
    assert.ok(error instanceof CareerInvocationError);
    const payload = JSON.parse(error.message);
    assert.equal(payload.schema_version, "career.pi_error.v1");
    assert.equal(payload.code, code);
    assert.deepEqual(Object.keys(payload).sort(), ["code", "message", "schema_version"]);
    return true;
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeFakeRuntime(root, bytes, expectedBytes = bytes) {
  const targetRoot = path.join(root, "darwin-arm64");
  await mkdir(targetRoot, { recursive: true });
  const binaryPath = path.join(targetRoot, "career");
  await writeFile(binaryPath, bytes);
  await chmod(binaryPath, 0o755);
  const manifest = structuredClone(sourceManifest);
  manifest.targets["darwin-arm64"] = {
    ...manifest.targets["darwin-arm64"],
    sha256: sha256(expectedBytes),
    size_bytes: expectedBytes.length,
  };
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { binaryPath, manifestPath };
}

test("selects only the two reviewed runtime targets", () => {
  assert.equal(selectRuntimeTarget({ platform: "darwin", arch: "arm64" }), "darwin-arm64");
  assert.equal(
    selectRuntimeTarget({ platform: "linux", arch: "x64", glibcVersionRuntime: "2.39" }),
    "linux-x64-gnu",
  );

  for (const info of [
    { platform: "win32", arch: "x64" },
    { platform: "darwin", arch: "x64" },
    { platform: "linux", arch: "arm64", glibcVersionRuntime: "2.39" },
    { platform: "linux", arch: "x64" },
    { platform: "linux", arch: "x64", glibcVersionRuntime: "" },
    { platform: "freebsd", arch: "x64" },
  ]) {
    assert.throws(() => selectRuntimeTarget(info), expectedError("unsupported_platform"));
  }
});

test("verifies size, mode, regular-file status, and SHA-256 without leaking details", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-runtime-unit-"));
  try {
    const binaryPath = path.join(root, "career");
    const bytes = Buffer.from("synthetic-runtime-bytes");
    const expected = { sha256: sha256(bytes), size_bytes: bytes.length, mode: "0755" };
    await writeFile(binaryPath, bytes);
    await chmod(binaryPath, 0o755);
    await verifyRuntimeBinary(binaryPath, expected);

    await assert.rejects(
      verifyRuntimeBinary(binaryPath, { ...expected, size_bytes: bytes.length + 1 }),
      expectedError("bundled_runtime_invalid"),
    );
    await assert.rejects(
      verifyRuntimeBinary(binaryPath, { ...expected, sha256: "0".repeat(64) }),
      expectedError("bundled_runtime_invalid"),
    );
    await chmod(binaryPath, 0o644);
    await assert.rejects(
      verifyRuntimeBinary(binaryPath, expected),
      expectedError("bundled_runtime_invalid"),
    );

    const symlinkPath = path.join(root, "career-link");
    await symlink(binaryPath, symlinkPath);
    await assert.rejects(
      verifyRuntimeBinary(symlinkPath, expected),
      expectedError("bundled_runtime_invalid"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("caches only successful bundled verification in memory", async () => {
  const successfulRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-runtime-cache-ok-"));
  const retryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-runtime-cache-retry-"));
  try {
    const original = Buffer.from("first-runtime");
    const successful = await makeFakeRuntime(successfulRoot, original);
    const options = {
      platformInfo: { platform: "darwin", arch: "arm64" },
      manifestPath: successful.manifestPath,
      runtimeRoot: successfulRoot,
    };
    assert.equal(await resolveBundledRuntime(options), successful.binaryPath);
    await writeFile(successful.binaryPath, Buffer.from("other-runtime"));
    await chmod(successful.binaryPath, 0o755);
    assert.equal(await resolveBundledRuntime(options), successful.binaryPath);

    const expected = Buffer.from("fixed-runtime");
    const retry = await makeFakeRuntime(retryRoot, Buffer.from("wrong-runtime"), expected);
    const retryOptions = {
      platformInfo: { platform: "darwin", arch: "arm64" },
      manifestPath: retry.manifestPath,
      runtimeRoot: retryRoot,
    };
    await assert.rejects(resolveBundledRuntime(retryOptions), expectedError("bundled_runtime_invalid"));
    await writeFile(retry.binaryPath, expected);
    await chmod(retry.binaryPath, 0o755);
    assert.equal(await resolveBundledRuntime(retryOptions), retry.binaryPath);
  } finally {
    await rm(successfulRoot, { recursive: true, force: true });
    await rm(retryRoot, { recursive: true, force: true });
  }
});

test("maps missing or malformed manifests to one payload-free runtime error", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-runtime-manifest-"));
  try {
    const options = {
      platformInfo: { platform: "darwin", arch: "arm64" },
      manifestPath: path.join(root, "missing.json"),
      runtimeRoot: root,
    };
    await assert.rejects(resolveBundledRuntime(options), expectedError("bundled_runtime_invalid"));
    await writeFile(options.manifestPath, "[]\n");
    await assert.rejects(resolveBundledRuntime(options), expectedError("bundled_runtime_invalid"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
