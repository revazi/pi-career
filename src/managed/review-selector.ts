// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { showDetailText } from "../workflow/detail-viewer.ts";
import type {
  VariantSelectionChange,
  VariantSelectionReview,
} from "./engine.ts";

const CONTINUE = "Continue with selected changes";
const BACK_TO_REVIEW = "Back to reviewed changes";
const CANCEL = "Cancel";

interface ReviewState {
  included: Set<string>;
  noticesReviewed: boolean;
}

type ReviewAction =
  | { kind: "cancel" }
  | { kind: "notices" }
  | { kind: "continue" }
  | { kind: "change"; change: VariantSelectionChange };

type SelectionOutcome =
  | { done: false }
  | { done: true; selection?: string[] };

const REPEAT_SELECTION: SelectionOutcome = { done: false };

function lineRange(change: VariantSelectionChange): string {
  return change.start_line === change.end_line
    ? `line ${change.start_line}`
    : `lines ${change.start_line}-${change.end_line}`;
}

function exactChangeValue(change: VariantSelectionChange): Record<string, unknown> {
  return {
    change_id: change.change_id,
    section: change.section,
    start_line: change.start_line,
    end_line: change.end_line,
    original_text: change.original_text,
    proposed_text: change.proposed_text,
    resume_evidence: change.resume_evidence,
    vacancy_evidence: change.vacancy_evidence,
  };
}

function exactChangeText(change: VariantSelectionChange): string {
  return JSON.stringify(exactChangeValue(change), null, 2);
}

function selectedChangeText(
  change: VariantSelectionChange,
  index: number,
  total: number,
): string {
  return [
    `Change ${index + 1} of ${total}`,
    `ID: ${JSON.stringify(change.change_id)}`,
    `Section: ${JSON.stringify(change.section)}`,
    `Line bounds: ${change.start_line}-${change.end_line}`,
    `Before: ${JSON.stringify(change.original_text)}`,
    `After: ${JSON.stringify(change.proposed_text)}`,
    `Resume evidence (${change.resume_evidence.length}): ${JSON.stringify(change.resume_evidence)}`,
    `Vacancy evidence (${change.vacancy_evidence.length}): ${JSON.stringify(change.vacancy_evidence)}`,
  ].join("\n");
}

function selectedChangesText(
  review: VariantSelectionReview,
  selected: VariantSelectionChange[],
): string {
  return [
    `Authority: ${review.authority}`,
    `Selected changes: ${selected.length}`,
    "",
    selected.map((change, index) => selectedChangeText(change, index, selected.length)).join("\n\n"),
  ].join("\n");
}

function noticeText(review: VariantSelectionReview): string {
  return JSON.stringify({
    authority: review.authority,
    warnings: review.warnings,
    discarded_changes: review.discarded_changes,
  }, null, 2);
}

function changeOption(change: VariantSelectionChange, included: boolean): string {
  return `${change.change_id} • ${change.section} • ${lineRange(change)} • ${included ? "included" : "excluded"}`;
}

function noticesOption(review: VariantSelectionReview, reviewed: boolean): string {
  return `Warnings and discards • ${review.warnings.length} warnings • ${review.discarded_changes.length} discarded • ${reviewed ? "reviewed" : "review required"}`;
}

function changeOptions(
  review: VariantSelectionReview,
  included: Set<string>,
): Map<string, VariantSelectionChange> {
  return new Map(review.changes.map((change) => [
    changeOption(change, included.has(change.change_id)),
    change,
  ]));
}

function selectedAction(
  selected: string | undefined,
  notices: string,
  byOption: Map<string, VariantSelectionChange>,
): ReviewAction {
  const fixed = new Map<string | undefined, ReviewAction>([
    [undefined, { kind: "cancel" }],
    [CANCEL, { kind: "cancel" }],
    [notices, { kind: "notices" }],
    [CONTINUE, { kind: "continue" }],
  ]);
  const change = byOption.get(selected ?? "");
  return fixed.get(selected) ?? (change === undefined ? { kind: "cancel" } : { kind: "change", change });
}

async function nextReviewAction(
  ctx: ExtensionCommandContext,
  review: VariantSelectionReview,
  state: ReviewState,
): Promise<ReviewAction> {
  const notices = noticesOption(review, state.noticesReviewed);
  const byOption = changeOptions(review, state.included);
  const selected = await ctx.ui.select(
    `Career reviewed changes • assisted/non-authoritative • ${state.included.size} selected`,
    [notices, ...byOption.keys(), CONTINUE, CANCEL],
  );
  return selectedAction(selected, notices, byOption);
}

function selectionOptions(wasIncluded: boolean): string[] {
  return wasIncluded
    ? ["Keep included", "Exclude", "Back without changing"]
    : ["Include", "Keep excluded", "Back without changing"];
}

