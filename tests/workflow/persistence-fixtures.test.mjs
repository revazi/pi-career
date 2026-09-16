// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  FIXTURE_OWNERSHIP,
  SYNTHETIC,
  buildChain,
  canonicalJson,
  canonicalStateFixtures,
  completeApplicationFixture,
  coverLetterReferenceFixtures,
  historicalReferenceFixtures,
  makeAssistedSidecar,
  makeCoverLetter,
  makeIdentity,
  makeManifest,
  makeResumeArtifact,
  makeRootMarker,
  makeSelectedOriginal,
  makeState,
  makeVacancyBinding,
  materializeApplicationFixture,
  mixedChainFixtures,
  packageCompletenessFixtures,
  readRaceAndPrivacyFixtures,
  sha256,
  sourceAuthorityFixtures,
  stateName,
  transactionOrphanFixtures,
} from "./fixtures/persistence-v2.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parsed(revision) {
  return JSON.parse(revision.bytes.toString("utf8"));
}

function assertLinkedChain(chain) {
  let parent = digest(chain.manifestBytes);
  chain.revisions.forEach((revision, index) => {
    assert.equal(revision.name, stateName(index + 1));
    assert.equal(revision.value.sequence, index + 1);
    assert.equal(revision.value.parent_sha256, parent);
    assert.deepEqual(parsed(revision), revision.value);
    assert.ok(revision.bytes.equals(canonicalJson(revision.value)));
    parent = digest(revision.bytes);
  });
}

test("#60 fixtures map every reviewed family to explicit P3 ownership", () => {
  assert.deepEqual(Object.keys(FIXTURE_OWNERSHIP), [
    "state-v2-canonical",
    "mixed-chain",
    "historical-references",
    "cover-letter-reference",
    "package-completeness",
    "source-authority",
    "read-races-and-privacy",
    "transaction-orphans",
  ]);
  for (const [family, scenarios] of Object.entries(FIXTURE_OWNERSHIP)) {
    assert.ok(scenarios.length > 0, `${family} needs scenario ownership`);
    for (const scenario of scenarios) assert.match(scenario, /^P3-(?:0[1-9]|[1-4][0-9])$/);
  }
});

test("#60 canonical builders produce independent exact v1/v2 bytes", () => {
  const rootMarker = makeRootMarker();
  const manifest = makeManifest();
  const identity = makeIdentity();
  const manifestBytes = canonicalJson(manifest);
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const sidecar = makeAssistedSidecar(SYNTHETIC.resumeBytes, selectedOriginal);
  const resumeArtifact = makeResumeArtifact(SYNTHETIC.resumeBytes, canonicalJson(sidecar));
  const state = makeState(2, {
    sequence: 1,
    parentSha256: digest(manifestBytes),
    vacancy,
    selectedOriginal,
    coverLetterArtifact: makeCoverLetter(),
  });
  assert.deepEqual(Object.keys(state), [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
    "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
  ]);
  assert.deepEqual(Object.keys(state.cover_letter_artifact), [
    "relative_path", "artifact_sha256", "utf8_bytes", "format", "authority",
    "job_description_sha256", "effective_resume_sha256",
  ]);
  assert.equal(rootMarker.root_id, manifest.root_id);
  assert.equal(identity.application_id, manifest.application_id);
  assert.equal(vacancy.content_sha256, digest(SYNTHETIC.vacancyBytes));
  assert.equal(selectedOriginal.text_sha256, digest(SYNTHETIC.originalBytes));
  assert.equal(sidecar.base_document_id, selectedOriginal.document_id);
  assert.equal(resumeArtifact.artifact_sha256, digest(SYNTHETIC.resumeBytes));
  assertLinkedChain(buildChain([{ version: 1 }, { version: 2 }]));
  assert.equal(sha256(canonicalJson(state)), digest(canonicalJson(state)));
  assert.equal(canonicalJson(state).at(-1), 0x0a);
  assert.doesNotMatch(canonicalJson(state).toString("utf8"), /Ready|match_result|provider|session_id/);
});

test("#60 P3-08/P3-09/P3-47 canonical state fixtures preserve transition bytes", () => {
  const fixtures = canonicalStateFixtures();
  assert.deepEqual(fixtures.map((fixture) => fixture.id), [
    "sequence-1-v2", "v1-null-cover-transition", "cover-introduction-transition",
  ]);
  fixtures.forEach((fixture) => assertLinkedChain(fixture.chain));

  const sequenceOne = parsed(fixtures[0].chain.revisions[0]);
  assert.equal(sequenceOne.schema_version, "pi.career.application_state.v2");
  assert.equal(sequenceOne.cover_letter_artifact, null);

  const nullTransition = fixtures[1].chain.revisions.map(parsed);
  assert.equal(nullTransition[0].schema_version, "pi.career.application_state.v1");
  assert.equal(nullTransition[1].schema_version, "pi.career.application_state.v2");
  assert.equal(nullTransition[1].cover_letter_artifact, null);

  const coverTransition = fixtures[2].chain.revisions.map(parsed);
  for (const field of ["status", "vacancy", "selected_original", "resume_artifact"]) {
    assert.deepEqual(coverTransition[1][field], coverTransition[0][field]);
  }
  assert.equal(coverTransition[1].cover_letter_artifact.authority, "user_authored");
  assert.deepEqual([...fixtures[2].files], [
    ["vacancy.md", SYNTHETIC.vacancyBytes],
    ["cover-letter.md", SYNTHETIC.coverBytes],
  ]);
});

