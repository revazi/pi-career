// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const FIXTURE_OWNERSHIP = Object.freeze({
  "state-v2-canonical": ["P3-08", "P3-09", "P3-47"],
  "mixed-chain": ["P3-04", "P3-08", "P3-09", "P3-10"],
  "historical-references": ["P3-04", "P3-20", "P3-21", "P3-43", "P3-47"],
  "cover-letter-reference": ["P3-19", "P3-20", "P3-21", "P3-44"],
  "package-completeness": ["P3-16", "P3-17", "P3-18", "P3-19", "P3-20", "P3-21", "P3-22", "P3-23", "P3-24", "P3-25"],
  "source-authority": ["P3-18", "P3-21", "P3-22", "P3-23", "P3-48"],
  "read-races-and-privacy": ["P3-33", "P3-37", "P3-39", "P3-43", "P3-44"],
  "transaction-orphans": ["P3-40", "P3-41"],
});

export const SYNTHETIC = Object.freeze({
  rootId: "00000000-0000-4000-8000-000000000099",
  applicationId: "00000000-0000-4000-8000-000000000001",
  vacancyStateId: "00000000-0000-4000-8000-000000000080",
  createdAt: "2026-08-12T00:00:00.000Z",
  companyLabel: "Synthetic Company",
  roleLabel: "Synthetic Engineer",
  vacancyBytes: Buffer.from("Synthetic job description."),
  originalBytes: Buffer.from("Synthetic original resume."),
  resumeBytes: Buffer.from("Synthetic assisted resume."),
  coverBytes: Buffer.from("Synthetic user-authored letter."),
  privateSentinel: "SYNTHETIC_PRIVATE_PERSISTENCE_SENTINEL",
});

export function canonicalJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function stateName(sequence) {
  return `.pi-career-state-${String(sequence).padStart(6, "0")}.json`;
}

export function makeRootMarker() {
  return {
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: SYNTHETIC.rootId,
    created_at: SYNTHETIC.createdAt,
  };
}

export function makeManifest() {
  return {
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: SYNTHETIC.applicationId,
    root_id: SYNTHETIC.rootId,
    application_created_at: SYNTHETIC.createdAt,
    workspace_created_at: SYNTHETIC.createdAt,
  };
}

export function makeIdentity() {
  return {
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: SYNTHETIC.applicationId,
    company_label: SYNTHETIC.companyLabel,
    role_label: SYNTHETIC.roleLabel,
    created_at: SYNTHETIC.createdAt,
  };
}

export function makeVacancyBinding(bytes = SYNTHETIC.vacancyBytes, relativePath = "vacancy.md") {
  return {
    relative_path: relativePath,
    content_sha256: sha256(bytes),
    utf8_bytes: bytes.length,
    source_state_id: SYNTHETIC.vacancyStateId,
  };
}

export function makeSelectedOriginal(bytes = SYNTHETIC.originalBytes) {
  return {
    document_id: sha256(Buffer.from("synthetic-document-id")),
    library_root_id: sha256(Buffer.from("synthetic-library-root-id")),
    text_sha256: sha256(bytes),
    format: "markdown",
  };
}

export function makeAssistedSidecar(
  artifactBytes = SYNTHETIC.resumeBytes,
  selectedOriginal = makeSelectedOriginal(),
) {
  return {
    schema_version: "pi.career.assisted_variant_meta.v2",
    kind: "assisted_variant",
    authority: "assisted_non_authoritative",
    base_document_id: selectedOriginal.document_id,
    base_text_sha256: selectedOriginal.text_sha256,
    artifact_sha256: sha256(artifactBytes),
    created_at: "2026-08-12T00:00:01.000Z",
  };
}

export function makeResumeArtifact(
  artifactBytes = SYNTHETIC.resumeBytes,
  sidecarBytes = canonicalJson(makeAssistedSidecar(artifactBytes)),
) {
  return {
    relative_path: "resume.md",
    artifact_sha256: sha256(artifactBytes),
    sidecar_relative_path: "resume.pi-career.json",
    sidecar_sha256: sha256(sidecarBytes),
  };
}

export function makeCoverLetter(
  bytes = SYNTHETIC.coverBytes,
  {
    relativePath = "cover-letter.md",
    format = "markdown",
    authority = "user_authored",
    jobDescriptionSha256 = sha256(SYNTHETIC.vacancyBytes),
    effectiveResumeSha256 = sha256(SYNTHETIC.originalBytes),
  } = {},
) {
  return {
    relative_path: relativePath,
    artifact_sha256: sha256(bytes),
    utf8_bytes: bytes.length,
    format,
    authority,
    job_description_sha256: jobDescriptionSha256,
    effective_resume_sha256: effectiveResumeSha256,
  };
}