async function exactSelection(
  ctx: ExtensionCommandContext,
  change: VariantSelectionChange,
  included: Set<string>,
): Promise<void> {
  await showDetailText(
    ctx,
    `${change.change_id} • ${change.section} • ${lineRange(change)}`,
    exactChangeText(change),
  );
  const decision = await ctx.ui.select(
    `Explicit selection • ${change.change_id}`,
    selectionOptions(included.has(change.change_id)),
  );
  const decisions = new Map<string | undefined, () => void>([
    ["Include", () => included.add(change.change_id)],
    ["Keep included", () => included.add(change.change_id)],
    ["Exclude", () => included.delete(change.change_id)],
    ["Keep excluded", () => included.delete(change.change_id)],
  ]);
  decisions.get(decision)?.();
}

function completeSelection(
  ctx: ExtensionCommandContext,
  review: VariantSelectionReview,
  state: ReviewState,
): VariantSelectionChange[] | undefined {
  if (!state.noticesReviewed) {
    ctx.ui.notify("Review all Career Core warnings and discarded-change reasons before continuing.", "warning");
    return undefined;
  }
  if (state.included.size === 0) {
    ctx.ui.notify("Include at least one exact canonical change before continuing.", "warning");
    return undefined;
  }
  return review.changes.filter((change) => state.included.has(change.change_id));
}

function prepareOption(count: number): string {
  return `Prepare ${count} selected change ID${count === 1 ? "" : "s"}`;
}

function confirmationOutcome(
  decision: string | undefined,
  prepare: string,
  selected: VariantSelectionChange[],
): SelectionOutcome {
  const outcomes = new Map<string | undefined, SelectionOutcome>([
    [undefined, { done: true }],
    [CANCEL, { done: true }],
    [BACK_TO_REVIEW, REPEAT_SELECTION],
    [prepare, { done: true, selection: selected.map((change) => change.change_id) }],
  ]);
  return outcomes.get(decision) ?? { done: true };
}

async function continueSelection(
  ctx: ExtensionCommandContext,
  review: VariantSelectionReview,
  state: ReviewState,
): Promise<SelectionOutcome> {
  const selected = completeSelection(ctx, review, state);
  if (selected === undefined) return REPEAT_SELECTION;
  await showDetailText(
    ctx,
    `${selected.length} selected change${selected.length === 1 ? "" : "s"} • final review`,
    selectedChangesText(review, selected),
  );
  const prepare = prepareOption(selected.length);
  const decision = await ctx.ui.select(
    "Final explicit selection • nothing runs automatically",
    [prepare, BACK_TO_REVIEW, CANCEL],
  );
  return confirmationOutcome(decision, prepare, selected);
}

async function reviewNotices(
  ctx: ExtensionCommandContext,
  review: VariantSelectionReview,
  state: ReviewState,
): Promise<SelectionOutcome> {
  await showDetailText(ctx, "Warnings and discarded changes", noticeText(review));
  state.noticesReviewed = true;
  return REPEAT_SELECTION;
}

async function reviewChange(
  ctx: ExtensionCommandContext,
  state: ReviewState,
  change: VariantSelectionChange,
): Promise<SelectionOutcome> {
  await exactSelection(ctx, change, state.included);
  return REPEAT_SELECTION;
}

async function applyAction(
  ctx: ExtensionCommandContext,
  review: VariantSelectionReview,
  state: ReviewState,
  action: ReviewAction,
): Promise<SelectionOutcome> {
  const handlers: Record<ReviewAction["kind"], () => Promise<SelectionOutcome>> = {
    cancel: async () => ({ done: true }),
    notices: async () => await reviewNotices(ctx, review, state),
    continue: async () => await continueSelection(ctx, review, state),
    change: async () => await reviewChange(
      ctx,
      state,
      (action as Extract<ReviewAction, { kind: "change" }>).change,
    ),
  };
  return await handlers[action.kind]();
}

function noticesRequired(review: VariantSelectionReview): boolean {
  return [review.warnings.length > 0, review.discarded_changes.length > 0].some(Boolean);
}

function selectableReview(ctx: ExtensionCommandContext, review: VariantSelectionReview): boolean {
  return [ctx.mode === "tui", review.changes.length > 0].every(Boolean);
}

export async function selectVariantChanges(
  ctx: ExtensionCommandContext,
  review: VariantSelectionReview,
): Promise<string[] | undefined> {
  if (!selectableReview(ctx, review)) return undefined;
  const state: ReviewState = {
    included: new Set<string>(),
    noticesReviewed: !noticesRequired(review),
  };
  while (true) {
    const action = await nextReviewAction(ctx, review, state);
    const outcome = await applyAction(ctx, review, state, action);
    if (outcome.done) return outcome.selection;
  }
}

export function materializeEditorText(reviewHandle: string, selectedChangeIds: string[]): string {
  const request = {
    command: "materialize",
    handle: reviewHandle,
    payload: { selected_change_ids: selectedChangeIds },
  };
  return [
    "I explicitly reviewed and selected these canonical Career Core changes in /career-review.",
    "",
    `Call career_run with exactly this request: ${JSON.stringify(request)}`,
    "",
    "Use exactly these selected IDs and the unchanged review handle. Keep the result assisted/non-authoritative. Do not analyze or match it as an original, and do not save or write any file.",
  ].join("\n");
}
