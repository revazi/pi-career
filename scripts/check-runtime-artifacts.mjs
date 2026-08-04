#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.env.PI_CAREER_PACKAGE_ROOT ?? repositoryRoot;
assert.ok(path.isAbsolute(root), "PI_CAREER_PACKAGE_ROOT must be absolute when supplied");

const CORE_SHA = "a3cdb4c6d7f966397e93ea4664071975bca7228c";
const CORE_REPOSITORY = "https://github.com/revazi/career-core";
const ARTIFACT_RUN = 30953471793;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXPECTED_RUNTIME_FILES = new Set([
  "runtime/LICENSE-APACHE",
  "runtime/LICENSE-MIT",
  "runtime/THIRD_PARTY_NOTICES.md",
  "runtime/darwin-arm64/career",
  "runtime/darwin-arm64/provenance.json",
  "runtime/linux-x64-gnu/career",
  "runtime/linux-x64-gnu/provenance.json",
  "runtime/manifest.json",
]);
const EXPECTED_TARGETS = {
  "darwin-arm64": {
    platform: "darwin",
    arch: "arm64",
    libc: null,
    targetTriple: "aarch64-apple-darwin",
    binaryMagic: "cffaedfe0c000001",
    provenanceSha256: "0e5cd03385dd11283551b3d198d071aebbef4ab99b7c278a60fba2ab8269e0c6",
    provenanceSize: 3275,
    artifactId: 8910079991,
    downloadSize: 1486583,
    archiveSha256: "3847ca2b06e8b41d86b6a4e3d4ce1f0a0cfd2322bf7f9a19330abb3f58b9ef2c",
  },
  "linux-x64-gnu": {
    platform: "linux",
    arch: "x64",
    libc: "gnu",
    targetTriple: "x86_64-unknown-linux-gnu",
    binaryMagic: "7f454c4602010100",
    provenanceSha256: "98ee468bb78d3ade4f398ec11615a4ae7469c850817655c63cfea94a7b79cc0f",
    provenanceSize: 3300,
    artifactId: 8910084163,
    downloadSize: 1679647,
    archiveSha256: "966f2b0693f815926eb53ee36933f5f1e8b6ea599ca7f33b308b82fc6cb88eed",
  },
};

async function filesBelow(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(absolute, relative)));
    else {
      assert.ok(entry.isFile(), `runtime entry must be a regular file: ${relative}`);
      files.push(relative);
    }
  }
  return files;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifiedFile(relativePath, expectedSize, expectedSha256, expectedMode = 0o644) {
  assert.ok(Number.isSafeInteger(expectedSize) && expectedSize > 0);
  assert.match(expectedSha256, SHA256_PATTERN);
  const absolute = path.join(root, relativePath);
  const metadata = await lstat(absolute);
  assert.ok(metadata.isFile(), `${relativePath} must be a regular file`);
  assert.equal(metadata.mode & 0o777, expectedMode, `${relativePath} mode`);
  assert.equal(metadata.size, expectedSize, `${relativePath} size`);
  const bytes = await readFile(absolute);
  assert.equal(bytes.length, expectedSize, `${relativePath} read size`);
  assert.equal(sha256(bytes), expectedSha256, `${relativePath} SHA-256`);
  return bytes;
}

const runtimeRoot = path.join(root, "runtime");
const actualRuntimeFiles = new Set((await filesBelow(runtimeRoot)).map((file) => `runtime/${file}`));
assert.deepEqual(actualRuntimeFiles, EXPECTED_RUNTIME_FILES);

const manifestBytes = await readFile(path.join(runtimeRoot, "manifest.json"));
assert.ok(manifestBytes.length > 0 && manifestBytes.length < 65_536);
assert.equal((await lstat(path.join(runtimeRoot, "manifest.json"))).mode & 0o777, 0o644);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
assert.deepEqual(Object.keys(manifest).sort(), [
  "career_core",
  "contracts",
  "distribution",
  "licenses_and_notices",
  "schema_version",
  "targets",
]);
assert.equal(manifest.schema_version, "pi.career.runtime_manifest.v1");
assert.deepEqual(manifest.career_core, {
  repository: CORE_REPOSITORY,
  commit: CORE_SHA,
  version: "0.1.0",
  artifact_run: {
    id: ARTIFACT_RUN,
    url: `https://github.com/revazi/career-core/actions/runs/${ARTIFACT_RUN}`,
    workflow: "Prepare pi-career runtime artifacts",
  },
});
assert.deepEqual(manifest.distribution, {
  private_package: true,
  unsigned: true,
  publication_status: "not_a_public_release",
});
assert.deepEqual(Object.keys(manifest.targets).sort(), Object.keys(EXPECTED_TARGETS).sort());

for (const contract of [
  manifest.contracts.capabilities,
  manifest.contracts.schema_catalog,
  manifest.contracts.schema_export,
  ...Object.values(manifest.contracts.representative_operations),
]) {
  assert.match(contract.sha256, SHA256_PATTERN);
  assert.ok(Number.isSafeInteger(contract.size_bytes) && contract.size_bytes > 0 && contract.size_bytes < 50_000);
}
assert.equal(manifest.contracts.capabilities.schema_version, "career.capabilities.v1");
assert.equal(manifest.contracts.schema_catalog.schema_version, "career.schema_catalog.v1");
assert.equal(manifest.contracts.schema_catalog.schema_count, 25);
assert.equal(manifest.contracts.schema_export.schema_id, "career.job_match.v1");
assert.equal(manifest.contracts.representative_operations["resume.analyze"].schema_version, "career.resume_analysis.v1");
assert.equal(manifest.contracts.representative_operations["job.match"].schema_version, "career.job_match.v1");

