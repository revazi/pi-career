// SPDX-License-Identifier: MIT OR Apache-2.0

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { parseWorkflowEntryData } from "./session-state.ts";
import { WORKFLOW_CUSTOM_TYPE } from "./types.ts";

export const APPLICATION_ATTACHMENT_CUSTOM_TYPE = "career.application_attachment";
export const APPLICATION_ASSISTANCE_CUSTOM_TYPE = "career.application_assistance";
export const CAREER_ASSISTANCE_HANDOFF =
  "/skill:career-core Use career_run for the attached application. Start with {\"command\":\"context\"}.";
const APPLICATION_ATTACHMENT_SCHEMA = "pi.career.application_attachment.v1";
const APPLICATION_ASSISTANCE_SCHEMA = "pi.career.application_assistance.v1";

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface ApplicationAttachmentEntry {
  schema_version: typeof APPLICATION_ATTACHMENT_SCHEMA;
  kind: "application_attachment";
  attachment_id: string;
  application_id: string;
  root_id: string;
  root_created_at: string;
  application_created_at: string;
  workspace_created_at: string;
}

export interface ApplicationDetachmentEntry {
  schema_version: typeof APPLICATION_ATTACHMENT_SCHEMA;
  kind: "application_detachment";
  detachment_id: string;
  attachment_id: string;
}

export type ApplicationAttachmentEntryData = ApplicationAttachmentEntry | ApplicationDetachmentEntry;

export interface ApplicationAssistanceActivationEntry {
  schema_version: typeof APPLICATION_ASSISTANCE_SCHEMA;
  kind: "application_assistance_activation";
  activation_id: string;
  attachment_id: string;
  application_id: string;
}

export interface ApplicationSessionRecords {
  integrity: "valid" | "invalid";
  used_application_id?: string;
  attachment?: ApplicationAttachmentEntry;
  activation?: ApplicationAssistanceActivationEntry;
}

interface RecordFactoryOptions {
  uuid: () => string;
}

