// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ResumeRecord, VacancyEntry } from "./types.ts";

export interface ResumeCoreInput {
  schema_version: "career.resume_input.v1";
  text: string;
  metadata: { document_id: string };
}

export interface JobCoreInput {
  schema_version: "career.job_input.v1";
  text: string;
  metadata: { document_id: string };
}

export interface JobMatchCoreInput {
  schema_version: "career.job_match_input.v1";
  resume: ResumeCoreInput;
  job: JobCoreInput;
}

export function buildResumeInput(resume: ResumeRecord): ResumeCoreInput {
  return {
    schema_version: "career.resume_input.v1",
    text: resume.text,
    metadata: { document_id: resume.id },
  };
}

export function buildJobInput(vacancy: VacancyEntry): JobCoreInput {
  return {
    schema_version: "career.job_input.v1",
    text: vacancy.vacancy_text,
    metadata: { document_id: vacancy.state_id },
  };
}

export function buildJobMatchInput(
  resume: ResumeRecord,
  vacancy: VacancyEntry,
): JobMatchCoreInput {
  return {
    schema_version: "career.job_match_input.v1",
    resume: buildResumeInput(resume),
    job: buildJobInput(vacancy),
  };
}

export function serializeCoreInput(value: ResumeCoreInput | JobCoreInput | JobMatchCoreInput): string {
  return JSON.stringify(value);
}
