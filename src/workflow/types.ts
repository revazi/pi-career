// SPDX-License-Identifier: MIT OR Apache-2.0

import type { CareerInvocation, CareerInvocationResult } from "../process.ts";

export const WORKFLOW_CUSTOM_TYPE = "career.workflow";
export const WORKFLOW_STATE_SCHEMA = "pi.career.workflow_state.v1";
export const RESULT_PROJECTION_SCHEMA = "pi.career.result_projection.v1";

export interface LibraryRoot {
  id: string;
  path: string;
  label: string;
}

export interface CareerConfig {
  schema_version: "pi.career.config.v1";
  library_roots: LibraryRoot[];
  generated_variants_root?: string;
}

export type ResumeKind = "original" | "assisted_variant";
export type ResumeFormat = "markdown" | "text";

export interface ResumeRecord {
  id: string;
  root_id: string;
  path: string;
  relative_path: string;
  label: string;
  kind: ResumeKind;
  format: ResumeFormat;
  modified_at: string;
  size_bytes: number;
  variant_group_id?: string;
  too_large_for_core_input?: true;
  text: string;
  text_sha256: string;
}

export type ScanWarningCode =
  | "root_stale"
  | "root_file_cap_reached"
  | "total_file_cap_reached"
  | "raw_file_too_large"
  | "invalid_utf8"
  | "invalid_assisted_sidecar"
  | "scan_entry_unavailable";

export interface ScanWarning {
  code: ScanWarningCode;
  root_id: string;
  relative_path?: string;
}

export interface RootScanSummary {
  root_id: string;
  original_count: number;
  assisted_variant_count: number;
  too_large_count: number;
  stale: boolean;
  capped: boolean;
}

export interface LibraryScan {
  records: ResumeRecord[];
  warnings: ScanWarning[];
  roots: RootScanSummary[];
  total_capped: boolean;
}

interface WorkflowEntryBase {
  schema_version: "pi.career.workflow_state.v1";
  state_id: string;
  created_at: string;
}

export interface VacancyEntry extends WorkflowEntryBase {
  kind: "vacancy";
  vacancy_label: string;
  vacancy_text: string;
  vacancy_text_sha256: string;
  source: "paste" | "replace";
}

export interface VacancyClearEntry extends WorkflowEntryBase {
  kind: "vacancy_clear";
  clears_state_id: string;
}

export interface ConsentEntry extends WorkflowEntryBase {
  kind: "consent";
  scope: "session_persistence";
  granted: boolean;
}

export interface ConsentClearEntry extends WorkflowEntryBase {
  kind: "consent_clear";
  scope: "session_persistence";
  clears_state_id: string;
}

export interface ProjectionUiFlags {
  adjusted: boolean;
  provisional: boolean;
  close_cluster: boolean;
  stale: boolean;
}

export interface ResultProjection {
  schema_version: "pi.career.result_projection.v1";
  core_schema_version: "career.resume_analysis.v1" | "career.job_match.v1";
  summary: Record<string, unknown>;
  ui_flags: ProjectionUiFlags;
}

export interface ResultCardEntry extends WorkflowEntryBase {
  kind: "result_card";
  workflow: "analyze" | "match";
  run_id: string;
  resume_id: string;
  resume_label: string;
  resume_path_fingerprint: string;
  input_digests: {
    resume_text_sha256: string;
    vacancy_text_sha256: string;
  };
  projection: ResultProjection;
}

export type WorkflowEntryData =
  | VacancyEntry
  | VacancyClearEntry
  | ConsentEntry
  | ConsentClearEntry
  | ResultCardEntry;

export interface ReconstructedWorkflowState {
  vacancy?: VacancyEntry;
  consent?: ConsentEntry;
  result_cards: ResultCardEntry[];
}

export type WorkflowInvoke = (
  invocation: CareerInvocation,
  signal?: AbortSignal,
) => Promise<CareerInvocationResult>;

export interface WorkflowDependencies {
  agentDir: string;
  invoke: WorkflowInvoke;
  now: () => Date;
  uuid: () => string;
}

export type WorkflowErrorCode =
  | "interactive_mode_required"
  | "invalid_command_arguments"
  | "config_invalid"
  | "root_invalid"
  | "library_empty"
  | "vacancy_required"
  | "consent_required"
  | "workflow_cancelled"
  | "workflow_stale"
  | "core_result_invalid"
  | "workflow_failed";

const WORKFLOW_ERROR_MESSAGES: Readonly<Record<WorkflowErrorCode, string>> = {
  interactive_mode_required: "This career command requires TUI or RPC mode.",
  invalid_command_arguments: "The career command arguments are invalid.",
  config_invalid: "The pi-career configuration is invalid.",
  root_invalid: "The selected resume root is unavailable or invalid.",
  library_empty: "No eligible original resumes are available.",
  vacancy_required: "Set a vacancy with /career-vacancy first.",
  consent_required: "Session-persistence consent was not granted.",
  workflow_cancelled: "The career workflow was cancelled.",
  workflow_stale: "A newer career workflow owns this session.",
  core_result_invalid: "Career Core returned an unexpected result shape.",
  workflow_failed: "The career workflow failed.",
};

export class CareerWorkflowError extends Error {
  readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode) {
    super(
      JSON.stringify({
        schema_version: "pi.career.workflow_error.v1",
        code,
        message: WORKFLOW_ERROR_MESSAGES[code],
      }),
    );
    this.name = "CareerWorkflowError";
    this.code = code;
  }
}

export function workflowError(code: WorkflowErrorCode): CareerWorkflowError {
  return new CareerWorkflowError(code);
}

export function workflowErrorMessage(code: WorkflowErrorCode): string {
  return WORKFLOW_ERROR_MESSAGES[code];
}

export interface OwnedRun {
  sequence: number;
  runId: string;
  sessionId: string;
  controller: AbortController;
}