test("#60 P3-04/P3-08/P3-09/P3-10 mixed-chain fixtures isolate each corruption", () => {
  const fixtures = new Map(mixedChainFixtures().map((fixture) => [fixture.id, fixture]));
  assert.deepEqual([...fixtures.keys()], [
    "all-v1", "all-v2", "v1-to-v2", "v2-to-v1", "gap",
    "embedded-sequence-mismatch", "bad-parent", "canonical-unsupported", "malformed-future-looking",
  ]);
  for (const id of ["all-v1", "all-v2", "v1-to-v2", "v2-to-v1"]) {
    assertLinkedChain(fixtures.get(id).chain);
  }
  assert.deepEqual(fixtures.get("v2-to-v1").chain.revisions.map((revision) => revision.value.schema_version), [
    "pi.career.application_state.v2", "pi.career.application_state.v1",
  ]);
  assert.equal(fixtures.get("gap").chain.revisions[1].name, stateName(3));
  assert.equal(fixtures.get("embedded-sequence-mismatch").chain.revisions[1].value.sequence, 3);
  assert.notEqual(
    fixtures.get("bad-parent").chain.revisions[1].value.parent_sha256,
    digest(fixtures.get("bad-parent").chain.revisions[0].bytes),
  );
  assert.equal(
    fixtures.get("canonical-unsupported").chain.revisions[1].value.schema_version,
    "pi.career.application_state.v99",
  );
  assert.throws(() => parsed(fixtures.get("malformed-future-looking").chain.revisions[1]), SyntaxError);
  assert.equal(fixtures.get("canonical-unsupported").expected, "unsupported");
  for (const id of ["v2-to-v1", "gap", "embedded-sequence-mismatch", "bad-parent", "malformed-future-looking"]) {
    assert.equal(fixtures.get(id).expected, "drifted");
  }
});

test("#60 P3-04/P3-20/P3-21/P3-43/P3-47 historical fixtures retain managed evidence", () => {
  const fixtures = new Map(historicalReferenceFixtures().map((fixture) => [fixture.id, fixture]));
  assert.deepEqual([...fixtures.keys()], [
    "carried-managed-references", "cleared-current-references", "absent-historical-external-original",
    "missing-historical-managed-file", "changed-historical-managed-file", "conflicting-path-reuse",
  ]);
  assertLinkedChain(fixtures.get("carried-managed-references").chain);
  const carried = fixtures.get("carried-managed-references").chain.revisions.map(parsed);
  assert.deepEqual(carried[2].vacancy, carried[1].vacancy);
  assert.deepEqual(carried[2].cover_letter_artifact, carried[1].cover_letter_artifact);
  const cleared = fixtures.get("cleared-current-references").chain.revisions.map(parsed);
  assert.equal(cleared[2].vacancy, null);
  assert.equal(cleared[2].cover_letter_artifact, null);
  assert.ok(fixtures.get("cleared-current-references").files.has("vacancy.md"));
  assert.ok(fixtures.get("cleared-current-references").files.has("cover-letter.md"));
  assert.deepEqual(fixtures.get("missing-historical-managed-file").omit, ["vacancy.md"]);
  assert.deepEqual(fixtures.get("changed-historical-managed-file").change, ["vacancy.md"]);
  const conflict = fixtures.get("conflicting-path-reuse").chain.revisions.map(parsed);
  assert.equal(conflict[0].vacancy.relative_path, conflict[1].vacancy.relative_path);
  assert.notEqual(conflict[0].vacancy.content_sha256, conflict[1].vacancy.content_sha256);
});

