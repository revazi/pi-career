// SPDX-License-Identifier: MIT OR Apache-2.0

import type { LibraryScan, ResumeFormat, ResumeRecord } from "./types.ts";

export type ApplicationComponentClassification = "Missing" | "Available" | "Stale" | "Unavailable" | "Drifted";
export type ApplicationReadinessLabel = "Incomplete 0/3" | "Incomplete 1/3" | "Incomplete 2/3" | "Ready 3/3";
export type ApplicationPackageEvidence = "valid" | "drifted";

export interface ReadinessSelectedOriginal {
  document_id: string;
  library_root_id: string;
  text_sha256: string;
  format: ResumeFormat;
}

export interface ReadinessResumeArtifact {
  artifact_sha256: string;
}

export interface ReadinessCoverLetterArtifact {
  job_description_sha256: string;
  effective_resume_sha256: string;
}

export interface ValidatedReadinessSnapshot {
  vacancy: null | { content_sha256: string };
  selected_original: ReadinessSelectedOriginal | null;
  resume_artifact: ReadinessResumeArtifact | null;
  cover_letter_artifact: ReadinessCoverLetterArtifact | null;
}

export interface ApplicationReadEvidence {
  vacancy: ApplicationPackageEvidence;
  resume_artifact: ApplicationPackageEvidence;
  cover_letter_artifact: ApplicationPackageEvidence;
  library_scan: LibraryScan;
}

export interface ApplicationReadinessProjection {
  components: {
    job_description: ApplicationComponentClassification;
    resume: ApplicationComponentClassification;
    cover_letter: ApplicationComponentClassification;
  };
  readiness: ApplicationReadinessLabel;
  effective_resume: "original" | "tailored" | null;
}

interface ResumeClassification {
  classification: ApplicationComponentClassification;
  digest?: string;
  effective: "original" | "tailored" | null;
}

function selectedRecord(
  selected: ReadinessSelectedOriginal,
  scan: LibraryScan,
): ResumeRecord | undefined {
  if (scan.total_capped) return undefined;
  const roots = scan.roots.filter((root) => root.root_id === selected.library_root_id);
  const [root] = roots;
  if (roots.length !== 1 || root === undefined || root.stale || root.capped) return undefined;
  const candidates = scan.records.filter(
    (record) => record.root_id === selected.library_root_id && record.id === selected.document_id,
  );
  const [candidate] = candidates;
  if (candidates.length !== 1 || candidate === undefined) return undefined;
  return candidate.kind === "original" && candidate.too_large_for_core_input !== true ? candidate : undefined;
}

function classifyResume(
  snapshot: ValidatedReadinessSnapshot,
  evidence: ApplicationReadEvidence,
): ResumeClassification {
  const selected = snapshot.selected_original;
  if (selected === null) {
    if (snapshot.resume_artifact !== null) throw new TypeError("invalid validated readiness snapshot");
    return { classification: "Missing", effective: null };
  }
  if (snapshot.resume_artifact !== null && evidence.resume_artifact === "drifted") {
    return { classification: "Drifted", effective: null };
  }
  const record = selectedRecord(selected, evidence.library_scan);
  if (record === undefined) return { classification: "Unavailable", effective: null };
  if (record.format !== selected.format || record.text_sha256 !== selected.text_sha256) {
    return { classification: "Stale", effective: null };
  }
  if (snapshot.resume_artifact !== null) {
    return {
      classification: "Available",
      digest: snapshot.resume_artifact.artifact_sha256,
      effective: "tailored",
    };
  }
  return { classification: "Available", digest: selected.text_sha256, effective: "original" };
}

function readinessLabel(available: number): ApplicationReadinessLabel {
  if (available === 3) return "Ready 3/3";
  if (available === 2) return "Incomplete 2/3";
  if (available === 1) return "Incomplete 1/3";
  return "Incomplete 0/3";
}

export function deriveApplicationReadiness(
  snapshot: ValidatedReadinessSnapshot,
  evidence: ApplicationReadEvidence,
): ApplicationReadinessProjection {
  const job = snapshot.vacancy === null
    ? "Missing"
    : evidence.vacancy === "valid" ? "Available" : "Drifted";
  const resume = classifyResume(snapshot, evidence);
  let cover: ApplicationComponentClassification;
  if (snapshot.cover_letter_artifact === null) {
    cover = "Missing";
  } else if (evidence.cover_letter_artifact === "drifted") {
    cover = "Drifted";
  } else if (job !== "Available" || resume.classification !== "Available") {
    cover = "Unavailable";
  } else if (
    snapshot.cover_letter_artifact.job_description_sha256 !== snapshot.vacancy?.content_sha256 ||
    snapshot.cover_letter_artifact.effective_resume_sha256 !== resume.digest
  ) {
    cover = "Stale";
  } else {
    cover = "Available";
  }
  const available = [job, resume.classification, cover].filter((value) => value === "Available").length;
  return {
    components: { job_description: job, resume: resume.classification, cover_letter: cover },
    readiness: readinessLabel(available),
    effective_resume: resume.effective,
  };
}
