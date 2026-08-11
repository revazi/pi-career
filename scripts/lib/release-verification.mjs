// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { parseStrictJson } from "./strict-json.mjs";

export const NPM_PUBLISH_ATTESTATION_TYPE = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
export const SLSA_PROVENANCE_TYPE = "https://slsa.dev/provenance/v1";
export const NPM_PUBLISH_BUNDLE_MEDIA_TYPE = "application/vnd.dev.sigstore.bundle+json;version=0.2";
export const SLSA_BUNDLE_MEDIA_TYPE = "application/vnd.dev.sigstore.bundle.v0.3+json";
export const REGISTRY_PROPAGATION_ATTEMPTS = 36;
export const REGISTRY_PROPAGATION_INTERVAL_MS = 5_000;

export async function pollRegistryResource({
  url,
  options = {},
  request,
  sleep,
  attempts = REGISTRY_PROPAGATION_ATTEMPTS,
  intervalMilliseconds = REGISTRY_PROPAGATION_INTERVAL_MS,
}) {
  assert.equal(typeof url, "string", "registry resource URL");
  assert.equal(typeof request, "function", "registry request function");
  assert.equal(typeof sleep, "function", "registry sleep function");
  assert.ok(Number.isSafeInteger(attempts) && attempts > 0, "registry propagation attempts");
  assert.ok(Number.isSafeInteger(intervalMilliseconds) && intervalMilliseconds >= 0, "registry propagation interval");
  let lastStatus;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await request(url, options);
      lastStatus = response.status;
      if (response.status === 200) return response;
      if (response.status !== 404 && response.status < 500) break;
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    if (attempt < attempts) await sleep(intervalMilliseconds);
  }
  assert.fail(`published registry resource did not become authoritative (status ${lastStatus ?? "unavailable"})`);
}

function expectedSubject(packageName, version, sha512Hex) {
  return {
    name: `pkg:npm/${packageName}@${version}`,
    digest: { sha512: sha512Hex },
  };
}

function attestationStatement(attestation, { packageName, version, sha512Hex, mediaType }) {
  assert.equal(attestation.bundle?.mediaType, mediaType);
  assert.equal(attestation.bundle?.dsseEnvelope?.payloadType, "application/vnd.in-toto+json");
  assert.equal(attestation.bundle?.dsseEnvelope?.signatures?.length, 1);
  assert.ok(attestation.bundle?.verificationMaterial?.tlogEntries?.length > 0, "attestation transparency entry");
  const payload = Buffer.from(attestation.bundle.dsseEnvelope.payload, "base64").toString("utf8");
  const statement = parseStrictJson(payload, { label: "attestation statement", maximumBytes: 512 * 1024 });
  assert.deepEqual(statement.subject, [expectedSubject(packageName, version, sha512Hex)]);
  assert.equal(statement.predicateType, attestation.predicateType);
  return statement;
}

export function validateReleaseAttestations({
  document,
  packageName,
  version,
  gitSha,
  sha512Hex,
  registry,
  repository,
  workflowPath,
}) {
  assert.ok(Array.isArray(document?.attestations), "registry attestations array");
  const publish = document.attestations.find(({ predicateType }) => predicateType === NPM_PUBLISH_ATTESTATION_TYPE);
  const provenance = document.attestations.find(({ predicateType }) => predicateType === SLSA_PROVENANCE_TYPE);
  assert.ok(publish, "npm publish attestation is missing");
  assert.ok(provenance, "SLSA provenance attestation is missing");

  const publishStatement = attestationStatement(publish, {
    packageName,
    version,
    sha512Hex,
    mediaType: NPM_PUBLISH_BUNDLE_MEDIA_TYPE,
  });
  assert.equal(publishStatement._type, "https://in-toto.io/Statement/v0.1");
  assert.deepEqual(publishStatement.predicate, { name: packageName, version, registry });

  const provenanceStatement = attestationStatement(provenance, {
    packageName,
    version,
    sha512Hex,
    mediaType: SLSA_BUNDLE_MEDIA_TYPE,
  });
  assert.equal(provenanceStatement._type, "https://in-toto.io/Statement/v1");
  const definition = provenanceStatement.predicate?.buildDefinition;
  assert.equal(definition?.buildType, "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1");
  assert.deepEqual(definition?.externalParameters?.workflow, {
    ref: `refs/tags/v${version}`,
    repository,
    path: workflowPath,
  });
  assert.ok(
    definition?.resolvedDependencies?.some(
      ({ uri, digest }) =>
        uri === `git+${repository}@refs/tags/v${version}` && digest?.gitCommit === gitSha,
    ),
    "provenance must resolve the tagged release commit",
  );
  assert.equal(provenanceStatement.predicate?.runDetails?.builder?.id, "https://github.com/actions/runner/github-hosted");
  const invocationId = provenanceStatement.predicate?.runDetails?.metadata?.invocationId;
  assert.match(invocationId, /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+\/attempts\/[0-9]+$/);
  assert.ok(invocationId.startsWith(`${repository}/actions/runs/`), "provenance invocation repository");
  return { publishStatement, provenanceStatement };
}
