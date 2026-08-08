// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkbenchPrompt, defaultWorkbenchQuestion, validWorkbenchQuestion } from "../../src/workflow/workbench.ts";

const resume = {
  id: "1".repeat(64), root_id: "2".repeat(64), path: "/private/synthetic-resume.pdf",
  relative_path: "synthetic-resume.pdf", label: "Synthetic Resume", kind: "original",
  format: "pdf", modified_at: "2026-08-04T17:56:06.000Z", size_bytes: 1_000,
  text: "Synthetic resume content\nTypeScript testing", text_sha256: "3".repeat(64),
};
const application = {
  schema_version: "pi.career.workflow_state.v1", kind: "application",
  state_id: "00000000-0000-4000-8000-000000000002", created_at: "2026-08-04T17:56:06.000Z",
  application_id: "00000000-0000-4000-8000-000000000003",
  company_label: "Synthetic Company", role_label: "Senior Engineer", status: "preparing",
};
const vacancy = {
  schema_version: "pi.career.workflow_state.v1", kind: "vacancy",
  state_id: "00000000-0000-4000-8000-000000000001", created_at: "2026-08-04T17:56:06.000Z",
  vacancy_label: "Synthetic vacancy", vacancy_text: "Synthetic vacancy\nTesting required",
  vacancy_text_sha256: "4".repeat(64), source: "paste",
};

test("workbench prompt keeps private inputs visible, original immutable, and PDF styling claims bounded", () => {
  const prompt = buildWorkbenchPrompt(resume, vacancy, application, "tailor", "Suggest safe targeted edits.");
  assert.ok(prompt);
  assert.match(prompt, /Suggest safe targeted edits/);
  assert.match(prompt, /Synthetic resume content/);
  assert.match(prompt, /Testing required/);
  assert.match(prompt, /Synthetic Company/);
  assert.match(prompt, /Senior Engineer/);
  assert.doesNotMatch(prompt, new RegExp(application.application_id));
  assert.match(prompt, /original resume is immutable/);
  assert.match(prompt, /cannot inspect its visual layout/);
  assert.match(prompt, /appropriate Career Core review operation/);
  assert.match(prompt, /assisted\/non-authoritative label/);
  assert.doesNotMatch(prompt, /\/private\/synthetic-resume\.pdf/);
});

test("workbench rejects missing vacancy, invalid questions, and oversized composite source", () => {
  assert.equal(buildWorkbenchPrompt(resume, undefined, undefined, "tailor", "Tailor this"), undefined);
  assert.equal(validWorkbenchQuestion("\u0000hidden"), false);
  assert.equal(validWorkbenchQuestion(" "), false);
  assert.equal(buildWorkbenchPrompt(
    { ...resume, text: "x".repeat(80_001) }, undefined, undefined, "improve", "Improve",
  ), undefined);
  assert.match(defaultWorkbenchQuestion("improve"), /keeping its existing structure and styling/);
});
