// SPDX-License-Identifier: MIT OR Apache-2.0

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { sha256 } from "./scan.ts";
import { isWithinCoreCharacterLimit } from "./text-limit.ts";
import {
  RESULT_PROJECTION_SCHEMA,
  type ConsentClearEntry,
  type ConsentEntry,
  type LibraryScan,
  type ReconstructedWorkflowState,
  type ResultCardEntry,
  type ResultProjection,
  type VacancyClearEntry,
  type VacancyEntry,
  type WorkflowEntryData,
  WORKFLOW_CUSTOM_TYPE,
  WORKFLOW_STATE_SCHEMA,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CARD_MAX_BYTES = 16_384;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...required].sort().join(",");
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function validBase(value: Record<string, unknown>): boolean {
  return (
    value.schema_version === WORKFLOW_STATE_SCHEMA &&
    typeof value.state_id === "string" &&
    UUID.test(value.state_id) &&
    typeof value.created_at === "string" &&
    ISO_UTC.test(value.created_at) &&
    Number.isFinite(Date.parse(value.created_at))
  );
}

function validFlags(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ["adjusted", "provisional", "close_cluster", "stale"])) {
    return false;
  }
  return [value.adjusted, value.provisional, value.close_cluster, value.stale].every(
    (flag) => typeof flag === "boolean",
  );
}

function validProjection(value: unknown): value is ResultProjection {
  if (!isRecord(value) || !exactKeys(value, ["schema_version", "core_schema_version", "summary", "ui_flags"])) {
    return false;
  }
  if (
    value.schema_version !== RESULT_PROJECTION_SCHEMA ||
    (value.core_schema_version !== "career.resume_analysis.v1" &&
      value.core_schema_version !== "career.job_match.v1") ||
    !isRecord(value.summary) ||
    !validFlags(value.ui_flags)
  ) return false;
  return Buffer.byteLength(JSON.stringify(value), "utf8") <= CARD_MAX_BYTES;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function parseVacancy(value: Record<string, unknown>): VacancyEntry | undefined {
  if (!exactKeys(value, [
    "schema_version", "kind", "state_id", "created_at", "vacancy_label", "vacancy_text",
    "vacancy_text_sha256", "source",
  ])) return undefined;
  if (
    !boundedText(value.vacancy_label, 120) ||
    typeof value.vacancy_text !== "string" ||
    value.vacancy_text.trim().length === 0 ||
    !isWithinCoreCharacterLimit(value.vacancy_text)
  ) return undefined;
  if (!isSha256(value.vacancy_text_sha256) || value.vacancy_text_sha256 !== sha256(value.vacancy_text)) {
    return undefined;
  }
  if (value.source !== "paste" && value.source !== "replace") return undefined;
  return value as unknown as VacancyEntry;
}

function parseVacancyClear(value: Record<string, unknown>): VacancyClearEntry | undefined {
  const keys = ["schema_version", "kind", "state_id", "created_at", "clears_state_id"];
  return exactKeys(value, keys) && isUuid(value.clears_state_id)
    ? value as unknown as VacancyClearEntry
    : undefined;
}

function parseConsent(value: Record<string, unknown>): ConsentEntry | undefined {
  const keys = ["schema_version", "kind", "state_id", "created_at", "scope", "granted"];
  return exactKeys(value, keys) &&
    value.scope === "session_persistence" &&
    typeof value.granted === "boolean"
    ? value as unknown as ConsentEntry
    : undefined;
}

function parseConsentClear(value: Record<string, unknown>): ConsentClearEntry | undefined {
  const keys = ["schema_version", "kind", "state_id", "created_at", "scope", "clears_state_id"];
  return exactKeys(value, keys) &&
    value.scope === "session_persistence" &&
    isUuid(value.clears_state_id)
    ? value as unknown as ConsentClearEntry
    : undefined;
}

function validInputDigests(value: unknown): boolean {
  return isRecord(value) &&
    exactKeys(value, ["resume_text_sha256", "vacancy_text_sha256"]) &&
    isSha256(value.resume_text_sha256) &&
    isSha256(value.vacancy_text_sha256);
}

function parseResultCard(value: Record<string, unknown>): ResultCardEntry | undefined {
  if (!exactKeys(value, [
    "schema_version", "kind", "state_id", "created_at", "workflow", "run_id", "resume_id",
    "resume_label", "resume_path_fingerprint", "input_digests", "projection",
  ])) return undefined;
  if (value.workflow !== "analyze" && value.workflow !== "match") return undefined;
  if (!isUuid(value.run_id) || !isSha256(value.resume_id) || !boundedText(value.resume_label, 120)) {
    return undefined;
  }
  if (!isSha256(value.resume_path_fingerprint) || !validInputDigests(value.input_digests)) {
    return undefined;
  }
  return validProjection(value.projection) ? value as unknown as ResultCardEntry : undefined;
}

export function parseWorkflowEntryData(value: unknown): WorkflowEntryData | undefined {
  if (!isRecord(value) || !validBase(value)) return undefined;
  switch (value.kind) {
    case "vacancy": return parseVacancy(value);
    case "vacancy_clear": return parseVacancyClear(value);
    case "consent": return parseConsent(value);
    case "consent_clear": return parseConsentClear(value);
    case "result_card": return parseResultCard(value);
    default: return undefined;
  }
}

function workflowDataFromEntries(entries: readonly SessionEntry[]): WorkflowEntryData[] {
  const data: WorkflowEntryData[] = [];
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== WORKFLOW_CUSTOM_TYPE) continue;
    const parsed = parseWorkflowEntryData(entry.data);
    if (parsed !== undefined) data.push(parsed);
  }
  return data;
}

