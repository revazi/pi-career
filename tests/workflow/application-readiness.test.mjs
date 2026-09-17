// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { deriveApplicationReadiness } from "../../src/workflow/application-workspace.ts";
import {
  SYNTHETIC,
  makeCoverLetter,
  makeSelectedOriginal,
  makeVacancyBinding,
  packageCompletenessFixtures,
  sourceAuthorityFixtures,
} from "./fixtures/persistence-v2.mjs";

function record(overrides = {}) {
  const selected = makeSelectedOriginal();
  return {
    id: selected.document_id,
    root_id: selected.library_root_id,
    path: "/synthetic/not-read/resume.md",
    relative_path: "resume.md",
    label: "Synthetic Resume",
    kind: "original",
    format: selected.format,
    modified_at: SYNTHETIC.createdAt,
    size_bytes: 10,
    text: "Synthetic resume.",
    text_sha256: selected.text_sha256,
    ...overrides,
  };
}

function scan(overrides = {}) {
  const selected = makeSelectedOriginal();
  return {
    records: [record()],
    warnings: [],
    roots: [{
      root_id: selected.library_root_id,
      original_count: 1,
      assisted_variant_count: 0,
      too_large_count: 0,
      stale: false,
      capped: false,
    }],
    total_capped: false,
    ...overrides,
  };
}

function inputs({ job = true, resume = true, tailored = false, cover = false } = {}) {
  const vacancy = job ? makeVacancyBinding() : null;
  const selected = resume ? makeSelectedOriginal() : null;
  const resumeArtifact = tailored ? { artifact_sha256: SYNTHETIC.resumeArtifactSha256 } : null;
  const coverLetter = cover
    ? makeCoverLetter(SYNTHETIC.coverBytes, {
      jobDescriptionSha256: vacancy?.content_sha256 ?? SYNTHETIC.vacancySha256,
      effectiveResumeSha256: resumeArtifact?.artifact_sha256 ?? selected?.text_sha256 ?? SYNTHETIC.originalTextSha256,
    })
    : null;
  return {
    snapshot: {
      vacancy,
      selected_original: selected,
      resume_artifact: resumeArtifact,
      cover_letter_artifact: coverLetter,
    },
    evidence: {
      vacancy: "valid",
      resume_artifact: "valid",
      cover_letter_artifact: "valid",
      library_scan: scan(),
    },
  };
}

function derive(options, mutate = () => {}) {
  const value = inputs(options);
  mutate(value);
  return deriveApplicationReadiness(value.snapshot, value.evidence);
}

test("P3-16 through P3-25: pure readiness implements every reachable availability row", () => {
  const cases = [
    [{ job: false, resume: false }, packageCompletenessFixtures()[0]],
    [{ job: true, resume: false }, packageCompletenessFixtures()[1]],
    [{ job: false, resume: true, cover: true }, packageCompletenessFixtures()[2]],
    [{ job: true, resume: true }, packageCompletenessFixtures()[3]],
    [{ job: true, resume: true, cover: true }, packageCompletenessFixtures()[4]],
  ];
  for (const [options, fixture] of cases) {
    const projection = derive(options);
    assert.deepEqual(projection.components, {
      job_description: fixture.components.job,
      resume: fixture.components.resume,
      cover_letter: fixture.components.cover_letter,
    }, fixture.id);
    assert.equal(projection.readiness, fixture.projection, fixture.id);
  }
});

test("P3-16/P3-20/P3-21: each non-Available component contributes zero", () => {
  const staleResume = derive({ job: true, resume: true, cover: true }, ({ evidence }) => {
    evidence.library_scan.records[0].text_sha256 = "0".repeat(64);
  });
  assert.deepEqual(staleResume.components, {
    job_description: "Available", resume: "Stale", cover_letter: "Unavailable",
  });
  assert.equal(staleResume.readiness, "Incomplete 1/3");

  const driftedJob = derive({ job: true, resume: true, cover: true }, ({ evidence }) => {
    evidence.vacancy = "drifted";
  });
  assert.deepEqual(driftedJob.components, {
    job_description: "Drifted", resume: "Available", cover_letter: "Unavailable",
  });
  assert.equal(driftedJob.readiness, "Incomplete 1/3");

  const driftedCover = derive({ job: true, resume: true, cover: true }, ({ evidence }) => {
    evidence.cover_letter_artifact = "drifted";
  });
  assert.deepEqual(driftedCover.components, {
    job_description: "Available", resume: "Available", cover_letter: "Drifted",
  });
  assert.equal(driftedCover.readiness, "Incomplete 2/3");
});

