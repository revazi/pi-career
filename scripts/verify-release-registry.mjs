#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pollRegistryResource, validateReleaseAttestations } from "./lib/release-verification.mjs";
import { parseStrictJson } from "./lib/strict-json.mjs";

const PACKAGE_NAME = "pi-career";
const REGISTRY = "https://registry.npmjs.org";
const REPOSITORY = "https://github.com/revazi/pi-career";
const WORKFLOW_PATH = ".github/workflows/release.yml";
const EXTERNAL_PEERS = {
  "@earendil-works/pi-ai": "*",
  "@earendil-works/pi-coding-agent": "*",
  "@earendil-works/pi-tui": "*",
  typebox: "*",
};
const SUPPORTED_OS = ["darwin", "linux"];
const FORBIDDEN_LIFECYCLES = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepack",
  "postpack",
  "prepublish",
  "prepublishOnly",
  "publish",
  "postpublish",
];
const VERSION_PATTERN = /^0\.[0-9]+\.[0-9]+$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function requiredEnvironment(name, pattern) {
  const value = process.env[name];
  assert.equal(typeof value, "string", `${name} must be set`);
  assert.match(value, pattern, `${name} has an invalid value`);
  return value;
}

async function responseBytes(response, maximumBytes, label) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    assert.match(declaredLength, /^(?:0|[1-9][0-9]*)$/, `${label} content length`);
    assert.ok(Number(declaredLength) <= maximumBytes, `${label} exceeds its size bound`);
  }
  assert.ok(response.body, `${label} response body is missing`);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    assert.ok(total <= maximumBytes, `${label} exceeds its size bound`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function request(url, { maximumBytes = 512 * 1024 } = {}) {
  assert.ok(url.startsWith(`${REGISTRY}/`), "registry request must remain canonical");
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "pi-career-release-verifier/0.3.0" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  return {
    status: response.status,
    bytes: await responseBytes(response, maximumBytes, url),
  };
}

function strictJson(bytes, label, maximumBytes) {
  return parseStrictJson(bytes.toString("utf8"), { label, maximumBytes });
}

async function assertVersionAbsent(version) {
  const url = `${REGISTRY}/${PACKAGE_NAME}/${version}`;
  const response = await request(url);
  assert.equal(response.status, 404, `${PACKAGE_NAME}@${version} already exists or registry state is not authoritative`);
  process.stdout.write(`Confirmed ${PACKAGE_NAME}@${version} is absent from the canonical registry\n`);
}

async function eventuallyAvailable(url, options = {}) {
  return pollRegistryResource({ url, options, request, sleep: delay });
}

async function publishedMetadata(version) {
  const response = await eventuallyAvailable(`${REGISTRY}/${PACKAGE_NAME}/${version}`);
  return strictJson(response.bytes, "published package metadata", 512 * 1024);
}

async function publishedPackument(version, gitSha) {
  const url = `${REGISTRY}/${PACKAGE_NAME}`;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await eventuallyAvailable(url, { maximumBytes: 2 * 1024 * 1024 });
    const packument = strictJson(response.bytes, "package registry metadata", 2 * 1024 * 1024);
    if (packument["dist-tags"]?.latest === version && packument.versions?.[version]?.gitHead === gitSha) {
      return packument;
    }
    if (attempt < 12) await delay(5_000);
  }
  assert.fail("package registry metadata did not expose the exact latest release");
}

async function assertAttestations(metadata, version, gitSha, sha512Hex) {
  const expectedUrl = `${REGISTRY}/-/npm/v1/attestations/${PACKAGE_NAME}@${version}`;
  assert.equal(metadata.dist?.attestations?.url, expectedUrl);
  assert.equal(metadata.dist.attestations.provenance?.predicateType, "https://slsa.dev/provenance/v1");
  const response = await eventuallyAvailable(expectedUrl, { maximumBytes: 4 * 1024 * 1024 });
  const document = strictJson(response.bytes, "registry attestations", 4 * 1024 * 1024);
  validateReleaseAttestations({
    document,
    packageName: PACKAGE_NAME,
    version,
    gitSha,
    sha512Hex,
    registry: REGISTRY,
    repository: REPOSITORY,
    workflowPath: WORKFLOW_PATH,
  });
}

