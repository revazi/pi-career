// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  NPM_PUBLISH_ATTESTATION_TYPE,
  NPM_PUBLISH_BUNDLE_MEDIA_TYPE,
  REGISTRY_PROPAGATION_ATTEMPTS,
  REGISTRY_PROPAGATION_INTERVAL_MS,
  SLSA_BUNDLE_MEDIA_TYPE,
  SLSA_PROVENANCE_TYPE,
  pollRegistryResource,
  validateReleaseAttestations,
} from "../../scripts/lib/release-verification.mjs";

const version = "0.2.0";
const gitSha = "6db58644a6140202de2f2d661a740acd298c79b5";
const sha512Hex = "d95d33e36a31b031dd13d6bf513b240b32d8de29d4d3f0d7df48764215ec7bf637ac0269b1a68dc1ea9586f670665314a2fb7206eee99c64a94a8f022e154e06";
const packageName = "pi-career";
const registry = "https://registry.npmjs.org";
const repository = "https://github.com/revazi/pi-career";
const workflowPath = ".github/workflows/release.yml";

function bundle(statement, mediaType, verificationMaterial) {
  return {
    mediaType,
    verificationMaterial: {
      ...verificationMaterial,
      tlogEntries: [{}],
      timestampVerificationData: {},
    },
    dsseEnvelope: {
      payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
      payloadType: "application/vnd.in-toto+json",
      signatures: [{}],
    },
  };
}

function attestationDocument() {
  const subject = [{ name: `pkg:npm/${packageName}@${version}`, digest: { sha512: sha512Hex } }];
  const publishStatement = {
    _type: "https://in-toto.io/Statement/v0.1",
    subject,
    predicateType: NPM_PUBLISH_ATTESTATION_TYPE,
    predicate: { name: packageName, version, registry },
  };
  const provenanceStatement = {
    _type: "https://in-toto.io/Statement/v1",
    subject,
    predicateType: SLSA_PROVENANCE_TYPE,
    predicate: {
      buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: {
          workflow: { ref: `refs/tags/v${version}`, repository, path: workflowPath },
        },
        resolvedDependencies: [
          {
            uri: `git+${repository}@refs/tags/v${version}`,
            digest: { gitCommit: gitSha },
          },
        ],
      },
      runDetails: {
        builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: { invocationId: `${repository}/actions/runs/31353182855/attempts/1` },
      },
    },
  };
  return {
    attestations: [
      {
        predicateType: NPM_PUBLISH_ATTESTATION_TYPE,
        bundle: bundle(publishStatement, NPM_PUBLISH_BUNDLE_MEDIA_TYPE, { publicKey: {} }),
      },
      {
        predicateType: SLSA_PROVENANCE_TYPE,
        bundle: bundle(provenanceStatement, SLSA_BUNDLE_MEDIA_TYPE, { certificate: {} }),
      },
    ],
  };
}

function validate(document = attestationDocument()) {
  return validateReleaseAttestations({
    document,
    packageName,
    version,
    gitSha,
    sha512Hex,
    registry,
    repository,
    workflowPath,
  });
}

test("release verifier accepts npm publish v0.2 and current SLSA v0.3 bundles", () => {
  const verified = validate();
  assert.equal(verified.publishStatement.predicateType, NPM_PUBLISH_ATTESTATION_TYPE);
  assert.equal(verified.provenanceStatement.predicateType, SLSA_PROVENANCE_TYPE);
});

test("release verifier rejects stale bundle media or wrong workflow/invocation provenance", () => {
  const staleMedia = attestationDocument();
  staleMedia.attestations[1].bundle.mediaType = NPM_PUBLISH_BUNDLE_MEDIA_TYPE;
  assert.throws(() => validate(staleMedia), /application\/vnd\.dev\.sigstore\.bundle\.v0\.3\+json/);

  const wrongWorkflow = attestationDocument();
  const statement = JSON.parse(Buffer.from(wrongWorkflow.attestations[1].bundle.dsseEnvelope.payload, "base64"));
  statement.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/other.yml";
  wrongWorkflow.attestations[1].bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
  assert.throws(() => validate(wrongWorkflow));

  const wrongInvocation = attestationDocument();
  const invocation = JSON.parse(Buffer.from(wrongInvocation.attestations[1].bundle.dsseEnvelope.payload, "base64"));
  invocation.predicate.runDetails.metadata.invocationId = "https://github.com/other/repository/actions/runs/1/attempts/1";
  wrongInvocation.attestations[1].bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(invocation)).toString("base64");
  assert.throws(() => validate(wrongInvocation), /invocation repository/);
});