test("P3-18/P3-22/P3-48: selected originals require one eligible record from a complete current scan", () => {
  const fixtures = new Map(sourceAuthorityFixtures().map((fixture) => [fixture.id, fixture]));
  const cases = [
    ["current-original", () => {}],
    ["changed-original", ({ evidence }) => { evidence.library_scan.records[0].text_sha256 = "0".repeat(64); }],
    ["missing-original", ({ evidence }) => { evidence.library_scan.records = []; }],
    ["capped-scan", ({ evidence }) => { evidence.library_scan.total_capped = true; }],
    ["ambiguous-original", ({ evidence }) => { evidence.library_scan.records.push({ ...evidence.library_scan.records[0] }); }],
    ["assisted-candidate", ({ evidence }) => { evidence.library_scan.records[0].kind = "assisted_variant"; }],
    ["quarantined-candidate", ({ evidence }) => {
      evidence.library_scan.records = [];
      evidence.library_scan.warnings.push({ code: "invalid_assisted_sidecar", root_id: makeSelectedOriginal().library_root_id });
    }],
  ];
  for (const [id, mutate] of cases) {
    const projection = derive({ job: false, resume: true }, mutate);
    assert.equal(projection.components.resume, fixtures.get(id).expected, id);
    assert.equal(projection.effective_resume, fixtures.get(id).effective, id);
  }
});

test("P3-18/P3-22: stale/capped roots, ineligible originals, and format drift fail closed", () => {
  const cases = [
    ["stale-root", "Unavailable", ({ evidence }) => { evidence.library_scan.roots[0].stale = true; }],
    ["capped-root", "Unavailable", ({ evidence }) => { evidence.library_scan.roots[0].capped = true; }],
    ["oversized-original", "Unavailable", ({ evidence }) => {
      evidence.library_scan.records[0].too_large_for_core_input = true;
    }],
    ["changed-format", "Stale", ({ evidence }) => { evidence.library_scan.records[0].format = "text"; }],
  ];
  for (const [id, expected, mutate] of cases) {
    assert.equal(derive({ job: false, resume: true }, mutate).components.resume, expected, id);
  }
});

test("P3-21/P3-23: exact tailored evidence selects tailored and package drift never falls back", () => {
  const available = derive({ job: true, resume: true, tailored: true });
  assert.equal(available.components.resume, "Available");
  assert.equal(available.effective_resume, "tailored");

  const drifted = derive({ job: true, resume: true, tailored: true }, ({ evidence }) => {
    evidence.resume_artifact = "drifted";
  });
  assert.equal(drifted.components.resume, "Drifted");
  assert.equal(drifted.effective_resume, null);
});

test("P3-20: a locally valid cover resolves unavailable before stale, then exact dependency equality", () => {
  const unavailable = derive({ job: false, resume: true, cover: true }, ({ snapshot }) => {
    snapshot.cover_letter_artifact.job_description_sha256 = "0".repeat(64);
  });
  assert.equal(unavailable.components.cover_letter, "Unavailable");

  const stale = derive({ job: true, resume: true, cover: true }, ({ snapshot }) => {
    snapshot.cover_letter_artifact.effective_resume_sha256 = "0".repeat(64);
  });
  assert.equal(stale.components.cover_letter, "Stale");
  assert.equal(stale.readiness, "Incomplete 2/3");

  assert.equal(derive({ job: true, resume: true, cover: true }).components.cover_letter, "Available");
});

test("P3-21: an artifact without a selected original yields no component projection", () => {
  const value = inputs({ job: true, resume: false });
  value.snapshot.resume_artifact = { artifact_sha256: SYNTHETIC.resumeArtifactSha256 };
  assert.throws(
    () => deriveApplicationReadiness(value.snapshot, value.evidence),
    { name: "TypeError", message: "invalid validated readiness snapshot" },
  );
});

test("P3-16/P3-33: derivation is deterministic, mutation-free, and returns no digest or document", () => {
  const value = inputs({ job: true, resume: true, tailored: true, cover: true });
  const before = structuredClone(value);
  const first = deriveApplicationReadiness(value.snapshot, value.evidence);
  assert.deepEqual(value, before);
  assert.deepEqual(deriveApplicationReadiness(value.snapshot, value.evidence), first);
  assert.doesNotMatch(JSON.stringify(first), /sha256|Synthetic resume|document_id|root_id/);
});