export interface ApplicationAttachmentPointer {
  applicationId: string;
  rootId: string;
  rootCreatedAt: string;
  applicationCreatedAt: string;
  workspaceCreatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOrderedKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && LOWERCASE_UUID.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function parseAttachment(value: Record<string, unknown>): ApplicationAttachmentEntry | undefined {
  if (!hasOrderedKeys(value, [
    "schema_version", "kind", "attachment_id", "application_id", "root_id",
    "root_created_at", "application_created_at", "workspace_created_at",
  ])) return undefined;
  const validIds = [value.attachment_id, value.application_id, value.root_id].every(isUuid);
  const validTimes = [value.root_created_at, value.application_created_at, value.workspace_created_at]
    .every(isTimestamp);
  return validIds && validTimes ? value as unknown as ApplicationAttachmentEntry : undefined;
}

function parseDetachment(value: Record<string, unknown>): ApplicationDetachmentEntry | undefined {
  const validKeys = hasOrderedKeys(
    value,
    ["schema_version", "kind", "detachment_id", "attachment_id"],
  );
  return validKeys && [value.detachment_id, value.attachment_id].every(isUuid)
    ? value as unknown as ApplicationDetachmentEntry
    : undefined;
}

export function parseApplicationAttachmentEntryData(
  value: unknown,
): ApplicationAttachmentEntryData | undefined {
  if (!isRecord(value) || value.schema_version !== APPLICATION_ATTACHMENT_SCHEMA) return undefined;
  if (value.kind === "application_attachment") return parseAttachment(value);
  if (value.kind === "application_detachment") return parseDetachment(value);
  return undefined;
}

export function parseApplicationAssistanceEntryData(
  value: unknown,
): ApplicationAssistanceActivationEntry | undefined {
  if (!isRecord(value) || !hasOrderedKeys(value, [
    "schema_version", "kind", "activation_id", "attachment_id", "application_id",
  ])) return undefined;
  const validConstants = value.schema_version === APPLICATION_ASSISTANCE_SCHEMA &&
    value.kind === "application_assistance_activation";
  return validConstants && [value.activation_id, value.attachment_id, value.application_id].every(isUuid)
    ? value as unknown as ApplicationAssistanceActivationEntry
    : undefined;
}

function invalidRecords(): ApplicationSessionRecords {
  return { integrity: "invalid" };
}

function relevantRecordId(
  data: ApplicationAttachmentEntryData | ApplicationAssistanceActivationEntry,
): string {
  if (data.kind === "application_attachment") return data.attachment_id;
  if (data.kind === "application_detachment") return data.detachment_id;
  return data.activation_id;
}

interface SessionClaims {
  usedApplicationId?: string;
}

type EntryClaim =
  | { kind: "ignore" }
  | { kind: "invalid" }
  | { kind: "record"; recordId?: string; applicationId?: string };

function attachmentClaim(value: unknown): EntryClaim {
  const data = parseApplicationAttachmentEntryData(value);
  if (data === undefined) return { kind: "invalid" };
  return {
    kind: "record",
    recordId: relevantRecordId(data),
    ...(data.kind === "application_attachment" ? { applicationId: data.application_id } : {}),
  };
}

function assistanceClaim(value: unknown): EntryClaim {
  const data = parseApplicationAssistanceEntryData(value);
  return data === undefined
    ? { kind: "invalid" }
    : { kind: "record", recordId: data.activation_id, applicationId: data.application_id };
}

function workflowClaim(value: unknown): EntryClaim {
  if (!isRecord(value) || value.kind !== "application") return { kind: "ignore" };
  const workflow = parseWorkflowEntryData(value);
  return workflow?.kind === "application"
    ? { kind: "record", applicationId: workflow.application_id }
    : { kind: "invalid" };
}

function claimFromEntry(entry: SessionEntry): EntryClaim {
  if (entry.type !== "custom") return { kind: "ignore" };
  switch (entry.customType) {
    case APPLICATION_ATTACHMENT_CUSTOM_TYPE: return attachmentClaim(entry.data);
    case APPLICATION_ASSISTANCE_CUSTOM_TYPE: return assistanceClaim(entry.data);
    case WORKFLOW_CUSTOM_TYPE: return workflowClaim(entry.data);
    default: return { kind: "ignore" };
  }
}

function scanSessionClaims(entries: readonly SessionEntry[]): SessionClaims | undefined {
  const recordIds = new Set<string>();
  const applicationIds = new Set<string>();
  for (const entry of entries) {
    const claim = claimFromEntry(entry);
    if (claim.kind === "invalid") return undefined;
    if (claim.kind === "ignore") continue;
    if (claim.recordId !== undefined) {
      if (recordIds.has(claim.recordId)) return undefined;
      recordIds.add(claim.recordId);
    }
    if (claim.applicationId !== undefined) applicationIds.add(claim.applicationId);
  }
  if (applicationIds.size > 1) return undefined;
  const usedApplicationId = applicationIds.values().next().value as string | undefined;
  return usedApplicationId === undefined ? {} : { usedApplicationId };
}

interface ActiveRecords {
  attachment?: ApplicationAttachmentEntry;
  activation?: ApplicationAssistanceActivationEntry;
}

function applyAttachmentRecord(
  current: ActiveRecords,
  data: ApplicationAttachmentEntryData,
  usedApplicationId: string | undefined,
): ActiveRecords | undefined {
  if (data.kind === "application_attachment") {
    if (current.attachment !== undefined || data.application_id !== usedApplicationId) return undefined;
    return { attachment: data };
  }
  if (current.attachment === undefined || data.attachment_id !== current.attachment.attachment_id) {
    return undefined;
  }
  return {};
}

function applyAssistanceRecord(
  current: ActiveRecords,
  data: ApplicationAssistanceActivationEntry,
): ActiveRecords | undefined {
  if (current.attachment === undefined || current.activation !== undefined ||
    data.attachment_id !== current.attachment.attachment_id ||
    data.application_id !== current.attachment.application_id) return undefined;
  return { attachment: current.attachment, activation: data };
}

function replayActiveBranch(
  entries: readonly SessionEntry[],
  usedApplicationId: string | undefined,
): ActiveRecords | undefined {
  let current: ActiveRecords = {};
  for (const entry of entries) {
    if (entry.type !== "custom") continue;
    if (entry.customType === APPLICATION_ATTACHMENT_CUSTOM_TYPE) {
      const data = parseApplicationAttachmentEntryData(entry.data);
      if (data === undefined) return undefined;
      const next = applyAttachmentRecord(current, data, usedApplicationId);
      if (next === undefined) return undefined;
      current = next;
    } else if (entry.customType === APPLICATION_ASSISTANCE_CUSTOM_TYPE) {
      const data = parseApplicationAssistanceEntryData(entry.data);
      if (data === undefined) return undefined;
      const next = applyAssistanceRecord(current, data);
      if (next === undefined) return undefined;
      current = next;
    }
  }
  return current;
}

export function replayApplicationSessionRecords(
  branchEntries: readonly SessionEntry[],
  allEntries: readonly SessionEntry[] = branchEntries,
): ApplicationSessionRecords {
  const claims = scanSessionClaims(allEntries);
  if (claims === undefined) return invalidRecords();
  const active = replayActiveBranch(branchEntries, claims.usedApplicationId);
  if (active === undefined) return invalidRecords();
  return {
    integrity: "valid",
    ...(claims.usedApplicationId === undefined ? {} : { used_application_id: claims.usedApplicationId }),
    ...(active.attachment === undefined ? {} : { attachment: active.attachment }),
    ...(active.activation === undefined ? {} : { activation: active.activation }),
  };
}

export function createApplicationAttachmentEntry(
  pointer: ApplicationAttachmentPointer,
  options: RecordFactoryOptions,
): ApplicationAttachmentEntry {
  const data: ApplicationAttachmentEntry = {
    schema_version: APPLICATION_ATTACHMENT_SCHEMA,
    kind: "application_attachment",
    attachment_id: options.uuid(),
    application_id: pointer.applicationId,
    root_id: pointer.rootId,
    root_created_at: pointer.rootCreatedAt,
    application_created_at: pointer.applicationCreatedAt,
    workspace_created_at: pointer.workspaceCreatedAt,
  };
  if (parseApplicationAttachmentEntryData(data) === undefined) {
    throw new TypeError("invalid application attachment record");
  }
  return data;
}

export function createApplicationDetachmentEntry(
  attachment: ApplicationAttachmentEntry,
  options: RecordFactoryOptions,
): ApplicationDetachmentEntry {
  const data: ApplicationDetachmentEntry = {
    schema_version: APPLICATION_ATTACHMENT_SCHEMA,
    kind: "application_detachment",
    detachment_id: options.uuid(),
    attachment_id: attachment.attachment_id,
  };
  if (parseApplicationAttachmentEntryData(data) === undefined) {
    throw new TypeError("invalid application detachment record");
  }
  return data;
}

export function createApplicationAssistanceActivationEntry(
  attachment: ApplicationAttachmentEntry,
  options: RecordFactoryOptions,
): ApplicationAssistanceActivationEntry {
  const data: ApplicationAssistanceActivationEntry = {
    schema_version: APPLICATION_ASSISTANCE_SCHEMA,
    kind: "application_assistance_activation",
    activation_id: options.uuid(),
    attachment_id: attachment.attachment_id,
    application_id: attachment.application_id,
  };
  if (parseApplicationAssistanceEntryData(data) === undefined) {
    throw new TypeError("invalid application assistance record");
  }
  return data;
}
