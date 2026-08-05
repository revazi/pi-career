// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { buildJobInput, buildJobMatchInput, buildResumeInput } from "../../src/workflow/core-input.ts";
import { createVacancyEntry } from "../../src/workflow/session-state.ts";
import { uuidSequence } from "./helpers.mjs";

const resume = {
  id: "1".repeat(64), root_id: "2".repeat(64), path: "/synthetic/resume.md", relative_path: "resume.md",
  label: "Synthetic", kind: "original", format: "markdown", modified_at: "2026-08-04T17:56:06.000Z",
  size_bytes: 16, text: "Synthetic resume", text_sha256: "3".repeat(64),
};
const vacancy = createVacancyEntry("Synthetic vacancy", "paste", {
  uuid: uuidSequence(), now: () => new Date("2026-08-04T17:56:06.000Z"),
});

test("workflow builds only the exact versioned Core inputs", () => {
  assert.deepEqual(buildResumeInput(resume), {
    schema_version: "career.resume_input.v1",
    text: "Synthetic resume",
    metadata: { document_id: "1".repeat(64) },
  });
  assert.deepEqual(buildJobInput(vacancy), {
    schema_version: "career.job_input.v1",
    text: "Synthetic vacancy",
    metadata: { document_id: vacancy.state_id },
  });
  assert.deepEqual(buildJobMatchInput(resume, vacancy), {
    schema_version: "career.job_match_input.v1",
    resume: buildResumeInput(resume),
    job: buildJobInput(vacancy),
  });
  assert.deepEqual(Object.keys(buildJobMatchInput(resume, vacancy)).sort(), ["job", "resume", "schema_version"]);
});