export function makeState(version, {
  sequence,
  parentSha256,
  status = "preparing",
  vacancy = null,
  selectedOriginal = null,
  resumeArtifact = null,
  coverLetterArtifact = null,
  updatedAt = new Date(Date.parse(SYNTHETIC.createdAt) + sequence * 1_000).toISOString(),
} = {}) {
  const shared = {
    schema_version: `pi.career.application_state.v${version}`,
    kind: "application_state_revision",
    application_id: SYNTHETIC.applicationId,
    sequence,
    parent_sha256: parentSha256,
    status,
    vacancy,
    selected_original: selectedOriginal,
    resume_artifact: resumeArtifact,
  };
  if (version === 1) return { ...shared, updated_at: updatedAt };
  return { ...shared, cover_letter_artifact: coverLetterArtifact, updated_at: updatedAt };
}

export function buildChain(specifications, { manifest = makeManifest() } = {}) {
  const manifestBytes = canonicalJson(manifest);
  let parentSha256 = sha256(manifestBytes);
  const revisions = specifications.map((specification, index) => {
    const sequence = index + 1;
    const value = makeState(specification.version, {
      sequence,
      parentSha256,
      ...specification,
    });
    const bytes = canonicalJson(value);
    parentSha256 = sha256(bytes);
    return { name: stateName(sequence), value, bytes };
  });
  return { manifest, manifestBytes, revisions };
}

function replaceRevision(chain, index, value, name = chain.revisions[index].name) {
  const revisions = chain.revisions.map((revision, revisionIndex) => revisionIndex === index
    ? { name, value, bytes: Buffer.isBuffer(value) ? value : canonicalJson(value) }
    : revision);
  return { ...chain, revisions };
}

export function mixedChainFixtures() {
  const allV1 = buildChain([{ version: 1 }, { version: 1 }]);
  const allV2 = buildChain([{ version: 2 }, { version: 2 }]);
  const transition = buildChain([{ version: 1 }, { version: 2 }]);
  const downgrade = buildChain([{ version: 2 }, { version: 1 }]);

  const gapBase = buildChain([{ version: 1 }, { version: 2 }]);
  const gap = replaceRevision(gapBase, 1, gapBase.revisions[1].value, stateName(3));

  const mismatchBase = buildChain([{ version: 1 }, { version: 2 }]);
  const sequenceMismatch = replaceRevision(mismatchBase, 1, {
    ...mismatchBase.revisions[1].value,
    sequence: 3,
  });

  const parentBase = buildChain([{ version: 1 }, { version: 2 }]);
  const badParent = replaceRevision(parentBase, 1, {
    ...parentBase.revisions[1].value,
    parent_sha256: "f".repeat(64),
  });

  const unsupportedBase = buildChain([{ version: 1 }, { version: 2 }]);
  const unsupported = replaceRevision(unsupportedBase, 1, {
    ...unsupportedBase.revisions[1].value,
    schema_version: "pi.career.application_state.v99",
  });

  const malformedBase = buildChain([{ version: 1 }, { version: 2 }]);
  const malformed = replaceRevision(
    malformedBase,
    1,
    Buffer.from('{"schema_version":"pi.career.application_state.v99",'),
  );

  return [
    { id: "all-v1", expected: "valid", chain: allV1 },
    { id: "all-v2", expected: "valid", chain: allV2 },
    { id: "v1-to-v2", expected: "valid", chain: transition },
    { id: "v2-to-v1", expected: "drifted", chain: downgrade },
    { id: "gap", expected: "drifted", chain: gap },
    { id: "embedded-sequence-mismatch", expected: "drifted", chain: sequenceMismatch },
    { id: "bad-parent", expected: "drifted", chain: badParent },
    { id: "canonical-unsupported", expected: "unsupported", chain: unsupported },
    { id: "malformed-future-looking", expected: "drifted", chain: malformed },
  ];
}

export function canonicalStateFixtures() {
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const coverLetterArtifact = makeCoverLetter();
  return [
    { id: "sequence-1-v2", chain: buildChain([{ version: 2 }]), files: new Map() },
    { id: "v1-null-cover-transition", chain: buildChain([{ version: 1 }, { version: 2 }]), files: new Map() },
    {
      id: "cover-introduction-transition",
      chain: buildChain([
        { version: 1, vacancy, selectedOriginal },
        { version: 2, vacancy, selectedOriginal, coverLetterArtifact },
      ]),
      files: new Map([
        ["vacancy.md", SYNTHETIC.vacancyBytes],
        ["cover-letter.md", SYNTHETIC.coverBytes],
      ]),
    },
  ];
}

