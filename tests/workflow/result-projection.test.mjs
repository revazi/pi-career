// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { projectJobMatch, projectResumeAnalysis } from "../../src/workflow/result-projection.ts";
import { matchResult, resumeResult } from "./helpers.mjs";

test("analyze projection uses exact v1 fields and derives only UI badges", () => {
  const result = resumeResult(77, true);
  const before = structuredClone(result);
  const projection = projectResumeAnalysis(result);
  assert.equal(projection.core_schema_version, "career.resume_analysis.v1");
  assert.equal(projection.summary.overall_score, 77);
  assert.deepEqual(projection.summary.confidence_context, {
    parse_confidence: { label: "high", score: 95 },
  });
  assert.equal(projection.ui_flags.adjusted, true);
  assert.equal(Object.hasOwn(projection.summary, "raw_score"), false);
  assert.deepEqual(result, before, "authoritative in-memory result must remain unchanged");
  assert.equal(result.checks[0].raw_score, 82);
  assert.equal(result.checks[0].score, 77);
});

test("match projection preserves recommendation/confidence labels without invented scores", () => {
  const result = matchResult(68, "improve_first", true, true);
  const projection = projectJobMatch(result);
  assert.equal(projection.core_schema_version, "career.job_match.v1");
  assert.equal(projection.summary.overall_score, 68);
  assert.deepEqual(projection.summary.recommendation, { label: "improve_first", status: "provisional" });
  assert.equal(projection.ui_flags.provisional, true);
  assert.equal(projection.ui_flags.adjusted, true);
  assert.equal(Object.hasOwn(projection.summary, "raw_score"), false);
  assert.equal(result.category_results[0].raw_score, 73);
  assert.equal(result.category_results[0].score, 68);
});

test("unexpected schemas fail closed", () => {
  assert.throws(() => projectResumeAnalysis({ schema_version: "synthetic.v1" }), /core_result_invalid/);
  assert.throws(() => projectJobMatch({ schema_version: "synthetic.v1" }), /core_result_invalid/);
});
