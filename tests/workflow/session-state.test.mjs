// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { createResultCard, projectResumeAnalysis } from "../../src/workflow/result-projection.ts";
import { sha256 } from "../../src/workflow/scan.ts";
import {
  createConsentClearEntry,
  createConsentEntry,
  createVacancyClearEntry,
  createVacancyEntry,
  parseWorkflowEntryData,
  reconstructWorkflowState,
  withCurrentStaleness,
} from "../../src/workflow/session-state.ts";
import { CORE_MAX_CHARACTERS } from "../../src/workflow/text-limit.ts";
import { resumeResult, uuidSequence } from "./helpers.mjs";

const now = () => new Date("2026-08-04T17:56:06.000Z");
function entry(data, index) {
  return { type: "custom", customType: "career.workflow", data, id: `e${index}`, parentId: index > 1 ? `e${index - 1}` : null, timestamp: now().toISOString() };
}

function syntheticResume(text = "Synthetic resume") {
  return {
    id: "1".repeat(64), root_id: "2".repeat(64), path: "/synthetic/resume.md", relative_path: "resume.md",
    label: "Synthetic Resume", kind: "original", format: "markdown", modified_at: now().toISOString(),
    size_bytes: text.length, text, text_sha256: (text === "Synthetic resume" ? "3" : "4").repeat(64),
  };
}

test("active-branch replay reconstructs consent, vacancy clears, and compact cards", () => {
  const uuid = uuidSequence();
  const factory = { uuid, now };
  const consent = createConsentEntry(true, factory);
  const consentClear = createConsentClearEntry(consent, factory);
  const denied = createConsentEntry(false, factory);
  const vacancy = createVacancyEntry("Synthetic Engineer\nRequirements", "paste", factory);
  const clear = createVacancyClearEntry(vacancy, factory);
  const replacement = createVacancyEntry("Replacement Synthetic Engineer", "replace", factory);
  const card = createResultCard({
    workflow: "analyze", runId: uuid(), resume: syntheticResume(),
    projection: projectResumeAnalysis(resumeResult()), uuid, now,
  });
  const branch = [consent, consentClear, denied, vacancy, clear, replacement, card].map(entry);
  const state = reconstructWorkflowState(branch);
  assert.equal(state.consent.granted, false);
  assert.equal(state.vacancy.state_id, replacement.state_id);
  assert.equal(state.result_cards.length, 1);
  assert.equal(JSON.stringify(state.result_cards).includes("checks"), false, "full Core checks must not persist");
  assert.ok(branch.every((item) => parseWorkflowEntryData(item.data)));

  const alternate = reconstructWorkflowState([entry(consent, 1), entry(vacancy, 2)]);
  assert.equal(alternate.consent.granted, true);
  assert.equal(alternate.vacancy.state_id, vacancy.state_id);
});

test("current file digests mark reconstructed cards stale without mutating stored data", () => {
  const uuid = uuidSequence();
  const resume = syntheticResume();
  const card = createResultCard({
    workflow: "analyze", runId: uuid(), resume,
    projection: projectResumeAnalysis(resumeResult()), uuid, now,
  });
  const state = reconstructWorkflowState([entry(card, 1)]);
  const changed = { ...resume, text: "Changed", text_sha256: "4".repeat(64) };
  const refreshed = withCurrentStaleness(state, {
    records: [changed], warnings: [], roots: [], total_capped: false,
  });
  assert.equal(refreshed.result_cards[0].projection.ui_flags.stale, true);
  assert.equal(card.projection.ui_flags.stale, false);
});

test("persisted vacancy parsing uses the same Unicode code-point boundary", () => {
  const uuid = uuidSequence();
  const acceptedText = ` ${"😀".repeat(CORE_MAX_CHARACTERS - 2)} `;
  const accepted = createVacancyEntry(acceptedText, "paste", { uuid, now });
  const rejected = createVacancyEntry(`${acceptedText}😀`, "paste", { uuid, now });
  assert.equal(parseWorkflowEntryData(accepted)?.vacancy_text, acceptedText);
  assert.equal(parseWorkflowEntryData(rejected), undefined);
});

test("persisted vacancy parsing rejects matching-digest whitespace-only text", () => {
  const whitespace = " \t\n ";
  const vacancy = createVacancyEntry(whitespace, "paste", { uuid: uuidSequence(), now });
  assert.equal(vacancy.vacancy_text_sha256, sha256(whitespace));
  assert.equal(parseWorkflowEntryData(vacancy), undefined);
  assert.deepEqual(reconstructWorkflowState([entry(vacancy, 1)]), { result_cards: [] });
});

test("invalid custom data is ignored exactly", () => {
  const invalid = {
    schema_version: "pi.career.workflow_state.v1", kind: "consent", state_id: "not-uuid",
    created_at: now().toISOString(), scope: "session_persistence", granted: true, extra: true,
  };
  assert.equal(parseWorkflowEntryData(invalid), undefined);
  assert.deepEqual(reconstructWorkflowState([entry(invalid, 1)]), { result_cards: [] });
});
