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
  | "managed_contract_invalid"
  | "managed_result_invalid"
  | "managed_result_capacity"
  | "detail_too_large"
  | "session_changed";

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
  managed_contract_invalid: "The selected Career Core managed-adapter contracts are incompatible.",
  managed_result_invalid: "Career Core returned an unexpected managed-workflow result.",
  managed_result_capacity: "The complete Career Core result exceeds the bounded in-memory managed-result capacity.",
  detail_too_large: "The requested model-visible detail is too large; request a narrower section.",
  session_changed: "The Pi session changed; run career_run context again for fresh ephemeral handles.",
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
