// SPDX-License-Identifier: MIT OR Apache-2.0
// Adapted from career-core commit 100774ed8bb3b39c019d64ce105af1e3f209144f.

import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

const SINGLE_INPUT_MAX_BYTES = 262_144;
export const COMPOSITE_INPUT_MAX_BYTES = 1_048_576;
const TOOL_RESULT_MAX_BYTES = 50_000;
const TOOL_RESULT_MAX_LINES = 2_000;
const STDOUT_CAPTURE_MAX_BYTES = 1_048_576;
const STDERR_CAPTURE_MAX_BYTES = 16_384;
const DEFAULT_TIMEOUT_MS = 30_000;
const TERMINATION_GRACE_MS = 250;
const EXECUTABLE_MAX_BYTES = 4_096;

const KNOWN_CLI_ERROR_CODES = new Set([
  "invalid_arguments",
  "input_read_failed",
  "cli_input_too_large",
  "invalid_json",
  "output_write_failed",
  "unsupported_schema_version",
  "source_text_empty",
  "source_text_too_large",
  "source_line_count_exceeded",
  "source_line_too_long",
  "document_id_empty",
  "document_id_too_long",
  "unsupported_enrichment_input_schema_version",
  "unsupported_enrichment_proposal_schema_version",
  "enrichment_not_eligible",
  "enrichment_proposal_too_large",
  "enrichment_non_target_populated",
  "enrichment_field_empty",
  "enrichment_field_too_long",
  "enrichment_list_too_long",
  "enrichment_value_not_grounded",
  "enrichment_entry_invalid",
  "unsupported_analysis_suggestion_review_input_schema_version",
  "unsupported_analysis_suggestion_proposal_schema_version",
  "unsupported_analysis_suggestion_analysis_policy_version",
  "analysis_suggestion_proposal_too_large",
  "analysis_suggestion_list_too_long",
  "unsupported_analysis_replacement_review_input_schema_version",
  "unsupported_analysis_replacement_proposal_schema_version",
  "unsupported_analysis_replacement_analysis_policy_version",
  "analysis_replacement_proposal_too_large",
  "analysis_replacement_list_too_long",
  "unsupported_variant_review_input_schema_version",
  "unsupported_variant_proposal_schema_version",
  "unsupported_variant_materialization_input_schema_version",
  "unsupported_variant_policy_version",
  "variant_proposal_too_large",
  "variant_change_list_too_long",
  "variant_preview_invalid",
  "variant_selection_empty",
  "variant_selection_too_long",
  "variant_selection_invalid",
]);

export type DiscoveryOperation = "capabilities" | "schema-list" | "schema-export";
export type ResumeOperation =
  | "evaluate"
  | "analyze"
  | "analysis-suggestions-review"
  | "analysis-replacements-review"
  | "normalize"
  | "enrich"
  | "variant-review"
  | "variant-materialize";
export type JobOperation = "normalize" | "match";

export type CareerInvocation =
  | { kind: "discovery"; operation: DiscoveryOperation; schemaId?: string }
  | { kind: "resume"; operation: ResumeOperation; inputJson: string }
  | { kind: "job"; operation: JobOperation; inputJson: string };

interface CareerCliErrorV1 {
  schema_version: "career.error.v1";
  code: string;
  message: string;
  field_path: string | null;
}

export interface CareerInvocationResult {
  json: string;
  operation: string;
}

export interface InvokeOptions {
  executable?: string;
  timeoutMs?: number;
  stdoutCaptureMaxBytes?: number;
  stderrCaptureMaxBytes?: number;
  toolResultMaxBytes?: number;
  toolResultMaxLines?: number;
}

type AdapterErrorCode =
  | "invalid_request"
  | "invalid_executable_override"
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

