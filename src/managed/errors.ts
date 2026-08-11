// SPDX-License-Identifier: MIT OR Apache-2.0

export type CareerRunErrorCode =
  | "invalid_request"
  | "consent_required"
  | "consent_declined"
  | "context_required"
  | "resume_not_found"
  | "vacancy_not_found"
  | "result_not_found"
  | "review_not_found"
  | "selection_invalid"
  | "pdf_materialization_unsupported"
  | "managed_contract_invalid"
  | "managed_result_invalid"
  | "managed_result_capacity"
  | "detail_too_large"
  | "session_changed"
  | "variant_save_unavailable"
  | "variant_save_destination_invalid"
  | "variant_save_preview_changed"
  | "variant_save_collision"
  | "variant_save_verification_failed"
  | "variant_save_status_unknown"
  | "variant_save_platform_unsupported";

const MESSAGES: Readonly<Record<CareerRunErrorCode, string>> = {
  invalid_request: "The career_run request is invalid.",
  consent_required: "Explicit Pi session-persistence consent is required before loading private career context.",
  consent_declined: "Session persistence was declined. Start a new `pi --no-session` run for a transient workflow.",
  context_required: "Run career_run context first to obtain current ephemeral handles.",
  resume_not_found: "The requested original-resume handle is unavailable or stale.",
  vacancy_not_found: "The requested current-vacancy handle is unavailable or stale.",
  result_not_found: "The requested ephemeral result handle is unavailable or expired.",
  review_not_found: "The requested ephemeral review handle is unavailable or expired.",
  selection_invalid: "Selected change IDs are invalid for this reviewed proposal.",
  pdf_materialization_unsupported: "PDF review changes are manual-application guidance and cannot be materialized from extracted text.",
  managed_contract_invalid: "The selected Career Core managed-adapter contracts are incompatible.",
  managed_result_invalid: "Career Core returned an unexpected managed-workflow result.",
  managed_result_capacity: "The complete Career Core result exceeds the bounded in-memory managed-result capacity.",
  detail_too_large: "The requested model-visible detail is too large; request a narrower section.",
  session_changed: "The Pi session changed; run career_run context again for fresh ephemeral handles.",
  variant_save_unavailable: "The materialized variant is unavailable, stale, or ineligible for local saving.",
  variant_save_destination_invalid: "The managed variants destination is unavailable or does not meet the private-directory contract.",
  variant_save_preview_changed: "The exact save preview changed or was cancelled; no file was written.",
  variant_save_collision: "A save destination already exists; no existing file was replaced.",
  variant_save_verification_failed: "The saved variant could not be verified as an excluded assisted artifact.",
  variant_save_status_unknown: "The save reached an indeterminate local-filesystem state; inspect the approved destination before retrying.",
  variant_save_platform_unsupported: "Private materialized-variant saving is not supported on this platform.",
};

export class CareerRunError extends Error {
  readonly code: CareerRunErrorCode;

  constructor(code: CareerRunErrorCode) {
    super(JSON.stringify({
      schema_version: "pi.career.run_error.v1",
      code,
      message: MESSAGES[code],
    }));
    this.name = "CareerRunError";
    this.code = code;
  }
}

export function careerRunErrorMessage(code: CareerRunErrorCode): string {
  return MESSAGES[code];
}

export function careerRunError(code: CareerRunErrorCode): CareerRunError {
  return new CareerRunError(code);
}

export function managedFailure(error: unknown): CareerRunError {
  if (error instanceof CareerRunError) return error;
  if (error instanceof Error && error.message === "managed_contract_invalid") {
    return careerRunError("managed_contract_invalid");
  }
  if (error instanceof Error && error.message === "managed_payload_invalid") {
    return careerRunError("invalid_request");
  }
  return careerRunError("managed_result_invalid");
}