test("#60 P3-19/P3-20/P3-21/P3-44 cover-letter cases hit exact byte and authority boundaries", () => {
  const fixtures = new Map(coverLetterReferenceFixtures().map((fixture) => [fixture.id, fixture]));
  assert.equal(fixtures.get("empty").bytes.length, 0);
  assert.equal(fixtures.get("one-byte").bytes.length, 1);
  assert.equal(fixtures.get("at-byte-limit").bytes.length, 262_144);
  assert.equal(fixtures.get("above-byte-limit").bytes.length, 262_145);
  assert.equal(fixtures.get("text-first").binding.relative_path, "cover-letter.txt");
  assert.equal(fixtures.get("markdown-numbered").binding.relative_path, "cover-letter-000003.md");
  assert.equal(fixtures.get("bad-authority").binding.authority, "assisted");
  assert.equal(fixtures.get("bad-format").binding.format, "text");
  assert.equal(fixtures.get("bad-path").binding.relative_path, "../cover-letter.md");
  assert.notEqual(fixtures.get("bad-hash").binding.artifact_sha256, digest(fixtures.get("bad-hash").bytes));
  assert.equal(fixtures.get("stale-job-dependency").expected, "Stale");
  assert.equal(fixtures.get("stale-resume-dependency").expected, "Stale");
});

test("#60 P3-16 through P3-25 completeness fixtures encode the closed readiness table", () => {
  const fixtures = packageCompletenessFixtures();
  for (const fixture of fixtures) {
    const available = Object.values(fixture.components).filter((value) => value === "Available").length;
    const expected = available === 3 ? "Ready 3/3" : `Incomplete ${available}/3`;
    assert.equal(fixture.projection, expected);
    assert.deepEqual(fixture.lifecycles, ["preparing", "applied", "interviewing", "closed"]);
    assert.equal(fixture.matchResult, null);
  }
  assert.ok(fixtures.some((fixture) => Object.values(fixture.components).includes("Stale")));
  assert.ok(fixtures.some((fixture) => Object.values(fixture.components).includes("Unavailable")));
  assert.ok(fixtures.some((fixture) => Object.values(fixture.components).includes("Drifted")));
});

test("#60 P3-18/P3-21/P3-22/P3-23/P3-48 source fixtures never silently fall back", () => {
  const fixtures = sourceAuthorityFixtures();
  assert.deepEqual(fixtures.filter((fixture) => fixture.effective !== null).map((fixture) => [fixture.id, fixture.effective]), [
    ["current-original", "original"],
    ["valid-tailored", "tailored"],
  ]);
  for (const fixture of fixtures.filter((candidate) => candidate.expected !== "Available")) {
    assert.equal(fixture.effective, null);
  }
  assert.equal(fixtures.find((fixture) => fixture.id === "assisted-candidate").expected, "Unavailable");
  assert.equal(fixtures.find((fixture) => fixture.id === "source-mismatched-tailored").expected, "Drifted");
});

test("#60 P3-33/P3-37/P3-39/P3-43/P3-44 race/privacy fixtures enumerate forbidden sinks", () => {
  const fixture = readRaceAndPrivacyFixtures();
  assert.deepEqual(fixture.raceTargets, [
    "state-revision", "historical-artifact", "current-artifact", "selected-original", "application-entry-set",
  ]);
  assert.deepEqual(fixture.forbiddenSinks, [
    "adapter-error", "log", "session-entry", "provider-message", "model-context", "telemetry",
  ]);
  assert.equal(fixture.expectedError, "workspace_drift");
  assert.equal(fixture.sentinel, SYNTHETIC.privateSentinel);
});

test("#60 P3-40/P3-41 transaction fixtures distinguish orphan from exact commit", () => {
  const fixtures = transactionOrphanFixtures();
  assert.deepEqual(fixtures.map((fixture) => [fixture.id, fixture.expected]), [
    ["artifact-without-state", "orphan-not-current"],
    ["exact-state-after-ambiguous-failure", "exact-commit-idempotent"],
  ]);
  assert.ok(fixtures[0].files.has("cover-letter.md"));
  assert.ok(fixtures[1].files.has(stateName(1)));
  assert.ok(fixtures[1].files.get(stateName(1)).equals(fixtures[1].chain.revisions[0].bytes));
});

test("#60 materialized fixture uses only private synthetic files and deterministic bytes", async (t) => {
  const fixture = completeApplicationFixture();
  const { root, directory } = await materializeApplicationFixture(fixture);
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.equal((await lstat(root)).mode & 0o7777, 0o700);
  assert.equal((await lstat(directory)).mode & 0o7777, 0o700);
  const rootEntries = await readdir(root);
  assert.deepEqual(rootEntries.sort(), [".pi-career-applications.json", path.basename(directory)].sort());
  for (const name of await readdir(directory)) {
    const file = path.join(directory, name);
    assert.equal((await lstat(file)).mode & 0o7777, 0o600);
    assert.ok((await readFile(file)).equals(fixture.files.get(name)));
  }
  const allBytes = Buffer.concat([
    await readFile(path.join(root, ".pi-career-applications.json")),
    ...await Promise.all((await readdir(directory)).map((name) => readFile(path.join(directory, name)))),
  ]).toString("utf8");
  assert.doesNotMatch(allBytes, new RegExp(root.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(allBytes, /provider response|credential|session\.jsonl|CAREER_CLI_PATH/);
});