test("registry polling tolerates bounded 404/5xx propagation without a real delay", async () => {
  assert.equal(REGISTRY_PROPAGATION_ATTEMPTS, 36);
  assert.equal(REGISTRY_PROPAGATION_INTERVAL_MS, 5_000);
  const statuses = [404, 503, 200];
  const sleeps = [];
  const response = await pollRegistryResource({
    url: `${registry}/${packageName}/${version}`,
    request: async () => ({ status: statuses.shift(), bytes: Buffer.from("synthetic") }),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(sleeps, [5_000, 5_000]);
});

test("registry polling fails closed immediately on a non-retryable response", async () => {
  let requests = 0;
  let sleeps = 0;
  await assert.rejects(
    pollRegistryResource({
      url: `${registry}/${packageName}/${version}`,
      request: async () => {
        requests += 1;
        return { status: 401, bytes: Buffer.from("synthetic") };
      },
      sleep: async () => {
        sleeps += 1;
      },
    }),
    /status 401/,
  );
  assert.equal(requests, 1);
  assert.equal(sleeps, 0);
});

test("release workflow is tag-only, platform-bounded, and orders publication safely", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  const releaseCreator = await readFile(new URL("../../scripts/create-github-release.mjs", import.meta.url), "utf8");
  assert.match(workflow, /on:\n  push:\n    tags:\n      - "v\*\.\*\.\*"/);
  assert.doesNotMatch(workflow, /workflow_dispatch:|pull_request:/);
  assert.match(workflow, /environment: npm/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /run: node scripts\/verify-hosted-release-gates\.mjs/);
  assert.match(workflow, /JSON\.stringify\(require\('\.\/package\.json'\)\.os\)/);
  assert.match(workflow, /JSON\.stringify\(require\('\.\/package-lock\.json'\)\.packages\[''\]\.os\)/);
  assert.doesNotMatch(workflow, /shell: node \{0\}/);
  assert.doesNotMatch(releaseCreator, /win32-(?:x64|arm64)-msvc|MSVC Windows|career-(?:darwin|linux)-/);
  assert.match(releaseCreator, /@revazi\/career@0\.2\.0/);
  assert.match(releaseCreator, /validates its exact ordered six-package v2 manifest/);
  assert.match(releaseCreator, /Only the launcher is a pi-career installation surface, and Windows remains unsupported/);
  assert.doesNotMatch(workflow, /secrets\.(?:NPM_TOKEN|NODE_AUTH_TOKEN)|--otp/);

  const absent = workflow.indexOf("verify-release-registry.mjs absent");
  const publish = workflow.indexOf("npm publish --access public --tag latest --provenance --ignore-scripts");
  const published = workflow.indexOf("verify-release-registry.mjs published");
  const release = workflow.indexOf("create-github-release.mjs");
  assert.ok(absent >= 0 && absent < publish && publish < published && published < release);
});

test("release documentation records immutable v0.2.0 coordinates and no-blind-rerun recovery", async () => {
  const documentation = await readFile(new URL("../../docs/releasing.md", import.meta.url), "utf8");
  assert.match(documentation, new RegExp(gitSha));
  assert.match(documentation, /sha512-2V0z42oxsDHdE9a\/UTskCzLY3inU0\/DX30h2QhXse\/Y3rAJpsaaNweqVhvZwZlMUovtyBu7pnGSpSo8CLhVOBg==/);
  assert.match(documentation, /31353182855/);
  assert.match(documentation, /Never rerun or republish after an ambiguous publish response/i);
});