export function stateBoundaryFixtures() {
  const base = buildChain([{ version: 2 }]);
  const rawState = (length) => ({
    ...base,
    revisions: [{ ...base.revisions[0], bytes: Buffer.alloc(length, 0x20) }],
  });
  return [
    { id: "metadata-below-limit", expected: "drifted", chain: rawState(16_383) },
    { id: "metadata-at-limit", expected: "drifted", chain: rawState(16_384) },
    { id: "metadata-above-limit", expected: "over_limit", chain: rawState(16_385) },
    { id: "revisions-at-limit", expected: "valid", chain: buildChain(Array.from({ length: 64 }, () => ({ version: 2 }))) },
    { id: "revisions-above-limit", expected: "over_limit", chain: buildChain(Array.from({ length: 65 }, () => ({ version: 2 }))) },
  ];
}

export function historicalReferenceFixtures() {
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const coverLetterArtifact = makeCoverLetter();
  const carried = buildChain([
    { version: 2, vacancy, selectedOriginal },
    { version: 2, vacancy, selectedOriginal, coverLetterArtifact },
    { version: 2, vacancy, selectedOriginal, coverLetterArtifact },
  ]);
  const cleared = buildChain([
    { version: 2, vacancy, selectedOriginal },
    { version: 2, vacancy, selectedOriginal, coverLetterArtifact },
    { version: 2 },
  ]);
  const historicalOriginal = buildChain([
    { version: 2, selectedOriginal },
    { version: 2 },
  ]);
  const conflictingPath = buildChain([
    { version: 2, vacancy },
    { version: 2, vacancy: { ...vacancy, content_sha256: "e".repeat(64) } },
  ]);
  const managedFiles = new Map([
    ["vacancy.md", SYNTHETIC.vacancyBytes],
    ["cover-letter.md", SYNTHETIC.coverBytes],
  ]);
  return [
    { id: "carried-managed-references", expected: "valid", chain: carried, files: managedFiles },
    { id: "cleared-current-references", expected: "valid", chain: cleared, files: managedFiles },
    { id: "absent-historical-external-original", expected: "valid", chain: historicalOriginal, files: new Map() },
    { id: "missing-historical-managed-file", expected: "drifted", chain: carried, files: managedFiles, omit: ["vacancy.md"] },
    { id: "changed-historical-managed-file", expected: "drifted", chain: carried, files: managedFiles, change: ["vacancy.md"] },
    { id: "conflicting-path-reuse", expected: "drifted", chain: conflictingPath, files: new Map([["vacancy.md", SYNTHETIC.vacancyBytes]]) },
  ];
}

export function coverLetterReferenceFixtures() {
  const one = Buffer.from("x");
  const atLimit = Buffer.alloc(262_144, 0x78);
  const aboveLimit = Buffer.alloc(262_145, 0x78);
  const cases = [
    { id: "markdown-first", bytes: SYNTHETIC.coverBytes, binding: makeCoverLetter(), expected: "valid" },
    { id: "text-first", bytes: one, binding: makeCoverLetter(one, { relativePath: "cover-letter.txt", format: "text" }), expected: "valid" },
    { id: "markdown-numbered", bytes: one, binding: makeCoverLetter(one, { relativePath: "cover-letter-000003.md" }), expected: "valid" },
    { id: "empty", bytes: Buffer.alloc(0), binding: makeCoverLetter(Buffer.alloc(0)), expected: "drifted" },
    { id: "one-byte", bytes: one, binding: makeCoverLetter(one), expected: "valid" },
    { id: "at-byte-limit", bytes: atLimit, binding: makeCoverLetter(atLimit), expected: "valid" },
    { id: "above-byte-limit", bytes: aboveLimit, binding: makeCoverLetter(aboveLimit), expected: "over_limit" },
    { id: "bad-authority", bytes: one, binding: makeCoverLetter(one, { authority: "assisted" }), expected: "drifted" },
    { id: "bad-format", bytes: one, binding: makeCoverLetter(one, { format: "text" }), expected: "drifted" },
    { id: "bad-path", bytes: one, binding: makeCoverLetter(one, { relativePath: "../cover-letter.md" }), expected: "drifted" },
    { id: "bad-hash", bytes: one, binding: { ...makeCoverLetter(one), artifact_sha256: "0".repeat(64) }, expected: "drifted" },
    { id: "stale-job-dependency", bytes: one, binding: makeCoverLetter(one, { jobDescriptionSha256: "0".repeat(64) }), expected: "Stale" },
    { id: "stale-resume-dependency", bytes: one, binding: makeCoverLetter(one, { effectiveResumeSha256: "0".repeat(64) }), expected: "Stale" },
  ];
  return cases;
}