async function assertTarball(metadata) {
  const response = await eventuallyAvailable(metadata.dist.tarball, { maximumBytes: 2_000_000 });
  assert.ok(response.bytes.length > 0, "published tarball must not be empty");
  const sha1 = createHash("sha1").update(response.bytes).digest("hex");
  const sha512 = createHash("sha512").update(response.bytes).digest("base64");
  assert.equal(sha1, metadata.dist.shasum, "published tarball shasum");
  assert.equal(`sha512-${sha512}`, metadata.dist.integrity, "published tarball integrity");
  return createHash("sha512").update(response.bytes).digest("hex");
}

async function assertPublished(version, gitSha) {
  const metadata = await publishedMetadata(version);
  assert.equal(metadata.name, PACKAGE_NAME);
  assert.equal(metadata.version, version);
  assert.equal(metadata.gitHead, gitSha);
  assert.deepEqual(metadata.repository, { type: "git", url: `git+${REPOSITORY}.git` });
  assert.deepEqual(metadata.peerDependencies, EXTERNAL_PEERS);
  assert.deepEqual(metadata.publishConfig, { access: "public", registry: `${REGISTRY}/` });
  assert.deepEqual(metadata.os, SUPPORTED_OS, "published package platform boundary");
  for (const field of ["dependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"]) {
    assert.equal(metadata[field], undefined, `published ${field} must be absent`);
  }
  for (const lifecycle of FORBIDDEN_LIFECYCLES) {
    assert.equal(metadata.scripts?.[lifecycle], undefined, `published lifecycle script ${lifecycle} is forbidden`);
  }
  assert.equal(metadata._nodeVersion, "22.19.0");
  assert.equal(metadata._npmVersion, "11.6.2");
  assert.equal(metadata._npmUser?.name, "GitHub Actions");
  assert.equal(metadata._npmUser?.email, "npm-oidc-no-reply@github.com");
  assert.equal(metadata._npmUser?.trustedPublisher?.id, "github");
  assert.match(metadata._npmUser?.trustedPublisher?.oidcConfigId, /^oidc:[0-9a-f-]{36}$/);
  assert.match(metadata.dist?.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.match(metadata.dist?.shasum, /^[0-9a-f]{40}$/);
  assert.equal(metadata.dist?.tarball, `${REGISTRY}/${PACKAGE_NAME}/-/${PACKAGE_NAME}-${version}.tgz`);
  assert.ok(Number.isSafeInteger(metadata.dist?.fileCount) && metadata.dist.fileCount > 0);
  assert.ok(Number.isSafeInteger(metadata.dist?.unpackedSize) && metadata.dist.unpackedSize < 5_000_000);

  const sha512Hex = await assertTarball(metadata);
  await assertAttestations(metadata, version, gitSha, sha512Hex);

  await publishedPackument(version, gitSha);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath !== undefined) {
    assert.ok(outputPath.startsWith("/"), "GITHUB_OUTPUT must be absolute");
    await appendFile(outputPath, `integrity=${metadata.dist.integrity}\nshasum=${metadata.dist.shasum}\n`, "utf8");
  }
  process.stdout.write(`Verified canonical registry metadata, tarball bytes, OIDC identity, and provenance for ${PACKAGE_NAME}@${version}\n`);
}

const mode = process.argv[2];
assert.ok(mode === "absent" || mode === "published", "usage: verify-release-registry.mjs <absent|published>");
const version = requiredEnvironment("RELEASE_VERSION", VERSION_PATTERN);
if (mode === "absent") {
  await assertVersionAbsent(version);
} else {
  await assertPublished(version, requiredEnvironment("RELEASE_SHA", SHA_PATTERN));
}