const ERROR_MESSAGES: Record<AdapterErrorCode, string> = {
  invalid_request: "The Career Core tool request is invalid.",
  invalid_executable_override: "CAREER_CLI_PATH must be a bounded absolute executable path.",
  missing_executable: "The installed career executable was not found.",
  executable_unavailable: "The installed career executable is not available for execution.",
  cancelled: "The Career Core operation was cancelled.",
  timeout: "The Career Core operation exceeded its time limit.",
  stdout_overflow: "The career executable exceeded the stdout capture limit.",
  stderr_overflow: "The career executable exceeded the stderr capture limit.",
  result_too_large: "The complete Career Core result exceeds the Pi tool context byte limit; run the installed CLI directly in a user-approved local workflow.",
  result_too_many_lines: "The complete Career Core result exceeds the Pi tool context line limit; run the installed CLI directly in a user-approved local workflow.",
  malformed_result: "The career executable did not return exactly one valid JSON object.",
  unexpected_stderr: "The career executable wrote unexpected diagnostics on success.",
  process_signalled: "The career executable ended because of a signal.",
  career_cli_error: "The career executable rejected the request with a validated error.",
  cli_failure: "The career executable failed without a validated error envelope.",
  process_io_failure: "The career executable stream failed.",
  process_failure: "The career executable failed unexpectedly.",
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

function adapterError(code: AdapterErrorCode, careerError?: CareerCliErrorV1): CareerInvocationError {
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

export function resolveCareerExecutable(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const override = environment.CAREER_CLI_PATH;
  if (override === undefined) return "career";

  if (
    override.length === 0 ||
    override.includes("\0") ||
    Buffer.byteLength(override, "utf8") > EXECUTABLE_MAX_BYTES ||
    !isAbsolute(override)
  ) {
    throw adapterError("invalid_executable_override");
  }

  return override;
}

interface PreparedInvocation {
  args: string[];
  input?: string;
  operation: string;
}

const DOCUMENT_INPUT_LIMITS: Readonly<Record<string, number>> = {
  "resume.evaluate": SINGLE_INPUT_MAX_BYTES,
  "resume.analyze": SINGLE_INPUT_MAX_BYTES,
  "resume.analysis-suggestions-review": SINGLE_INPUT_MAX_BYTES,
  "resume.analysis-replacements-review": SINGLE_INPUT_MAX_BYTES,
  "resume.normalize": SINGLE_INPUT_MAX_BYTES,
  "resume.enrich": SINGLE_INPUT_MAX_BYTES,
  "resume.variant-review": COMPOSITE_INPUT_MAX_BYTES,
  "resume.variant-materialize": COMPOSITE_INPUT_MAX_BYTES,
  "job.normalize": SINGLE_INPUT_MAX_BYTES,
  "job.match": COMPOSITE_INPUT_MAX_BYTES,
};

function prepareDiscoveryInvocation(
  invocation: Extract<CareerInvocation, { kind: "discovery" }>,
): PreparedInvocation {
  switch (invocation.operation) {
    case "capabilities":
      if (invocation.schemaId !== undefined) throw adapterError("invalid_request");
      return { args: ["capabilities", "--format", "json-compact"], operation: "capabilities" };
    case "schema-list":
      if (invocation.schemaId !== undefined) throw adapterError("invalid_request");
      return { args: ["schema", "list", "--format", "json-compact"], operation: "schema.list" };
    case "schema-export":
      if (
        typeof invocation.schemaId !== "string" ||
        invocation.schemaId.length > 100 ||
        !/^career\.[a-z0-9_.-]+\.v[0-9]+$/.test(invocation.schemaId)
      ) {
        throw adapterError("invalid_request");
      }
      return {
        args: ["schema", "export", "--id", invocation.schemaId, "--format", "json-compact"],
        operation: "schema.export",
      };
    default:
      throw adapterError("invalid_request");
  }
}

function isJsonObject(inputJson: string): boolean {
  try {
    const parsed: unknown = JSON.parse(inputJson);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function prepareDocumentInvocation(
  invocation: Exclude<CareerInvocation, { kind: "discovery" }>,
): PreparedInvocation {
  const operation = `${invocation.kind}.${invocation.operation}`;
  const inputMaxBytes = DOCUMENT_INPUT_LIMITS[operation];
  if (typeof invocation.inputJson !== "string") throw adapterError("invalid_request");
  const inputBytes = Buffer.byteLength(invocation.inputJson, "utf8");
  if (
    inputMaxBytes === undefined ||
    inputBytes === 0 ||
    inputBytes > inputMaxBytes ||
    !isJsonObject(invocation.inputJson)
  ) {
    throw adapterError("invalid_request");
  }

  return {
    args: [invocation.kind, invocation.operation, "--input", "-", "--format", "json-compact"],
    input: invocation.inputJson,
    operation,
  };
}

function prepareInvocation(invocation: CareerInvocation): PreparedInvocation {
  return invocation.kind === "discovery"
    ? prepareDiscoveryInvocation(invocation)
    : prepareDocumentInvocation(invocation);
}

function decodeUtf8(chunks: Buffer[]): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return undefined;
  }
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseKnownCliError(stderr: string): CareerCliErrorV1 | undefined {
  const value = parseJsonObject(stderr);
  if (value === undefined) return undefined;
  if (Object.keys(value).sort().join(",") !== "code,field_path,message,schema_version") return undefined;
  if (value.schema_version !== "career.error.v1") return undefined;
  if (typeof value.code !== "string" || !KNOWN_CLI_ERROR_CODES.has(value.code)) return undefined;
  if (
    typeof value.message !== "string" ||
    value.message.length === 0 ||
    value.message.length > 500 ||
    !/^[\x20-\x7e]+$/.test(value.message)
  ) {
    return undefined;
  }
  if (
    value.field_path !== null &&
    (typeof value.field_path !== "string" ||
      value.field_path.length > 100 ||
      !/^[A-Za-z0-9_.\[\]-]*$/.test(value.field_path))
  ) {
    return undefined;
  }

  return {
    schema_version: "career.error.v1",
    code: value.code,
    message: value.message,
    field_path: value.field_path as string | null,
  };
}

function outputLineCount(text: string): number {
  if (text.length === 0) return 0;
  const newlineCount = (text.match(/\n/g) ?? []).length;
  return text.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function withoutOneTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

interface ExecutionLimits {
  timeoutMs: number;
  stdoutMax: number;
  stderrMax: number;
  resultMax: number;
  resultLineMax: number;
}

function executionLimits(options: InvokeOptions): ExecutionLimits {
  const limits = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    stdoutMax: options.stdoutCaptureMaxBytes ?? STDOUT_CAPTURE_MAX_BYTES,
    stderrMax: options.stderrCaptureMaxBytes ?? STDERR_CAPTURE_MAX_BYTES,
    resultMax: options.toolResultMaxBytes ?? TOOL_RESULT_MAX_BYTES,
    resultLineMax: options.toolResultMaxLines ?? TOOL_RESULT_MAX_LINES,
  };
  const positiveIntegers = [
    limits.timeoutMs,
    limits.stdoutMax,
    limits.stderrMax,
    limits.resultMax,
    limits.resultLineMax,
  ];
  if (positiveIntegers.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw adapterError("invalid_request");
  }
  if (limits.stdoutMax <= limits.resultMax) throw adapterError("invalid_request");
  return limits;
}

function throwCliFailure(code: number | null, stdout: string, stderr: string): never {
  if (stdout.trim().length === 0 && code !== null && code >= 2 && code <= 6) {
    const cliError = parseKnownCliError(stderr);
    if (cliError !== undefined) throw adapterError("career_cli_error", cliError);
  }
  throw adapterError("cli_failure");
}

function successfulResult(
  prepared: PreparedInvocation,
  stdout: string,
  stderr: string,
  limits: ExecutionLimits,
): CareerInvocationResult {
  if (stderr.trim().length !== 0) throw adapterError("unexpected_stderr");
  if (Buffer.byteLength(stdout, "utf8") > limits.resultMax) throw adapterError("result_too_large");
  if (outputLineCount(stdout) > limits.resultLineMax) throw adapterError("result_too_many_lines");
  if (parseJsonObject(stdout) === undefined) throw adapterError("malformed_result");
  return { json: withoutOneTrailingNewline(stdout), operation: prepared.operation };
}

interface CompletedProcess {
  code: number | null;
  exitSignal: NodeJS.Signals | null;
  spawnErrorCode?: string;
  terminationError?: CareerInvocationError;
  stdoutChunks: Buffer[];
  stderrChunks: Buffer[];
}

function completedResult(
  prepared: PreparedInvocation,
  completed: CompletedProcess,
  limits: ExecutionLimits,
): CareerInvocationResult {
  if (completed.terminationError !== undefined) throw completed.terminationError;
  if (completed.spawnErrorCode === "ENOENT") throw adapterError("missing_executable");
  if (completed.spawnErrorCode === "EACCES" || completed.spawnErrorCode === "EPERM") {
    throw adapterError("executable_unavailable");
  }
  if (completed.spawnErrorCode !== undefined) throw adapterError("process_failure");
  if (completed.exitSignal !== null) throw adapterError("process_signalled");

  const stdout = decodeUtf8(completed.stdoutChunks);
  const stderr = decodeUtf8(completed.stderrChunks);
  if (stdout === undefined || stderr === undefined) throw adapterError("malformed_result");
  if (completed.code !== 0) throwCliFailure(completed.code, stdout, stderr);
  return successfulResult(prepared, stdout, stderr, limits);
}

export async function invokeCareerCli(
  invocation: CareerInvocation,
  signal?: AbortSignal,
  options: InvokeOptions = {},
): Promise<CareerInvocationResult> {
  const prepared = prepareInvocation(invocation);
  const executable = options.executable ?? resolveCareerExecutable();
  if (
    executable.length === 0 ||
    executable.includes("\0") ||
    Buffer.byteLength(executable, "utf8") > EXECUTABLE_MAX_BYTES ||
    (executable !== "career" && !isAbsolute(executable))
  ) {
    throw adapterError("invalid_executable_override");
  }
  if (signal?.aborted) throw adapterError("cancelled");

  const limits = executionLimits(options);

  return new Promise<CareerInvocationResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, prepared.args, {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      reject(adapterError("executable_unavailable"));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let closed = false;
    let spawnErrorCode: string | undefined;
    let terminationError: CareerInvocationError | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = (error: CareerInvocationError) => {
      if (terminationError !== undefined || closed) return;
      terminationError = error;
      try {
        child.kill("SIGTERM");
      } catch {
        // The close/error event still owns settlement.
      }
      killTimer = setTimeout(() => {
        if (closed) return;
        try {
          child.kill("SIGKILL");
        } catch {
          // The close/error event still owns settlement.
        }
      }, TERMINATION_GRACE_MS);
      killTimer.unref();
    };

    const timeout = setTimeout(() => terminate(adapterError("timeout")), limits.timeoutMs);
    timeout.unref();

    const onAbort = () => terminate(adapterError("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", (error: NodeJS.ErrnoException) => {
      spawnErrorCode = error.code;
    });

    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") {
        terminate(adapterError("process_io_failure"));
      }
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > limits.stdoutMax) {
        terminate(adapterError("stdout_overflow"));
        return;
      }
      stdoutChunks.push(Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > limits.stderrMax) {
        terminate(adapterError("stderr_overflow"));
        return;
      }
      stderrChunks.push(Buffer.from(chunk));
    });

    child.once("close", (code, exitSignal) => {
      closed = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);

      try {
        resolve(
          completedResult(
            prepared,
            {
              code,
              exitSignal,
              ...(spawnErrorCode === undefined ? {} : { spawnErrorCode }),
              ...(terminationError === undefined ? {} : { terminationError }),
              stdoutChunks,
              stderrChunks,
            },
            limits,
          ),
        );
      } catch (error) {
        reject(publicAdapterError(error));
      }
    });

    child.stdin.end(prepared.input);
  });
}
