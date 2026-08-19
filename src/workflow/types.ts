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

export interface ApplicationWorkspaceConfig {
  root_id: string;
  root_path: string;
}

export interface CareerConfig {
  schema_version: "pi.career.config.v2";
  library_roots: LibraryRoot[];
  generated_variants_root: string | null;
  application_workspace: ApplicationWorkspaceConfig | null;
}

export type ResumeKind = "original" | "assisted_variant";
export type ResumeFormat = "markdown" | "text" | "pdf";

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
  | "pdf_text_unavailable"
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

export type ApplicationStatus = "preparing" | "applied" | "interviewing" | "closed";

export interface ApplicationEntry extends WorkflowEntryBase {
  kind: "application";
  application_id: string;
  company_label: string;
  role_label: string;
  status: ApplicationStatus;
}

export interface ApplicationClearEntry extends WorkflowEntryBase {
  kind: "application_clear";
  clears_state_id: string;
}

export interface VacancyEntry extends WorkflowEntryBase {
  kind: "vacancy";
  application_id?: string;
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
  application_id?: string;
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
  | ApplicationEntry
  | ApplicationClearEntry
  | VacancyEntry
  | VacancyClearEntry
  | ConsentEntry
  | ConsentClearEntry
  | ResultCardEntry;

export interface ReconstructedWorkflowState {
  application_context_seen?: true;
  application?: ApplicationEntry;
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
  | "workbench_too_large"
  | "core_result_invalid"
  | "workflow_failed"
  | "workspace_config_invalid"
  | "workspace_root_invalid"
  | "workspace_root_overlap"
  | "workspace_unavailable"
  | "workspace_identity_conflict"
  | "workspace_limit_reached"
  | "workspace_busy"
  | "workspace_collision"
  | "workspace_drift"
  | "workspace_preview_changed"
  | "workspace_verification_failed"
  | "workspace_status_unknown";

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
  workbench_too_large: "The combined private workbench prompt is too large for a bounded Pi handoff.",
  core_result_invalid: "Career Core returned an unexpected result shape.",
  workflow_failed: "The career workflow failed.",
  workspace_config_invalid: "The pi-career workspace configuration is invalid.",
  workspace_root_invalid: "The application workspace root does not meet the private-root contract.",
  workspace_root_overlap: "The application workspace must remain disjoint from resume and variation roots.",
  workspace_unavailable: "The current application workspace is unavailable.",
  workspace_identity_conflict: "The session and application workspace identities conflict.",
  workspace_limit_reached: "The application workspace has reached a bounded v1 limit.",
  workspace_busy: "Another workspace mutation is active or a prior lock requires inspection.",
  workspace_collision: "A workspace target already exists; no existing file was replaced.",
  workspace_drift: "The application workspace changed or contains inconsistent package state.",
  workspace_preview_changed: "The exact workspace preview changed; no mutation was performed.",
  workspace_verification_failed: "The workspace mutation could not be safely verified.",
  workspace_status_unknown: "The workspace reached an indeterminate filesystem state; reconcile before retrying.",
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
