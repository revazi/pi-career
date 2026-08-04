// SPDX-License-Identifier: MIT OR Apache-2.0

export interface CareerCliErrorV1 {
  schema_version: "career.error.v1";
  code: string;
  message: string;
  field_path: string | null;
}

export type AdapterErrorCode =
  | "invalid_request"
  | "invalid_executable_override"
  | "unsupported_platform"
  | "bundled_runtime_invalid"
  | "missing_executable"
  | "executable_unavailable"
  | "cancelled"
  | "timeout"
  | "stdout_overflow"
  | "stderr_overflow"
  | "result_too_large"
  | "result_too_many_lines"
  | "malformed_result"
  | "unexpected_stderr"
  | "process_signalled"
  | "career_cli_error"
  | "cli_failure"
  | "process_io_failure"
  | "process_failure"
  | "internal_error";

interface CareerPiErrorV1 {
  schema_version: "career.pi_error.v1";
  code: AdapterErrorCode;
  message: string;
  career_error?: CareerCliErrorV1;
}

const ERROR_MESSAGES: Readonly<Record<AdapterErrorCode, string>> = {
  invalid_request: "The Career Core tool request is invalid.",
  invalid_executable_override: "CAREER_CLI_PATH must be a bounded absolute executable path.",
  unsupported_platform: "No bundled Career Core runtime is available for this platform.",
  bundled_runtime_invalid: "The bundled Career Core runtime failed local integrity verification.",
  missing_executable: "The selected Career Core runtime was not found.",
  executable_unavailable: "The selected Career Core runtime is not available for execution.",
  cancelled: "The Career Core operation was cancelled.",
  timeout: "The Career Core operation exceeded its time limit.",
  stdout_overflow: "The Career Core runtime exceeded the stdout capture limit.",
  stderr_overflow: "The Career Core runtime exceeded the stderr capture limit.",
  result_too_large:
    "The complete Career Core result exceeds the Pi tool context byte limit; partial output is unavailable and full-result export is not yet supported.",
  result_too_many_lines:
    "The complete Career Core result exceeds the Pi tool context line limit; partial output is unavailable and full-result export is not yet supported.",
  malformed_result: "The Career Core runtime did not return exactly one valid JSON object.",
  unexpected_stderr: "The Career Core runtime wrote unexpected diagnostics on success.",
  process_signalled: "The Career Core runtime ended because of a signal.",
  career_cli_error: "The Career Core runtime rejected the request with a validated error.",
  cli_failure: "The Career Core runtime failed without a validated error envelope.",
  process_io_failure: "The Career Core runtime stream failed.",
  process_failure: "The Career Core runtime failed unexpectedly.",
  internal_error: "The Career Core Pi adapter failed unexpectedly.",
};

export class CareerInvocationError extends Error {
  readonly payload: CareerPiErrorV1;

  constructor(payload: CareerPiErrorV1) {
    super(JSON.stringify(payload));
    this.name = "CareerInvocationError";
    this.payload = payload;
  }
}

export function adapterError(
  code: AdapterErrorCode,
  careerError?: CareerCliErrorV1,
): CareerInvocationError {
  return new CareerInvocationError({
    schema_version: "career.pi_error.v1",
    code,
    message: ERROR_MESSAGES[code],
    ...(careerError === undefined ? {} : { career_error: careerError }),
  });
}

export function publicAdapterError(error: unknown): CareerInvocationError {
  return error instanceof CareerInvocationError ? error : adapterError("internal_error");
}
