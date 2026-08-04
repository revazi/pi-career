// Generated from src/ by npm run build; do not edit.
// SPDX-License-Identifier: MIT OR Apache-2.0

// src/index.ts
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

// src/process.ts
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";
var SINGLE_INPUT_MAX_BYTES = 262144;
var COMPOSITE_INPUT_MAX_BYTES = 1048576;
var TOOL_RESULT_MAX_BYTES = 5e4;
var TOOL_RESULT_MAX_LINES = 2e3;
var STDOUT_CAPTURE_MAX_BYTES = 1048576;
var STDERR_CAPTURE_MAX_BYTES = 16384;
var DEFAULT_TIMEOUT_MS = 3e4;
var TERMINATION_GRACE_MS = 250;
var EXECUTABLE_MAX_BYTES = 4096;
var KNOWN_CLI_ERROR_CODES = /* @__PURE__ */ new Set([
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
  "variant_selection_invalid"
]);
var ERROR_MESSAGES = {
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
  internal_error: "The Career Core Pi adapter failed unexpectedly."
};
var CareerInvocationError = class extends Error {
  payload;
  constructor(payload) {
    super(JSON.stringify(payload));
    this.name = "CareerInvocationError";
    this.payload = payload;
  }
};
function adapterError(code, careerError) {
  return new CareerInvocationError({
    schema_version: "career.pi_error.v1",
    code,
    message: ERROR_MESSAGES[code],
    ...careerError === void 0 ? {} : { career_error: careerError }
  });
}
function publicAdapterError(error) {
  return error instanceof CareerInvocationError ? error : adapterError("internal_error");
}
function resolveCareerExecutable(environment = process.env) {
  const override = environment.CAREER_CLI_PATH;
  if (override === void 0) return "career";
  if (override.length === 0 || override.includes("\0") || Buffer.byteLength(override, "utf8") > EXECUTABLE_MAX_BYTES || !isAbsolute(override)) {
    throw adapterError("invalid_executable_override");
  }
  return override;
}
var DOCUMENT_INPUT_LIMITS = {
  "resume.evaluate": SINGLE_INPUT_MAX_BYTES,
  "resume.analyze": SINGLE_INPUT_MAX_BYTES,
  "resume.analysis-suggestions-review": SINGLE_INPUT_MAX_BYTES,
  "resume.analysis-replacements-review": SINGLE_INPUT_MAX_BYTES,
  "resume.normalize": SINGLE_INPUT_MAX_BYTES,
  "resume.enrich": SINGLE_INPUT_MAX_BYTES,
  "resume.variant-review": COMPOSITE_INPUT_MAX_BYTES,
  "resume.variant-materialize": COMPOSITE_INPUT_MAX_BYTES,
  "job.normalize": SINGLE_INPUT_MAX_BYTES,
  "job.match": COMPOSITE_INPUT_MAX_BYTES
};
function prepareDiscoveryInvocation(invocation) {
  switch (invocation.operation) {
    case "capabilities":
      if (invocation.schemaId !== void 0) throw adapterError("invalid_request");
      return { args: ["capabilities", "--format", "json-compact"], operation: "capabilities" };
    case "schema-list":
      if (invocation.schemaId !== void 0) throw adapterError("invalid_request");
      return { args: ["schema", "list", "--format", "json-compact"], operation: "schema.list" };
    case "schema-export":
      if (typeof invocation.schemaId !== "string" || invocation.schemaId.length > 100 || !/^career\.[a-z0-9_.-]+\.v[0-9]+$/.test(invocation.schemaId)) {
        throw adapterError("invalid_request");
      }
      return {
        args: ["schema", "export", "--id", invocation.schemaId, "--format", "json-compact"],
        operation: "schema.export"
      };
    default:
      throw adapterError("invalid_request");
  }
}
function isJsonObject(inputJson) {
  try {
    const parsed = JSON.parse(inputJson);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
function prepareDocumentInvocation(invocation) {
  const operation = `${invocation.kind}.${invocation.operation}`;
  const inputMaxBytes = DOCUMENT_INPUT_LIMITS[operation];
  if (typeof invocation.inputJson !== "string") throw adapterError("invalid_request");
  const inputBytes = Buffer.byteLength(invocation.inputJson, "utf8");
  if (inputMaxBytes === void 0 || inputBytes === 0 || inputBytes > inputMaxBytes || !isJsonObject(invocation.inputJson)) {
    throw adapterError("invalid_request");
  }
  return {
    args: [invocation.kind, invocation.operation, "--input", "-", "--format", "json-compact"],
    input: invocation.inputJson,
    operation
  };
}
function prepareInvocation(invocation) {
  return invocation.kind === "discovery" ? prepareDiscoveryInvocation(invocation) : prepareDocumentInvocation(invocation);
}
function decodeUtf8(chunks) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return void 0;
  }
}
function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
function parseKnownCliError(stderr) {
  const value = parseJsonObject(stderr);
  if (value === void 0) return void 0;
  if (Object.keys(value).sort().join(",") !== "code,field_path,message,schema_version") return void 0;
  if (value.schema_version !== "career.error.v1") return void 0;
  if (typeof value.code !== "string" || !KNOWN_CLI_ERROR_CODES.has(value.code)) return void 0;
  if (typeof value.message !== "string" || value.message.length === 0 || value.message.length > 500 || !/^[\x20-\x7e]+$/.test(value.message)) {
    return void 0;
  }
  if (value.field_path !== null && (typeof value.field_path !== "string" || value.field_path.length > 100 || !/^[A-Za-z0-9_.\[\]-]*$/.test(value.field_path))) {
    return void 0;
  }
  return {
    schema_version: "career.error.v1",
    code: value.code,
    message: value.message,
    field_path: value.field_path
  };
}
function outputLineCount(text) {
  if (text.length === 0) return 0;
  const newlineCount = (text.match(/\n/g) ?? []).length;
  return text.endsWith("\n") ? newlineCount : newlineCount + 1;
}
function withoutOneTrailingNewline(text) {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}
function executionLimits(options) {
  const limits = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    stdoutMax: options.stdoutCaptureMaxBytes ?? STDOUT_CAPTURE_MAX_BYTES,
    stderrMax: options.stderrCaptureMaxBytes ?? STDERR_CAPTURE_MAX_BYTES,
    resultMax: options.toolResultMaxBytes ?? TOOL_RESULT_MAX_BYTES,
    resultLineMax: options.toolResultMaxLines ?? TOOL_RESULT_MAX_LINES
  };
  const positiveIntegers = [
    limits.timeoutMs,
    limits.stdoutMax,
    limits.stderrMax,
    limits.resultMax,
    limits.resultLineMax
  ];
  if (positiveIntegers.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw adapterError("invalid_request");
  }
  if (limits.stdoutMax <= limits.resultMax) throw adapterError("invalid_request");
  return limits;
}
function throwCliFailure(code, stdout, stderr) {
  if (stdout.trim().length === 0 && code !== null && code >= 2 && code <= 6) {
    const cliError = parseKnownCliError(stderr);
    if (cliError !== void 0) throw adapterError("career_cli_error", cliError);
  }
  throw adapterError("cli_failure");
}
function successfulResult(prepared, stdout, stderr, limits) {
  if (stderr.trim().length !== 0) throw adapterError("unexpected_stderr");
  if (Buffer.byteLength(stdout, "utf8") > limits.resultMax) throw adapterError("result_too_large");
  if (outputLineCount(stdout) > limits.resultLineMax) throw adapterError("result_too_many_lines");
  if (parseJsonObject(stdout) === void 0) throw adapterError("malformed_result");
  return { json: withoutOneTrailingNewline(stdout), operation: prepared.operation };
}
function completedResult(prepared, completed, limits) {
  if (completed.terminationError !== void 0) throw completed.terminationError;
  if (completed.spawnErrorCode === "ENOENT") throw adapterError("missing_executable");
  if (completed.spawnErrorCode === "EACCES" || completed.spawnErrorCode === "EPERM") {
    throw adapterError("executable_unavailable");
  }
  if (completed.spawnErrorCode !== void 0) throw adapterError("process_failure");
  if (completed.exitSignal !== null) throw adapterError("process_signalled");
  const stdout = decodeUtf8(completed.stdoutChunks);
  const stderr = decodeUtf8(completed.stderrChunks);
  if (stdout === void 0 || stderr === void 0) throw adapterError("malformed_result");
  if (completed.code !== 0) throwCliFailure(completed.code, stdout, stderr);
  return successfulResult(prepared, stdout, stderr, limits);
}
async function invokeCareerCli(invocation, signal, options = {}) {
  const prepared = prepareInvocation(invocation);
  const executable = options.executable ?? resolveCareerExecutable();
  if (executable.length === 0 || executable.includes("\0") || Buffer.byteLength(executable, "utf8") > EXECUTABLE_MAX_BYTES || executable !== "career" && !isAbsolute(executable)) {
    throw adapterError("invalid_executable_override");
  }
  if (signal?.aborted) throw adapterError("cancelled");
  const limits = executionLimits(options);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, prepared.args, {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch {
      reject(adapterError("executable_unavailable"));
      return;
    }
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let closed = false;
    let spawnErrorCode;
    let terminationError;
    let killTimer;
    const terminate = (error) => {
      if (terminationError !== void 0 || closed) return;
      terminationError = error;
      try {
        child.kill("SIGTERM");
      } catch {
      }
      killTimer = setTimeout(() => {
        if (closed) return;
        try {
          child.kill("SIGKILL");
        } catch {
        }
      }, TERMINATION_GRACE_MS);
      killTimer.unref();
    };
    const timeout = setTimeout(() => terminate(adapterError("timeout")), limits.timeoutMs);
    timeout.unref();
    const onAbort = () => terminate(adapterError("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => {
      spawnErrorCode = error.code;
    });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") {
        terminate(adapterError("process_io_failure"));
      }
    });
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > limits.stdoutMax) {
        terminate(adapterError("stdout_overflow"));
        return;
      }
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
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
      if (killTimer !== void 0) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      try {
        resolve(
          completedResult(
            prepared,
            {
              code,
              exitSignal,
              ...spawnErrorCode === void 0 ? {} : { spawnErrorCode },
              ...terminationError === void 0 ? {} : { terminationError },
              stdoutChunks,
              stderrChunks
            },
            limits
          )
        );
      } catch (error) {
        reject(publicAdapterError(error));
      }
    });
    child.stdin.end(prepared.input);
  });
}

