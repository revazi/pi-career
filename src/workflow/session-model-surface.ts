// SPDX-License-Identifier: MIT OR Apache-2.0

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { MANAGED_TOOL_NAME, RAW_TOOL_NAMES } from "../managed/schema.ts";
import {
  type ApplicationAttachmentEntry,
  replayApplicationSessionRecords,
} from "./session-attachment.ts";

const CAREER_MODEL_TOOL_NAMES = [MANAGED_TOOL_NAME, ...RAW_TOOL_NAMES] as const;

export interface CareerModelSurface {
  careerRunActive: boolean;
  skillDiscoverable: boolean;
}

export const INACTIVE_CAREER_MODEL_SURFACE: CareerModelSurface = {
  careerRunActive: false,
  skillDiscoverable: false,
};

export const ACTIVE_MANAGED_CAREER_MODEL_SURFACE: CareerModelSurface = {
  careerRunActive: true,
  skillDiscoverable: true,
};

export type AttachmentValidator = (attachment: ApplicationAttachmentEntry) => Promise<unknown>;

export async function resolveCareerModelSurface(
  branchEntries: readonly SessionEntry[],
  allEntries: readonly SessionEntry[] = branchEntries,
  validateAttachment?: AttachmentValidator,
): Promise<CareerModelSurface> {
  const records = replayApplicationSessionRecords(branchEntries, allEntries);
  if (records.integrity !== "valid" || records.attachment === undefined || records.activation === undefined) {
    return INACTIVE_CAREER_MODEL_SURFACE;
  }
  if (validateAttachment === undefined) return INACTIVE_CAREER_MODEL_SURFACE;
  try {
    await validateAttachment(records.attachment);
  } catch {
    return INACTIVE_CAREER_MODEL_SURFACE;
  }
  return ACTIVE_MANAGED_CAREER_MODEL_SURFACE;
}

export function applyCareerToolSurface(
  getActiveTools: () => string[],
  setActiveTools: (names: string[]) => void,
  surface: CareerModelSurface,
  includeRaw = false,
): void {
  const retained = getActiveTools().filter(
    (name) => !CAREER_MODEL_TOOL_NAMES.includes(name as typeof CAREER_MODEL_TOOL_NAMES[number]),
  );
  const next = [...retained];
  if (surface.careerRunActive) next.push(MANAGED_TOOL_NAME);
  if (surface.careerRunActive && includeRaw) next.push(...RAW_TOOL_NAMES);
  setActiveTools([...new Set(next)]);
}
