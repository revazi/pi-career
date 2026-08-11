// SPDX-License-Identifier: MIT OR Apache-2.0

import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export const RAW_TOOL_NAMES = [
  "career_core_discover",
  "career_core_resume",
  "career_core_job",
] as const;
export const MANAGED_TOOL_NAME = "career_run";

const CAREER_RUN_COMMANDS = [
  "context",
  "consent",
  "analyze",
  "match",
  "suggestion-review",
  "replacement-review",
  "variant-review",
  "materialize",
  "detail",
] as const;

export const DETAIL_SECTIONS = [
  "summary", "warnings", "checks", "evidence", "changes", "document", "raw",
] as const;

export const careerRunParameters = Type.Object({
  command: StringEnum(CAREER_RUN_COMMANDS),
  handle: Type.Optional(Type.String({
    pattern: "^(resume|result|review|variant):[a-f0-9-]{8,64}$",
    maxLength: 80,
  })),
  payload: Type.Optional(Type.Unknown({
    description: "Native command payload; never a JSON string or complete Core envelope.",
  })),
}, { additionalProperties: false });

export interface CareerRunParams {
  command: typeof CAREER_RUN_COMMANDS[number];
  handle?: string;
  payload?: unknown;
}

export interface DetailRequest {
  section: typeof DETAIL_SECTIONS[number];
  item?: string;
}

export interface CareerRunDetails {
  schema_version: "pi.career.run_details.v1";
  command: string;
  status: "ready" | "consent_required" | "complete";
  handle?: string;
  action?: "review_select" | "pdf_manual";
  summary: string;
}