const expectedNoticeNames = ["LICENSE-MIT", "LICENSE-APACHE", "THIRD_PARTY_NOTICES.md"];
assert.deepEqual(manifest.licenses_and_notices.map(({ path: file }) => path.basename(file)), expectedNoticeNames);
for (const notice of manifest.licenses_and_notices) {
  assert.ok(EXPECTED_RUNTIME_FILES.has(notice.path));
  await verifiedFile(notice.path, notice.size_bytes, notice.sha256);
}

for (const [targetKey, expected] of Object.entries(EXPECTED_TARGETS)) {
  const target = manifest.targets[targetKey];
  const binaryPath = `runtime/${targetKey}/career`;
  const provenancePath = `runtime/${targetKey}/provenance.json`;
  assert.equal(target.platform, expected.platform);
  assert.equal(target.arch, expected.arch);
  assert.equal(target.libc, expected.libc);
  assert.equal(target.target_triple, expected.targetTriple);
  assert.equal(target.path, binaryPath);
  assert.equal(target.provenance_path, provenancePath);
  assert.equal(target.provenance_sha256, expected.provenanceSha256);
  assert.equal(target.provenance_size_bytes, expected.provenanceSize);
  assert.equal(target.mode, "0755");
  assert.equal(target.version_output, "career 0.1.0");
  assert.equal(target.source_artifact.id, expected.artifactId);
  assert.equal(target.source_artifact.download_size_bytes, expected.downloadSize);
  assert.equal(target.source_artifact.archive_sha256, expected.archiveSha256);
  assert.match(target.source_artifact.name, new RegExp(`^career-pi-runtime-${targetKey}-`));
  assert.equal(target.source_artifact.archive_file, `${target.source_artifact.name}.tar.gz`);

  const binary = await verifiedFile(binaryPath, target.size_bytes, target.sha256, 0o755);
  assert.equal(binary.subarray(0, 8).toString("hex"), expected.binaryMagic, `${targetKey} binary target magic`);
  const provenanceBytes = await verifiedFile(
    provenancePath,
    target.provenance_size_bytes,
    target.provenance_sha256,
  );
  const provenance = JSON.parse(provenanceBytes.toString("utf8"));
  assert.equal(provenance.schema_version, "career.pi_career_runtime_artifact.v1");
  assert.deepEqual(provenance.source, {
    repository: CORE_REPOSITORY,
    git_sha: CORE_SHA,
    git_dirty: false,
  });
  assert.equal(provenance.purpose, "maintainer_input_for_external_pi_career");
  assert.equal(provenance.publication_status, "not_a_public_release");
  assert.equal(provenance.build.platform_key, targetKey);
  assert.equal(provenance.build.target_triple, expected.targetTriple);
  assert.equal(provenance.build.locked, true);
  assert.equal(provenance.build.profile, "release");
  assert.deepEqual(provenance.executable, {
    file_name: "career",
    sha256: target.sha256,
    size_bytes: target.size_bytes,
    version_output: target.version_output,
  });
  assert.deepEqual(provenance.package.contents, [
    "career",
    "metadata.json",
    "LICENSE-MIT",
    "LICENSE-APACHE",
    "THIRD_PARTY_NOTICES.md",
  ]);
  assert.equal(provenance.package.unsigned, true);
  assert.deepEqual(provenance.contract_digests, {
    capabilities: manifest.contracts.capabilities,
    schema_catalog: manifest.contracts.schema_catalog,
    schema_export: manifest.contracts.schema_export,
  });
  for (const verification of provenance.native_verification) {
    const locked = manifest.contracts.representative_operations[verification.operation];
    assert.ok(locked, `${verification.operation} must be locked in the runtime manifest`);
    assert.equal(verification.output_schema_version, locked.schema_version);
    assert.equal(verification.output_sha256, locked.sha256);
    assert.equal(verification.output_size_bytes, locked.size_bytes);
  }
  assert.deepEqual(
    provenance.licenses_and_notices.map(({ file_name, sha256, size_bytes }) => ({ file_name, sha256, size_bytes })),
    manifest.licenses_and_notices.map(({ path: file, sha256, size_bytes }) => ({
      file_name: path.basename(file),
      sha256,
      size_bytes,
    })),
  );
}

const totalRuntimeBytes = await Promise.all(
  [...EXPECTED_RUNTIME_FILES].map(async (relativePath) => (await lstat(path.join(root, relativePath))).size),
).then((sizes) => sizes.reduce((sum, size) => sum + size, 0));
assert.ok(totalRuntimeBytes < 11_000_000, "runtime payload must remain below 11 MB unpacked");
process.stdout.write(
  `Verified bundled runtime artifacts for ${Object.keys(EXPECTED_TARGETS).join(", ")} (${totalRuntimeBytes} bytes)\n`,
);