export function packageCompletenessFixtures() {
  return [
    ["Missing", "Missing", "Missing", "Incomplete 0/3"],
    ["Available", "Missing", "Missing", "Incomplete 1/3"],
    ["Missing", "Available", "Unavailable", "Incomplete 1/3"],
    ["Available", "Available", "Missing", "Incomplete 2/3"],
    ["Available", "Available", "Available", "Ready 3/3"],
    ["Available", "Stale", "Unavailable", "Incomplete 1/3"],
    ["Drifted", "Available", "Unavailable", "Incomplete 1/3"],
    ["Available", "Unavailable", "Drifted", "Incomplete 1/3"],
  ].map(([job, resume, coverLetter, projection], index) => ({
    id: `completeness-${index}`,
    components: { job, resume, cover_letter: coverLetter },
    projection,
    lifecycles: ["preparing", "applied", "interviewing", "closed"],
    matchResult: null,
  }));
}

export function sourceAuthorityFixtures() {
  return [
    { id: "current-original", evidence: "unique-current-original", expected: "Available", effective: "original" },
    { id: "changed-original", evidence: "same-identity-different-digest", expected: "Stale", effective: null },
    { id: "missing-original", evidence: "candidate-absent", expected: "Unavailable", effective: null },
    { id: "capped-scan", evidence: "scan-cap-reached", expected: "Unavailable", effective: null },
    { id: "ambiguous-original", evidence: "duplicate-identity", expected: "Unavailable", effective: null },
    { id: "assisted-candidate", evidence: "assisted-non-authoritative", expected: "Unavailable", effective: null },
    { id: "quarantined-candidate", evidence: "invalid-assisted-sidecar", expected: "Unavailable", effective: null },
    { id: "valid-tailored", evidence: "valid-artifact-sidecar-source", expected: "Available", effective: "tailored" },
    { id: "source-mismatched-tailored", evidence: "sidecar-source-mismatch", expected: "Drifted", effective: null },
  ];
}

export function readRaceAndPrivacyFixtures() {
  return {
    sentinel: SYNTHETIC.privateSentinel,
    raceTargets: [
      "state-revision", "historical-artifact", "current-artifact", "selected-original", "application-entry-set",
    ],
    forbiddenSinks: [
      "adapter-error", "log", "session-entry", "provider-message", "model-context", "telemetry",
    ],
    expectedError: "workspace_drift",
  };
}

export function transactionOrphanFixtures() {
  const coverBytes = SYNTHETIC.coverBytes;
  const exactState = buildChain([{ version: 2 }]);
  return [
    {
      id: "artifact-without-state",
      expected: "orphan-not-current",
      files: new Map([["cover-letter.md", coverBytes]]),
      chain: buildChain([{ version: 2 }]),
    },
    {
      id: "exact-state-after-ambiguous-failure",
      expected: "exact-commit-idempotent",
      files: new Map([[exactState.revisions[0].name, exactState.revisions[0].bytes]]),
      chain: exactState,
    },
  ];
}

export function completeApplicationFixture(chain = buildChain([{ version: 1 }]), additionalFiles = new Map()) {
  const rootMarker = makeRootMarker();
  const identity = makeIdentity();
  const files = new Map([
    ["application.json", chain.manifestBytes],
    [".pi-career-identity.json", canonicalJson(identity)],
    ...chain.revisions.map((revision) => [revision.name, revision.bytes]),
    ...additionalFiles,
  ]);
  return { rootMarker, identity, chain, files };
}

export async function materializeApplicationFixture(fixture = completeApplicationFixture()) {
  for (const name of fixture.files.keys()) {
    if (name.length === 0 || name === "." || name === ".." || path.basename(name) !== name ||
      path.isAbsolute(name) || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new TypeError("unsafe synthetic fixture filename");
    }
  }
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-persistence-v2-")));
  await chmod(root, 0o700);
  await writeFile(path.join(root, ".pi-career-applications.json"), canonicalJson(fixture.rootMarker), { mode: 0o600 });
  const directory = path.join(root, `synthetic-company--synthetic-engineer--${SYNTHETIC.applicationId}`);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  for (const [name, bytes] of fixture.files) {
    await writeFile(path.join(directory, name), bytes, { mode: 0o600 });
    await chmod(path.join(directory, name), 0o600);
  }
  return { root, directory };
}