export function workflowResultCards(entries: readonly SessionEntry[]): ResultCardEntry[] {
  return workflowDataFromEntries(entries).filter(
    (data): data is ResultCardEntry => data.kind === "result_card",
  );
}

export function reconstructWorkflowState(
  entries: readonly SessionEntry[],
): ReconstructedWorkflowState {
  let vacancy: VacancyEntry | undefined;
  let consent: ConsentEntry | undefined;
  const cards = new Map<string, ResultCardEntry>();

  for (const data of workflowDataFromEntries(entries)) {
    switch (data.kind) {
      case "vacancy":
        vacancy = data;
        break;
      case "vacancy_clear":
        if (vacancy?.state_id === data.clears_state_id) vacancy = undefined;
        break;
      case "consent":
        consent = data;
        break;
      case "consent_clear":
        if (consent?.state_id === data.clears_state_id) consent = undefined;
        break;
      case "result_card":
        cards.set(`${data.workflow}:${data.resume_id}`, data);
        break;
    }
  }

  return {
    ...(vacancy === undefined ? {} : { vacancy }),
    ...(consent === undefined ? {} : { consent }),
    result_cards: [...cards.values()],
  };
}

interface EntryFactoryOptions {
  uuid: () => string;
  now: () => Date;
}

function base(options: EntryFactoryOptions) {
  return {
    schema_version: WORKFLOW_STATE_SCHEMA as typeof WORKFLOW_STATE_SCHEMA,
    state_id: options.uuid(),
    created_at: options.now().toISOString(),
  };
}

export function createVacancyEntry(
  text: string,
  source: "paste" | "replace",
  options: EntryFactoryOptions,
): VacancyEntry {
  const label = text.split("\n").find((line) => line.trim().length > 0)?.trim() || "Current vacancy";
  return {
    ...base(options),
    kind: "vacancy",
    vacancy_label: label.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120),
    vacancy_text: text,
    vacancy_text_sha256: sha256(text),
    source,
  };
}

export function createVacancyClearEntry(
  vacancy: VacancyEntry,
  options: EntryFactoryOptions,
): VacancyClearEntry {
  return { ...base(options), kind: "vacancy_clear", clears_state_id: vacancy.state_id };
}

export function createConsentEntry(
  granted: boolean,
  options: EntryFactoryOptions,
): ConsentEntry {
  return {
    ...base(options),
    kind: "consent",
    scope: "session_persistence",
    granted,
  };
}

export function createConsentClearEntry(
  consent: ConsentEntry,
  options: EntryFactoryOptions,
): ConsentClearEntry {
  return {
    ...base(options),
    kind: "consent_clear",
    scope: "session_persistence",
    clears_state_id: consent.state_id,
  };
}

export function withCurrentStaleness(
  state: ReconstructedWorkflowState,
  scan: LibraryScan,
): ReconstructedWorkflowState {
  const records = new Map(scan.records.map((record) => [record.id, record]));
  const cards = state.result_cards.map((card) => {
    const current = records.get(card.resume_id);
    const resumeStale = current === undefined || current.text_sha256 !== card.input_digests.resume_text_sha256;
    const vacancyStale =
      card.workflow === "match" &&
      state.vacancy?.vacancy_text_sha256 !== card.input_digests.vacancy_text_sha256;
    const stale = resumeStale || vacancyStale;
    return {
      ...card,
      projection: {
        ...card.projection,
        ui_flags: { ...card.projection.ui_flags, stale },
      },
    };
  });
  return { ...state, result_cards: cards };
}
