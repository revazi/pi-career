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
  const prompt = buildWorkbenchPrompt(
    resume,
    vacancy,
    application,
    "tailor",
    "Suggest safe targeted edits.",
    "~/synthetic/variants",
  );
  assert.ok(prompt);
  assert.match(prompt, /Suggest safe targeted edits/);
  assert.match(prompt, /Synthetic resume content/);
  assert.match(prompt, /Testing required/);
  assert.match(prompt, /Synthetic Company/);
  assert.match(prompt, /Senior Engineer/);
  assert.doesNotMatch(prompt, new RegExp(application.application_id));
  assert.match(prompt, /original resume is immutable/);
  assert.match(prompt, /cannot inspect its visual layout/);
  assert.match(prompt, /Call career_run "variant-review" once/);
  assert.match(prompt, /do not call career_run "materialize"/);
  assert.doesNotMatch(prompt, /Only after a later explicit selection/);
  assert.match(prompt, /authority labels/);
  assert.match(prompt, /local_save_guidance/);
  assert.match(prompt, /preferred_variants_directory/);
  assert.match(prompt, /~\/synthetic\/variants/);
  assert.match(prompt, /destination guidance only/);
  assert.match(prompt, /require separate explicit approval/);
  assert.doesNotMatch(prompt, /\/private\/synthetic-resume\.pdf/);
});

test("guided modes require complete baselines and the matching Career Core review stage", () => {
  const markdown = { ...resume, format: "markdown", path: "/private/synthetic-resume.md" };
  const explain = buildWorkbenchPrompt(markdown, undefined, undefined, "explain", "Explain the score.");
  const plan = buildWorkbenchPrompt(markdown, undefined, undefined, "plan", "Plan improvements.");
  const rewrite = buildWorkbenchPrompt(markdown, undefined, undefined, "rewrite", "Interview me before rewriting.");
  const replacements = buildWorkbenchPrompt(markdown, undefined, undefined, "replacements", "Draft replacements.");
  const tailored = buildWorkbenchPrompt(markdown, vacancy, application, "tailor", "Create a variation.");

  assert.match(explain, /complete result, not a prior score or card/);
  assert.match(explain, /then stop/);
  assert.match(plan, /Call career_run "suggestion-review" once/);
  assert.match(plan, /source_target must be verbatim/);
  assert.match(plan, /at most three advisory suggestions/);
  assert.match(rewrite, /Ask at most five factual questions/);
  assert.match(rewrite, /Do not draft or review wording/);
  assert.match(rewrite, /Later, use only explicit answers/);
  assert.match(rewrite, /call career_run "replacement-review" once/);
  assert.match(replacements, /call career_run "replacement-review" once/);
  assert.match(replacements, /do not claim selection/);
  assert.match(tailored, /Call career_run "variant-review" once/);
  assert.match(tailored, /select retained IDs, then stop/);
  assert.match(tailored, /Only after later selection/);
  assert.match(tailored, /call career_run "materialize"/);
  assert.match(tailored, /Do not use file-writing tools/);
  for (const prompt of [plan, rewrite, replacements, tailored]) {
    assert.match(prompt, /prefer one line, never a label/);
    assert.match(prompt, /Do not auto-repair or retry discards/);
    assert.match(prompt, /Do not reprint an unchanged review-embedded baseline/);
  }
});

test("workbench rejects missing vacancy, invalid questions, and oversized composite source", () => {
  assert.equal(buildWorkbenchPrompt(resume, undefined, undefined, "tailor", "Tailor this"), undefined);
  assert.doesNotMatch(
    buildWorkbenchPrompt(resume, undefined, undefined, "plan", "Improve", "bad\npath"),
    /"local_save_guidance"/,
  );
  assert.equal(validWorkbenchQuestion("\u0000hidden"), false);
  assert.equal(validWorkbenchQuestion(" "), false);
  assert.equal(buildWorkbenchPrompt(
    { ...resume, text: "x".repeat(80_001) }, undefined, undefined, "plan", "Improve",
  ), undefined);
  assert.match(defaultWorkbenchQuestion("plan"), /reviewed improvement plan/);
  assert.match(defaultWorkbenchQuestion("rewrite"), /ask a small batch of factual questions/);
  assert.match(defaultWorkbenchQuestion("explain"), /complete resume-readiness analysis/);
  assert.match(defaultWorkbenchQuestion("replacements"), /exact replacements/);
  assert.match(defaultWorkbenchQuestion("tailor"), /reviewed variation/);
});