// src/index.ts
var DISCOVERY_OPERATIONS = ["capabilities", "schema-list", "schema-export"];
var RESUME_OPERATIONS = [
  "evaluate",
  "analyze",
  "analysis-suggestions-review",
  "analysis-replacements-review",
  "normalize",
  "enrich",
  "variant-review",
  "variant-materialize"
];
var JOB_OPERATIONS = ["normalize", "match"];
var discoveryParameters = Type.Object(
  {
    operation: StringEnum(DISCOVERY_OPERATIONS, {
      description: "Discover capabilities, list embedded schemas, or export one embedded schema."
    }),
    schema_id: Type.Optional(
      Type.String({
        description: "Required only for schema-export; use an exact ID returned by schema-list.",
        minLength: 1,
        maxLength: 100,
        pattern: "^career\\.[a-z0-9_.-]+\\.v[0-9]+$"
      })
    )
  },
  { additionalProperties: false }
);
var resumeParameters = Type.Object(
  {
    operation: StringEnum(RESUME_OPERATIONS, {
      description: "One available deterministic resume CLI operation."
    }),
    input_json: Type.String({
      description: "Exactly one versioned JSON input object as a string. Discover the operation schema first. Private arguments may be stored by Pi unless the session is transient.",
      minLength: 2,
      maxLength: COMPOSITE_INPUT_MAX_BYTES
    })
  },
  { additionalProperties: false }
);
var jobParameters = Type.Object(
  {
    operation: StringEnum(JOB_OPERATIONS, {
      description: "Normalize a caller-supplied job description or match original resume/job inputs."
    }),
    input_json: Type.String({
      description: "Exactly one versioned JSON input object as a string. Discover the operation schema first. Private arguments may be stored by Pi unless the session is transient.",
      minLength: 2,
      maxLength: COMPOSITE_INPUT_MAX_BYTES
    })
  },
  { additionalProperties: false }
);
var privacyGuideline = "Before using career_core_resume or career_core_job with private career content, require an explicit user decision about Pi session persistence and recommend starting a new `pi --no-session` transient run; do not claim secure erasure.";
function resultContent(json, operation) {
  return {
    content: [{ type: "text", text: json }],
    details: {
      schema_version: "career.pi_tool_details.v1",
      operation
    }
  };
}
function careerCoreExtension(pi) {
  pi.registerTool({
    name: "career_core_discover",
    label: "Career Core Discovery",
    description: "Discover the installed deterministic career CLI capabilities and embedded JSON schemas. Makes no network or model request.",
    promptSnippet: "Discover installed Career Core capabilities and exact embedded schemas before document operations",
    promptGuidelines: [
      "Use career_core_discover before career_core_resume or career_core_job; invoke only capabilities reported as available and do not infer contract shapes."
    ],
    parameters: discoveryParameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await invokeCareerCli(
          {
            kind: "discovery",
            operation: params.operation,
            ...params.schema_id === void 0 ? {} : { schemaId: params.schema_id }
          },
          signal
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw publicAdapterError(error);
      }
    }
  });
  pi.registerTool({
    name: "career_core_resume",
    label: "Career Core Resume",
    description: "Run one bounded installed Career Core resume operation with JSON over stdin. Returns the complete authoritative CLI JSON or fails without truncation. Never invokes Cargo, a provider, or the network.",
    promptSnippet: "Evaluate, analyze, normalize, or review bounded resume inputs through the installed deterministic CLI",
    promptGuidelines: [
      privacyGuideline,
      "Use career_core_resume only with an exact schema discovered through career_core_discover; preserve every warning, evidence item, uncertainty status, baseline boundary, and assisted/non-authoritative label returned by the tool.",
      "If career_core_resume reports result_too_large or result_too_many_lines, do not request a truncated result; fall back to the installed career CLI in a user-approved local workflow that can consume the complete JSON."
    ],
    parameters: resumeParameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await invokeCareerCli(
          {
            kind: "resume",
            operation: params.operation,
            inputJson: params.input_json
          },
          signal
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw publicAdapterError(error);
      }
    }
  });
  pi.registerTool({
    name: "career_core_job",
    label: "Career Core Job",
    description: "Run installed Career Core job normalization or conservative matching with JSON over stdin. Returns complete authoritative CLI JSON or fails without truncation. Never fetches URLs, invokes Cargo, a provider, or the network.",
    promptSnippet: "Normalize job text or conservatively match original resume and job inputs through the installed deterministic CLI",
    promptGuidelines: [
      privacyGuideline,
      "Use career_core_job only with an exact schema discovered through career_core_discover; preserve source spans, confidence, warnings, uncertainty, conservative equivalence, and recommendation limitations exactly.",
      "If career_core_job reports result_too_large or result_too_many_lines, do not request a truncated result; fall back to the installed career CLI in a user-approved local workflow that can consume the complete JSON."
    ],
    parameters: jobParameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await invokeCareerCli(
          {
            kind: "job",
            operation: params.operation,
            inputJson: params.input_json
          },
          signal
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw publicAdapterError(error);
      }
    }
  });
}
export {
  careerCoreExtension as default
};
