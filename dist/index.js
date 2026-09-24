// Generated from src/ by npm run build; do not edit.
// SPDX-License-Identifier: MIT OR Apache-2.0

// src/index.ts
import { StringEnum as StringEnum2 } from "@earendil-works/pi-ai";
import { Type as Type2 } from "typebox";

// src/errors.ts
var ERROR_MESSAGES = {
  unsupported_platform: "pi-career supports only macOS and Linux.",
  invalid_request: "The Career Core tool request is invalid.",
  invalid_executable_override: "CAREER_CLI_PATH must be a bounded absolute executable path.",
  managed_contract_invalid: "The selected Career Core runtime has incompatible managed contracts.",
  runtime_unavailable: "No compatible Career Core runtime is available. Install @revazi/career@0.2.0 or configure a compatible local career executable.",
  runtime_acquisition_failed: "Automatic acquisition of @revazi/career@0.2.0 failed. Install that exact package or configure a compatible local career executable.",
  missing_executable: "The selected Career Core runtime was not found.",
  executable_unavailable: "The selected Career Core runtime is not available for execution.",
  cancelled: "The Career Core operation was cancelled.",
  timeout: "The Career Core operation exceeded its time limit.",
  stdout_overflow: "The Career Core runtime exceeded the stdout capture limit.",
  stderr_overflow: "The Career Core runtime exceeded the stderr capture limit.",
  result_too_large: "The complete Career Core result exceeds the Pi tool context byte limit; partial output is unavailable and full-result export is not yet supported.",
  result_too_many_lines: "The complete Career Core result exceeds the Pi tool context line limit; partial output is unavailable and full-result export is not yet supported.",
  malformed_result: "The Career Core runtime did not return exactly one valid JSON object.",
  unexpected_stderr: "The Career Core runtime wrote unexpected diagnostics on success.",
  process_signalled: "The Career Core runtime ended because of a signal.",
  career_cli_error: "The Career Core runtime rejected the request with a validated error.",
  cli_failure: "The Career Core runtime failed without a validated error envelope.",
  process_io_failure: "The Career Core runtime stream failed.",
  process_failure: "The Career Core runtime failed unexpectedly.",
  internal_error: "The Career Core Pi adapter failed unexpectedly."
}, CareerInvocationError = class extends Error {
  payload;
  constructor(payload) {
    super(JSON.stringify(payload)), this.name = "CareerInvocationError", this.payload = payload;
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
function publicAdapterMessage(error) {
  let code = error.payload?.code, safeCode = typeof code == "string" && Object.hasOwn(ERROR_MESSAGES, code) ? code : "internal_error";
  return `${safeCode}: ${ERROR_MESSAGES[safeCode]}`;
}
function publicAdapterError(error) {
  return error instanceof CareerInvocationError ? error : adapterError("internal_error");
}
function payloadFreeAdapterError(error) {
  let code = error.payload?.code;
  return adapterError(typeof code == "string" && Object.hasOwn(ERROR_MESSAGES, code) ? code : "internal_error");
}

// src/process.ts
import { spawn as spawn2 } from "node:child_process";
import { isAbsolute } from "node:path";
import { TextDecoder as TextDecoder2 } from "node:util";

// src/managed/catalog.ts
var MANAGED_INVOKE_OPTIONS = {
  stdoutCaptureMaxBytes: 33554433,
  toolResultMaxBytes: 33554432,
  toolResultMaxLines: 2
}, EXPECTED_CORE_VERSION = "0.2.0", EXPECTED_OPERATIONS = {
  "core.capabilities": {
    capability: "core.capabilities",
    path: ["capabilities"],
    input: null,
    output: "career.capabilities.v1",
    inputBytes: null
  },
  "core.operations": {
    capability: null,
    path: ["operations"],
    input: null,
    output: "career.operation_catalog.v1",
    inputBytes: null
  },
  "schema.list": {
    capability: null,
    path: ["schema", "list"],
    input: null,
    output: "career.schema_catalog.v1",
    inputBytes: null
  },
  "schema.export": {
    capability: null,
    path: ["schema", "export"],
    input: null,
    output: "https://json-schema.org/draft/2020-12/schema",
    inputBytes: null
  },
  "schema.bundle": {
    capability: null,
    path: ["schema", "bundle"],
    input: null,
    output: "https://json-schema.org/draft/2020-12/schema",
    inputBytes: null
  },
  "resume.evaluate": {
    capability: "resume.evaluate",
    path: ["resume", "evaluate"],
    input: "career.resume_input.v1",
    output: "career.resume_evaluation.v1",
    inputBytes: 262144
  },
  "resume.analyze": {
    capability: "resume.analyze",
    path: ["resume", "analyze"],
    input: "career.resume_input.v1",
    output: "career.resume_analysis.v1",
    inputBytes: 262144
  },
  "resume.normalize": {
    capability: "resume.normalize",
    path: ["resume", "normalize"],
    input: "career.resume_input.v1",
    output: "career.resume_normalization.v1",
    inputBytes: 262144
  },
  "resume.enrich": {
    capability: "resume.enrich",
    path: ["resume", "enrich"],
    input: "career.resume_enrichment_input.v1",
    output: "career.resume_enrichment_result.v1",
    inputBytes: 262144
  },
  "resume.analysis-suggestions.review": {
    capability: "resume.analysis-suggestions.review",
    path: ["resume", "analysis-suggestions-review"],
    input: "career.resume_analysis_suggestion_review_input.v1",
    output: "career.resume_analysis_suggestion_review.v1",
    inputBytes: 262144
  },
  "resume.analysis-replacements.review": {
    capability: "resume.analysis-replacements.review",
    path: ["resume", "analysis-replacements-review"],
    input: "career.resume_analysis_replacement_review_input.v1",
    output: "career.resume_analysis_replacement_review.v1",
    inputBytes: 262144
  },
  "resume.variant.review": {
    capability: "resume.variant.review",
    path: ["resume", "variant-review"],
    input: "career.resume_variant_review_input.v1",
    output: "career.resume_variant_review.v1",
    inputBytes: 1048576
  },
  "resume.variant.materialize": {
    capability: "resume.variant.materialize",
    path: ["resume", "variant-materialize"],
    input: "career.resume_variant_materialization_input.v1",
    output: "career.resume_variant.v1",
    inputBytes: 1048576
  },
  "job.normalize": {
    capability: "job.normalize",
    path: ["job", "normalize"],
    input: "career.job_input.v1",
    output: "career.job_normalization.v1",
    inputBytes: 262144
  },
  "job.match": {
    capability: "job.match",
    path: ["job", "match"],
    input: "career.job_match_input.v1",
    output: "career.job_match.v1",
    inputBytes: 1048576
  }
}, REQUIRED_BUNDLES = [
  ["career.resume_analysis_suggestion_review_input.v1", "resume-analysis-suggestion-review-input-v1.schema.json"],
  ["career.resume_analysis_replacement_review_input.v1", "resume-analysis-replacement-review-input-v1.schema.json"],
  ["career.resume_variant_review_input.v1", "resume-variant-review-input-v1.schema.json"],
  ["career.resume_variant_materialization_input.v1", "resume-variant-materialization-input-v1.schema.json"]
];
function isRecord(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function parseObject(json) {
  let value = JSON.parse(json);
  if (!isRecord(value)) throw new Error("managed_contract_invalid");
  return value;
}
function exactKeys(value, expected) {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}
function parseDescriptor(value) {
  if (!isRecord(value) || !exactKeys(value, [
    "operation_id",
    "capability_id",
    "availability",
    "cli_path",
    "input_transport",
    "input_schema_id",
    "output_schema_id",
    "maximum_input_bytes",
    "maximum_successful_machine_output_bytes"
  ])) throw new Error("managed_contract_invalid");
  if (typeof value.operation_id != "string" || value.capability_id !== null && typeof value.capability_id != "string" || value.availability !== "available" || !Array.isArray(value.cli_path) || value.cli_path.length === 0 || !value.cli_path.every((part) => typeof part == "string" && /^[a-z-]+$/.test(part)) || value.input_transport !== "none" && value.input_transport !== "cli_arguments" && value.input_transport !== "json_file_or_stdin" || value.input_schema_id !== null && typeof value.input_schema_id != "string" || typeof value.output_schema_id != "string" || value.maximum_input_bytes !== null && !Number.isSafeInteger(value.maximum_input_bytes) || value.maximum_successful_machine_output_bytes !== 33554432) throw new Error("managed_contract_invalid");
  return value;
}
function verifyDescriptor(descriptor, expected) {
  let documentOperation = expected.input !== null;
  if (descriptor.capability_id !== expected.capability || descriptor.cli_path.join("\0") !== expected.path.join("\0") || descriptor.input_schema_id !== expected.input || descriptor.output_schema_id !== expected.output || descriptor.maximum_input_bytes !== expected.inputBytes || descriptor.input_transport !== (documentOperation ? "json_file_or_stdin" : descriptor.operation_id.startsWith("schema.") && descriptor.operation_id !== "schema.list" ? "cli_arguments" : "none")) throw new Error("managed_contract_invalid");
}
function inspectReferences(value, root) {
  if (Array.isArray(value)) {
    for (let item2 of value) inspectReferences(item2, root);
    return;
  }
  if (!isRecord(value)) return;
  let reference = value.$ref;
  if (reference !== void 0) {
    if (typeof reference != "string" || !reference.startsWith("#/"))
      throw new Error("managed_contract_invalid");
    let current = root;
    for (let rawPart of reference.slice(2).split("/")) {
      let part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!isRecord(current) || !Object.hasOwn(current, part))
        throw new Error("managed_contract_invalid");
      current = current[part];
    }
  }
  for (let nested of Object.values(value)) inspectReferences(nested, root);
}
function verifyBundle(json, fileName) {
  let bundle = parseObject(json);
  if (bundle.$schema !== "https://json-schema.org/draft/2020-12/schema" || typeof bundle.$id != "string" || !bundle.$id.endsWith(`/${fileName}`)) throw new Error("managed_contract_invalid");
  inspectReferences(bundle, bundle);
}
var ManagedContractCache = class {
  cached;
  loading;
  async load(invoke, signal) {
    if (this.cached !== void 0) return this.cached;
    if (this.loading !== void 0) return this.loading;
    this.loading = this.discover(invoke, signal);
    try {
      let contracts = await this.loading;
      return signal?.aborted || (this.cached = contracts), contracts;
    } finally {
      this.loading = void 0;
    }
  }
  async discover(invoke, signal) {
    let catalogResult = await invoke(
      { kind: "discovery", operation: "operations" },
      signal,
      MANAGED_INVOKE_OPTIONS
    ), catalog = parseObject(catalogResult.json);
    if (!exactKeys(catalog, ["schema_version", "core_version", "operations"]) || catalog.schema_version !== "career.operation_catalog.v1" || catalog.core_version !== EXPECTED_CORE_VERSION || !Array.isArray(catalog.operations)) throw new Error("managed_contract_invalid");
    let operations = /* @__PURE__ */ new Map();
    for (let value of catalog.operations) {
      let descriptor = parseDescriptor(value);
      if (operations.has(descriptor.operation_id)) throw new Error("managed_contract_invalid");
      operations.set(descriptor.operation_id, descriptor);
    }
    if (operations.size !== Object.keys(EXPECTED_OPERATIONS).length)
      throw new Error("managed_contract_invalid");
    for (let [operationId, expected] of Object.entries(EXPECTED_OPERATIONS)) {
      let descriptor = operations.get(operationId);
      if (descriptor === void 0) throw new Error("managed_contract_invalid");
      verifyDescriptor(descriptor, expected);
    }
    let bundles = await Promise.all(REQUIRED_BUNDLES.map(async ([schemaId, fileName]) => ({
      fileName,
      result: await invoke(
        { kind: "discovery", operation: "schema-bundle", schemaId },
        signal,
        MANAGED_INVOKE_OPTIONS
      )
    })));
    for (let bundle of bundles) verifyBundle(bundle.result.json, bundle.fileName);
    return { coreVersion: catalog.core_version, operations };
  }
};

// src/runtime.ts
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { TextDecoder } from "node:util";
var CAREER_PACKAGE_NAME = "@revazi/career", CAREER_PACKAGE_VERSION = "0.2.0", CAREER_LAUNCHER_SCHEMA = "career.npm_launcher.v2", CAREER_TARGET_CATALOG = "targets.json", CAREER_LAUNCHER_ENTRY = "bin/career.js", CAREER_PLATFORM_PACKAGES = Object.freeze([
  "@revazi/career-darwin-arm64",
  "@revazi/career-darwin-x64",
  "@revazi/career-linux-x64-gnu",
  "@revazi/career-linux-arm64-gnu",
  "@revazi/career-linux-x64-musl",
  "@revazi/career-linux-arm64-musl"
]), CAREER_LAUNCHER_FILES = Object.freeze([
  CAREER_LAUNCHER_ENTRY,
  CAREER_TARGET_CATALOG,
  "README.md",
  "LICENSE-MIT",
  "LICENSE-APACHE",
  "THIRD_PARTY_NOTICES.md"
]), CAREER_PACKAGE_SPEC = `${CAREER_PACKAGE_NAME}@${CAREER_PACKAGE_VERSION}`, EXECUTABLE_MAX_BYTES = 4096, PATH_MAX_BYTES = 65536, PACKAGE_MANIFEST_MAX_BYTES = 32768, LAUNCHER_MAX_BYTES = 65536, ACQUISITION_STDOUT_MAX_BYTES = 8192, ACQUISITION_STDERR_MAX_BYTES = 16384, ACQUISITION_TIMEOUT_MS = 12e4, TERMINATION_GRACE_MS = 250, CANONICAL_NPM_REGISTRY = "https://registry.npmjs.org/", SOURCE_ORDER = ["path", "package-local", "acquired"], SUPPORTED_PLATFORMS = /* @__PURE__ */ new Set(["darwin", "linux"]), requireFromPackage = createRequire(import.meta.url), cachedResolution, pendingResolution;
function environmentValue(environment, key) {
  return environment[key];
}
function runtimeEnvironmentKey(environment) {
  return JSON.stringify([
    environmentValue(environment, "CAREER_CLI_PATH") ?? null,
    environmentValue(environment, "PATH") ?? null
  ]);
}
function assertSupportedPlatform() {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) throw adapterError("unsupported_platform");
}
function resolveCareerExecutable(environment = process.env) {
  assertSupportedPlatform();
  let override = environmentValue(environment, "CAREER_CLI_PATH");
  if (override !== void 0) {
    if (override.length === 0 || override.includes("\0") || Buffer.byteLength(override, "utf8") > EXECUTABLE_MAX_BYTES || !path.isAbsolute(override))
      throw adapterError("invalid_executable_override");
    return override;
  }
}
function route(command, argumentPrefix, source) {
  return Object.freeze({
    command,
    argumentPrefix: Object.freeze([...argumentPrefix]),
    source,
    identity: `${source}\0${command}\0${argumentPrefix.join("\0")}`
  });
}
function explicitRoute(executable) {
  return route(executable, [], "explicit");
}
function pathEntries(environmentPath, cwd) {
  return environmentPath === void 0 || environmentPath.includes("\0") || Buffer.byteLength(environmentPath, "utf8") > PATH_MAX_BYTES ? [] : environmentPath.split(path.delimiter).map((entry) => path.resolve(entry || cwd));
}
async function pathRoute(environment, cwd) {
  for (let directory of pathEntries(environmentValue(environment, "PATH"), cwd)) {
    let candidate = path.join(directory, "career");
    try {
      let metadata = await lstat(candidate);
      if (!metadata.isFile() && !metadata.isSymbolicLink()) continue;
      return await access(candidate, fsConstants.X_OK), route(candidate, [], "path");
    } catch {
    }
  }
}
function isRecord2(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function boundedRegularFile(metadata, maximumBytes, executable) {
  return !metadata.isSymbolicLink() && metadata.isFile() && metadata.size >= 2 && metadata.size <= maximumBytes && (!executable || (metadata.mode & 73) !== 0);
}
function exactKeys2(value, expected) {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}
function exactStringArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}
function launcherManifestIsValid(manifest) {
  if (!isRecord2(manifest) || !isRecord2(manifest.bin) || !isRecord2(manifest.optionalDependencies) || !isRecord2(manifest.career_launcher)) return !1;
  let optionalDependencies = manifest.optionalDependencies;
  return manifest.name === CAREER_PACKAGE_NAME && manifest.version === CAREER_PACKAGE_VERSION && exactKeys2(manifest.bin, ["career"]) && manifest.bin.career === CAREER_LAUNCHER_ENTRY && exactStringArray(manifest.files, CAREER_LAUNCHER_FILES) && exactKeys2(optionalDependencies, CAREER_PLATFORM_PACKAGES) && CAREER_PLATFORM_PACKAGES.every(
    (packageName) => optionalDependencies[packageName] === CAREER_PACKAGE_VERSION
  ) && exactKeys2(manifest.career_launcher, [
    "schema_version",
    "executable",
    "target_catalog",
    "platform_packages"
  ]) && manifest.career_launcher.schema_version === CAREER_LAUNCHER_SCHEMA && manifest.career_launcher.executable === "career" && manifest.career_launcher.target_catalog === CAREER_TARGET_CATALOG && exactStringArray(manifest.career_launcher.platform_packages, CAREER_PLATFORM_PACKAGES);
}
async function readLauncherRoute(manifestPath, source, execPath) {
  try {
    if (!path.isAbsolute(manifestPath) || !path.isAbsolute(execPath)) return;
    let [manifestMetadata, realNodePath] = await Promise.all([
      lstat(manifestPath),
      realpath(execPath)
    ]);
    if (!boundedRegularFile(manifestMetadata, PACKAGE_MANIFEST_MAX_BYTES, !1)) return;
    let nodeMetadata = await lstat(realNodePath);
    if (!nodeMetadata.isFile() || (nodeMetadata.mode & 73) === 0) return;
    let bytes = await readFile(manifestPath);
    if (bytes.length !== manifestMetadata.size) return;
    let manifest = JSON.parse(bytes.toString("utf8"));
    if (!launcherManifestIsValid(manifest)) return;
    let launcherPath = path.join(path.dirname(manifestPath), CAREER_LAUNCHER_ENTRY), launcherMetadata = await lstat(launcherPath);
    return boundedRegularFile(launcherMetadata, LAUNCHER_MAX_BYTES, !0) ? route(realNodePath, [launcherPath], source) : void 0;
  } catch {
    return;
  }
}
function defaultPackageManifest() {
  try {
    return requireFromPackage.resolve(`${CAREER_PACKAGE_NAME}/package.json`);
  } catch {
    return;
  }
}
async function packageLocalRoute(dependencies) {
  let manifestPath = (dependencies.resolvePackageManifest ?? defaultPackageManifest)();
  if (manifestPath !== void 0)
    return readLauncherRoute(
      manifestPath,
      "package-local",
      dependencies.execPath ?? process.execPath
    );
}
function npmExecPathValues(environment) {
  return Object.entries(environment).filter(([key]) => key.toLowerCase() === "npm_execpath").map(([, value]) => value);
}
async function trustedNpm(execPath, environment) {
  try {
    if (!path.isAbsolute(execPath)) throw new Error("invalid node path");
    let realNodePath = await realpath(execPath), nodeMetadata = await lstat(realNodePath);
    if (!nodeMetadata.isFile() || (nodeMetadata.mode & 73) === 0)
      throw new Error("invalid node executable");
    let derivedNpmCliPath = path.join(
      path.dirname(path.dirname(realNodePath)),
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ), realNpmCliPath = await realpath(derivedNpmCliPath);
    if (realNpmCliPath !== derivedNpmCliPath) throw new Error("invalid npm path");
    let npmMetadata = await lstat(realNpmCliPath);
    if (!npmMetadata.isFile() || (npmMetadata.mode & 73) === 0)
      throw new Error("invalid npm executable");
    let supplied = npmExecPathValues(environment);
    if (supplied.length > 1) throw new Error("ambiguous npm_execpath");
    if (supplied.length === 1) {
      let suppliedPath = supplied[0];
      if (typeof suppliedPath != "string" || !path.isAbsolute(suppliedPath))
        throw new Error("invalid npm_execpath");
      if (await realpath(suppliedPath) !== realNpmCliPath)
        throw new Error("conflicting npm_execpath");
    }
    return { nodePath: realNodePath, npmCliPath: realNpmCliPath, scriptShell: "/bin/sh" };
  } catch {
    throw adapterError("runtime_acquisition_failed");
  }
}
var FORBIDDEN_NPM_ENVIRONMENT = /* @__PURE__ */ new Set([
  "node_env",
  "node_options",
  "npm_config_audit_level",
  "npm_config_global",
  "npm_config_include",
  "npm_config_omit",
  "npm_config_prefix",
  "npm_config_registry",
  "npm_config_script_shell"
]);
function sanitizedNpmEnvironment(environment, trusted) {
  return {
    ...Object.fromEntries(Object.entries(environment).filter(
      ([key, value]) => typeof value == "string" && key.toLowerCase() !== "path" && !FORBIDDEN_NPM_ENVIRONMENT.has(key.toLowerCase().replaceAll("-", "_"))
    )),
    PATH: [path.dirname(trusted.nodePath), "/usr/bin", "/bin"].join(path.delimiter)
  };
}
var LOCATE_ACQUIRED_PATH_EXPRESSION = "process.env.PATH";
function decodeAcquiredLauncherOutput(stdout) {
  try {
    let launchers = new TextDecoder("utf-8", { fatal: !0 }).decode(Buffer.concat(stdout)).split(/\r?\n/).flatMap((line) => {
      let firstPathEntry = line.split(path.delimiter)[0];
      if (firstPathEntry === void 0 || !path.isAbsolute(firstPathEntry) || path.basename(firstPathEntry) !== ".bin") return [];
      let modules = path.dirname(firstPathEntry);
      return path.basename(modules) !== "node_modules" ? [] : [path.join(modules, "@revazi", "career", "bin", "career.js")];
    }), launcher = launchers[0];
    if (launchers.length !== 1 || launcher === void 0 || launcher.includes("\0") || Buffer.byteLength(launcher, "utf8") > EXECUTABLE_MAX_BYTES || !path.isAbsolute(launcher)) throw new Error("invalid acquired launcher");
    return launcher;
  } catch {
    throw adapterError("runtime_acquisition_failed");
  }
}
function terminateAcquisitionProcessTree(child, signal) {
  try {
    if (child.pid === void 0) throw new Error("missing process id");
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
    }
  }
}
async function runAcquisition(trusted, environment, cwd, signal) {
  let { nodePath, npmCliPath, scriptShell } = trusted;
  if (signal?.aborted) throw adapterError("cancelled");
  let arguments_ = [
    npmCliPath,
    "exec",
    "--yes",
    "--ignore-scripts",
    "--include=optional",
    "--node-options=",
    `--script-shell=${scriptShell}`,
    `--registry=${CANONICAL_NPM_REGISTRY}`,
    `--package=${CAREER_PACKAGE_SPEC}`,
    "--",
    nodePath,
    "-p",
    LOCATE_ACQUIRED_PATH_EXPRESSION
  ], completed = await new Promise((resolve) => {
    let child;
    try {
      child = spawn(nodePath, arguments_, {
        cwd,
        detached: !0,
        env: sanitizedNpmEnvironment(environment, trusted),
        shell: !1,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch {
      resolve({ code: null, signal: null, spawnError: !0, stdout: [], stderrBytes: 0 });
      return;
    }
    let stdout = [], stdoutBytes = 0, stderrBytes = 0, closed = !1, spawnError = !1, terminationError, killTimer, terminate = (error) => {
      terminationError !== void 0 || closed || (terminationError = error, terminateAcquisitionProcessTree(child, "SIGTERM"), killTimer = setTimeout(() => {
        closed || terminateAcquisitionProcessTree(child, "SIGKILL");
      }, TERMINATION_GRACE_MS), killTimer.unref());
    }, timeout = setTimeout(
      () => terminate(adapterError("timeout")),
      ACQUISITION_TIMEOUT_MS
    );
    timeout.unref();
    let onAbort = () => terminate(adapterError("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: !0 }), child.once("error", () => {
      spawnError = !0;
    }), child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length, stdoutBytes > ACQUISITION_STDOUT_MAX_BYTES ? terminate(adapterError("stdout_overflow")) : stdout.push(Buffer.from(chunk));
    }), child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length, stderrBytes > ACQUISITION_STDERR_MAX_BYTES && terminate(adapterError("stderr_overflow"));
    }), child.once("close", (code, childSignal) => {
      closed = !0, clearTimeout(timeout), killTimer !== void 0 && clearTimeout(killTimer), signal?.removeEventListener("abort", onAbort), resolve({
        code,
        signal: childSignal,
        spawnError,
        ...terminationError === void 0 ? {} : { terminationError },
        stdout,
        stderrBytes
      });
    });
  });
  if (completed.terminationError !== void 0) throw completed.terminationError;
  if (completed.spawnError || completed.code !== 0 || completed.signal !== null) throw adapterError("runtime_acquisition_failed");
  return decodeAcquiredLauncherOutput(completed.stdout);
}
async function defaultAcquireLauncher(signal, environment, dependencies) {
  let trusted = await trustedNpm(dependencies.execPath ?? process.execPath, environment);
  return runAcquisition(
    trusted,
    environment,
    path.dirname(trusted.nodePath),
    signal
  );
}
async function acquiredRoute(signal, environment, dependencies) {
  if (environmentValue(environment, "PI_OFFLINE") === "1")
    throw adapterError("runtime_unavailable");
  let launcherPath = dependencies.acquireLauncher === void 0 ? await defaultAcquireLauncher(signal, environment, dependencies) : await dependencies.acquireLauncher(signal, environment), manifestPath = path.join(path.dirname(path.dirname(launcherPath)), "package.json"), found = await readLauncherRoute(
    manifestPath,
    "acquired",
    dependencies.execPath ?? process.execPath
  );
  if (found === void 0 || found.argumentPrefix[0] !== launcherPath)
    throw adapterError("runtime_acquisition_failed");
  return found;
}
function terminalProbeError(error) {
  return error instanceof CareerInvocationError && (error.payload.code === "cancelled" || error.payload.code === "timeout");
}
function explicitProbeError(error) {
  return error instanceof CareerInvocationError && (error.payload.code === "missing_executable" || error.payload.code === "executable_unavailable" || error.payload.code === "cancelled" || error.payload.code === "timeout") ? error : adapterError("managed_contract_invalid");
}
function sourceStart(afterSource) {
  if (afterSource === void 0 || afterSource === "explicit") return 0;
  let index = SOURCE_ORDER.indexOf(afterSource);
  return index < 0 ? 0 : index + 1;
}
async function probeCandidate(candidate, probe, signal) {
  try {
    return await probe(candidate, signal), !0;
  } catch (error) {
    if (terminalProbeError(error)) throw error;
    if (candidate.source === "explicit") throw explicitProbeError(error);
    return !1;
  }
}
async function resolveUncached(options) {
  let environment = options.environment ?? process.env, dependencies = options.dependencies ?? {};
  if (options.signal?.aborted) throw adapterError("cancelled");
  let override = resolveCareerExecutable(environment);
  if (override !== void 0) {
    let candidate = explicitRoute(override);
    return await probeCandidate(candidate, options.probe, options.signal), candidate;
  }
  for (let index = sourceStart(options.afterSource); index < SOURCE_ORDER.length; index += 1) {
    let source = SOURCE_ORDER[index], candidate;
    if (source === "path" ? candidate = await pathRoute(environment, dependencies.cwd ?? process.cwd()) : source === "package-local" ? candidate = await packageLocalRoute(dependencies) : candidate = await acquiredRoute(options.signal, environment, dependencies), candidate !== void 0 && await probeCandidate(candidate, options.probe, options.signal))
      return candidate;
  }
  throw adapterError("runtime_unavailable");
}
async function resolveCareerRuntime(options) {
  assertSupportedPlatform();
  let environment = options.environment ?? process.env, environmentKey = runtimeEnvironmentKey(environment), useCache = options.afterSource === void 0 && options.dependencies === void 0;
  if (options.afterSource !== void 0 && cachedResolution?.environmentKey === environmentKey && cachedResolution.route.source === options.afterSource && (cachedResolution = void 0), useCache && cachedResolution?.environmentKey === environmentKey)
    return cachedResolution.route;
  if (useCache && pendingResolution?.environmentKey === environmentKey)
    return pendingResolution.promise;
  cachedResolution?.environmentKey !== environmentKey && (cachedResolution = void 0);
  let promise = resolveUncached(options);
  useCache && (pendingResolution = { environmentKey, promise });
  try {
    let resolved = await promise;
    return useCache && pendingResolution?.promise === promise ? cachedResolution = { environmentKey, route: resolved } : options.afterSource !== void 0 && options.dependencies === void 0 && (cachedResolution = { environmentKey, route: resolved }), resolved;
  } finally {
    useCache && pendingResolution?.promise === promise && (pendingResolution = void 0);
  }
}

// src/process.ts
var SINGLE_INPUT_MAX_BYTES = 262144, COMPOSITE_INPUT_MAX_BYTES = 1048576, TOOL_RESULT_MAX_BYTES = 5e4, TOOL_RESULT_MAX_LINES = 2e3, STDOUT_CAPTURE_MAX_BYTES = 1048576, STDERR_CAPTURE_MAX_BYTES = 16384, DEFAULT_TIMEOUT_MS = 3e4, TERMINATION_GRACE_MS2 = 250, EXECUTABLE_MAX_BYTES2 = 4096, KNOWN_CLI_ERROR_CODES = /* @__PURE__ */ new Set([
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
]), DOCUMENT_INPUT_LIMITS = {
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
    case "operations":
      if (invocation.schemaId !== void 0) throw adapterError("invalid_request");
      return { args: ["operations", "--format", "json-compact"], operation: "core.operations" };
    case "schema-list":
      if (invocation.schemaId !== void 0) throw adapterError("invalid_request");
      return { args: ["schema", "list", "--format", "json-compact"], operation: "schema.list" };
    case "schema-export":
    case "schema-bundle": {
      if (typeof invocation.schemaId != "string" || invocation.schemaId.length > 100 || !/^career\.[a-z0-9_.-]+\.v[0-9]+$/.test(invocation.schemaId))
        throw adapterError("invalid_request");
      let schemaOperation = invocation.operation === "schema-export" ? "export" : "bundle";
      return {
        args: ["schema", schemaOperation, "--id", invocation.schemaId, "--format", "json-compact"],
        operation: `schema.${schemaOperation}`
      };
    }
    default:
      throw adapterError("invalid_request");
  }
}
function isJsonObject(inputJson) {
  try {
    let parsed = JSON.parse(inputJson);
    return parsed !== null && typeof parsed == "object" && !Array.isArray(parsed);
  } catch {
    return !1;
  }
}
function prepareDocumentInvocation(invocation) {
  let operation = `${invocation.kind}.${invocation.operation}`, inputMaxBytes = DOCUMENT_INPUT_LIMITS[operation];
  if (typeof invocation.inputJson != "string") throw adapterError("invalid_request");
  let inputBytes = Buffer.byteLength(invocation.inputJson, "utf8");
  if (inputMaxBytes === void 0 || inputBytes === 0 || inputBytes > inputMaxBytes || !isJsonObject(invocation.inputJson))
    throw adapterError("invalid_request");
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
    return new TextDecoder2("utf-8", { fatal: !0 }).decode(Buffer.concat(chunks));
  } catch {
    return;
  }
}
function parseJsonObject(text) {
  try {
    let parsed = JSON.parse(text);
    return parsed === null || typeof parsed != "object" || Array.isArray(parsed) ? void 0 : parsed;
  } catch {
    return;
  }
}
function parseKnownCliError(stderr) {
  let value = parseJsonObject(stderr);
  if (value !== void 0 && Object.keys(value).sort().join(",") === "code,field_path,message,schema_version" && value.schema_version === "career.error.v1" && !(typeof value.code != "string" || !KNOWN_CLI_ERROR_CODES.has(value.code)) && !(typeof value.message != "string" || value.message.length === 0 || value.message.length > 500 || !/^[\x20-\x7e]+$/.test(value.message)) && !(value.field_path !== null && (typeof value.field_path != "string" || value.field_path.length > 100 || !/^[A-Za-z0-9_.\[\]-]*$/.test(value.field_path))))
    return {
      schema_version: "career.error.v1",
      code: value.code,
      message: value.message,
      field_path: value.field_path
    };
}
function outputLineCount(text) {
  if (text.length === 0) return 0;
  let newlineCount = (text.match(/\n/g) ?? []).length;
  return text.endsWith(`
`) ? newlineCount : newlineCount + 1;
}
function withoutOneTrailingNewline(text) {
  return text.endsWith(`
`) ? text.slice(0, -1) : text;
}
function executionLimits(options) {
  let limits = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    stdoutMax: options.stdoutCaptureMaxBytes ?? STDOUT_CAPTURE_MAX_BYTES,
    stderrMax: options.stderrCaptureMaxBytes ?? STDERR_CAPTURE_MAX_BYTES,
    resultMax: options.toolResultMaxBytes ?? TOOL_RESULT_MAX_BYTES,
    resultLineMax: options.toolResultMaxLines ?? TOOL_RESULT_MAX_LINES
  };
  if ([
    limits.timeoutMs,
    limits.stdoutMax,
    limits.stderrMax,
    limits.resultMax,
    limits.resultLineMax
  ].some((value) => !Number.isSafeInteger(value) || value <= 0))
    throw adapterError("invalid_request");
  if (limits.stdoutMax <= limits.resultMax) throw adapterError("invalid_request");
  return limits;
}
function throwCliFailure(code, stdout, stderr) {
  if (stdout.trim().length === 0 && code !== null && code >= 2 && code <= 6) {
    let cliError = parseKnownCliError(stderr);
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
  if (completed.spawnErrorCode === "EACCES" || completed.spawnErrorCode === "EPERM")
    throw adapterError("executable_unavailable");
  if (completed.spawnErrorCode !== void 0) throw adapterError("process_failure");
  if (completed.exitSignal !== null) throw adapterError("process_signalled");
  let stdout = decodeUtf8(completed.stdoutChunks), stderr = decodeUtf8(completed.stderrChunks);
  if (stdout === void 0 || stderr === void 0) throw adapterError("malformed_result");
  return completed.code !== 0 && throwCliFailure(completed.code, stdout, stderr), successfulResult(prepared, stdout, stderr, limits);
}
var ProcessAttemptError = class extends Error {
  constructor(publicError, started) {
    super(publicError.message);
    this.publicError = publicError;
    this.started = started;
    this.name = "ProcessAttemptError";
  }
  publicError;
  started;
};
function injectedRoute(executable) {
  return Object.freeze({
    command: executable,
    argumentPrefix: Object.freeze([]),
    source: "explicit",
    identity: `injected\0${executable}`
  });
}
function executePrepared(prepared, runtime, signal, limits) {
  return signal?.aborted ? Promise.reject(new ProcessAttemptError(adapterError("cancelled"), !1)) : new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn2(runtime.command, [...runtime.argumentPrefix, ...prepared.args], {
        shell: !1,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch {
      reject(new ProcessAttemptError(adapterError("executable_unavailable"), !1));
      return;
    }
    let stdoutChunks = [], stderrChunks = [], stdoutBytes = 0, stderrBytes = 0, closed = !1, started = !1, spawnErrorCode, terminationError, killTimer, terminate = (error) => {
      if (!(terminationError !== void 0 || closed)) {
        terminationError = error;
        try {
          child.kill("SIGTERM");
        } catch {
        }
        killTimer = setTimeout(() => {
          if (!closed)
            try {
              child.kill("SIGKILL");
            } catch {
            }
        }, TERMINATION_GRACE_MS2), killTimer.unref();
      }
    }, timeout = setTimeout(() => terminate(adapterError("timeout")), limits.timeoutMs);
    timeout.unref();
    let onAbort = () => terminate(adapterError("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: !0 }), child.once("spawn", () => {
      started = !0;
      try {
        child.stdin.end(terminationError === void 0 ? prepared.input : void 0);
      } catch {
        terminate(adapterError("process_io_failure"));
      }
    }), child.once("error", (error) => {
      spawnErrorCode = error.code;
    }), child.stdin.on("error", (error) => {
      error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED" && terminate(adapterError("process_io_failure"));
    }), child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length, stdoutBytes > limits.stdoutMax ? terminate(adapterError("stdout_overflow")) : stdoutChunks.push(Buffer.from(chunk));
    }), child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length, stderrBytes > limits.stderrMax ? terminate(adapterError("stderr_overflow")) : stderrChunks.push(Buffer.from(chunk));
    }), child.once("close", (code, exitSignal) => {
      closed = !0, clearTimeout(timeout), killTimer !== void 0 && clearTimeout(killTimer), signal?.removeEventListener("abort", onAbort);
      try {
        resolve(completedResult(
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
        ));
      } catch (error) {
        reject(new ProcessAttemptError(publicAdapterError(error), started));
      }
    });
  });
}
async function probeRuntime(runtime, signal) {
  await new ManagedContractCache().load(async (invocation, invocationSignal, options = {}) => {
    let prepared = prepareInvocation(invocation);
    try {
      return await executePrepared(
        prepared,
        runtime,
        invocationSignal,
        executionLimits(options)
      );
    } catch (error) {
      throw error instanceof ProcessAttemptError ? error.publicError : publicAdapterError(error);
    }
  }, signal);
}
function retryablePrelaunch(error, runtime) {
  return runtime.source !== "explicit" && !error.started && (error.publicError.payload.code === "missing_executable" || error.publicError.payload.code === "executable_unavailable");
}
async function executeResolved(prepared, runtime, signal, limits) {
  try {
    return await executePrepared(prepared, runtime, signal, limits);
  } catch (error) {
    if (!(error instanceof ProcessAttemptError)) throw publicAdapterError(error);
    if (!retryablePrelaunch(error, runtime) || signal?.aborted) throw error.publicError;
    let next = await resolveCareerRuntime({
      ...signal === void 0 ? {} : { signal },
      probe: probeRuntime,
      afterSource: runtime.source
    });
    try {
      return await executePrepared(prepared, next, signal, limits);
    } catch (retryError) {
      throw retryError instanceof ProcessAttemptError ? retryError.publicError : publicAdapterError(retryError);
    }
  }
}
async function invokeCareerCli(invocation, signal, options = {}) {
  assertSupportedPlatform();
  let prepared = prepareInvocation(invocation);
  if (signal?.aborted) throw adapterError("cancelled");
  let limits = executionLimits(options);
  if (options.executable !== void 0) {
    let executable = options.executable;
    if (executable.length === 0 || executable.includes("\0") || Buffer.byteLength(executable, "utf8") > EXECUTABLE_MAX_BYTES2 || !isAbsolute(executable)) throw adapterError("invalid_executable_override");
    try {
      return await executePrepared(prepared, injectedRoute(executable), signal, limits);
    } catch (error) {
      throw error instanceof ProcessAttemptError ? error.publicError : publicAdapterError(error);
    }
  }
  let runtime = await resolveCareerRuntime({
    ...signal === void 0 ? {} : { signal },
    probe: probeRuntime
  });
  if (signal?.aborted) throw adapterError("cancelled");
  return executeResolved(prepared, runtime, signal, limits);
}

// src/managed/tool.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Text as Text2 } from "@earendil-works/pi-tui";

// src/career-paths.ts
import path2 from "node:path";
import { fileURLToPath } from "node:url";
function careerSkillsDirectory() {
  return path2.resolve(path2.dirname(fileURLToPath(import.meta.url)), "..", "skills");
}

// src/workflow/config.ts
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access as access2,
  link,
  lstat as lstat2,
  mkdir,
  open,
  readFile as readFile2,
  realpath as realpath2,
  rename,
  unlink
} from "node:fs/promises";
import path3 from "node:path";
import { TextDecoder as TextDecoder3 } from "node:util";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

// src/workflow/strict-json.ts
var NUMBER_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
function invalidJson() {
  throw new SyntaxError("invalid strict JSON");
}
function parseStrictJson(text) {
  let offset = 0;
  function skipWhitespace() {
    for (; offset < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[offset]); ) offset += 1;
  }
  function skipEscape() {
    offset += 1;
    let escaped = text[offset];
    if (escaped === "u") {
      /^[0-9a-fA-F]{4}$/.test(text.slice(offset + 1, offset + 5)) || invalidJson(), offset += 5;
      return;
    }
    (escaped === void 0 || !['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped)) && invalidJson(), offset += 1;
  }
  function parseString() {
    text[offset] !== '"' && invalidJson();
    let start = offset;
    for (offset += 1; offset < text.length; ) {
      let character = text[offset];
      if (character === '"') {
        offset += 1;
        try {
          return JSON.parse(text.slice(start, offset));
        } catch {
          invalidJson();
        }
      }
      text.charCodeAt(offset) <= 31 && invalidJson(), character === "\\" ? skipEscape() : offset += 1;
    }
    invalidJson();
  }
  function parseObject2(depth) {
    offset += 1, skipWhitespace();
    let keys = /* @__PURE__ */ new Set();
    if (text[offset] === "}") {
      offset += 1;
      return;
    }
    for (; offset < text.length; ) {
      let key = parseString();
      if (keys.has(key) && invalidJson(), keys.add(key), skipWhitespace(), text[offset] !== ":" && invalidJson(), offset += 1, parseValue(depth + 1), skipWhitespace(), text[offset] === "}") {
        offset += 1;
        return;
      }
      text[offset] !== "," && invalidJson(), offset += 1, skipWhitespace();
    }
    invalidJson();
  }
  function parseArray(depth) {
    if (offset += 1, skipWhitespace(), text[offset] === "]") {
      offset += 1;
      return;
    }
    for (; offset < text.length; ) {
      if (parseValue(depth + 1), skipWhitespace(), text[offset] === "]") {
        offset += 1;
        return;
      }
      text[offset] !== "," && invalidJson(), offset += 1, skipWhitespace();
    }
    invalidJson();
  }
  function parseValue(depth) {
    depth > 32 && invalidJson(), skipWhitespace();
    let character = text[offset];
    if (character === "{") return parseObject2(depth);
    if (character === "[") return parseArray(depth);
    if (character === '"') {
      parseString();
      return;
    }
    for (let literal of ["true", "false", "null"])
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    let number = text.slice(offset).match(NUMBER_PATTERN)?.[0];
    if (number !== void 0) {
      offset += number.length;
      return;
    }
    invalidJson();
  }
  text.length === 0 && invalidJson(), parseValue(0), skipWhitespace(), offset !== text.length && invalidJson();
  try {
    return JSON.parse(text);
  } catch {
    invalidJson();
  }
}

// src/workflow/types.ts
var WORKFLOW_CUSTOM_TYPE = "career.workflow", WORKFLOW_STATE_SCHEMA = "pi.career.workflow_state.v1", RESULT_PROJECTION_SCHEMA = "pi.career.result_projection.v1", WORKFLOW_ERROR_MESSAGES = {
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
  attachment_unavailable: "The attached career application is unavailable."
}, CareerWorkflowError = class extends Error {
  code;
  constructor(code) {
    super(
      JSON.stringify({
        schema_version: "pi.career.workflow_error.v1",
        code,
        message: WORKFLOW_ERROR_MESSAGES[code]
      })
    ), this.name = "CareerWorkflowError", this.code = code;
  }
};
function workflowError(code) {
  return new CareerWorkflowError(code);
}
function workflowErrorMessage(code) {
  return WORKFLOW_ERROR_MESSAGES[code];
}

// src/workflow/config.ts
var CONFIG_V1_SCHEMA = "pi.career.config.v1", CONFIG_V2_SCHEMA = "pi.career.config.v2", CONFIG_MAX_BYTES = 65536, LABEL_MAX_CHARACTERS = 80, PATH_MAX_BYTES2 = 4096, SHA256 = /^[a-f0-9]{64}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, CONFIG_LOCK_SCHEMA = "pi.career.workspace_lock.v1", SNAPSHOTS = /* @__PURE__ */ new WeakMap();
function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function identity(metadata) {
  return {
    dev: metadata.dev,
    ino: metadata.ino,
    size: metadata.size,
    uid: metadata.uid,
    mode: metadata.mode,
    nlink: metadata.nlink
  };
}
function sameIdentity(metadata, expected) {
  return metadata.dev === expected.dev && metadata.ino === expected.ino && metadata.size === expected.size && metadata.uid === expected.uid && metadata.mode === expected.mode && metadata.nlink === expected.nlink;
}
function effectiveUserId() {
  let value = process.geteuid?.() ?? process.getuid?.();
  if (value === void 0) throw workflowError("config_invalid");
  return value;
}
function exactPrivateMode(metadata, expected) {
  return metadata.uid === effectiveUserId() && (metadata.mode & 4095) === expected;
}
function isPlainRecord(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function exactKeys3(value, required, optional = []) {
  let allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function validLabel(value) {
  return typeof value == "string" && value.length > 0 && value.length <= LABEL_MAX_CHARACTERS && !/[\u0000-\u001f\u007f]/.test(value);
}
function canonicalBoundedAbsolutePath(value) {
  return typeof value == "string" && value.length > 0 && path3.isAbsolute(value) && Buffer.byteLength(value, "utf8") <= PATH_MAX_BYTES2 && !/[\u0000-\u001f\u007f]/.test(value) && path3.resolve(value) === value && path3.parse(value).root !== value && !value.endsWith(path3.sep);
}
function normalizeLegacyGeneratedVariantsRoot(value) {
  if (typeof value != "string" || value.length === 0 || !path3.isAbsolute(value) || Buffer.byteLength(value, "utf8") > PATH_MAX_BYTES2 || /[\u0000-\u001f\u007f]/.test(value)) return;
  let normalized = path3.resolve(value);
  return path3.dirname(normalized) === normalized ? void 0 : normalized;
}
function rootId(canonicalPath) {
  return createHash("sha256").update(canonicalPath).digest("hex");
}
function parseRoot(value) {
  if (!(!isPlainRecord(value) || !exactKeys3(value, ["id", "path", "label"])) && !(typeof value.id != "string" || !SHA256.test(value.id) || typeof value.path != "string" || !path3.isAbsolute(value.path) || !canonicalBoundedAbsolutePath(value.path) || value.id !== rootId(value.path) || !validLabel(value.label)))
    return { id: value.id, path: value.path, label: value.label };
}
function parseRoots(value) {
  if (!Array.isArray(value)) throw workflowError("config_invalid");
  let roots = [], ids = /* @__PURE__ */ new Set(), paths = /* @__PURE__ */ new Set();
  for (let candidate of value) {
    let root = parseRoot(candidate);
    if (root === void 0 || ids.has(root.id) || paths.has(root.path)) throw workflowError("config_invalid");
    ids.add(root.id), paths.add(root.path), roots.push(root);
  }
  return roots;
}
function componentOverlap(left, right) {
  if (left === right) return !0;
  let relativeLeft = path3.relative(left, right);
  if (relativeLeft !== "" && relativeLeft !== ".." && !relativeLeft.startsWith(`..${path3.sep}`) && !path3.isAbsolute(relativeLeft)) return !0;
  let relativeRight = path3.relative(right, left);
  return relativeRight !== "" && relativeRight !== ".." && !relativeRight.startsWith(`..${path3.sep}`) && !path3.isAbsolute(relativeRight);
}
function parseApplicationWorkspace(value) {
  if (value === null) return null;
  if (!isPlainRecord(value) || !exactKeys3(value, ["root_id", "root_path"]) || typeof value.root_id != "string" || !UUID.test(value.root_id) || !canonicalBoundedAbsolutePath(value.root_path)) throw workflowError("config_invalid");
  return { root_id: value.root_id, root_path: value.root_path };
}
function canonicalConfig(value) {
  return {
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: value.library_roots.map((root) => ({ id: root.id, path: root.path, label: root.label })),
    generated_variants_root: value.generated_variants_root,
    application_workspace: value.application_workspace === null ? null : {
      root_id: value.application_workspace.root_id,
      root_path: value.application_workspace.root_path
    }
  };
}
function parseV1(value) {
  if (!exactKeys3(value, ["schema_version", "library_roots"], ["generated_variants_root"]) || value.schema_version !== CONFIG_V1_SCHEMA) throw workflowError("config_invalid");
  let roots = parseRoots(value.library_roots), generated = value.generated_variants_root === void 0 ? void 0 : normalizeLegacyGeneratedVariantsRoot(value.generated_variants_root);
  if (value.generated_variants_root !== void 0 && (generated === void 0 || generated !== value.generated_variants_root || roots.some((root) => root.path === generated))) throw workflowError("config_invalid");
  return {
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: roots,
    generated_variants_root: generated ?? null,
    application_workspace: null
  };
}
function parseV2(value) {
  if (!exactKeys3(value, ["schema_version", "library_roots", "generated_variants_root", "application_workspace"]) || value.schema_version !== CONFIG_V2_SCHEMA) throw workflowError("config_invalid");
  let roots = parseRoots(value.library_roots), generated = value.generated_variants_root === null ? null : canonicalBoundedAbsolutePath(value.generated_variants_root) ? value.generated_variants_root : void 0;
  if (generated === void 0 || generated !== null && roots.some((root) => root.path === generated))
    throw workflowError("config_invalid");
  let applicationWorkspace = parseApplicationWorkspace(value.application_workspace);
  if (applicationWorkspace !== null && [
    ...roots.map((root) => root.path),
    ...generated === null ? [] : [generated]
  ].some((candidate) => componentOverlap(applicationWorkspace.root_path, candidate)))
    throw workflowError("config_invalid");
  return canonicalConfig({
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: roots,
    generated_variants_root: generated,
    application_workspace: applicationWorkspace
  });
}
function boundedConfigBytes(value) {
  let bytes = Buffer.from(`${JSON.stringify(value, null, 2)}
`, "utf8");
  if (bytes.length > CONFIG_MAX_BYTES) throw workflowError("config_invalid");
  return bytes;
}
function encodeConfigV1(config) {
  if (config.application_workspace !== null) throw workflowError("config_invalid");
  let value = {
    schema_version: CONFIG_V1_SCHEMA,
    library_roots: config.library_roots.map((root) => ({ id: root.id, path: root.path, label: root.label })),
    ...config.generated_variants_root === null ? {} : { generated_variants_root: config.generated_variants_root }
  };
  return parseV1(value), boundedConfigBytes(value);
}
function encodeConfigV2(config) {
  let validated = parseV2(canonicalConfig(config));
  return boundedConfigBytes(validated);
}
function encodeConfig(config) {
  return encodeConfigV2(config);
}
function encodeConfigForFormat(config, format) {
  return format === "v1" ? encodeConfigV1(config) : encodeConfigV2(config);
}
function decodeConfig(bytes) {
  if (bytes.length === 0 || bytes.length > CONFIG_MAX_BYTES || bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
    throw workflowError("config_invalid");
  let text;
  try {
    text = new TextDecoder3("utf-8", { fatal: !0 }).decode(bytes);
  } catch {
    throw workflowError("config_invalid");
  }
  let value;
  try {
    value = parseStrictJson(text);
  } catch {
    throw workflowError("config_invalid");
  }
  if (!isPlainRecord(value)) throw workflowError("config_invalid");
  if (value.schema_version === CONFIG_V1_SCHEMA) return { config: parseV1(value), sourceFormat: "v1" };
  let config = parseV2(value);
  if (!bytes.equals(encodeConfigV2(config))) throw workflowError("config_invalid");
  return { config, sourceFormat: "v2" };
}
function emptyConfig() {
  let config = {
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: [],
    generated_variants_root: null,
    application_workspace: null
  };
  return SNAPSHOTS.set(config, {
    config,
    filePath: "",
    directoryPath: "",
    bytes: null,
    sha256: null,
    identity: null,
    sourceFormat: "absent"
  }), config;
}
function configPath(agentDir) {
  if (!path3.isAbsolute(agentDir)) throw workflowError("config_invalid");
  return path3.join(agentDir, "career", "config.v1.json");
}
function attachSnapshot(config, snapshot) {
  let complete = { ...snapshot, config };
  return SNAPSHOTS.set(config, complete), complete;
}
function inheritSnapshot(source, target) {
  let snapshot = SNAPSHOTS.get(source);
  return snapshot !== void 0 && attachSnapshot(target, {
    filePath: snapshot.filePath,
    directoryPath: snapshot.directoryPath,
    bytes: snapshot.bytes,
    sha256: snapshot.sha256,
    identity: snapshot.identity,
    sourceFormat: snapshot.sourceFormat
  }), target;
}
async function noSymlinkComponentWalk(value, errorCode) {
  let parsed = path3.parse(value), current = parsed.root;
  try {
    for (let component of value.slice(parsed.root.length).split(path3.sep).filter(Boolean))
      if (current = path3.join(current, component), (await lstat2(current)).isSymbolicLink()) throw workflowError(errorCode);
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError(errorCode);
  }
}
async function configDirectoryMetadata(directory, allowMissing) {
  try {
    return await lstat2(directory);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return;
    throw workflowError("config_invalid");
  }
}
async function validatePresentConfigDirectory(directory, metadata) {
  try {
    await noSymlinkComponentWalk(directory, "config_invalid");
    let canonical = await realpath2(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== directory || !exactPrivateMode(metadata, 448)) throw workflowError("config_invalid");
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("config_invalid");
  }
}
async function validateConfigDirectory(directory, allowMissing = !1) {
  if (!canonicalBoundedAbsolutePath(directory)) throw workflowError("config_invalid");
  let metadata = await configDirectoryMetadata(directory, allowMissing);
  return metadata === void 0 ? !1 : (await validatePresentConfigDirectory(directory, metadata), !0);
}
async function readPresentSnapshot(file, directory) {
  try {
    let metadata = await lstat2(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > CONFIG_MAX_BYTES || metadata.nlink !== 1 || !exactPrivateMode(metadata, 384))
      throw workflowError("config_invalid");
    let bytes = await readFile2(file);
    if (bytes.length !== metadata.size) throw workflowError("config_invalid");
    let decoded = decodeConfig(bytes);
    return attachSnapshot(decoded.config, {
      filePath: file,
      directoryPath: directory,
      bytes,
      sha256: hashBytes(bytes),
      identity: identity(metadata),
      sourceFormat: decoded.sourceFormat
    });
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("config_invalid");
  }
}
async function loadConfigSnapshotInternal(agentDir, allowMissingDirectory) {
  let file = configPath(agentDir), directory = path3.dirname(file), directoryExists = await validateConfigDirectory(directory, allowMissingDirectory), absent = () => {
    let config = emptyConfig();
    return attachSnapshot(config, {
      filePath: file,
      directoryPath: directory,
      bytes: null,
      sha256: null,
      identity: null,
      sourceFormat: "absent"
    });
  };
  if (!directoryExists) return absent();
  try {
    await lstat2(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw workflowError("config_invalid");
    return absent();
  }
  return readPresentSnapshot(file, directory);
}
async function loadConfigSnapshot(agentDir) {
  return loadConfigSnapshotInternal(agentDir, !1);
}
async function loadConfig(agentDir) {
  return (await loadConfigSnapshotInternal(agentDir, !0)).config;
}
async function canonicalizeRoot(inputPath) {
  if (typeof inputPath != "string" || inputPath.length === 0 || inputPath.includes("\0") || Buffer.byteLength(inputPath, "utf8") > PATH_MAX_BYTES2) throw workflowError("root_invalid");
  try {
    let absolute = path3.resolve(inputPath), suppliedMetadata = await lstat2(absolute);
    if (!suppliedMetadata.isDirectory() || suppliedMetadata.isSymbolicLink()) throw workflowError("root_invalid");
    let canonical = await realpath2(absolute), metadata = await lstat2(canonical);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw workflowError("root_invalid");
    return await access2(canonical, constants.R_OK), canonical;
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("root_invalid");
  }
}
function defaultRootLabel(canonicalPath) {
  return (path3.basename(canonicalPath).trim() || "Resume library").slice(0, LABEL_MAX_CHARACTERS);
}
async function addLibraryRoot(config, inputPath, label) {
  let canonical = await canonicalizeRoot(inputPath), chosenLabel = label?.trim() || defaultRootLabel(canonical);
  if (!validLabel(chosenLabel)) throw workflowError("root_invalid");
  let id = rootId(canonical), withoutExisting = config.library_roots.filter((root) => root.id !== id);
  return inheritSnapshot(config, canonicalConfig({
    ...config,
    library_roots: [...withoutExisting, { id, path: canonical, label: chosenLabel }]
  }));
}
function removeLibraryRoot(config, id) {
  return inheritSnapshot(config, canonicalConfig({
    ...config,
    library_roots: config.library_roots.filter((root) => root.id !== id)
  }));
}
function suggestedGeneratedVariantsRoot(config, selectedRootId) {
  if (config.generated_variants_root !== null) return config.generated_variants_root;
  let selectedRoot = selectedRootId === void 0 ? config.library_roots[0] : config.library_roots.find((root) => root.id === selectedRootId);
  return selectedRoot === void 0 ? void 0 : path3.join(selectedRoot.path, "variants");
}
function setApplicationWorkspace(config, applicationWorkspace) {
  return inheritSnapshot(config, canonicalConfig({ ...config, application_workspace: applicationWorkspace }));
}
async function validateApplicationRootPath(value) {
  if (!canonicalBoundedAbsolutePath(value) || Buffer.byteLength(path3.join(value, "x".repeat(180)), "utf8") > PATH_MAX_BYTES2)
    throw workflowError("workspace_root_invalid");
  try {
    await noSymlinkComponentWalk(value, "workspace_root_invalid");
    let metadata = await lstat2(value), canonical = await realpath2(value);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== value || !exactPrivateMode(metadata, 448)) throw workflowError("workspace_root_invalid");
    return await access2(value, constants.R_OK | constants.W_OK | constants.X_OK), metadata;
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_root_invalid");
  }
}
async function currentDirectoryIdentity(value, application = !1) {
  try {
    let metadata = application ? await validateApplicationRootPath(value) : await lstat2(value), canonical = await realpath2(value);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== value)
      throw workflowError(application ? "workspace_root_invalid" : "workspace_root_overlap");
    return metadata;
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError(application ? "workspace_root_invalid" : "workspace_root_overlap");
  }
}
async function assertApplicationWorkspaceDisjoint(config) {
  let application = config.application_workspace;
  if (application === null) return;
  let applicationMetadata = await currentDirectoryIdentity(application.root_path, !0);
  for (let candidate of config.library_roots.map((root) => root.path)) {
    if (componentOverlap(application.root_path, candidate)) throw workflowError("workspace_root_overlap");
    let metadata = await currentDirectoryIdentity(candidate);
    if (metadata.dev === applicationMetadata.dev && metadata.ino === applicationMetadata.ino)
      throw workflowError("workspace_root_overlap");
  }
  let generated = config.generated_variants_root;
  if (generated !== null) {
    if (componentOverlap(application.root_path, generated)) throw workflowError("workspace_root_overlap");
    try {
      let metadata = await lstat2(generated), canonical = await realpath2(generated);
      if (metadata.isSymbolicLink() || canonical !== generated || metadata.dev === applicationMetadata.dev && metadata.ino === applicationMetadata.ino)
        throw workflowError("workspace_root_overlap");
    } catch (error) {
      if (error?.code !== "ENOENT")
        throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_root_overlap");
    }
  }
}
function lockBytes(kind, mutationId, createdAt) {
  return Buffer.from(`${JSON.stringify({
    schema_version: CONFIG_LOCK_SCHEMA,
    kind,
    mutation_id: mutationId,
    created_at: createdAt
  }, null, 2)}
`, "utf8");
}
async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, constants.O_RDONLY), await handle.sync(), await handle.close();
  } catch {
    throw handle !== void 0 && await handle.close().catch(() => {
    }), workflowError("workspace_status_unknown");
  }
}
async function validateConfigBootstrapParent(agentDir) {
  if (!canonicalBoundedAbsolutePath(agentDir)) throw workflowError("config_invalid");
  try {
    await noSymlinkComponentWalk(agentDir, "config_invalid");
    let metadata = await lstat2(agentDir), canonical = await realpath2(agentDir);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== agentDir || metadata.uid !== effectiveUserId()) throw workflowError("config_invalid");
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("config_invalid");
  }
}
function assertCreatedDirectoryIdentity(created, opened) {
  if (!created.isDirectory() || created.isSymbolicLink() || created.uid !== effectiveUserId() || created.dev !== opened.dev || created.ino !== opened.ino) throw workflowError("config_invalid");
}
function assertPrivateDirectoryIdentity(expected, current) {
  if (current.dev !== expected.dev || current.ino !== expected.ino || !exactPrivateMode(current, 448)) throw workflowError("config_invalid");
}
async function createPrivateConfigDirectory(agentDir, directory) {
  await mkdir(directory, { recursive: !1, mode: 448 });
  let created = await lstat2(directory), handle;
  try {
    handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY), assertCreatedDirectoryIdentity(created, await handle.stat()), await handle.chmod(448);
    let privateCreated = await handle.stat();
    await handle.close(), handle = void 0, assertPrivateDirectoryIdentity(privateCreated, await lstat2(directory)), await validateConfigDirectory(directory), await syncDirectory(agentDir);
  } finally {
    handle !== void 0 && await handle.close().catch(() => {
    });
  }
}
async function ensureConfigDirectoryForOrdinaryWrite(agentDir, directory) {
  if (!await validateConfigDirectory(directory, !0)) {
    await validateConfigBootstrapParent(agentDir);
    try {
      await createPrivateConfigDirectory(agentDir, directory);
    } catch (error) {
      if (error?.code === "EEXIST") {
        await validateConfigDirectory(directory);
        return;
      }
      throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("config_invalid");
    }
  }
}
function configLockPath(agentDir) {
  return path3.join(path3.dirname(configPath(agentDir)), ".pi-career-config.lock");
}
function workspaceLockPath(rootPath) {
  return path3.join(rootPath, ".pi-career-workspace.lock");
}
async function acquireMutationLock(lockPath, kind, mutationId, createdAt) {
  if (!UUID.test(mutationId) || !ISO_UTC.test(createdAt) || new Date(createdAt).toISOString() !== createdAt)
    throw workflowError("workspace_verification_failed");
  let bytes = lockBytes(kind, mutationId, createdAt), handle, createdIdentity;
  try {
    handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 384);
    let created = await handle.stat();
    createdIdentity = { dev: created.dev, ino: created.ino }, await handle.writeFile(bytes), await handle.sync(), await handle.chmod(384);
    let metadata = await handle.stat();
    if (await handle.close(), handle = void 0, !metadata.isFile() || metadata.nlink !== 1 || metadata.size !== bytes.length || !exactPrivateMode(metadata, 384) || !(await readFile2(lockPath)).equals(bytes))
      throw workflowError("workspace_verification_failed");
    return await syncDirectory(path3.dirname(lockPath)), { path: lockPath, identity: identity(metadata) };
  } catch (error) {
    if (handle !== void 0 && await handle.close().catch(() => {
    }), createdIdentity !== void 0)
      try {
        let current = await lstat2(lockPath);
        current.dev === createdIdentity.dev && current.ino === createdIdentity.ino && (await unlink(lockPath), await syncDirectory(path3.dirname(lockPath)));
      } catch {
      }
    throw error?.code === "EEXIST" ? workflowError("workspace_busy") : error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_verification_failed");
  }
}
async function releaseMutationLock(lock) {
  try {
    let metadata = await lstat2(lock.path);
    if (!sameIdentity(metadata, lock.identity)) throw workflowError("workspace_status_unknown");
    await unlink(lock.path), await syncDirectory(path3.dirname(lock.path));
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_status_unknown");
  }
}
async function assertConfigSnapshotCurrent(snapshot) {
  try {
    await validateConfigDirectory(snapshot.directoryPath);
  } catch {
    throw workflowError("workspace_drift");
  }
  if (snapshot.bytes === null || snapshot.identity === null)
    try {
      throw await lstat2(snapshot.filePath), workflowError("workspace_drift");
    } catch (error) {
      if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
      if (error?.code !== "ENOENT") throw workflowError("workspace_drift");
      return;
    }
  try {
    let metadata = await lstat2(snapshot.filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !sameIdentity(metadata, snapshot.identity) || !exactPrivateMode(metadata, 384) || metadata.nlink !== 1) throw workflowError("workspace_drift");
    let bytes = await readFile2(snapshot.filePath);
    if (!bytes.equals(snapshot.bytes) || hashBytes(bytes) !== snapshot.sha256) throw workflowError("workspace_drift");
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_drift");
  }
}
async function verifyConfigFinal(file, expected, format) {
  try {
    let metadata = await lstat2(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size !== expected.length || !exactPrivateMode(metadata, 384))
      throw workflowError("workspace_status_unknown");
    let bytes = await readFile2(file);
    if (!bytes.equals(expected)) throw workflowError("workspace_status_unknown");
    if (decodeConfig(bytes).sourceFormat !== format) throw workflowError("workspace_status_unknown");
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_status_unknown");
  }
}
async function commitConfigUnderLock(snapshot, next, temporaryPath, targetFormat) {
  let bytes = encodeConfigForFormat(next, targetFormat);
  await assertConfigSnapshotCurrent(snapshot);
  let handle, temporaryIdentity, published = !1;
  try {
    handle = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 384), await handle.writeFile(bytes), await handle.sync(), await handle.chmod(384);
    let metadata = await handle.stat();
    if (await handle.close(), handle = void 0, !metadata.isFile() || metadata.nlink !== 1 || metadata.size !== bytes.length || !exactPrivateMode(metadata, 384) || !(await readFile2(temporaryPath)).equals(bytes))
      throw workflowError("workspace_verification_failed");
    if (temporaryIdentity = identity(metadata), await assertConfigSnapshotCurrent(snapshot), snapshot.bytes === null) {
      await link(temporaryPath, snapshot.filePath), published = !0;
      let linked = await lstat2(snapshot.filePath);
      if (linked.dev !== metadata.dev || linked.ino !== metadata.ino) throw workflowError("workspace_status_unknown");
      await unlink(temporaryPath);
    } else
      await rename(temporaryPath, snapshot.filePath), published = !0;
    await syncDirectory(snapshot.directoryPath), await verifyConfigFinal(snapshot.filePath, bytes, targetFormat);
  } catch (error) {
    if (handle !== void 0 && await handle.close().catch(() => {
    }), published)
      try {
        if (temporaryIdentity !== void 0) {
          let temporary = await lstat2(temporaryPath).catch(() => {
          });
          temporary !== void 0 && temporary.dev === temporaryIdentity.dev && temporary.ino === temporaryIdentity.ino && await unlink(temporaryPath);
        }
        await syncDirectory(snapshot.directoryPath), await verifyConfigFinal(snapshot.filePath, bytes, targetFormat);
        return;
      } catch {
        if (temporaryIdentity !== void 0)
          try {
            let temporary = await lstat2(temporaryPath);
            temporary.dev === temporaryIdentity.dev && temporary.ino === temporaryIdentity.ino && (await unlink(temporaryPath), await syncDirectory(snapshot.directoryPath));
          } catch {
          }
        throw workflowError("workspace_status_unknown");
      }
    if (temporaryIdentity !== void 0)
      try {
        let metadata = await lstat2(temporaryPath);
        metadata.dev === temporaryIdentity.dev && metadata.ino === temporaryIdentity.ino && (await unlink(temporaryPath), await syncDirectory(snapshot.directoryPath));
      } catch {
      }
    throw error?.code === "EEXIST" ? workflowError("workspace_collision") : error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_status_unknown");
  }
}
function configTemporaryPath(agentDir, mutationId) {
  if (!UUID.test(mutationId)) throw workflowError("config_invalid");
  return path3.join(path3.dirname(configPath(agentDir)), `.config.v1.${mutationId}.tmp`);
}
async function withQueues(keys, operation) {
  let unique = [...new Set(keys)].sort(), run = (index) => index >= unique.length ? operation() : withFileMutationQueue(unique[index], () => run(index + 1));
  return run(0);
}
async function writeConfig(agentDir, config, uuid = randomUUID, options = {}) {
  let mutationId = uuid().toLowerCase(), createdAt = (options.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
  if (!UUID.test(mutationId)) throw workflowError("config_invalid");
  let file = configPath(agentDir), directory = path3.dirname(file), inherited = SNAPSHOTS.get(config), snapshot = inherited?.filePath === file ? inherited : await loadConfigSnapshotInternal(agentDir, !0), targetFormat = snapshot.sourceFormat === "v2" ? "v2" : "v1";
  await assertApplicationWorkspaceDisjoint(config);
  let queueKeys = [file, ...config.application_workspace === null ? [] : [config.application_workspace.root_path]];
  await withQueues(queueKeys, async () => {
    await ensureConfigDirectoryForOrdinaryWrite(agentDir, directory);
    let configLock = await acquireMutationLock(configLockPath(agentDir), "config_mutation_lock", mutationId, createdAt), rootLock;
    try {
      config.application_workspace !== null && (rootLock = await acquireMutationLock(
        workspaceLockPath(config.application_workspace.root_path),
        "workspace_mutation_lock",
        mutationId,
        createdAt
      ), await assertApplicationWorkspaceDisjoint(config)), await commitConfigUnderLock(snapshot, config, configTemporaryPath(agentDir, mutationId), targetFormat);
    } finally {
      try {
        rootLock !== void 0 && await releaseMutationLock(rootLock);
      } finally {
        await releaseMutationLock(configLock);
      }
    }
  });
  let committed = await loadConfigSnapshot(agentDir);
  attachSnapshot(config, {
    filePath: committed.filePath,
    directoryPath: committed.directoryPath,
    bytes: committed.bytes,
    sha256: committed.sha256,
    identity: committed.identity,
    sourceFormat: committed.sourceFormat
  });
}

// src/workflow/core-input.ts
function buildResumeInput(resume) {
  return {
    schema_version: "career.resume_input.v1",
    text: resume.text,
    metadata: { document_id: resume.id }
  };
}
function buildJobInput(vacancy) {
  return {
    schema_version: "career.job_input.v1",
    text: vacancy.vacancy_text,
    metadata: { document_id: vacancy.state_id }
  };
}
function buildJobMatchInput(resume, vacancy) {
  return {
    schema_version: "career.job_match_input.v1",
    resume: buildResumeInput(resume),
    job: buildJobInput(vacancy)
  };
}
function serializeCoreInput(value) {
  return JSON.stringify(value);
}

// src/workflow/scan.ts
import { createHash as createHash3 } from "node:crypto";
import { lstat as lstat3, opendir, readFile as readFile3, realpath as realpath3 } from "node:fs/promises";
import path4 from "node:path";
import { TextDecoder as TextDecoder4 } from "node:util";

// src/workflow/pdf.ts
import { Worker } from "node:worker_threads";
var PDF_MAX_RAW_BYTES = 10 * 1024 * 1024, PDF_MAX_PAGES = 20, PDF_EXTRACTION_TIMEOUT_MS = 1e4, PDF_MAX_RESULT_BYTES = 512 * 1024;
function workerUrl() {
  return import.meta.url.endsWith("/dist/index.js") ? new URL("./pdf-worker.js", import.meta.url) : new URL("./pdf-worker.ts", import.meta.url);
}
function validWorkerResult(value) {
  if (value === null || typeof value != "object" || Array.isArray(value)) return !1;
  let result = value;
  return result.ok === !1 ? Object.keys(result).length === 1 : result.ok === !0 && Object.keys(result).sort().join(",") === "ok,pageCount,text" && typeof result.text == "string" && Buffer.byteLength(result.text, "utf8") <= PDF_MAX_RESULT_BYTES && Number.isSafeInteger(result.pageCount) && result.pageCount > 0 && result.pageCount <= PDF_MAX_PAGES;
}
async function extractPdfText(bytes) {
  if (bytes.byteLength === 0 || bytes.byteLength > PDF_MAX_RAW_BYTES) return { ok: !1 };
  let worker;
  try {
    worker = new Worker(workerUrl(), {
      env: {},
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4
      }
    });
  } catch {
    return { ok: !1 };
  }
  return await new Promise((resolve) => {
    let settled = !1, finish = (result) => {
      settled || (settled = !0, clearTimeout(timer), worker.terminate(), resolve(result));
    }, timer = setTimeout(() => finish({ ok: !1 }), PDF_EXTRACTION_TIMEOUT_MS);
    worker.once("message", (value) => {
      if (!validWorkerResult(value) || value.ok === !1 || value.text.trim().length === 0) {
        finish({ ok: !1 });
        return;
      }
      finish({ ok: !0, text: value.text, pageCount: value.pageCount });
    }), worker.once("error", () => finish({ ok: !1 })), worker.once("exit", () => finish({ ok: !1 }));
    let transferable = Uint8Array.from(bytes);
    try {
      worker.postMessage(transferable, [transferable.buffer]);
    } catch {
      finish({ ok: !1 });
    }
  });
}

// src/workflow/text-limit.ts
function isWithinCoreCharacterLimit(value) {
  let codePoints = 0;
  for (let _codePoint of value)
    if (codePoints += 1, codePoints > 5e4) return !1;
  return !0;
}

// src/workflow/variant-metadata.ts
import { createHash as createHash2 } from "node:crypto";
var ASSISTED_SIDECAR_MAX_BYTES = 16384, MANAGED_VARIANTS_MARKER_NAME = ".pi-career-variants.json", MANAGED_VARIANTS_MARKER_SCHEMA = "pi.career.variants_directory.v1", ASSISTED_VARIANT_SCHEMA_V1 = "pi.career.assisted_variant_meta.v1", ASSISTED_VARIANT_SCHEMA_V2 = "pi.career.assisted_variant_meta.v2", SHA2562 = /^[a-f0-9]{64}$/, CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, LEGACY_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
function isRecord3(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function exactKeys4(value, expected) {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}
function validSha256(value) {
  return typeof value == "string" && SHA2562.test(value);
}
function validCanonicalTimestamp(value) {
  return typeof value == "string" && CANONICAL_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function sha256Bytes(value) {
  return createHash2("sha256").update(value).digest("hex");
}
function encodeCanonical(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}
`, "utf8");
}
function encodeManagedVariantsMarker(libraryRootId, createdAt) {
  if (!validSha256(libraryRootId) || !validCanonicalTimestamp(createdAt))
    throw new TypeError("invalid managed variants marker");
  return encodeCanonical({
    schema_version: MANAGED_VARIANTS_MARKER_SCHEMA,
    kind: "managed_variants_directory",
    library_root_id: libraryRootId,
    created_at: createdAt
  });
}
function parseManagedVariantsMarker(text, expectedLibraryRootId) {
  try {
    let value = parseStrictJson(text);
    return !isRecord3(value) || !exactKeys4(value, [
      "schema_version",
      "kind",
      "library_root_id",
      "created_at"
    ]) || value.schema_version !== MANAGED_VARIANTS_MARKER_SCHEMA || value.kind !== "managed_variants_directory" || value.library_root_id !== expectedLibraryRootId || !validSha256(value.library_root_id) || !validCanonicalTimestamp(value.created_at) ? void 0 : value;
  } catch {
    return;
  }
}
function encodeAssistedVariantMetadataV2(metadata) {
  if (!validSha256(metadata.base_document_id) || !validSha256(metadata.base_text_sha256) || !validSha256(metadata.artifact_sha256) || !validCanonicalTimestamp(metadata.created_at)) throw new TypeError("invalid assisted variant metadata");
  return encodeCanonical({
    schema_version: ASSISTED_VARIANT_SCHEMA_V2,
    kind: "assisted_variant",
    authority: "assisted_non_authoritative",
    base_document_id: metadata.base_document_id,
    base_text_sha256: metadata.base_text_sha256,
    artifact_sha256: metadata.artifact_sha256,
    created_at: metadata.created_at
  });
}
function parseLegacyMetadata(value) {
  if (exactKeys4(value, ["schema_version", "kind", "base_document_id", "created_at"]) && !(value.kind !== "assisted_variant" || !validSha256(value.base_document_id) || typeof value.created_at != "string" || !LEGACY_TIMESTAMP.test(value.created_at) || !Number.isFinite(Date.parse(value.created_at))))
    return { schemaVersion: ASSISTED_VARIANT_SCHEMA_V1, baseDocumentId: value.base_document_id };
}
function parseHashBoundMetadata(value, artifactBytes) {
  if (exactKeys4(value, [
    "schema_version",
    "kind",
    "authority",
    "base_document_id",
    "base_text_sha256",
    "artifact_sha256",
    "created_at"
  ]) && !(value.kind !== "assisted_variant" || value.authority !== "assisted_non_authoritative" || !validSha256(value.base_document_id) || !validSha256(value.base_text_sha256) || !validSha256(value.artifact_sha256) || value.artifact_sha256 !== sha256Bytes(artifactBytes) || !validCanonicalTimestamp(value.created_at)))
    return { schemaVersion: ASSISTED_VARIANT_SCHEMA_V2, baseDocumentId: value.base_document_id };
}
function parseAssistedVariantMetadata(text, artifactBytes) {
  try {
    let value = parseStrictJson(text);
    return isRecord3(value) ? value.schema_version === ASSISTED_VARIANT_SCHEMA_V1 ? parseLegacyMetadata(value) : value.schema_version === ASSISTED_VARIANT_SCHEMA_V2 ? parseHashBoundMetadata(value, artifactBytes) : void 0 : void 0;
  } catch {
    return;
  }
}

// src/workflow/scan.ts
var SCAN_MAX_DEPTH = 8, SCAN_MAX_FILES_PER_ROOT = 500, SCAN_MAX_FILES_TOTAL = 2e3, SCAN_MAX_RAW_BYTES = 256 * 1024, MAX_DIRECTORY_ENTRIES_PER_ROOT = 1e4;
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function sha256(value) {
  return createHash3("sha256").update(value).digest("hex");
}
function normalizeDocumentText(value) {
  return value.replace(/\r\n?/g, `
`);
}
function supportedFormat(file) {
  let extension = path4.extname(file).toLowerCase();
  if (extension === ".md") return "markdown";
  if (extension === ".txt") return "text";
  if (extension === ".pdf") return "pdf";
}
function safeLabel(value, fallback) {
  return (value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || fallback).slice(0, 120);
}
function resumeLabel(file, format, text) {
  let fallback = path4.basename(file, path4.extname(file));
  if (format === "markdown") {
    let nonEmpty = 0;
    for (let line of text.split(`
`)) {
      if (line.trim().length === 0) continue;
      nonEmpty += 1;
      let match = line.match(/^#\s+(.+?)\s*#*\s*$/);
      if (match?.[1]) return safeLabel(match[1], fallback);
      if (nonEmpty >= 32) break;
    }
  }
  return safeLabel(fallback, "Resume");
}
function sidecarPath(file) {
  return path4.join(path4.dirname(file), `${path4.basename(file, path4.extname(file))}.pi-career.json`);
}
function privateMode(metadata, expected) {
  let userId = process.geteuid?.() ?? process.getuid?.();
  return userId !== void 0 && metadata.uid === userId && (metadata.mode & 511) === expected;
}
async function readSidecar(file, artifactBytes, required) {
  let sidecar = sidecarPath(file);
  try {
    let metadata = await lstat3(sidecar);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > ASSISTED_SIDECAR_MAX_BYTES) return { kind: "quarantined" };
    let bytes = await readFile3(sidecar);
    if (bytes.length !== metadata.size) return { kind: "quarantined" };
    let text = new TextDecoder4("utf-8", { fatal: !0 }).decode(bytes), parsed = parseAssistedVariantMetadata(text, artifactBytes);
    return parsed === void 0 || parsed.schemaVersion === "pi.career.assisted_variant_meta.v2" && !privateMode(metadata, 384) ? { kind: "quarantined" } : { kind: "assisted_variant", variantGroupId: parsed.baseDocumentId };
  } catch (error) {
    return error?.code === "ENOENT" ? { kind: required ? "quarantined" : "original" } : { kind: "quarantined" };
  }
}
function managedVariantsPath(config, root) {
  let configured = config.generated_variants_root === null ? void 0 : path4.resolve(config.generated_variants_root);
  return configured !== void 0 && path4.dirname(configured) === root.path ? configured : path4.join(root.path, "variants");
}
async function managedVariantsDirectory(config, root) {
  let directoryPath = managedVariantsPath(config, root);
  try {
    let directory = await lstat3(directoryPath), canonical = await realpath3(directoryPath);
    if (!directory.isDirectory() || directory.isSymbolicLink() || canonical !== directoryPath || !privateMode(directory, 448)) return { path: directoryPath, markerValid: !1 };
    let markerPath = path4.join(directoryPath, MANAGED_VARIANTS_MARKER_NAME), marker = await lstat3(markerPath);
    if (!marker.isFile() || marker.isSymbolicLink() || marker.size <= 0 || marker.size > ASSISTED_SIDECAR_MAX_BYTES || !privateMode(marker, 384)) return { path: directoryPath, markerValid: !1 };
    let bytes = await readFile3(markerPath);
    if (bytes.length !== marker.size) return { path: directoryPath, markerValid: !1 };
    let text = new TextDecoder4("utf-8", { fatal: !0 }).decode(bytes);
    return {
      path: directoryPath,
      markerValid: parseManagedVariantsMarker(text, root.id) !== void 0
    };
  } catch {
    return { path: directoryPath, markerValid: !1 };
  }
}
function containingManagedVariants(file, managedDirectories) {
  return managedDirectories.filter((managed) => file.startsWith(`${managed.path}${path4.sep}`));
}
async function scanRootIsCurrent(root) {
  try {
    let metadata = await lstat3(root.path), canonical = await realpath3(root.path);
    return metadata.isDirectory() && !metadata.isSymbolicLink() && canonical === root.path;
  } catch {
    return !1;
  }
}
async function directoryChildren(current, rootId2, warnings2, maximumEntries) {
  let entries = [];
  try {
    let directory = await opendir(current.absolute);
    for await (let entry of directory)
      if (entries.push(entry), entries.length > maximumEntries)
        return { children: [], entryCount: entries.length, overflow: !0 };
  } catch {
    return warnings2.push({ code: "scan_entry_unavailable", root_id: rootId2 }), { children: [], entryCount: 0, overflow: !1 };
  }
  entries.sort((left, right) => compareText(left.name, right.name));
  let children = [];
  for (let entry of entries) {
    if (entry.isSymbolicLink()) continue;
    let relative = current.relative ? path4.posix.join(current.relative, entry.name) : entry.name, absolute = path4.join(current.absolute, entry.name), depth = current.depth + 1;
    entry.isDirectory() && depth <= SCAN_MAX_DEPTH ? children.push({ absolute, relative, depth, kind: "directory" }) : entry.isFile() && supportedFormat(entry.name) !== void 0 && children.push({ absolute, relative, depth: current.depth, kind: "file" });
  }
  return { children, entryCount: entries.length, overflow: !1 };
}
function candidateFromPending(current) {
  let format = supportedFormat(current.absolute);
  return format === void 0 ? void 0 : { absolute: current.absolute, relative: current.relative, format };
}
async function collectCandidates(root, maximum, warnings2) {
  if (!await scanRootIsCurrent(root))
    return warnings2.push({ code: "root_stale", root_id: root.id }), { candidates: [], capped: !1, stale: !0 };
  let pending = [{ absolute: root.path, relative: "", depth: 0, kind: "directory" }], candidates = [], visitedEntries = 0, capped = !1;
  for (; pending.length > 0 && candidates.length < maximum; ) {
    pending.sort((left, right) => compareText(left.relative, right.relative));
    let current = pending.shift();
    if (current === void 0) break;
    if (current.kind === "file") {
      let candidate = candidateFromPending(current);
      candidate !== void 0 && candidates.push(candidate), capped = candidates.length >= maximum;
      continue;
    }
    let remainingEntryBudget = MAX_DIRECTORY_ENTRIES_PER_ROOT - visitedEntries, { children, entryCount, overflow } = await directoryChildren(
      current,
      root.id,
      warnings2,
      remainingEntryBudget
    );
    if (overflow) {
      capped = !0;
      break;
    }
    visitedEntries += entryCount, pending.push(...children);
  }
  return candidates.sort((left, right) => {
    let relative = compareText(left.relative, right.relative);
    return relative !== 0 ? relative : compareText(path4.basename(left.relative), path4.basename(right.relative));
  }), { candidates, capped, stale: !1 };
}
async function scanCandidate(root, candidate, managedDirectories, warnings2) {
  let metadata, canonical;
  try {
    if (metadata = await lstat3(candidate.absolute), canonical = await realpath3(candidate.absolute), !metadata.isFile() || metadata.isSymbolicLink() || canonical !== candidate.absolute || !canonical.startsWith(`${root.path}${path4.sep}`)) return;
  } catch {
    warnings2.push({ code: "scan_entry_unavailable", root_id: root.id, relative_path: candidate.relative });
    return;
  }
  let rawByteLimit = candidate.format === "pdf" ? PDF_MAX_RAW_BYTES : SCAN_MAX_RAW_BYTES;
  if (metadata.size > rawByteLimit) {
    warnings2.push({ code: "raw_file_too_large", root_id: root.id, relative_path: candidate.relative });
    return;
  }
  let bytes;
  try {
    if (bytes = await readFile3(canonical), bytes.length > rawByteLimit || bytes.length !== metadata.size) {
      warnings2.push({ code: "raw_file_too_large", root_id: root.id, relative_path: candidate.relative });
      return;
    }
  } catch {
    warnings2.push({ code: "scan_entry_unavailable", root_id: root.id, relative_path: candidate.relative });
    return;
  }
  let decoded;
  if (candidate.format === "pdf") {
    let extracted = await extractPdfText(bytes);
    if (!extracted.ok) {
      warnings2.push({ code: "pdf_text_unavailable", root_id: root.id, relative_path: candidate.relative });
      return;
    }
    decoded = extracted.text;
  } else
    try {
      decoded = new TextDecoder4("utf-8", { fatal: !0 }).decode(bytes);
    } catch {
      warnings2.push({ code: "invalid_utf8", root_id: root.id, relative_path: candidate.relative });
      return;
    }
  let text = normalizeDocumentText(decoded), id = sha256(canonical), containingManaged = containingManagedVariants(canonical, managedDirectories);
  if (containingManaged.some((managed) => !managed.markerValid)) {
    warnings2.push({ code: "invalid_assisted_sidecar", root_id: root.id, relative_path: candidate.relative });
    return;
  }
  let sidecar = await readSidecar(canonical, bytes, containingManaged.length > 0);
  if (sidecar.kind === "quarantined") {
    warnings2.push({ code: "invalid_assisted_sidecar", root_id: root.id, relative_path: candidate.relative });
    return;
  }
  return {
    id,
    root_id: root.id,
    path: canonical,
    relative_path: candidate.relative,
    label: resumeLabel(canonical, candidate.format, text),
    kind: sidecar.kind,
    format: candidate.format,
    modified_at: metadata.mtime.toISOString(),
    size_bytes: metadata.size,
    ...sidecar.variantGroupId === void 0 ? {} : { variant_group_id: sidecar.variantGroupId },
    ...isWithinCoreCharacterLimit(text) ? {} : { too_large_for_core_input: !0 },
    text,
    text_sha256: sha256(text)
  };
}
async function scanLibrary(config) {
  let warnings2 = [], records = [], roots = [], managedDirectories = await Promise.all(
    config.library_roots.map((root) => managedVariantsDirectory(config, root))
  ), totalCapped = !1, scannedCandidateCount = 0;
  for (let root of config.library_roots) {
    let remaining = SCAN_MAX_FILES_TOTAL - scannedCandidateCount;
    if (remaining <= 0) {
      warnings2.push({ code: "total_file_cap_reached", root_id: root.id }), totalCapped = !0, roots.push({
        root_id: root.id,
        original_count: 0,
        assisted_variant_count: 0,
        too_large_count: 0,
        stale: !1,
        capped: !0
      });
      continue;
    }
    let maximum = Math.min(SCAN_MAX_FILES_PER_ROOT, remaining), collected = await collectCandidates(root, maximum, warnings2);
    scannedCandidateCount += collected.candidates.length;
    let rootRecords = [];
    for (let candidate of collected.candidates) {
      let record = await scanCandidate(root, candidate, managedDirectories, warnings2);
      record !== void 0 && rootRecords.push(record);
    }
    records.push(...rootRecords), collected.capped && (warnings2.push({ code: "root_file_cap_reached", root_id: root.id }), maximum < SCAN_MAX_FILES_PER_ROOT && (totalCapped = !0)), roots.push({
      root_id: root.id,
      original_count: rootRecords.filter((record) => record.kind === "original").length,
      assisted_variant_count: rootRecords.filter((record) => record.kind === "assisted_variant").length,
      too_large_count: rootRecords.filter((record) => record.too_large_for_core_input === !0).length,
      stale: collected.stale,
      capped: collected.capped
    });
  }
  return { records, warnings: warnings2, roots, total_capped: totalCapped };
}
function eligibleOriginals(scan) {
  return scan.records.filter(
    (record) => record.kind === "original" && record.too_large_for_core_input !== !0
  );
}

// src/workflow/result-projection.ts
function isRecord4(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function numberField(value, field) {
  let found = value[field];
  if (typeof found != "number" || !Number.isFinite(found)) throw workflowError("core_result_invalid");
  return found;
}
function recordField(value, field) {
  let found = value[field];
  if (!isRecord4(found)) throw workflowError("core_result_invalid");
  return found;
}
function arrayField(value, field) {
  let found = value[field];
  if (!Array.isArray(found)) throw workflowError("core_result_invalid");
  return found;
}
function compactObjects(value, fields, maximum) {
  return value.slice(0, maximum).flatMap((candidate) => {
    if (!isRecord4(candidate)) return [];
    let selected = {};
    for (let field of fields)
      candidate[field] !== void 0 && (selected[field] = candidate[field]);
    return [selected];
  });
}
function compactWarnings(value) {
  return compactObjects(value, ["code", "message", "related_fields", "related_categories"], 3);
}
function parseConfidencePreview(value) {
  if (!isRecord4(value) || typeof value.label != "string" || typeof value.score != "number")
    throw workflowError("core_result_invalid");
  return { label: value.label, score: value.score };
}
function parseCoreJson(json) {
  try {
    let value = JSON.parse(json);
    if (!isRecord4(value)) throw workflowError("core_result_invalid");
    return value;
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("core_result_invalid");
  }
}
function projectResumeAnalysis(result) {
  if (result.schema_version !== "career.resume_analysis.v1") throw workflowError("core_result_invalid");
  let checks = arrayField(result, "checks"), confidence = recordField(result, "confidence_context"), parseConfidence = parseConfidencePreview(confidence.parse_confidence), adjusted = checks.some((check) => isRecord4(check) && check.score_adjusted === !0);
  return {
    schema_version: RESULT_PROJECTION_SCHEMA,
    core_schema_version: "career.resume_analysis.v1",
    summary: {
      overall_score: numberField(result, "overall_score"),
      category_scores: recordField(result, "category_scores"),
      confidence_context: { parse_confidence: parseConfidence },
      top_strengths: compactObjects(arrayField(result, "top_strengths"), ["area", "title", "status"], 2),
      top_weaknesses: compactObjects(arrayField(result, "top_weaknesses"), ["area", "title", "status"], 2),
      improvement_actions: compactObjects(
        arrayField(result, "improvement_actions"),
        ["priority", "area", "action", "basis_check_id", "status"],
        2
      ),
      warnings: compactWarnings(arrayField(result, "warnings"))
    },
    ui_flags: { adjusted, provisional: !1, close_cluster: !1, stale: !1 }
  };
}
function projectJobMatch(result) {
  if (result.schema_version !== "career.job_match.v1") throw workflowError("core_result_invalid");
  let categories = arrayField(result, "category_results"), confidence = recordField(result, "confidence_context"), recommendation = recordField(result, "recommendation");
  if (typeof recommendation.label != "string") throw workflowError("core_result_invalid");
  let provisional = confidence.is_uncertain === !0, adjusted = categories.some((category) => isRecord4(category) && category.score_adjusted === !0);
  return {
    schema_version: RESULT_PROJECTION_SCHEMA,
    core_schema_version: "career.job_match.v1",
    summary: {
      overall_score: numberField(result, "overall_score"),
      category_scores: recordField(result, "category_scores"),
      confidence_context: {
        resume_parse_confidence: parseConfidencePreview(confidence.resume_parse_confidence),
        job_parse_confidence: parseConfidencePreview(confidence.job_parse_confidence),
        is_uncertain: provisional
      },
      top_strengths: compactObjects(
        arrayField(result, "top_strengths"),
        ["category", "item", "status", "match_type"],
        2
      ),
      top_gaps: compactObjects(arrayField(result, "top_gaps"), ["category", "item", "status"], 2),
      recommendation: compactObjects([recommendation], ["label", "status"], 1)[0] ?? {},
      warnings: compactWarnings(arrayField(result, "warnings"))
    },
    ui_flags: { adjusted, provisional, close_cluster: !1, stale: !1 }
  };
}
function createResultCard(options) {
  return {
    schema_version: WORKFLOW_STATE_SCHEMA,
    kind: "result_card",
    ...options.applicationId === void 0 ? {} : { application_id: options.applicationId },
    state_id: options.uuid(),
    created_at: options.now().toISOString(),
    workflow: options.workflow,
    run_id: options.runId,
    resume_id: options.resume.id,
    resume_label: options.resume.label,
    resume_path_fingerprint: sha256(options.resume.path),
    input_digests: {
      resume_text_sha256: options.resume.text_sha256,
      vacancy_text_sha256: options.vacancy?.vacancy_text_sha256 ?? sha256("")
    },
    projection: options.projection
  };
}
var RECOMMENDATION_BUCKET = {
  apply_now: 3,
  apply_after_small_edits: 2,
  improve_first: 1
};
function recommendationLabel(result) {
  let recommendation = recordField(result, "recommendation").label;
  if (recommendation !== "apply_now" && recommendation !== "apply_after_small_edits" && recommendation !== "improve_first") throw workflowError("core_result_invalid");
  return recommendation;
}
function compareText2(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function rankMatches(values) {
  let ranked = values.map(({ resume, result, projection }) => ({
    resume,
    result,
    projection: projection ?? projectJobMatch(result),
    overallScore: numberField(result, "overall_score"),
    recommendation: recommendationLabel(result),
    tie: !1,
    closeCluster: !1
  }));
  ranked.sort((left, right) => {
    if (left.overallScore !== right.overallScore) return right.overallScore - left.overallScore;
    let bucket = RECOMMENDATION_BUCKET[right.recommendation] - RECOMMENDATION_BUCKET[left.recommendation];
    if (bucket !== 0) return bucket;
    let pathOrder = compareText2(left.resume.path, right.resume.path);
    return pathOrder !== 0 ? pathOrder : compareText2(left.resume.id, right.resume.id);
  });
  let topScore = ranked[0]?.overallScore, secondScore = ranked[1]?.overallScore, tie = topScore !== void 0 && secondScore === topScore, close = topScore !== void 0 && secondScore !== void 0 && topScore - secondScore <= 3;
  for (let [index, item2] of ranked.entries())
    item2.tie = tie && item2.overallScore === topScore, item2.closeCluster = close && index < 2, item2.projection = {
      ...item2.projection,
      ui_flags: { ...item2.projection.ui_flags, close_cluster: item2.closeCluster }
    };
  return ranked;
}

// src/workflow/application-workspace.ts
import { createHash as createHash4 } from "node:crypto";
import { constants as constants2 } from "node:fs";
import {
  chmod,
  link as link2,
  lstat as lstat4,
  mkdir as mkdir2,
  open as open2,
  opendir as opendir2,
  readFile as readFile4,
  realpath as realpath4,
  rmdir,
  unlink as unlink2
} from "node:fs/promises";
import path6 from "node:path";
import { TextDecoder as TextDecoder5 } from "node:util";
import {
  withFileMutationQueue as withFileMutationQueue2
} from "@earendil-works/pi-coding-agent";

// src/workflow/renderers.ts
import os from "node:os";
import path5 from "node:path";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  truncateToWidth,
  wrapTextWithAnsi
} from "@earendil-works/pi-tui";

// src/workflow/session-state.ts
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, SHA2563 = /^[a-f0-9]{64}$/, ISO_UTC2 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, CARD_MAX_BYTES = 16384;
function isRecord5(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function exactKeys5(value, required, optional = []) {
  let allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function boundedText(value, maximum) {
  return typeof value == "string" && value.length > 0 && value.length <= maximum;
}
function boundedLabel(value) {
  return typeof value == "string" && value.length > 0 && [...value].length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
}
function validBase(value) {
  return value.schema_version === WORKFLOW_STATE_SCHEMA && typeof value.state_id == "string" && UUID2.test(value.state_id) && typeof value.created_at == "string" && ISO_UTC2.test(value.created_at) && Number.isFinite(Date.parse(value.created_at));
}
function validFlags(value) {
  return !isRecord5(value) || !exactKeys5(value, ["adjusted", "provisional", "close_cluster", "stale"]) ? !1 : [value.adjusted, value.provisional, value.close_cluster, value.stale].every(
    (flag) => typeof flag == "boolean"
  );
}
function validProjection(value) {
  return !isRecord5(value) || !exactKeys5(value, ["schema_version", "core_schema_version", "summary", "ui_flags"]) || value.schema_version !== RESULT_PROJECTION_SCHEMA || value.core_schema_version !== "career.resume_analysis.v1" && value.core_schema_version !== "career.job_match.v1" || !isRecord5(value.summary) || !validFlags(value.ui_flags) ? !1 : Buffer.byteLength(JSON.stringify(value), "utf8") <= CARD_MAX_BYTES;
}
function isUuid(value) {
  return typeof value == "string" && UUID2.test(value);
}
function isSha256(value) {
  return typeof value == "string" && SHA2563.test(value);
}
var APPLICATION_STATUSES = /* @__PURE__ */ new Set(["preparing", "applied", "interviewing", "closed"]);
function parseApplication(value) {
  if (exactKeys5(value, [
    "schema_version",
    "kind",
    "state_id",
    "created_at",
    "application_id",
    "company_label",
    "role_label",
    "status"
  ]) && !(!isUuid(value.application_id) || !boundedLabel(value.company_label) || !boundedLabel(value.role_label) || typeof value.status != "string" || !APPLICATION_STATUSES.has(value.status)))
    return value;
}
function parseApplicationClear(value) {
  return exactKeys5(value, ["schema_version", "kind", "state_id", "created_at", "clears_state_id"]) && isUuid(value.clears_state_id) ? value : void 0;
}
function parseVacancy(value) {
  if (exactKeys5(value, [
    "schema_version",
    "kind",
    "state_id",
    "created_at",
    "vacancy_label",
    "vacancy_text",
    "vacancy_text_sha256",
    "source"
  ], ["application_id"]) && !(!boundedText(value.vacancy_label, 120) || typeof value.vacancy_text != "string" || value.vacancy_text.trim().length === 0 || !isWithinCoreCharacterLimit(value.vacancy_text)) && !(!isSha256(value.vacancy_text_sha256) || value.vacancy_text_sha256 !== sha256(value.vacancy_text)) && !(value.source !== "paste" && value.source !== "replace") && !(value.application_id !== void 0 && !isUuid(value.application_id)))
    return value;
}
function parseVacancyClear(value) {
  return exactKeys5(value, ["schema_version", "kind", "state_id", "created_at", "clears_state_id"]) && isUuid(value.clears_state_id) ? value : void 0;
}
function parseConsent(value) {
  return exactKeys5(value, ["schema_version", "kind", "state_id", "created_at", "scope", "granted"]) && value.scope === "session_persistence" && typeof value.granted == "boolean" ? value : void 0;
}
function parseConsentClear(value) {
  return exactKeys5(value, ["schema_version", "kind", "state_id", "created_at", "scope", "clears_state_id"]) && value.scope === "session_persistence" && isUuid(value.clears_state_id) ? value : void 0;
}
function validInputDigests(value) {
  return isRecord5(value) && exactKeys5(value, ["resume_text_sha256", "vacancy_text_sha256"]) && isSha256(value.resume_text_sha256) && isSha256(value.vacancy_text_sha256);
}
function parseResultCard(value) {
  if (exactKeys5(value, [
    "schema_version",
    "kind",
    "state_id",
    "created_at",
    "workflow",
    "run_id",
    "resume_id",
    "resume_label",
    "resume_path_fingerprint",
    "input_digests",
    "projection"
  ], ["application_id"]) && !(value.workflow !== "analyze" && value.workflow !== "match") && !(!isUuid(value.run_id) || !isSha256(value.resume_id) || !boundedText(value.resume_label, 120)) && !(!isSha256(value.resume_path_fingerprint) || !validInputDigests(value.input_digests)) && !(value.application_id !== void 0 && !isUuid(value.application_id)))
    return validProjection(value.projection) ? value : void 0;
}
function parseWorkflowEntryData(value) {
  if (!(!isRecord5(value) || !validBase(value)))
    switch (value.kind) {
      case "application":
        return parseApplication(value);
      case "application_clear":
        return parseApplicationClear(value);
      case "vacancy":
        return parseVacancy(value);
      case "vacancy_clear":
        return parseVacancyClear(value);
      case "consent":
        return parseConsent(value);
      case "consent_clear":
        return parseConsentClear(value);
      case "result_card":
        return parseResultCard(value);
      default:
        return;
    }
}
function workflowDataFromEntries(entries) {
  let data = [];
  for (let entry of entries) {
    if (entry.type !== "custom" || entry.customType !== WORKFLOW_CUSTOM_TYPE) continue;
    let parsed = parseWorkflowEntryData(entry.data);
    parsed !== void 0 && data.push(parsed);
  }
  return data;
}
function workflowResultCards(entries) {
  return workflowDataFromEntries(entries).filter(
    (data) => data.kind === "result_card"
  );
}
function workspaceApplicationIdentity(entries) {
  let identity2, current, contextCleared = !1, stateIds = /* @__PURE__ */ new Set();
  for (let data of workflowDataFromEntries(entries))
    if (data.kind === "application") {
      let canonicalTimestamp = !1;
      try {
        canonicalTimestamp = new Date(data.created_at).toISOString() === data.created_at;
      } catch {
      }
      if (contextCleared || stateIds.has(data.state_id) || data.application_id !== data.application_id.toLowerCase() || !canonicalTimestamp)
        throw workflowError("workspace_identity_conflict");
      if (stateIds.add(data.state_id), identity2 === void 0) {
        identity2 = data, current = data;
        continue;
      }
      if (current === void 0 || data.application_id !== identity2.application_id || data.company_label !== identity2.company_label || data.role_label !== identity2.role_label || Date.parse(data.created_at) <= Date.parse(current.created_at))
        throw workflowError("workspace_identity_conflict");
      current = data;
    } else data.kind === "application_clear" && current?.state_id === data.clears_state_id && (identity2 = void 0, current = void 0, contextCleared = !0);
  if (identity2 === void 0 || current === void 0) return;
  let reconstructed = reconstructWorkflowState(entries);
  if (reconstructed.application?.state_id !== current.state_id)
    throw workflowError("workspace_identity_conflict");
  return {
    identity: identity2,
    current,
    ...reconstructed.vacancy === void 0 ? {} : { vacancy: reconstructed.vacancy }
  };
}
function reconstructWorkflowState(entries) {
  let application, applicationContextSeen = !1, vacancy, consent, cards = /* @__PURE__ */ new Map();
  for (let data of workflowDataFromEntries(entries))
    switch (data.kind) {
      case "application":
        applicationContextSeen = !0, application = data;
        break;
      case "application_clear":
        application?.state_id === data.clears_state_id && (application = void 0);
        break;
      case "vacancy":
        vacancy = data;
        break;
      case "vacancy_clear":
        vacancy?.state_id === data.clears_state_id && (vacancy = void 0);
        break;
      case "consent":
        consent = data;
        break;
      case "consent_clear":
        consent?.state_id === data.clears_state_id && (consent = void 0);
        break;
      case "result_card":
        cards.set(`${data.application_id ?? "legacy"}:${data.workflow}:${data.resume_id}`, data);
        break;
    }
  let applicationId = application?.application_id, hasActiveScope = application !== void 0 || !applicationContextSeen, scopedVacancy = hasActiveScope && vacancy?.application_id === applicationId ? vacancy : void 0, scopedCards = hasActiveScope ? [...cards.values()].filter((card) => card.application_id === applicationId) : [];
  return {
    ...applicationContextSeen ? { application_context_seen: !0 } : {},
    ...application === void 0 ? {} : { application },
    ...scopedVacancy === void 0 ? {} : { vacancy: scopedVacancy },
    ...consent === void 0 ? {} : { consent },
    result_cards: scopedCards
  };
}
function base(options) {
  return {
    schema_version: WORKFLOW_STATE_SCHEMA,
    state_id: options.uuid(),
    created_at: options.now().toISOString()
  };
}
function cleanApplicationLabel(value) {
  return [...value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()].slice(0, 120).join("");
}
function createApplicationEntry(company, role, status, options, applicationId) {
  return {
    ...base(options),
    kind: "application",
    application_id: applicationId ?? options.uuid(),
    company_label: cleanApplicationLabel(company),
    role_label: cleanApplicationLabel(role),
    status
  };
}
function createApplicationClearEntry(application, options) {
  return { ...base(options), kind: "application_clear", clears_state_id: application.state_id };
}
function createVacancyEntry(text, source, options) {
  let label = text.split(`
`).find((line) => line.trim().length > 0)?.trim() || "Current vacancy";
  return {
    ...base(options),
    kind: "vacancy",
    ...options.applicationId === void 0 ? {} : { application_id: options.applicationId },
    vacancy_label: label.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120),
    vacancy_text: text,
    vacancy_text_sha256: sha256(text),
    source
  };
}
function createVacancyClearEntry(vacancy, options) {
  return { ...base(options), kind: "vacancy_clear", clears_state_id: vacancy.state_id };
}
function createConsentEntry(granted, options) {
  return {
    ...base(options),
    kind: "consent",
    scope: "session_persistence",
    granted
  };
}
function withCurrentStaleness(state, scan, vacancyDigest, extraRecords = []) {
  let records = new Map([
    ...scan.records.map((record) => [record.id, record]),
    ...extraRecords.map((record) => [record.id, record])
  ]), authoritativeVacancy = vacancyDigest === void 0 ? state.vacancy?.vacancy_text_sha256 : vacancyDigest ?? void 0, cards = state.result_cards.map((card) => {
    let current = records.get(card.resume_id), resumeStale = current === void 0 || current.text_sha256 !== card.input_digests.resume_text_sha256, vacancyStale = card.workflow === "match" && authoritativeVacancy !== card.input_digests.vacancy_text_sha256, stale = resumeStale || vacancyStale;
    return {
      ...card,
      projection: {
        ...card.projection,
        ui_flags: { ...card.projection.ui_flags, stale }
      }
    };
  });
  return { ...state, result_cards: cards };
}

// src/workflow/renderers.ts
function privacyDisplayPath(absolutePath) {
  let home = os.homedir(), relative = path5.relative(home, absolutePath);
  return relative && !relative.startsWith("..") && !path5.isAbsolute(relative) ? `~${path5.sep}${relative}` : path5.basename(absolutePath) || "resume root";
}
function setupSummary(config, scan, persisted3) {
  let resumes = scan.records.length, roots = config.library_roots.length, notices = scan.warnings.length, variantsRoot = suggestedGeneratedVariantsRoot(config), variants = variantsRoot === void 0 ? "Resume variation suggestion: unavailable until a resume root is configured" : `Resume variation suggestion: ${privacyDisplayPath(variantsRoot)} (${config.generated_variants_root === null ? "default under the first configured root" : "configured"})`;
  return [
    `pi-career • ${roots} root${roots === 1 ? "" : "s"} • ${resumes} resume${resumes === 1 ? "" : "s"} • ${notices} notice${notices === 1 ? "" : "s"} • session ${persisted3 ? "persisted" : "transient"}`,
    variants
  ].join(`
`);
}
function scanWarningMessage(code, isPdf) {
  switch (code) {
    case "root_stale":
      return "root is unavailable or has moved";
    case "root_file_cap_reached":
      return "root scan limit reached; some files were not indexed";
    case "total_file_cap_reached":
      return "total scan limit reached; some files were not indexed";
    case "raw_file_too_large":
      return isPdf ? "PDF is over 10 MiB; reduce or export it as Markdown/text" : "file is over 256 KiB; reduce it before analysis";
    case "pdf_text_unavailable":
      return "PDF text could not be extracted; use a searchable, unencrypted PDF or export it as Markdown/text (OCR is not supported)";
    case "invalid_utf8":
      return "text file is not valid UTF-8";
    case "invalid_assisted_sidecar":
      return "assisted-variant sidecar is invalid; the document is quarantined from original eligibility";
    case "scan_entry_unavailable":
      return "file or directory could not be read";
  }
}
function libraryWarningPreview(config, scan, maximum = 10) {
  if (scan.warnings.length === 0) return "";
  let labels = new Map(config.library_roots.map((root) => [root.id, root.label])), lines = scan.warnings.slice(0, maximum).map((warning) => {
    let root = labels.get(warning.root_id) ?? "Resume root", relative = warning.relative_path?.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160);
    return `- ${relative ? `${root}/${relative}` : root}: ${scanWarningMessage(warning.code, relative?.toLowerCase().endsWith(".pdf") === !0)}`;
  });
  return scan.warnings.length > maximum && lines.push(`- ${scan.warnings.length - maximum} more notice${scan.warnings.length - maximum === 1 ? "" : "s"}`), ["Library notices:", ...lines].join(`
`);
}
function librarySummary(config, scan, persisted3) {
  let originals = scan.records.filter((record) => record.kind === "original").length, assisted = scan.records.filter((record) => record.kind === "assisted_variant").length, tooLarge = scan.records.filter((record) => record.too_large_for_core_input === !0).length, staleRoots = scan.roots.filter((root) => root.stale).length;
  return [
    `${config.library_roots.length} roots`,
    `${originals} original resumes`,
    `${assisted} assisted variants`,
    `${tooLarge} too large`,
    `${staleRoots} stale roots`,
    `${scan.warnings.length} notices`,
    `${persisted3 ? "persisted" : "transient"} session`
  ].join(" • ");
}
function summaryRecord(card) {
  return card.projection.summary;
}
function recommendationLabel2(card) {
  let recommendation = summaryRecord(card).recommendation;
  if (recommendation !== null && typeof recommendation == "object" && !Array.isArray(recommendation)) {
    let label = recommendation.label;
    return typeof label == "string" ? label : void 0;
  }
}
function scoreValue(card) {
  let value = summaryRecord(card).overall_score;
  return typeof value == "number" && Number.isFinite(value) ? value : void 0;
}
function score(card) {
  return String(scoreValue(card) ?? "unavailable");
}
function badges(card, tie = !1) {
  let flags = card.projection.ui_flags;
  return [
    ...tie ? ["tie"] : [],
    ...flags.adjusted ? ["adjusted"] : [],
    ...flags.provisional ? ["provisional"] : [],
    ...flags.close_cluster ? ["close cluster"] : [],
    ...flags.stale ? ["stale"] : []
  ];
}
function objectField(value, field) {
  return value !== null && typeof value == "object" && !Array.isArray(value) ? value[field] : void 0;
}
function previewItems(summary, field) {
  let values = summary[field];
  if (!Array.isArray(values)) return "none";
  let items = values.slice(0, 2).flatMap((value) => {
    let item2 = objectField(value, "item") ?? objectField(value, "title");
    return typeof item2 == "string" ? [item2.slice(0, 80)] : [];
  });
  return items.length > 0 ? items.join(", ") : "none";
}
function matchProjectionDetails(projection) {
  let summary = projection.summary, confidence = summary.confidence_context, resumeConfidence = objectField(confidence, "resume_parse_confidence"), jobConfidence = objectField(confidence, "job_parse_confidence"), resumeLabel2 = objectField(resumeConfidence, "label"), resumeScore = objectField(resumeConfidence, "score"), jobLabel = objectField(jobConfidence, "label"), jobScore = objectField(jobConfidence, "score"), warnings2 = summary.warnings, warningCount = Array.isArray(warnings2) ? warnings2.length : 0;
  return [
    `confidence resume ${String(resumeLabel2 ?? "unavailable")} ${String(resumeScore ?? "-")} • job ${String(jobLabel ?? "unavailable")} ${String(jobScore ?? "-")}`,
    `strengths ${previewItems(summary, "top_strengths")}`,
    `gaps ${previewItems(summary, "top_gaps")} • warnings ${warningCount}`
  ];
}
function plainResultCard(card, tie = !1) {
  let labels = badges(card, tie), recommendation = recommendationLabel2(card);
  return [
    `${card.workflow === "match" ? "Career match" : "Career analyze"}: ${card.resume_label}`,
    `score ${score(card)}${recommendation ? ` • ${recommendation}` : ""}`,
    ...labels.length > 0 ? [labels.join(" • ")] : [],
    ...card.workflow === "match" ? matchProjectionDetails(card.projection) : []
  ].join(`
`);
}
function stateEntryText(data) {
  switch (data.kind) {
    case "application":
      return `Career application: ${data.company_label} — ${data.role_label} — ${data.status}`;
    case "application_clear":
      return "Career application cleared";
    case "vacancy":
      return `Career vacancy: ${data.vacancy_label}`;
    case "vacancy_clear":
      return "Career vacancy cleared";
    case "consent":
      return `Career session-persistence consent: ${data.granted ? "granted" : "declined"}`;
    case "consent_clear":
      return "Career session-persistence consent cleared";
  }
}
function resultCardLines(card, theme, width, tie) {
  let label = theme.fg("accent", theme.bold(card.resume_label)), flags = badges(card, tie), recommendation = recommendationLabel2(card), recommendationText = recommendation ? ` • ${recommendation}` : "", flagText = flags.length > 0 ? flags.join(" • ") : void 0, matchDetails = card.workflow === "match" ? matchProjectionDetails(card.projection) : [];
  return width >= 100 ? [
    `${label} • score ${score(card)}${recommendationText}${flagText ? ` • ${flagText}` : ""}`,
    ...matchDetails
  ] : width >= 80 ? [label, `score ${score(card)}${recommendationText}`, ...flagText ? [flagText] : [], ...matchDetails] : [label, `score ${score(card)}`, ...flagText ? [flagText] : [], ...matchDetails];
}
var ResponsiveCard = class {
  constructor(data, theme, tie) {
    this.data = data;
    this.theme = theme;
    this.tie = tie;
  }
  data;
  theme;
  tie;
  render(width) {
    return this.data.kind !== "result_card" ? [truncateToWidth(this.theme.fg("muted", stateEntryText(this.data)), width)] : resultCardLines(this.data, this.theme, width, this.tie).map((line) => truncateToWidth(line, width));
  }
  invalidate() {
  }
};
function registerWorkflowEntryRenderer(pi, currentData, currentTie) {
  pi.registerEntryRenderer(WORKFLOW_RENDERER_TYPE, (entry, _options, theme) => {
    let parsed = parseWorkflowEntryData(entry.data);
    if (parsed === void 0) return;
    let data = currentData?.(parsed.state_id) ?? parsed, tie = data.kind === "result_card" && currentTie?.(data.state_id) === !0, container = new Container();
    return container.addChild(new DynamicBorder((text) => theme.fg("borderMuted", text))), container.addChild(new ResponsiveCard(data, theme, tie)), container.addChild(new DynamicBorder((text) => theme.fg("borderMuted", text))), container;
  });
}
var WORKFLOW_RENDERER_TYPE = "career.workflow";
function oversizeResultMessage(command, runId, code) {
  return `${command} • run ${runId} • ${code}
No partial output exists and the result was not stored.`;
}
function unavailableMatchResultMessage(runId, resumeLabel2, code) {
  return `career-match • run ${runId} • ${code}
${resumeLabel2} • result unavailable
No partial output exists and the result was not stored.`;
}
function deriveMatchTieStateIds(cards) {
  let byRun = /* @__PURE__ */ new Map();
  for (let card of cards) {
    if (card.workflow !== "match" || scoreValue(card) === void 0) continue;
    let runCards = byRun.get(card.run_id) ?? [];
    runCards.push(card), byRun.set(card.run_id, runCards);
  }
  let tied = /* @__PURE__ */ new Set();
  for (let runCards of byRun.values()) {
    let topScore = Math.max(...runCards.map((card) => scoreValue(card))), topCards = runCards.filter((card) => scoreValue(card) === topScore);
    if (!(topCards.length < 2))
      for (let card of topCards) tied.add(card.state_id);
  }
  return tied;
}
var DetailViewer = class {
  constructor(label, text, theme, keybindings, visibleLineCount, requestRender, close) {
    this.label = label;
    this.text = text;
    this.theme = theme;
    this.keybindings = keybindings;
    this.visibleLineCount = visibleLineCount;
    this.requestRender = requestRender;
    this.close = close;
  }
  label;
  text;
  theme;
  keybindings;
  visibleLineCount;
  requestRender;
  close;
  offset = 0;
  wrappedWidth;
  wrappedLines = [];
  maximumOffset() {
    return Math.max(0, this.wrappedLines.length - this.visibleLineCount);
  }
  moveTo(offset) {
    let next = Math.max(0, Math.min(this.maximumOffset(), offset));
    next !== this.offset && (this.offset = next, this.requestRender());
  }
  handleInput(data) {
    this.keybindings.matches(data, "tui.select.cancel") ? this.close() : this.keybindings.matches(data, "tui.select.up") ? this.moveTo(this.offset - 1) : this.keybindings.matches(data, "tui.select.down") ? this.moveTo(this.offset + 1) : this.keybindings.matches(data, "tui.select.pageUp") ? this.moveTo(this.offset - this.visibleLineCount) : this.keybindings.matches(data, "tui.select.pageDown") ? this.moveTo(this.offset + this.visibleLineCount) : matchesKey(data, Key.home) ? this.moveTo(0) : matchesKey(data, Key.end) && this.moveTo(this.maximumOffset());
  }
  render(width) {
    let renderWidth = Math.max(1, width);
    this.wrappedWidth !== renderWidth && (this.wrappedWidth = renderWidth, this.wrappedLines = wrapTextWithAnsi(this.text, renderWidth), this.wrappedLines.length === 0 && (this.wrappedLines = [""]), this.offset = Math.min(this.offset, this.maximumOffset()));
    let visible = this.wrappedLines.slice(this.offset, this.offset + this.visibleLineCount), first = this.offset + 1, last = this.offset + visible.length;
    return [
      this.theme.fg("accent", this.theme.bold(`Career detail • ${this.label}`)),
      ...visible,
      this.theme.fg("dim", `${first}-${last} of ${this.wrappedLines.length} visual lines`),
      this.theme.fg("dim", "↑↓ line • PgUp/PgDn page • Home/End • Esc close")
    ].map((line) => truncateToWidth(line, renderWidth));
  }
  invalidate() {
    this.wrappedWidth = void 0;
  }
};

// src/workflow/application-readiness.ts
function selectedRecord(selected, scan) {
  if (scan.total_capped) return;
  let roots = scan.roots.filter((root2) => root2.root_id === selected.library_root_id), [root] = roots;
  if (roots.length !== 1 || root === void 0 || root.stale || root.capped) return;
  let candidates = scan.records.filter(
    (record) => record.root_id === selected.library_root_id && record.id === selected.document_id
  ), [candidate] = candidates;
  if (!(candidates.length !== 1 || candidate === void 0))
    return candidate.kind === "original" && candidate.too_large_for_core_input !== !0 ? candidate : void 0;
}
function classifyResume(snapshot, evidence) {
  let selected = snapshot.selected_original;
  if (selected === null) {
    if (snapshot.resume_artifact !== null) throw new TypeError("invalid validated readiness snapshot");
    return { classification: "Missing", effective: null };
  }
  if (snapshot.resume_artifact !== null && evidence.resume_artifact === "drifted")
    return { classification: "Drifted", effective: null };
  let record = selectedRecord(selected, evidence.library_scan);
  return record === void 0 ? { classification: "Unavailable", effective: null } : record.format !== selected.format || record.text_sha256 !== selected.text_sha256 ? { classification: "Stale", effective: null } : snapshot.resume_artifact !== null ? {
    classification: "Available",
    digest: snapshot.resume_artifact.artifact_sha256,
    effective: "tailored"
  } : { classification: "Available", digest: selected.text_sha256, effective: "original" };
}
function readinessLabel(available) {
  return available === 3 ? "Ready 3/3" : available === 2 ? "Incomplete 2/3" : available === 1 ? "Incomplete 1/3" : "Incomplete 0/3";
}
function deriveApplicationReadiness(snapshot, evidence) {
  let job = snapshot.vacancy === null ? "Missing" : evidence.vacancy === "valid" ? "Available" : "Drifted", resume = classifyResume(snapshot, evidence), cover;
  snapshot.cover_letter_artifact === null ? cover = "Missing" : evidence.cover_letter_artifact === "drifted" ? cover = "Drifted" : job !== "Available" || resume.classification !== "Available" ? cover = "Unavailable" : snapshot.cover_letter_artifact.job_description_sha256 !== snapshot.vacancy?.content_sha256 || snapshot.cover_letter_artifact.effective_resume_sha256 !== resume.digest ? cover = "Stale" : cover = "Available";
  let available = [job, resume.classification, cover].filter((value) => value === "Available").length;
  return {
    components: { job_description: job, resume: resume.classification, cover_letter: cover },
    readiness: readinessLabel(available),
    effective_resume: resume.effective
  };
}

// src/workflow/session-attachment.ts
var APPLICATION_ATTACHMENT_CUSTOM_TYPE = "career.application_attachment", APPLICATION_ASSISTANCE_CUSTOM_TYPE = "career.application_assistance", CAREER_ASSISTANCE_HANDOFF = '/skill:career-core Use career_run for the attached application. Start with {"command":"context"}.', APPLICATION_ATTACHMENT_SCHEMA = "pi.career.application_attachment.v1", APPLICATION_ASSISTANCE_SCHEMA = "pi.career.application_assistance.v1", LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, CANONICAL_TIMESTAMP2 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function isRecord6(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function hasOrderedKeys(value, expected) {
  let actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isUuid2(value) {
  return typeof value == "string" && LOWERCASE_UUID.test(value);
}
function isTimestamp(value) {
  if (typeof value != "string" || !CANONICAL_TIMESTAMP2.test(value)) return !1;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return !1;
  }
}
function parseAttachment(value) {
  if (!hasOrderedKeys(value, [
    "schema_version",
    "kind",
    "attachment_id",
    "application_id",
    "root_id",
    "root_created_at",
    "application_created_at",
    "workspace_created_at"
  ])) return;
  let validIds = [value.attachment_id, value.application_id, value.root_id].every(isUuid2), validTimes = [value.root_created_at, value.application_created_at, value.workspace_created_at].every(isTimestamp);
  return validIds && validTimes ? value : void 0;
}
function parseDetachment(value) {
  return hasOrderedKeys(
    value,
    ["schema_version", "kind", "detachment_id", "attachment_id"]
  ) && [value.detachment_id, value.attachment_id].every(isUuid2) ? value : void 0;
}
function parseApplicationAttachmentEntryData(value) {
  if (!(!isRecord6(value) || value.schema_version !== APPLICATION_ATTACHMENT_SCHEMA)) {
    if (value.kind === "application_attachment") return parseAttachment(value);
    if (value.kind === "application_detachment") return parseDetachment(value);
  }
}
function parseApplicationAssistanceEntryData(value) {
  return !isRecord6(value) || !hasOrderedKeys(value, [
    "schema_version",
    "kind",
    "activation_id",
    "attachment_id",
    "application_id"
  ]) ? void 0 : value.schema_version === APPLICATION_ASSISTANCE_SCHEMA && value.kind === "application_assistance_activation" && [value.activation_id, value.attachment_id, value.application_id].every(isUuid2) ? value : void 0;
}
function invalidRecords() {
  return { integrity: "invalid" };
}
function relevantRecordId(data) {
  return data.kind === "application_attachment" ? data.attachment_id : data.kind === "application_detachment" ? data.detachment_id : data.activation_id;
}
function attachmentClaim(value) {
  let data = parseApplicationAttachmentEntryData(value);
  return data === void 0 ? { kind: "invalid" } : {
    kind: "record",
    recordId: relevantRecordId(data),
    ...data.kind === "application_attachment" ? { applicationId: data.application_id } : {}
  };
}
function assistanceClaim(value) {
  let data = parseApplicationAssistanceEntryData(value);
  return data === void 0 ? { kind: "invalid" } : { kind: "record", recordId: data.activation_id, applicationId: data.application_id };
}
function workflowClaim(value) {
  if (!isRecord6(value) || value.kind !== "application") return { kind: "ignore" };
  let workflow = parseWorkflowEntryData(value);
  return workflow?.kind === "application" ? { kind: "record", applicationId: workflow.application_id } : { kind: "invalid" };
}
function claimFromEntry(entry) {
  if (entry.type !== "custom") return { kind: "ignore" };
  switch (entry.customType) {
    case APPLICATION_ATTACHMENT_CUSTOM_TYPE:
      return attachmentClaim(entry.data);
    case APPLICATION_ASSISTANCE_CUSTOM_TYPE:
      return assistanceClaim(entry.data);
    case WORKFLOW_CUSTOM_TYPE:
      return workflowClaim(entry.data);
    default:
      return { kind: "ignore" };
  }
}
function scanSessionClaims(entries) {
  let recordIds = /* @__PURE__ */ new Set(), applicationIds = /* @__PURE__ */ new Set();
  for (let entry of entries) {
    let claim = claimFromEntry(entry);
    if (claim.kind === "invalid") return;
    if (claim.kind !== "ignore") {
      if (claim.recordId !== void 0) {
        if (recordIds.has(claim.recordId)) return;
        recordIds.add(claim.recordId);
      }
      claim.applicationId !== void 0 && applicationIds.add(claim.applicationId);
    }
  }
  if (applicationIds.size > 1) return;
  let usedApplicationId = applicationIds.values().next().value;
  return usedApplicationId === void 0 ? {} : { usedApplicationId };
}
function applyAttachmentRecord(current, data, usedApplicationId) {
  if (data.kind === "application_attachment")
    return current.attachment !== void 0 || data.application_id !== usedApplicationId ? void 0 : { attachment: data };
  if (!(current.attachment === void 0 || data.attachment_id !== current.attachment.attachment_id))
    return {};
}
function applyAssistanceRecord(current, data) {
  if (!(current.attachment === void 0 || current.activation !== void 0 || data.attachment_id !== current.attachment.attachment_id || data.application_id !== current.attachment.application_id))
    return { attachment: current.attachment, activation: data };
}
function replayActiveBranch(entries, usedApplicationId) {
  let current = {};
  for (let entry of entries)
    if (entry.type === "custom") {
      if (entry.customType === APPLICATION_ATTACHMENT_CUSTOM_TYPE) {
        let data = parseApplicationAttachmentEntryData(entry.data);
        if (data === void 0) return;
        let next = applyAttachmentRecord(current, data, usedApplicationId);
        if (next === void 0) return;
        current = next;
      } else if (entry.customType === APPLICATION_ASSISTANCE_CUSTOM_TYPE) {
        let data = parseApplicationAssistanceEntryData(entry.data);
        if (data === void 0) return;
        let next = applyAssistanceRecord(current, data);
        if (next === void 0) return;
        current = next;
      }
    }
  return current;
}
function replayApplicationSessionRecords(branchEntries, allEntries = branchEntries) {
  let claims = scanSessionClaims(allEntries);
  if (claims === void 0) return invalidRecords();
  let active = replayActiveBranch(branchEntries, claims.usedApplicationId);
  return active === void 0 ? invalidRecords() : {
    integrity: "valid",
    ...claims.usedApplicationId === void 0 ? {} : { used_application_id: claims.usedApplicationId },
    ...active.attachment === void 0 ? {} : { attachment: active.attachment },
    ...active.activation === void 0 ? {} : { activation: active.activation }
  };
}
function createApplicationAttachmentEntry(pointer, options) {
  let data = {
    schema_version: APPLICATION_ATTACHMENT_SCHEMA,
    kind: "application_attachment",
    attachment_id: options.uuid(),
    application_id: pointer.applicationId,
    root_id: pointer.rootId,
    root_created_at: pointer.rootCreatedAt,
    application_created_at: pointer.applicationCreatedAt,
    workspace_created_at: pointer.workspaceCreatedAt
  };
  if (parseApplicationAttachmentEntryData(data) === void 0)
    throw new TypeError("invalid application attachment record");
  return data;
}
function createApplicationDetachmentEntry(attachment, options) {
  let data = {
    schema_version: APPLICATION_ATTACHMENT_SCHEMA,
    kind: "application_detachment",
    detachment_id: options.uuid(),
    attachment_id: attachment.attachment_id
  };
  if (parseApplicationAttachmentEntryData(data) === void 0)
    throw new TypeError("invalid application detachment record");
  return data;
}
function createApplicationAssistanceActivationEntry(attachment, options) {
  let data = {
    schema_version: APPLICATION_ASSISTANCE_SCHEMA,
    kind: "application_assistance_activation",
    activation_id: options.uuid(),
    attachment_id: attachment.attachment_id,
    application_id: attachment.application_id
  };
  if (parseApplicationAssistanceEntryData(data) === void 0)
    throw new TypeError("invalid application assistance record");
  return data;
}

// src/workflow/application-workspace.ts
var ROOT_MARKER_NAME = ".pi-career-applications.json", MANIFEST_NAME = "application.json", IDENTITY_NAME = ".pi-career-identity.json", ROOT_MARKER_SCHEMA = "pi.career.application_root.v1", MANIFEST_SCHEMA = "pi.career.application_manifest.v1", IDENTITY_SCHEMA = "pi.career.application_identity.v1", STATE_SCHEMA_V1 = "pi.career.application_state.v1", STATE_SCHEMA_V2 = "pi.career.application_state.v2", PREVIEW_SCHEMA = "pi.career.workspace_mutation_preview.v1", METADATA_MAX_BYTES = 16384, CONFIG_MAX_BYTES2 = 65536, PREVIEW_MAX_BYTES = 5242880, VACANCY_MAX_BYTES = 262144, ROOT_MAX_ENTRIES = 1024, APPLICATION_MAX_ENTRIES = 160, APPLICATION_MAX_MANAGED_BYTES = 2097152, STATE_MAX_REVISIONS = 64, PATH_MAX_BYTES3 = 4096, BASENAME_MAX_BYTES = 180, CONFIRM_TIMEOUT_MS = 600 * 1e3, UUID3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, SHA2564 = /^[a-f0-9]{64}$/, ISO_UTC3 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, STATE_BASENAME = /^\.pi-career-state-([0-9]{6})\.json$/, VACANCY_BASENAME = /^vacancy(?:-([0-9]{6}))?\.md$/, COVER_LETTER_BASENAME = /^cover-letter(?:-([0-9]{6}))?\.(md|txt)$/, APPLICATION_BASENAME = /^([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?|company)--([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?|role)--([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/, APPLICATION_STATUSES2 = /* @__PURE__ */ new Set(["preparing", "applied", "interviewing", "closed"]);
function hashBytes2(bytes) {
  return createHash4("sha256").update(bytes).digest("hex");
}
function isRecord7(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function exactKeys6(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function validTimestamp(value) {
  if (typeof value != "string" || !ISO_UTC3.test(value)) return !1;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return !1;
  }
}
function validUuid(value) {
  return typeof value == "string" && UUID3.test(value);
}
function validSessionUuid(value) {
  return typeof value == "string" && SESSION_UUID.test(value);
}
function validHash(value) {
  return typeof value == "string" && SHA2564.test(value);
}
function validRelativeBasename(value) {
  return typeof value == "string" && value.length > 0 && value !== "." && value !== ".." && path6.basename(value) === value && !path6.isAbsolute(value) && Buffer.byteLength(value, "utf8") <= BASENAME_MAX_BYTES && !/[\u0000-\u001f\u007f]/.test(value);
}
function canonicalJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}
`, "utf8");
}
function effectiveUserId2() {
  let value = process.geteuid?.() ?? process.getuid?.();
  if (value === void 0) throw workflowError("workspace_verification_failed");
  return value;
}
function privateMetadata(metadata, mode, kind) {
  return (kind === "file" ? metadata.isFile() : metadata.isDirectory()) && !metadata.isSymbolicLink() && metadata.uid === effectiveUserId2() && (metadata.mode & 4095) === mode && (kind === "directory" || metadata.nlink === 1);
}
function sameInode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
function persistentRootEntries(root) {
  let lockName = path6.basename(workspaceLockPath(path6.dirname(root.markerFile.path)));
  return root.entries.filter((entry) => entry !== lockName);
}
function assertRootPlanCurrent(expected, current) {
  if (!sameInode(expected.metadata, current.metadata) || !sameInode(expected.markerFile.metadata, current.markerFile.metadata) || JSON.stringify(persistentRootEntries(expected)) !== JSON.stringify(persistentRootEntries(current)) || expected.applications.length !== current.applications.length)
    throw workflowError("workspace_drift");
  let currentApplications = new Map(current.applications.map((application) => [application.directoryPath, application]));
  for (let application of expected.applications) {
    let replacement = currentApplications.get(application.directoryPath);
    if (replacement === void 0 || !sameInode(application.metadata, replacement.metadata) || !sameInode(application.manifestFile.metadata, replacement.manifestFile.metadata) || application.manifestFile.sha256 !== replacement.manifestFile.sha256)
      throw workflowError("workspace_drift");
  }
  if (expected.currentApplication !== void 0) {
    let application = current.currentApplication;
    if (application === void 0 || !sameInode(expected.currentApplication.headFile.metadata, application.headFile.metadata))
      throw workflowError("workspace_drift");
  }
}
function parseMarker(value) {
  if (!(!isRecord7(value) || !exactKeys6(value, ["schema_version", "kind", "root_id", "created_at"]) || value.schema_version !== ROOT_MARKER_SCHEMA || value.kind !== "application_workspace_root" || !validUuid(value.root_id) || !validTimestamp(value.created_at)))
    return {
      schema_version: ROOT_MARKER_SCHEMA,
      kind: "application_workspace_root",
      root_id: value.root_id,
      created_at: value.created_at
    };
}
function parseManifest(value) {
  if (!(!isRecord7(value) || !exactKeys6(value, [
    "schema_version",
    "kind",
    "application_id",
    "root_id",
    "application_created_at",
    "workspace_created_at"
  ]) || value.schema_version !== MANIFEST_SCHEMA || value.kind !== "career_application" || !validUuid(value.application_id) || !validUuid(value.root_id) || !validTimestamp(value.application_created_at) || !validTimestamp(value.workspace_created_at) || Date.parse(value.workspace_created_at) < Date.parse(value.application_created_at)))
    return {
      schema_version: MANIFEST_SCHEMA,
      kind: "career_application",
      application_id: value.application_id,
      root_id: value.root_id,
      application_created_at: value.application_created_at,
      workspace_created_at: value.workspace_created_at
    };
}
function decodeApplicationIdentity(bytes, manifest) {
  return decodeCanonical(bytes, (value) => {
    if (!(!isRecord7(value) || !exactKeys6(value, [
      "schema_version",
      "kind",
      "application_id",
      "company_label",
      "role_label",
      "created_at"
    ]) || value.schema_version !== IDENTITY_SCHEMA || value.kind !== "application_identity" || !validUuid(value.application_id) || !validTimestamp(value.created_at) || !boundedLabel(value.company_label) || !boundedLabel(value.role_label) || value.application_id !== manifest.application_id || value.created_at !== manifest.application_created_at))
      return {
        schema_version: IDENTITY_SCHEMA,
        kind: "application_identity",
        application_id: value.application_id,
        company_label: value.company_label,
        role_label: value.role_label,
        created_at: value.created_at
      };
  });
}
async function readApplicationIdentityFile(directory, manifest) {
  let directoryMetadata = await inspectPrivateApplicationDirectory(directory, void 0), checkDirectory = async () => {
    if (!sameInode(directoryMetadata, await inspectPrivateApplicationDirectory(directory, void 0)))
      throw workflowError("workspace_drift");
  }, handle;
  try {
    try {
      handle = await open2(path6.join(directory, IDENTITY_NAME), constants2.O_RDONLY | constants2.O_NOFOLLOW | constants2.O_NONBLOCK);
    } catch (error) {
      if (error.code === "ENOENT") {
        await checkDirectory();
        return;
      }
      throw error;
    }
    let metadata = await handle.stat();
    if (!privateMetadata(metadata, 384, "file") || metadata.size <= 0 || metadata.size > METADATA_MAX_BYTES)
      throw workflowError("workspace_drift");
    let bytes = Buffer.alloc(METADATA_MAX_BYTES + 1), length = 0;
    for (; length < bytes.length; ) {
      let { bytesRead } = await handle.read(bytes, length, bytes.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    let current = await handle.stat(), named = await lstat4(path6.join(directory, IDENTITY_NAME));
    if (length !== metadata.size || !privateMetadata(current, 384, "file") || !privateMetadata(named, 384, "file") || !sameInode(current, named) || current.size !== metadata.size || current.mtimeMs !== metadata.mtimeMs || current.ctimeMs !== metadata.ctimeMs)
      throw workflowError("workspace_drift");
    await checkDirectory();
    let content = Buffer.from(bytes.subarray(0, length));
    return {
      identity: decodeApplicationIdentity(content, manifest),
      file: { path: path6.join(directory, IDENTITY_NAME), bytes: content, metadata: current, sha256: hashBytes2(content) }
    };
  } catch {
    throw workflowError("workspace_drift");
  } finally {
    await handle?.close().catch(() => {
      throw workflowError("workspace_drift");
    });
  }
}
async function readApplicationIdentity(directory, manifest) {
  return (await readApplicationIdentityFile(directory, manifest))?.identity;
}
function parseVacancyBinding(value) {
  if (value === null) return null;
  if (!(!isRecord7(value) || !exactKeys6(value, ["relative_path", "content_sha256", "utf8_bytes", "source_state_id"]) || !validRelativeBasename(value.relative_path) || !VACANCY_BASENAME.test(value.relative_path) || !validHash(value.content_sha256) || !Number.isSafeInteger(value.utf8_bytes) || value.utf8_bytes < 1 || value.utf8_bytes > VACANCY_MAX_BYTES || !validSessionUuid(value.source_state_id)))
    return {
      relative_path: value.relative_path,
      content_sha256: value.content_sha256,
      utf8_bytes: value.utf8_bytes,
      source_state_id: value.source_state_id
    };
}
function parseSelectedOriginal(value) {
  if (value === null) return null;
  if (!(!isRecord7(value) || !exactKeys6(value, ["document_id", "library_root_id", "text_sha256", "format"]) || !validHash(value.document_id) || !validHash(value.library_root_id) || !validHash(value.text_sha256) || !["markdown", "text", "pdf"].includes(value.format)))
    return {
      document_id: value.document_id,
      library_root_id: value.library_root_id,
      text_sha256: value.text_sha256,
      format: value.format
    };
}
function parseResumeArtifact(value) {
  if (value === null) return null;
  if (!(!isRecord7(value) || !exactKeys6(value, [
    "relative_path",
    "artifact_sha256",
    "sidecar_relative_path",
    "sidecar_sha256"
  ]) || !validRelativeBasename(value.relative_path) || !["resume.md", "resume.txt"].includes(value.relative_path) || !validHash(value.artifact_sha256) || value.sidecar_relative_path !== "resume.pi-career.json" || !validHash(value.sidecar_sha256)))
    return {
      relative_path: value.relative_path,
      artifact_sha256: value.artifact_sha256,
      sidecar_relative_path: "resume.pi-career.json",
      sidecar_sha256: value.sidecar_sha256
    };
}
function parseCoverLetterArtifact(value) {
  if (value === null) return null;
  if (!isRecord7(value) || !exactKeys6(value, [
    "relative_path",
    "artifact_sha256",
    "utf8_bytes",
    "format",
    "authority",
    "job_description_sha256",
    "effective_resume_sha256"
  ]) || !validRelativeBasename(value.relative_path) || !COVER_LETTER_BASENAME.test(value.relative_path) || !validHash(value.artifact_sha256) || !Number.isSafeInteger(value.utf8_bytes) || value.utf8_bytes < 1 || !["markdown", "text"].includes(value.format) || value.authority !== "user_authored" || !validHash(value.job_description_sha256) || !validHash(value.effective_resume_sha256)) return;
  let extension = value.relative_path.endsWith(".md") ? "markdown" : "text";
  if (value.format === extension)
    return {
      relative_path: value.relative_path,
      artifact_sha256: value.artifact_sha256,
      utf8_bytes: value.utf8_bytes,
      format: value.format,
      authority: "user_authored",
      job_description_sha256: value.job_description_sha256,
      effective_resume_sha256: value.effective_resume_sha256
    };
}
function parseStateBase(value) {
  if (value.kind !== "application_state_revision" || !validUuid(value.application_id) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence > STATE_MAX_REVISIONS || !validHash(value.parent_sha256) || typeof value.status != "string" || !APPLICATION_STATUSES2.has(value.status) || !validTimestamp(value.updated_at)) return;
  let vacancy = parseVacancyBinding(value.vacancy), selected = parseSelectedOriginal(value.selected_original), artifact = parseResumeArtifact(value.resume_artifact);
  if (!(vacancy === void 0 || selected === void 0 || artifact === void 0))
    return {
      kind: "application_state_revision",
      application_id: value.application_id,
      sequence: value.sequence,
      parent_sha256: value.parent_sha256,
      status: value.status,
      vacancy,
      selected_original: selected,
      resume_artifact: artifact,
      updated_at: value.updated_at
    };
}
function parseState(value) {
  if (!isRecord7(value)) return;
  let v1 = value.schema_version === STATE_SCHEMA_V1, v2 = value.schema_version === STATE_SCHEMA_V2;
  if (!v1 && !v2 || !exactKeys6(value, [
    "schema_version",
    "kind",
    "application_id",
    "sequence",
    "parent_sha256",
    "status",
    "vacancy",
    "selected_original",
    "resume_artifact",
    ...v2 ? ["cover_letter_artifact"] : [],
    "updated_at"
  ])) return;
  let base2 = parseStateBase(value);
  if (base2 === void 0) return;
  if (v1) return { schema_version: STATE_SCHEMA_V1, ...base2 };
  let coverLetter2 = parseCoverLetterArtifact(value.cover_letter_artifact);
  if (coverLetter2 === void 0) return;
  let { updated_at: updatedAt, ...beforeUpdatedAt } = base2;
  return {
    schema_version: STATE_SCHEMA_V2,
    ...beforeUpdatedAt,
    cover_letter_artifact: coverLetter2,
    updated_at: updatedAt
  };
}
function decodeCanonical(bytes, parser) {
  if (bytes.length === 0 || bytes.length > METADATA_MAX_BYTES || bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
    throw workflowError("workspace_drift");
  let text, value;
  try {
    text = new TextDecoder5("utf-8", { fatal: !0 }).decode(bytes), value = parseStrictJson(text);
  } catch {
    throw workflowError("workspace_drift");
  }
  let parsed = parser(value);
  if (parsed === void 0 || !canonicalJson(parsed).equals(bytes)) throw workflowError("workspace_drift");
  return parsed;
}
async function readExactFile(file, parser) {
  try {
    let metadata = await lstat4(file);
    if (!privateMetadata(metadata, 384, "file") || metadata.size <= 0 || metadata.size > METADATA_MAX_BYTES)
      throw workflowError("workspace_drift");
    let bytes = await readFile4(file);
    if (bytes.length !== metadata.size) throw workflowError("workspace_drift");
    return {
      file: { path: file, bytes, metadata, sha256: hashBytes2(bytes) },
      value: decodeCanonical(bytes, parser)
    };
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_drift");
  }
}
async function boundedEntries(directory, maximum) {
  try {
    let entries = [], handle = await opendir2(directory);
    try {
      for await (let entry of handle)
        if (entries.push(entry.name), entries.length > maximum) throw workflowError("workspace_limit_reached");
    } finally {
      await handle.close().catch(() => {
      });
    }
    return entries.sort();
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_drift");
  }
}
async function readContentFile(file, expectedSize, expectedHash) {
  try {
    let metadata = await lstat4(file);
    if (!privateMetadata(metadata, 384, "file") || metadata.size !== expectedSize || metadata.size > VACANCY_MAX_BYTES)
      throw workflowError("workspace_drift");
    let bytes = await readFile4(file);
    if (bytes.length !== metadata.size || hashBytes2(bytes) !== expectedHash) throw workflowError("workspace_drift");
    return { path: file, bytes, metadata, sha256: expectedHash };
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_drift");
  }
}
async function inspectPrivateApplicationDirectory(directoryPath, expectedBasename) {
  try {
    let metadata = await lstat4(directoryPath), canonical = await realpath4(directoryPath);
    if (!privateMetadata(metadata, 448, "directory") || canonical !== directoryPath || expectedBasename !== void 0 && path6.basename(directoryPath) !== expectedBasename)
      throw workflowError("workspace_drift");
    return metadata;
  } catch (error) {
    throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_drift");
  }
}
function assertManifestDirectoryBinding(directoryPath, rootId2, manifest) {
  let basenameMatch = path6.basename(directoryPath).match(APPLICATION_BASENAME);
  if (manifest.root_id !== rootId2 || basenameMatch === null || basenameMatch[3] !== manifest.application_id)
    throw workflowError("workspace_drift");
}
async function inspectApplicationManifest(directoryPath, rootId2, expectedBasename) {
  let metadata = await inspectPrivateApplicationDirectory(directoryPath, expectedBasename), manifestRead = await readExactFile(path6.join(directoryPath, MANIFEST_NAME), parseManifest);
  return assertManifestDirectoryBinding(directoryPath, rootId2, manifestRead.value), {
    directoryPath,
    metadata,
    manifestFile: manifestRead.file,
    manifest: manifestRead.value
  };
}
function orderedStateNames(entries) {
  let states = [];
  for (let entry of entries) {
    if (!entry.startsWith(".pi-career-state-")) continue;
    let match = entry.match(STATE_BASENAME);
    if (match === null) throw workflowError("workspace_drift");
    states.push({ name: entry, sequence: Number(match[1]) });
  }
  if (states.sort((left, right) => left.sequence - right.sequence), states.length === 0 || states.length > STATE_MAX_REVISIONS) throw workflowError("workspace_drift");
  return states;
}
function sameVacancyBinding(left, right) {
  return left === null || right === null ? left === right : left.relative_path === right.relative_path && left.content_sha256 === right.content_sha256 && left.utf8_bytes === right.utf8_bytes && left.source_state_id === right.source_state_id;
}
async function inspectVacancyReference(directoryPath, state, previous, referencedFiles) {
  let binding = state.vacancy;
  if (binding === null) return;
  let existing = referencedFiles.get(binding.relative_path);
  if (sameVacancyBinding(previous?.vacancy ?? null, binding)) {
    if (existing === void 0 || existing.sha256 !== binding.content_sha256 || existing.bytes.length !== binding.utf8_bytes) throw workflowError("workspace_drift");
    return;
  }
  let expectedName = state.sequence === 1 ? "vacancy.md" : `vacancy-${String(state.sequence).padStart(6, "0")}.md`;
  if (binding.relative_path !== expectedName || existing !== void 0) throw workflowError("workspace_drift");
  referencedFiles.set(binding.relative_path, await readContentFile(
    path6.join(directoryPath, binding.relative_path),
    binding.utf8_bytes,
    binding.content_sha256
  ));
}
async function inspectArtifactFile(directoryPath, relativePath, expectedHash, maximumBytes) {
  let file = path6.join(directoryPath, relativePath), metadata = await lstat4(file).catch(() => {
  });
  if (metadata === void 0 || metadata.size <= 0) throw workflowError("workspace_drift");
  if (metadata.size > maximumBytes) throw workflowError("workspace_limit_reached");
  return readContentFile(file, metadata.size, expectedHash);
}
function assertCanonicalArtifactText(file) {
  let text;
  try {
    text = new TextDecoder5("utf-8", { fatal: !0 }).decode(file.bytes);
  } catch {
    throw workflowError("workspace_drift");
  }
  if (file.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])) || /[\u0000\r]/.test(text))
    throw workflowError("workspace_drift");
}
function parseApplicationSidecar(bytes, artifact, selected) {
  decodeCanonical(bytes, (value) => {
    if (!(!isRecord7(value) || !exactKeys6(value, [
      "schema_version",
      "kind",
      "authority",
      "base_document_id",
      "base_text_sha256",
      "artifact_sha256",
      "created_at"
    ]) || value.schema_version !== "pi.career.assisted_variant_meta.v2" || value.kind !== "assisted_variant" || value.authority !== "assisted_non_authoritative" || value.base_document_id !== selected.document_id || value.base_text_sha256 !== selected.text_sha256 || value.artifact_sha256 !== artifact.artifact_sha256 || !validTimestamp(value.created_at)))
      return value;
  });
}
async function inspectArtifactReferences(directoryPath, state, referencedFiles) {
  let artifact = state.resume_artifact;
  if (artifact === null) return;
  if (state.selected_original === null) throw workflowError("workspace_drift");
  let artifactFile = referencedFiles.get(artifact.relative_path);
  if (artifactFile === void 0)
    artifactFile = await inspectArtifactFile(
      directoryPath,
      artifact.relative_path,
      artifact.artifact_sha256,
      VACANCY_MAX_BYTES
    ), assertCanonicalArtifactText(artifactFile), referencedFiles.set(artifact.relative_path, artifactFile);
  else if (artifactFile.sha256 !== artifact.artifact_sha256)
    throw workflowError("workspace_drift");
  let sidecarFile = referencedFiles.get(artifact.sidecar_relative_path);
  if (sidecarFile === void 0)
    sidecarFile = await inspectArtifactFile(
      directoryPath,
      artifact.sidecar_relative_path,
      artifact.sidecar_sha256,
      METADATA_MAX_BYTES
    ), referencedFiles.set(artifact.sidecar_relative_path, sidecarFile);
  else if (sidecarFile.sha256 !== artifact.sidecar_sha256)
    throw workflowError("workspace_drift");
  parseApplicationSidecar(sidecarFile.bytes, artifact, state.selected_original);
}
function coverLetter(state) {
  return state?.schema_version === STATE_SCHEMA_V2 ? state.cover_letter_artifact : null;
}
function sameCoverLetterIdentity(left, right) {
  return left === null || right === null ? left === right : left.relative_path === right.relative_path && left.artifact_sha256 === right.artifact_sha256 && left.utf8_bytes === right.utf8_bytes && left.format === right.format && left.authority === right.authority;
}
function sameCoverLetterBinding(left, right) {
  return sameCoverLetterIdentity(left, right) && (left === null || right === null || left.job_description_sha256 === right.job_description_sha256 && left.effective_resume_sha256 === right.effective_resume_sha256);
}
function effectiveResumeDigest(state) {
  return state.resume_artifact?.artifact_sha256 ?? state.selected_original?.text_sha256;
}
function assertCoverDependencies(state, previous) {
  let binding = coverLetter(state);
  if (binding === null) return;
  let previousBinding = coverLetter(previous);
  if (!sameCoverLetterBinding(previousBinding, binding) && (binding.job_description_sha256 !== state.vacancy?.content_sha256 || binding.effective_resume_sha256 !== effectiveResumeDigest(state)))
    throw workflowError("workspace_drift");
}
async function inspectCoverLetterReference(directoryPath, state, previous, referencedFiles) {
  let binding = coverLetter(state);
  if (binding === null) return;
  if (binding.utf8_bytes > VACANCY_MAX_BYTES) throw workflowError("workspace_limit_reached");
  assertCoverDependencies(state, previous);
  let existing = referencedFiles.get(binding.relative_path);
  if (existing !== void 0) {
    if (existing.sha256 !== binding.artifact_sha256 || existing.bytes.length !== binding.utf8_bytes)
      throw workflowError("workspace_drift");
    return;
  }
  let extension = binding.format === "markdown" ? "md" : "txt", expectedName = [...referencedFiles.keys()].filter((name) => COVER_LETTER_BASENAME.test(name)).length === 0 ? `cover-letter.${extension}` : `cover-letter-${String(state.sequence).padStart(6, "0")}.${extension}`;
  if (binding.relative_path !== expectedName) throw workflowError("workspace_drift");
  let file = await inspectArtifactFile(
    directoryPath,
    binding.relative_path,
    binding.artifact_sha256,
    VACANCY_MAX_BYTES
  );
  if (file.bytes.length !== binding.utf8_bytes) throw workflowError("workspace_drift");
  assertCanonicalArtifactText(file), referencedFiles.set(binding.relative_path, file);
}
function sameSelectedOriginal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function sameResumeArtifact(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function assertVersionAndSourceTransition(state, previous) {
  if (state.resume_artifact !== null && state.selected_original === null) throw workflowError("workspace_drift");
  if (previous === void 0) {
    if (state.schema_version === STATE_SCHEMA_V2 && state.cover_letter_artifact !== null)
      throw workflowError("workspace_drift");
    return;
  }
  if (previous.schema_version === STATE_SCHEMA_V2 && state.schema_version === STATE_SCHEMA_V1)
    throw workflowError("workspace_drift");
  if (previous.resume_artifact !== null && !sameSelectedOriginal(previous.selected_original, state.selected_original) && state.resume_artifact !== null) throw workflowError("workspace_drift");
  if (previous.schema_version === STATE_SCHEMA_V1 && state.schema_version === STATE_SCHEMA_V2 && (state.status !== previous.status || !sameVacancyBinding(state.vacancy, previous.vacancy) || !sameSelectedOriginal(state.selected_original, previous.selected_original) || !sameResumeArtifact(state.resume_artifact, previous.resume_artifact)))
    throw workflowError("workspace_drift");
}
async function inspectStateChain(application, stateNames) {
  let revisions = [], referencedFiles = /* @__PURE__ */ new Map(), parentHash = application.manifestFile.sha256, priorTimestamp = application.manifest.workspace_created_at;
  for (let index = 0; index < stateNames.length; index += 1) {
    let expectedSequence = index + 1, stateName2 = stateNames[index];
    if (stateName2.sequence !== expectedSequence) throw workflowError("workspace_drift");
    let read = await readExactFile(path6.join(application.directoryPath, stateName2.name), parseState), previous = revisions.at(-1)?.state, timestampInvalid = expectedSequence === 1 ? Date.parse(read.value.updated_at) < Date.parse(priorTimestamp) : Date.parse(read.value.updated_at) <= Date.parse(priorTimestamp);
    if (read.value.sequence !== expectedSequence || read.value.application_id !== application.manifest.application_id || read.value.parent_sha256 !== parentHash || timestampInvalid) throw workflowError("workspace_drift");
    assertVersionAndSourceTransition(read.value, previous), await inspectVacancyReference(application.directoryPath, read.value, previous, referencedFiles), await inspectArtifactReferences(application.directoryPath, read.value, referencedFiles), await inspectCoverLetterReference(application.directoryPath, read.value, previous, referencedFiles), revisions.push({ file: read.file, state: read.value }), parentHash = read.file.sha256, priorTimestamp = read.value.updated_at;
  }
  return { revisions, referencedFiles };
}
function assertNoOrphanManagedFiles(entries, referencedFiles) {
  for (let entry of entries) {
    if ((VACANCY_BASENAME.test(entry) || COVER_LETTER_BASENAME.test(entry)) && !referencedFiles.has(entry))
      throw workflowError("workspace_drift");
    if (["resume.md", "resume.txt", "resume.pi-career.json"].includes(entry) && !referencedFiles.has(entry))
      throw workflowError("workspace_drift");
  }
}
async function inspectApplicationDirectory(directoryPath, rootId2, expectedBasename, identity2, identityFile) {
  let application = await inspectApplicationManifest(directoryPath, rootId2, expectedBasename), entries = await boundedEntries(directoryPath, APPLICATION_MAX_ENTRIES);
  if (entries.some((entry) => entry.startsWith(".pi-career-") && !STATE_BASENAME.test(entry) && !(identity2 !== void 0 && entry === ".pi-career-identity.json")))
    throw workflowError("workspace_drift");
  let { revisions, referencedFiles } = await inspectStateChain(application, orderedStateNames(entries));
  assertNoOrphanManagedFiles(entries, referencedFiles);
  let managedFiles = [
    application.manifestFile,
    ...identityFile === void 0 ? [] : [identityFile],
    ...revisions.map((revision) => revision.file),
    ...referencedFiles.values()
  ], managedBytes = managedFiles.reduce((total, file) => total + file.bytes.length, 0) + (identity2 !== void 0 && identityFile === void 0 ? canonicalJson(identity2).length : 0);
  if (managedBytes > APPLICATION_MAX_MANAGED_BYTES) throw workflowError("workspace_limit_reached");
  let head = revisions.at(-1);
  return {
    ...application,
    ...identity2 === void 0 ? {} : { identity: identity2 },
    ...identityFile === void 0 ? {} : { identityFile },
    revisions,
    head: head.state,
    headFile: head.file,
    entries,
    managedFiles,
    managedBytes
  };
}
async function inspectRootEntries(rootPath, ownedLock) {
  let allowedLockName = ownedLock === void 0 ? void 0 : path6.basename(ownedLock), entries = await boundedEntries(rootPath, ROOT_MAX_ENTRIES + (allowedLockName === void 0 ? 0 : 1));
  if (entries.length > ROOT_MAX_ENTRIES && (allowedLockName === void 0 || !entries.includes(allowedLockName))) throw workflowError("workspace_limit_reached");
  if (entries.includes(path6.basename(workspaceLockPath(rootPath))) && ownedLock === void 0)
    throw workflowError("workspace_busy");
  return { entries, ...allowedLockName === void 0 ? {} : { allowedLockName } };
}
async function inspectBoundRootMarker(rootPath, expectedRootId) {
  let markerRead = await readExactFile(path6.join(rootPath, ROOT_MARKER_NAME), parseMarker);
  if (expectedRootId !== void 0 && markerRead.value.root_id !== expectedRootId)
    throw workflowError("workspace_identity_conflict");
  return { markerFile: markerRead.file, marker: markerRead.value };
}
async function inspectRootEnvelope(rootPath, options) {
  let metadata = await validateApplicationRootPath(rootPath), entries = await inspectRootEntries(rootPath, options.ownedLock), marker = await inspectBoundRootMarker(rootPath, options.expectedRootId);
  return { metadata, ...entries, ...marker };
}
async function inspectInactiveApplications(rootPath, rootId2, entries, allowedLockName) {
  let applications = [], applicationIds = /* @__PURE__ */ new Set();
  for (let entry of entries) {
    if (entry === ROOT_MARKER_NAME || entry === allowedLockName) continue;
    if (!APPLICATION_BASENAME.test(entry)) throw workflowError("workspace_drift");
    let application = await inspectApplicationManifest(path6.join(rootPath, entry), rootId2);
    if (applicationIds.has(application.manifest.application_id)) throw workflowError("workspace_identity_conflict");
    applicationIds.add(application.manifest.application_id), applications.push(application);
  }
  return applications;
}
async function inspectCurrentApplication(applications, target, rootId2) {
  if (target === void 0) return;
  let matching = applications.find((application) => application.manifest.application_id === target.applicationId);
  if (matching === void 0) return;
  if (matching.directoryPath !== target.directoryPath || matching.manifest.application_created_at !== target.applicationCreatedAt)
    throw workflowError("workspace_identity_conflict");
  let identity2 = await readApplicationIdentity(matching.directoryPath, matching.manifest);
  if (identity2 !== void 0 && (identity2.company_label !== target.companyLabel || identity2.role_label !== target.roleLabel))
    throw workflowError("workspace_identity_conflict");
  return inspectApplicationDirectory(matching.directoryPath, rootId2, path6.basename(target.directoryPath), identity2);
}
async function inspectRoot(rootPath, options = {}) {
  let envelope = await inspectRootEnvelope(rootPath, options), applications = await inspectInactiveApplications(
    rootPath,
    envelope.marker.root_id,
    envelope.entries,
    envelope.allowedLockName
  ), currentApplication = await inspectCurrentApplication(
    applications,
    options.currentApplication,
    envelope.marker.root_id
  );
  return {
    metadata: envelope.metadata,
    markerFile: envelope.markerFile,
    marker: envelope.marker,
    entries: envelope.entries,
    applications,
    ...currentApplication === void 0 ? {} : { currentApplication }
  };
}
var CATALOG_SCHEMA = "pi.career.application_catalog.v1", APPLICATION_TEMP = /^\.pi-career-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(?:manifest|identity|vacancy|transition|state)\.tmp$/;
function emptyCatalogProjection() {
  return {
    schema_version: CATALOG_SCHEMA,
    applications: [],
    reconciliation: { interrupted: 0, drifted: 0, duplicate_id: 0, unsupported: 0, over_limit: 0 }
  };
}
async function hasUnsupportedSchema(file, kind, schemaPrefix, supportedSchema, applicationId, binding = {}) {
  try {
    let metadata = await lstat4(file);
    if (!privateMetadata(metadata, 384, "file") || metadata.size <= 0 || metadata.size > METADATA_MAX_BYTES) return !1;
    let bytes = await readFile4(file);
    if (bytes.length !== metadata.size) return !1;
    let value = parseStrictJson(new TextDecoder5("utf-8", { fatal: !0 }).decode(bytes)), supportedSchemas = typeof supportedSchema == "string" ? [supportedSchema] : supportedSchema;
    return isRecord7(value) && value.kind === kind && typeof value.schema_version == "string" && value.schema_version.startsWith(schemaPrefix) && !supportedSchemas.includes(value.schema_version) && value.application_id === applicationId && (binding.createdAt === void 0 || value.created_at === binding.createdAt) && (binding.sequence === void 0 || value.sequence === binding.sequence) && canonicalJson(value).equals(bytes);
  } catch {
    return !1;
  }
}
function recognizableInterruptedEntries(entries, hasManifest) {
  return entries.every((entry) => APPLICATION_TEMP.test(entry) || hasManifest && (entry === MANIFEST_NAME || entry === IDENTITY_NAME || VACANCY_BASENAME.test(entry)));
}
function reconciliationForError(error) {
  return error instanceof CareerWorkflowError && error.code === "workspace_limit_reached" ? "over_limit" : "drifted";
}
async function collectCatalogCandidate(rootPath, expectedRootId, name) {
  let directoryPath = path6.join(rootPath, name), candidate = { name, directoryPath };
  if (!APPLICATION_BASENAME.test(name)) return { ...candidate, classification: "drifted" };
  try {
    candidate.metadata = await inspectPrivateApplicationDirectory(directoryPath, name);
  } catch {
    return { ...candidate, classification: "drifted" };
  }
  try {
    candidate.application = await inspectApplicationManifest(directoryPath, expectedRootId, name);
  } catch {
    try {
      candidate.entries = await boundedEntries(directoryPath, APPLICATION_MAX_ENTRIES), candidate.classification = recognizableInterruptedEntries(candidate.entries, !1) ? "interrupted" : "drifted";
    } catch (error) {
      candidate.classification = reconciliationForError(error);
    }
  }
  return candidate;
}
function markDuplicateClaims(candidates) {
  let claimsById = /* @__PURE__ */ new Map();
  for (let candidate of candidates) {
    if (candidate.application === void 0) continue;
    let claims = claimsById.get(candidate.application.manifest.application_id) ?? [];
    claims.push(candidate), claimsById.set(candidate.application.manifest.application_id, claims);
  }
  for (let claims of claimsById.values())
    if (claims.length > 1) for (let candidate of claims) candidate.classification = "duplicate_id";
}
async function candidateHasOversizedState(candidate, stateNames) {
  for (let stateNameValue of stateNames)
    try {
      let metadata = await lstat4(path6.join(candidate.directoryPath, stateNameValue));
      if (metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > METADATA_MAX_BYTES) return !0;
    } catch {
      return !1;
    }
  return !1;
}
async function candidateHasUnsupportedSchema(candidate, entries, stateNames) {
  let manifest = candidate.application.manifest;
  if (entries.includes(IDENTITY_NAME) && await hasUnsupportedSchema(
    path6.join(candidate.directoryPath, IDENTITY_NAME),
    "application_identity",
    "pi.career.application_identity.v",
    IDENTITY_SCHEMA,
    manifest.application_id,
    { createdAt: manifest.application_created_at }
  )) return !0;
  for (let stateNameValue of stateNames)
    if (await hasUnsupportedSchema(
      path6.join(candidate.directoryPath, stateNameValue),
      "application_state_revision",
      "pi.career.application_state.v",
      [STATE_SCHEMA_V1, STATE_SCHEMA_V2],
      manifest.application_id,
      { sequence: Number(stateNameValue.match(STATE_BASENAME)[1]) }
    )) return !0;
  return !1;
}
async function classifyIncompleteCandidate(candidate, entries) {
  try {
    return entries.includes(IDENTITY_NAME) && await readApplicationIdentityFile(candidate.directoryPath, candidate.application.manifest), recognizableInterruptedEntries(entries, !0) ? "interrupted" : "drifted";
  } catch {
    return "drifted";
  }
}
async function classifyCatalogCandidate(candidate, expectedRootId) {
  if (candidate.classification !== void 0) return { classification: candidate.classification };
  let entries;
  try {
    entries = await boundedEntries(candidate.directoryPath, APPLICATION_MAX_ENTRIES);
  } catch (error) {
    return { classification: reconciliationForError(error) };
  }
  let stateNames = entries.filter((entry) => STATE_BASENAME.test(entry));
  if (stateNames.length > STATE_MAX_REVISIONS || await candidateHasOversizedState(candidate, stateNames))
    return { classification: "over_limit" };
  if (await candidateHasUnsupportedSchema(candidate, entries, stateNames)) return { classification: "unsupported" };
  if (!entries.includes(stateName(1)))
    return { classification: await classifyIncompleteCandidate(candidate, entries) };
  try {
    let identityRead = await readApplicationIdentityFile(candidate.directoryPath, candidate.application.manifest), inspected = await inspectApplicationDirectory(
      candidate.directoryPath,
      expectedRootId,
      candidate.name,
      identityRead?.identity,
      identityRead?.file
    ), basename = candidate.name.match(APPLICATION_BASENAME);
    return basename === null ? { classification: "drifted" } : {
      record: {
        application_id: inspected.manifest.application_id,
        classification: identityRead === void 0 ? "legacy" : "valid",
        ...identityRead === void 0 ? {
          legacy_identity: {
            company_slug: basename[1],
            role_slug: basename[2],
            authority: "directory_slug_non_authoritative"
          }
        } : { identity: identityRead.identity },
        status: inspected.head.status,
        updated_at: inspected.head.updated_at
      },
      inspected
    };
  } catch (error) {
    return { classification: reconciliationForError(error) };
  }
}
async function deriveApplicationCatalog(rootPath, expectedRootId) {
  let root = await inspectRootEnvelope(rootPath, { expectedRootId }), candidates = [];
  for (let name of root.entries)
    name !== ROOT_MARKER_NAME && candidates.push(await collectCatalogCandidate(rootPath, expectedRootId, name));
  markDuplicateClaims(candidates);
  let projection = emptyCatalogProjection(), files = [], directories = [], validatedApplications = [];
  for (let candidate of candidates) {
    let result = await classifyCatalogCandidate(candidate, expectedRootId);
    "classification" in result ? projection.reconciliation[result.classification] += 1 : (projection.applications.push(result.record), validatedApplications.push(result), directories.push(result.inspected.metadata), files.push(...result.inspected.managedFiles));
  }
  return projection.applications.sort((left, right) => right.updated_at.localeCompare(left.updated_at) || left.application_id.localeCompare(right.application_id)), {
    root: {
      metadata: root.metadata,
      markerFile: root.markerFile,
      marker: root.marker,
      entries: root.entries,
      applications: []
    },
    files,
    directories,
    projection,
    applicationClaims: candidates.flatMap((candidate) => candidate.application === void 0 ? [] : [candidate.application.manifest.application_id]),
    validatedApplications
  };
}
function statsFingerprint(metadata) {
  return [metadata.dev, metadata.ino, metadata.mode, metadata.size, metadata.mtimeMs, metadata.ctimeMs].join(":");
}
function sameCatalogEvidence(left, right) {
  if (!sameInode(left.root.metadata, right.root.metadata) || !sameInode(left.root.markerFile.metadata, right.root.markerFile.metadata) || left.root.markerFile.sha256 !== right.root.markerFile.sha256 || JSON.stringify(left.root.entries) !== JSON.stringify(right.root.entries) || JSON.stringify(left.projection) !== JSON.stringify(right.projection)) return !1;
  let directoryFingerprints = (evidence) => evidence.directories.map(statsFingerprint).sort(), fileFingerprints = (evidence) => evidence.files.map((file) => `${file.path}:${file.sha256}:${statsFingerprint(file.metadata)}`).sort();
  return JSON.stringify(directoryFingerprints(left)) === JSON.stringify(directoryFingerprints(right)) && JSON.stringify(fileFingerprints(left)) === JSON.stringify(fileFingerprints(right));
}
async function listCatalogApplications(agentDir) {
  try {
    let snapshot = await loadConfigSnapshot(agentDir), configured = snapshot.config.application_workspace;
    if (configured === null) return [];
    await assertApplicationWorkspaceDisjoint(snapshot.config);
    let initial = await deriveApplicationCatalog(configured.root_path, configured.root_id), current = await deriveApplicationCatalog(configured.root_path, configured.root_id);
    if (!sameCatalogEvidence(initial, current)) return [];
    let items = [];
    for (let { record, inspected } of initial.validatedApplications)
      record.classification !== "valid" || record.identity === void 0 || items.push({
        option: `${record.identity.company_label} — ${record.identity.role_label} — ${record.status}`,
        pointer: {
          applicationId: inspected.manifest.application_id,
          rootId: inspected.manifest.root_id,
          rootCreatedAt: initial.root.marker.created_at,
          applicationCreatedAt: inspected.manifest.application_created_at,
          workspaceCreatedAt: inspected.manifest.workspace_created_at
        }
      });
    let counts = /* @__PURE__ */ new Map();
    for (let item2 of items) counts.set(item2.option, (counts.get(item2.option) ?? 0) + 1);
    return items.map((item2) => counts.get(item2.option) === 1 ? item2 : {
      ...item2,
      option: `${item2.option} — ${item2.pointer.applicationId}`
    });
  } catch {
    return [];
  }
}
async function readApplicationCatalog(rootPath, expectedRootId, betweenSnapshots) {
  let initial = await deriveApplicationCatalog(rootPath, expectedRootId);
  await betweenSnapshots?.();
  let current;
  try {
    current = await deriveApplicationCatalog(rootPath, expectedRootId);
  } catch {
    throw workflowError("workspace_drift");
  }
  if (!sameCatalogEvidence(initial, current)) throw workflowError("workspace_drift");
  return initial.projection;
}
function attachmentValidationError(error) {
  throw error instanceof CareerWorkflowError && error.code === "workspace_identity_conflict" ? error : workflowError("attachment_unavailable");
}
function expectedIdentityBasename(identity2) {
  return `${slug(identity2.company_label, "company")}--${slug(identity2.role_label, "role")}--${identity2.application_id}`;
}
function exactValidatedMatch(evidence, attachment) {
  let claims = evidence.applicationClaims.filter((id) => id === attachment.application_id);
  if (claims.length > 1) throw workflowError("workspace_identity_conflict");
  if (claims.length === 0) throw workflowError("attachment_unavailable");
  let matches = evidence.validatedApplications.filter(
    ({ record }) => record.application_id === attachment.application_id
  ), match = matches.length === 1 ? matches[0] : void 0, identity2 = match?.record.identity;
  if (match === void 0 || match.record.classification !== "valid" || identity2 === void 0)
    throw workflowError("attachment_unavailable");
  return { ...match, identity: identity2 };
}
function assertExactAttachmentBinding(evidence, attachment, match) {
  let { inspected, identity: identity2 } = match;
  if (evidence.root.marker.created_at !== attachment.root_created_at || inspected.manifest.root_id !== attachment.root_id || inspected.manifest.application_created_at !== attachment.application_created_at || inspected.manifest.workspace_created_at !== attachment.workspace_created_at || identity2.created_at !== attachment.application_created_at || path6.basename(inspected.directoryPath) !== expectedIdentityBasename(identity2))
    throw workflowError("workspace_identity_conflict");
}
async function inspectAttachedApplication(agentDir, attachment) {
  try {
    let snapshot = await loadConfigSnapshot(agentDir), configured = snapshot.config.application_workspace;
    if (configured === null) throw workflowError("attachment_unavailable");
    if (configured.root_id !== attachment.root_id) throw workflowError("workspace_identity_conflict");
    await assertApplicationWorkspaceDisjoint(snapshot.config);
    let initial = await deriveApplicationCatalog(configured.root_path, configured.root_id), current = await deriveApplicationCatalog(configured.root_path, configured.root_id);
    if (!sameCatalogEvidence(initial, current)) throw workflowError("attachment_unavailable");
    await assertConfigSnapshotCurrent(snapshot);
    let match = exactValidatedMatch(initial, attachment);
    return assertExactAttachmentBinding(initial, attachment, match), {
      snapshot,
      evidence: initial,
      inspected: match.inspected,
      identity: match.identity
    };
  } catch (error) {
    return attachmentValidationError(error);
  }
}
function managedFile(application, relativePath) {
  return application.managedFiles.find((file) => path6.basename(file.path) === relativePath);
}
function decodeManagedUtf8(file) {
  let text;
  try {
    text = new TextDecoder5("utf-8", { fatal: !0 }).decode(file.bytes);
  } catch {
    throw workflowError("workspace_drift");
  }
  if (file.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])) || /[\u0000\r]/.test(text) || hasUnpairedSurrogate(text) || !isWithinCoreCharacterLimit(text))
    throw workflowError("workspace_drift");
  return text;
}
function vacancyLabelFromText(text) {
  return (text.split(`
`).find((line) => line.trim().length > 0)?.trim() || "Current vacancy").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);
}
function vacancyFromBinding(application) {
  let binding = application.head.vacancy;
  if (binding === null) return;
  let file = managedFile(application, binding.relative_path);
  if (file === void 0 || file.sha256 !== binding.content_sha256 || file.bytes.length !== binding.utf8_bytes)
    throw workflowError("workspace_drift");
  let text = decodeManagedUtf8(file);
  if (sha256(text) !== binding.content_sha256) throw workflowError("workspace_drift");
  return {
    schema_version: WORKFLOW_STATE_SCHEMA,
    kind: "vacancy",
    state_id: binding.source_state_id,
    created_at: application.head.updated_at,
    application_id: application.head.application_id,
    vacancy_label: vacancyLabelFromText(text),
    vacancy_text: text,
    vacancy_text_sha256: binding.content_sha256,
    source: "paste"
  };
}
function tailoredResumeRecord(application, original) {
  let artifact = application.head.resume_artifact;
  if (artifact === null) throw workflowError("workspace_drift");
  let file = managedFile(application, artifact.relative_path);
  if (file === void 0 || file.sha256 !== artifact.artifact_sha256) throw workflowError("workspace_drift");
  let text = decodeManagedUtf8(file), format = artifact.relative_path.endsWith(".md") ? "markdown" : "text";
  return {
    id: artifact.artifact_sha256,
    root_id: original.root_id,
    path: artifact.relative_path,
    relative_path: artifact.relative_path,
    label: original.label,
    kind: "assisted_variant",
    format,
    modified_at: application.head.updated_at,
    size_bytes: file.bytes.length,
    text,
    text_sha256: sha256(text)
  };
}
async function validateApplicationAttachment(agentDir, attachment) {
  let loaded = await inspectAttachedApplication(agentDir, attachment);
  return {
    attachment_id: attachment.attachment_id,
    application_id: attachment.application_id,
    root_id: attachment.root_id,
    company_label: loaded.identity.company_label,
    role_label: loaded.identity.role_label,
    status: loaded.inspected.head.status,
    updated_at: loaded.inspected.head.updated_at
  };
}
async function loadAttachedApplicationSources(agentDir, attachment) {
  let loaded = await inspectAttachedApplication(agentDir, attachment), application = loaded.inspected;
  if (application.identity === void 0) throw workflowError("attachment_unavailable");
  let scan = await scanLibrary(loaded.snapshot.config), selected = application.head.selected_original, selectedOriginal;
  if (selected !== null) {
    let root = scan.roots.find((item2) => item2.root_id === selected.library_root_id), matches = eligibleOriginals(scan).filter((record) => record.id === selected.document_id && record.root_id === selected.library_root_id && record.text_sha256 === selected.text_sha256 && record.format === selected.format);
    if (scan.total_capped || root === void 0 || root.capped || root.stale || matches.length !== 1)
      throw workflowError("workspace_drift");
    selectedOriginal = matches[0];
  }
  let readiness = deriveApplicationReadiness({
    vacancy: application.head.vacancy === null ? null : { content_sha256: application.head.vacancy.content_sha256 },
    selected_original: selected,
    resume_artifact: application.head.resume_artifact === null ? null : { artifact_sha256: application.head.resume_artifact.artifact_sha256 },
    cover_letter_artifact: application.head.schema_version === STATE_SCHEMA_V2 ? application.head.cover_letter_artifact : null
  }, {
    vacancy: "valid",
    resume_artifact: "valid",
    cover_letter_artifact: "valid",
    library_scan: scan
  });
  if (application.head.resume_artifact !== null && readiness.effective_resume !== "tailored")
    throw workflowError("workspace_drift");
  if (selected !== null && readiness.effective_resume === null) throw workflowError("workspace_drift");
  let effective = readiness.effective_resume === "tailored" && selectedOriginal !== void 0 ? tailoredResumeRecord(application, selectedOriginal) : selectedOriginal, vacancy = vacancyFromBinding(application);
  return {
    application_id: application.manifest.application_id,
    company_label: loaded.identity.company_label,
    role_label: loaded.identity.role_label,
    status: application.head.status,
    readiness,
    can_select_original: application.head.resume_artifact === null,
    ...vacancy === void 0 ? {} : { vacancy },
    ...selectedOriginal === void 0 ? {} : { selected_original: selectedOriginal },
    ...effective === void 0 ? {} : { effective_resume: effective }
  };
}
async function attachedApplicationSourcesForSession(agentDir, branch, allEntries = branch) {
  let records = replayApplicationSessionRecords(branch, allEntries);
  if (!(records.integrity !== "valid" || records.attachment === void 0))
    return loadAttachedApplicationSources(agentDir, records.attachment);
}
function slug(value, fallback) {
  return value.normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "").replace(/[A-Z]/g, (letter) => letter.toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "") || fallback;
}
function applicationDirectoryBasename(identity2) {
  return `${slug(identity2.identity.company_label, "company")}--${slug(identity2.identity.role_label, "role")}--${identity2.identity.application_id}`;
}
function sessionIdentity(ctx) {
  return workspaceApplicationIdentity(ctx.sessionManager.getBranch());
}
function expectedApplicationPath(rootPath, identity2) {
  let basename = applicationDirectoryBasename(identity2), result = path6.join(rootPath, basename);
  if (Buffer.byteLength(basename, "utf8") > BASENAME_MAX_BYTES || Buffer.byteLength(result, "utf8") > PATH_MAX_BYTES3) throw workflowError("workspace_root_invalid");
  return result;
}
function currentApplicationTarget(rootPath, identity2) {
  return identity2 === void 0 ? void 0 : {
    directoryPath: expectedApplicationPath(rootPath, identity2),
    applicationId: identity2.identity.application_id,
    applicationCreatedAt: identity2.identity.created_at,
    companyLabel: identity2.identity.company_label,
    roleLabel: identity2.identity.role_label
  };
}
async function attachmentFor(agentDir, identity2) {
  let snapshot;
  try {
    snapshot = await loadConfigSnapshot(agentDir);
  } catch {
    throw workflowError("workspace_config_invalid");
  }
  if (snapshot.config.application_workspace === null)
    return { snapshot, root: void 0 };
  await assertApplicationWorkspaceDisjoint(snapshot.config);
  let configured = snapshot.config.application_workspace, target = currentApplicationTarget(configured.root_path, identity2), root = await inspectRoot(configured.root_path, {
    expectedRootId: configured.root_id,
    ...target === void 0 ? {} : { currentApplication: target }
  });
  if (identity2 === void 0 || target === void 0) return { snapshot, root };
  let application = root.currentApplication;
  if (application !== void 0 && application.manifest.application_created_at !== identity2.identity.created_at)
    throw workflowError("workspace_identity_conflict");
  return {
    snapshot,
    root,
    ...application === void 0 ? {} : { application },
    expectedDirectoryPath: target.directoryPath
  };
}
function applicationIdentityBytes(identity2, manifest) {
  let decoded = decodeApplicationIdentity(canonicalJson({
    schema_version: IDENTITY_SCHEMA,
    kind: "application_identity",
    application_id: identity2.application_id,
    company_label: identity2.company_label,
    role_label: identity2.role_label,
    created_at: identity2.created_at
  }), manifest);
  if (decoded === void 0) throw workflowError("workspace_identity_conflict");
  return canonicalJson(decoded);
}
function vacancyBytes(vacancy, applicationId) {
  if (vacancy === void 0) return;
  if (vacancy.application_id !== applicationId || vacancy.vacancy_text.length === 0 || vacancy.vacancy_text.includes("\r") || hasUnpairedSurrogate(vacancy.vacancy_text) || !isWithinCoreCharacterLimit(vacancy.vacancy_text)) throw workflowError("workspace_identity_conflict");
  let bytes = Buffer.from(vacancy.vacancy_text, "utf8");
  if (bytes.length === 0 || bytes.length > VACANCY_MAX_BYTES || hashBytes2(bytes) !== vacancy.vacancy_text_sha256)
    throw workflowError("workspace_drift");
  return bytes;
}
function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      let next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) return !0;
      index += 1;
    } else if (code >= 56320 && code <= 57343) return !0;
  }
  return !1;
}
function createPreview(file, bytes) {
  return {
    path: file,
    object_type: "file",
    mode: "0600",
    utf8_bytes: bytes.length,
    sha256: hashBytes2(bytes),
    text: bytes.toString("utf8")
  };
}
function createDirectoryPreview(directory) {
  return { path: directory, object_type: "directory", mode: "0700", utf8_bytes: null, sha256: null, text: null };
}
function bytePreview(bytes) {
  return { utf8_bytes: bytes.length, sha256: hashBytes2(bytes), text: bytes.toString("utf8") };
}
function configPreview(snapshot, nextBytes) {
  return snapshot.bytes === null ? { creates: [createPreview(snapshot.filePath, nextBytes)], replaces: [] } : {
    creates: [],
    replaces: [{
      path: snapshot.filePath,
      object_type: "file",
      mode: "0600",
      expected: bytePreview(snapshot.bytes),
      replacement: bytePreview(nextBytes)
    }]
  };
}
function buildPlan(options, ctx, operation, applicationId, identity2, expectedConfigSha, expectedStateSha, creates, replaces, temporaryPaths, warnings2, mutationId, createdAt) {
  let id = (mutationId ?? options.uuid()).toLowerCase(), timestamp = createdAt ?? options.now().toISOString();
  if (!validUuid(id) || !validTimestamp(timestamp)) throw workflowError("workspace_verification_failed");
  let envelope = {
    schema_version: PREVIEW_SCHEMA,
    mutation_id: id,
    mutation_class: "workspace_file",
    operation,
    application_id: applicationId,
    expected_config_sha256: expectedConfigSha,
    expected_state_sha256: expectedStateSha,
    creates,
    replaces,
    deletes: [],
    temporary_paths: temporaryPaths,
    warnings: warnings2
  }, previewText2 = canonicalJson(envelope).toString("utf8");
  if (Buffer.byteLength(previewText2, "utf8") > PREVIEW_MAX_BYTES) throw workflowError("workspace_limit_reached");
  return {
    envelope,
    previewText: previewText2,
    sessionId: ctx.sessionManager.getSessionId(),
    identityStateId: identity2?.identity.state_id ?? null,
    currentStateId: identity2?.current.state_id ?? null,
    vacancyStateId: operation === "initialize_application" || operation === "record_state" ? identity2?.vacancy?.state_id ?? null : null,
    vacancySha256: operation === "initialize_application" || operation === "record_state" ? identity2?.vacancy?.vacancy_text_sha256 ?? null : null,
    createdAt: timestamp
  };
}
function assertPlanContext(plan, ctx) {
  if (ctx.sessionManager.getSessionId() !== plan.sessionId || !ctx.isIdle()) throw workflowError("workspace_unavailable");
}
function assertSessionPlan(plan, ctx) {
  assertPlanContext(plan, ctx);
  let identity2 = sessionIdentity(ctx);
  if ((identity2?.identity.state_id ?? null) !== plan.identityStateId || (identity2?.current.state_id ?? null) !== plan.currentStateId || (plan.envelope.operation === "initialize_application" || plan.envelope.operation === "record_state") && ((identity2?.vacancy?.state_id ?? null) !== plan.vacancyStateId || (identity2?.vacancy?.vacancy_text_sha256 ?? null) !== plan.vacancySha256))
    throw workflowError("workspace_identity_conflict");
  return identity2;
}
async function approve(plan, ctx) {
  ctx.mode === "rpc" && ctx.ui.notify(
    "RPC retention warning: the RPC client may retain the complete private workspace preview and UI responses independently of Pi session settings.",
    "warning"
  );
  let reviewed = await ctx.ui.editor("Review exact application workspace mutation", plan.previewText);
  if (reviewed === void 0) return !1;
  if (reviewed !== plan.previewText) throw workflowError("workspace_preview_changed");
  let finalBasenames = [
    ...plan.envelope.creates.map((item2) => path6.basename(item2.path)),
    ...plan.envelope.replaces.map((item2) => path6.basename(item2.path))
  ], objectDetails = [
    ...plan.envelope.creates.map((item2) => item2.object_type === "directory" ? `${path6.basename(item2.path)}: directory mode ${item2.mode}` : `${path6.basename(item2.path)}: ${item2.utf8_bytes} bytes, ${item2.sha256}`),
    ...plan.envelope.replaces.map((item2) => `${path6.basename(item2.path)}: ${item2.replacement.utf8_bytes} bytes, ${item2.replacement.sha256}`)
  ];
  return await ctx.ui.confirm(
    "Apply application workspace mutation?",
    [
      `Mutation ID: ${plan.envelope.mutation_id}`,
      `Class: ${plan.envelope.mutation_class}`,
      `Operation: ${plan.envelope.operation}`,
      ...plan.envelope.application_id === null ? [] : [`Application: ${plan.envelope.application_id}`],
      `Creates: ${plan.envelope.creates.length}; replaces: ${plan.envelope.replaces.length}; deletes: 0`,
      `Final basenames: ${finalBasenames.join(", ") || "none"}`,
      ...objectDetails,
      "Workspace-file authorization applies only to this exact mutation and is separate from session, provider, artifact-file, and deletion consent.",
      "The approved exact files persist until you remove them. Existing workspace files are never overwritten."
    ].join(`
`),
    { timeout: CONFIRM_TIMEOUT_MS }
  ) === !0 && ctx.signal?.aborted !== !0;
}
async function syncDirectory2(directory) {
  let handle;
  try {
    handle = await open2(directory, constants2.O_RDONLY), await handle.sync(), await handle.close();
  } catch {
    throw handle !== void 0 && await handle.close().catch(() => {
    }), workflowError("workspace_status_unknown");
  }
}
async function requireAbsent(target) {
  try {
    throw await lstat4(target), workflowError("workspace_collision");
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    if (error?.code !== "ENOENT") throw workflowError("workspace_drift");
  }
}
async function publishFile(finalPath, temporaryPath, bytes) {
  let handle, tempMetadata, linkedFinal = !1;
  try {
    if (handle = await open2(temporaryPath, constants2.O_CREAT | constants2.O_EXCL | constants2.O_WRONLY | constants2.O_NOFOLLOW, 384), await handle.writeFile(bytes), await handle.sync(), await handle.chmod(384), tempMetadata = await handle.stat(), await handle.close(), handle = void 0, !privateMetadata(tempMetadata, 384, "file") || tempMetadata.size !== bytes.length || !(await readFile4(temporaryPath)).equals(bytes)) throw workflowError("workspace_verification_failed");
    await link2(temporaryPath, finalPath), linkedFinal = !0;
    let linked = await lstat4(finalPath);
    if (linked.dev !== tempMetadata.dev || linked.ino !== tempMetadata.ino) throw workflowError("workspace_status_unknown");
    await unlink2(temporaryPath), await syncDirectory2(path6.dirname(finalPath));
    let finalMetadata = await lstat4(finalPath);
    if (!privateMetadata(finalMetadata, 384, "file") || finalMetadata.dev !== tempMetadata.dev || finalMetadata.ino !== tempMetadata.ino || finalMetadata.size !== bytes.length || !(await readFile4(finalPath)).equals(bytes)) throw workflowError("workspace_status_unknown");
    return { finalPath, metadata: finalMetadata, bytes };
  } catch (error) {
    if (handle !== void 0 && await handle.close().catch(() => {
    }), linkedFinal && tempMetadata !== void 0) {
      try {
        let temporary = await lstat4(temporaryPath).catch(() => {
        });
        temporary !== void 0 && sameInode(temporary, tempMetadata) && await unlink2(temporaryPath), await syncDirectory2(path6.dirname(finalPath));
        let finalMetadata = await lstat4(finalPath);
        if (privateMetadata(finalMetadata, 384, "file") && sameInode(finalMetadata, tempMetadata) && finalMetadata.size === bytes.length && (await readFile4(finalPath)).equals(bytes))
          return { finalPath, metadata: finalMetadata, bytes };
      } catch {
      }
      try {
        let finalMetadata = await lstat4(finalPath);
        sameInode(finalMetadata, tempMetadata) && finalMetadata.size === bytes.length && (await readFile4(finalPath)).equals(bytes) && await unlink2(finalPath);
      } catch {
      }
    }
    if (tempMetadata !== void 0) {
      try {
        let current = await lstat4(temporaryPath);
        sameInode(current, tempMetadata) && await unlink2(temporaryPath);
      } catch {
      }
      await syncDirectory2(path6.dirname(finalPath)).catch(() => {
      });
    }
    throw error?.code === "EEXIST" ? workflowError("workspace_collision") : error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError("workspace_status_unknown");
  }
}
async function unlinkOwned(published) {
  try {
    let metadata = await lstat4(published.finalPath);
    metadata.dev === published.metadata.dev && metadata.ino === published.metadata.ino && await unlink2(published.finalPath);
  } catch {
  }
}
async function withQueues2(paths, operation) {
  let sorted = [...new Set(paths)].sort(), run = (index) => index >= sorted.length ? operation() : withFileMutationQueue2(sorted[index], () => run(index + 1));
  return run(0);
}
function sameSessionVacancy(state, vacancy) {
  return vacancy === void 0 ? state.vacancy === null : state.vacancy !== null && state.vacancy.source_state_id === vacancy.state_id && state.vacancy.content_sha256 === vacancy.vacancy_text_sha256 && state.vacancy.utf8_bytes === Buffer.byteLength(vacancy.vacancy_text, "utf8");
}
async function reconciliationClassification(rootPath) {
  try {
    await validateApplicationRootPath(rootPath);
    let entries = await boundedEntries(rootPath, ROOT_MAX_ENTRIES);
    if (entries.includes(path6.basename(workspaceLockPath(rootPath))))
      return "Crash-left workspace lock detected. Mutations are blocked; reconciliation made no change.";
    if (entries.some((entry) => entry.includes(".tmp") || entry.startsWith(".pi-career-") && entry !== ROOT_MARKER_NAME))
      return "Crash-left workspace temporary entry detected. Mutations are blocked; reconciliation made no change.";
    for (let entry of entries) {
      if (entry === ROOT_MARKER_NAME) continue;
      let applicationPath = path6.join(rootPath, entry), metadata = await lstat4(applicationPath).catch(() => {
      });
      if (metadata === void 0)
        return "Application directory became unavailable during bounded reconciliation; no path was repaired or followed.";
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
      let children;
      try {
        children = await boundedEntries(applicationPath, APPLICATION_MAX_ENTRIES);
      } catch (error) {
        return error instanceof CareerWorkflowError && error.code === "workspace_limit_reached" ? "Application entry limit reached during reconciliation. Mutations are blocked; reconciliation made no change." : "Application directory could not be boundedly read. Mutations are blocked; reconciliation made no change.";
      }
      if (children.length === 0)
        return "Interrupted initialization: an empty application directory is quarantined. Reconciliation made no change.";
      if (children.some((name) => name.includes(".tmp") || name.startsWith(".pi-career-") && !STATE_BASENAME.test(name) && name !== IDENTITY_NAME))
        return "Crash-left application temporary entry detected. Mutations are blocked; reconciliation made no change.";
      let hasManifest = children.includes(MANIFEST_NAME), states = children.filter((name) => STATE_BASENAME.test(name));
      if (hasManifest && states.length === 0)
        return "Interrupted initialization: a manifest has no committed first state. Reconciliation made no change.";
      if (children.some((name) => VACANCY_BASENAME.test(name)) && states.length === 0)
        return "Orphan vacancy file detected without a committed state. Reconciliation made no change.";
      if (children.includes("resume.pi-career.json") && !children.some((name) => name === "resume.md" || name === "resume.txt"))
        return "Assisted sidecar orphan detected. It is not attached or authoritative; reconciliation made no change.";
      if (children.includes("resume.pi-career.json") && children.some((name) => name === "resume.md" || name === "resume.txt") && states.length === 0)
        return "Uncommitted assisted pair orphan detected. It is not attached after restart; reconciliation made no change.";
    }
    return "Workspace drift detected. Package mutations are blocked; reconciliation made no change.";
  } catch (error) {
    if (error instanceof CareerWorkflowError) {
      if (error.code === "workspace_root_invalid")
        return "Workspace root validation failed before reconciliation access. Package mutations are blocked; no path was followed or changed.";
      if (error.code === "workspace_limit_reached")
        return "Workspace root entry limit reached during reconciliation. Package mutations are blocked; reconciliation made no change.";
    }
    return "Workspace drift was detected before bounded reconciliation completed. Package mutations are blocked; reconciliation made no change.";
  }
}
async function validateSelectedBinding(config, binding) {
  if (binding === null) return;
  let scan = await scanLibrary(config), root = scan.roots.find((item2) => item2.root_id === binding.library_root_id), matches = eligibleOriginals(scan).filter((record) => record.id === binding.document_id && record.root_id === binding.library_root_id && record.text_sha256 === binding.text_sha256 && record.format === binding.format);
  if (scan.total_capped || root === void 0 || root.capped || root.stale || matches.length !== 1)
    throw workflowError("workspace_drift");
}
function stateBytes(state) {
  let bytes = canonicalJson(state);
  if (bytes.length > METADATA_MAX_BYTES) throw workflowError("workspace_limit_reached");
  return bytes;
}
function stateName(sequence) {
  return `.pi-career-state-${String(sequence).padStart(6, "0")}.json`;
}
function vacancyBindingFromBytes(fileName, bytes, sourceStateId) {
  return {
    relative_path: fileName,
    content_sha256: hashBytes2(bytes),
    utf8_bytes: bytes.length,
    source_state_id: sourceStateId
  };
}
function vacancyBinding(fileName, bytes, vacancy) {
  return vacancyBindingFromBytes(fileName, bytes, vacancy.state_id);
}
function assertApplicationCapacity(application, additions, revisionAdditions = 1) {
  let entryCount = application.entries.length + additions.length, byteCount = application.managedBytes + additions.reduce((total, item2) => total + (item2.bytes?.length ?? 0), 0);
  if (entryCount > APPLICATION_MAX_ENTRIES || byteCount > APPLICATION_MAX_MANAGED_BYTES || application.revisions.length + revisionAdditions > STATE_MAX_REVISIONS)
    throw workflowError("workspace_limit_reached");
}
function transitionTimestamp(headUpdatedAt, finalUpdatedAt) {
  let value = Date.parse(headUpdatedAt) + 1;
  if (!Number.isSafeInteger(value) || !validTimestamp(finalUpdatedAt) || value >= Date.parse(finalUpdatedAt))
    throw workflowError("workspace_unavailable");
  return new Date(value).toISOString();
}
function transitionToStateV2(head, parentSha256, updatedAt) {
  return {
    schema_version: STATE_SCHEMA_V2,
    kind: "application_state_revision",
    application_id: head.application_id,
    sequence: head.sequence + 1,
    parent_sha256: parentSha256,
    status: head.status,
    vacancy: head.vacancy,
    selected_original: head.selected_original,
    resume_artifact: head.resume_artifact,
    cover_letter_artifact: null,
    updated_at: updatedAt
  };
}
function prepareV2Mutation(application, mutationId, createdAt) {
  if (!validTimestamp(createdAt) || Date.parse(createdAt) <= Date.parse(application.head.updated_at))
    throw workflowError("workspace_unavailable");
  if (application.head.schema_version === STATE_SCHEMA_V2)
    return {
      createdAt,
      sequence: application.head.sequence + 1,
      parentSha256: application.headFile.sha256,
      coverLetterArtifact: application.head.cover_letter_artifact,
      transitionFiles: [],
      revisionAdditions: 1
    };
  let transition = transitionToStateV2(
    application.head,
    application.headFile.sha256,
    transitionTimestamp(application.head.updated_at, createdAt)
  ), bytes = stateBytes(transition);
  return {
    createdAt,
    sequence: transition.sequence + 1,
    parentSha256: hashBytes2(bytes),
    coverLetterArtifact: null,
    transitionFiles: [{
      final: path6.join(application.directoryPath, stateName(transition.sequence)),
      temp: path6.join(application.directoryPath, `.pi-career-${mutationId}-transition.tmp`),
      bytes
    }],
    revisionAdditions: 2
  };
}
function freshRecord(scan, record) {
  let root = scan.roots.find((item2) => item2.root_id === record.root_id), matches = eligibleOriginals(scan).filter((candidate) => candidate.id === record.id && candidate.root_id === record.root_id && candidate.format === record.format && candidate.text_sha256 === record.text_sha256);
  if (scan.total_capped || root === void 0 || root.capped || root.stale || matches.length !== 1)
    throw workflowError("workspace_drift");
  return matches[0];
}
function compareText3(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function selectedOriginalOptions(records) {
  let options = [...records].sort((left, right) => compareText3(left.relative_path, right.relative_path) || compareText3(left.id, right.id) || compareText3(left.root_id, right.root_id)).map((record) => ({
    option: `${record.label} — ${record.format} — ${record.relative_path.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240)} — ${record.id} — ${record.root_id}`,
    record
  }));
  if (new Set(options.map(({ option }) => option)).size !== options.length) throw workflowError("workspace_drift");
  return options;
}
async function chooseSelectedOriginal(config, ctx) {
  let scan = await scanLibrary(config);
  if (scan.total_capped) throw workflowError("workspace_limit_reached");
  let eligibleRootIds = new Set(scan.roots.filter((root) => !root.capped && !root.stale).map((root) => root.root_id)), originals = eligibleOriginals(scan).filter((record) => eligibleRootIds.has(record.root_id));
  if (originals.length === 0) throw workflowError("workspace_unavailable");
  let byOption = new Map(selectedOriginalOptions(originals).map(({ option, record }) => [option, record])), selectedOption = await ctx.ui.select("Select original resume binding", [...byOption.keys()]);
  return selectedOption === void 0 ? void 0 : byOption.get(selectedOption);
}
function selectedOriginalBinding(record) {
  return {
    document_id: record.id,
    library_root_id: record.root_id,
    text_sha256: record.text_sha256,
    format: record.format
  };
}
function prepareSelectedOriginalRevision(options, application, applicationId, binding) {
  let mutationId = options.uuid().toLowerCase(), prepared = prepareV2Mutation(application, mutationId, options.now().toISOString()), { createdAt, sequence } = prepared;
  if (sequence > STATE_MAX_REVISIONS) throw workflowError("workspace_limit_reached");
  let state = {
    schema_version: STATE_SCHEMA_V2,
    kind: "application_state_revision",
    application_id: applicationId,
    sequence,
    parent_sha256: prepared.parentSha256,
    status: application.head.status,
    vacancy: application.head.vacancy,
    selected_original: binding,
    resume_artifact: null,
    cover_letter_artifact: prepared.coverLetterArtifact,
    updated_at: createdAt
  }, stateBuffer = stateBytes(state);
  return {
    mutationId,
    createdAt,
    sequence,
    stateBuffer,
    files: [
      ...prepared.transitionFiles,
      {
        final: path6.join(application.directoryPath, stateName(sequence)),
        temp: path6.join(application.directoryPath, `.pi-career-${mutationId}-state.tmp`),
        bytes: stateBuffer
      }
    ],
    revisionAdditions: prepared.revisionAdditions
  };
}
var ApplicationWorkspaceWorkflow = class {
  constructor(options) {
    this.options = options;
  }
  options;
  withMutationQueues(paths, operation) {
    return this.options.withMutationQueues?.(paths, operation) ?? withQueues2(paths, operation);
  }
  afterWorkspaceLockAcquired(operation, mutationId) {
    return this.options.afterWorkspaceLockAcquired?.(operation, mutationId) ?? Promise.resolve();
  }
  async run(args, ctx) {
    if (args.trim() !== "") throw workflowError("invalid_command_arguments");
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") throw workflowError("interactive_mode_required");
    if (!ctx.isIdle()) throw workflowError("workspace_unavailable");
    let identity2 = sessionIdentity(ctx), menuState = await this.menuState(ctx, identity2), action = await ctx.ui.select("Career application workspace", [
      "Status and reconcile",
      ...menuState.canInitialize ? ["Initialize current application"] : [],
      ...menuState.canMigrate ? ["Finish application migration"] : [],
      ...menuState.canRecord ? ["Record current status and vacancy"] : [],
      ...menuState.canSelectOriginal ? ["Select original resume"] : [],
      ...menuState.canAttach ? ["Attach current application"] : [],
      ...menuState.canAttachCatalog ? ["Attach application"] : [],
      ...menuState.canOpenInNewSession ? ["Open application in new Pi session"] : [],
      ...menuState.canDetachSession ? ["Detach current application from session"] : [],
      ...menuState.canActivateAssistance ? ["Activate Career assistance"] : [],
      "Configure application root",
      "Detach application root from config",
      "Close"
    ]);
    if (!(action === void 0 || action === "Close")) {
      if (action === "Status and reconcile") return this.status(ctx);
      if (action === "Configure application root") return this.configureRoot(ctx);
      if (action === "Detach application root from config") return this.detachRoot(ctx);
      if (action === "Initialize current application") return this.initialize(ctx);
      if (action === "Finish application migration") return this.finishMigration(ctx);
      if (action === "Record current status and vacancy") return this.record(ctx);
      if (action === "Select original resume") return this.selectOriginal(ctx);
      if (action === "Attach current application") return this.attachCurrent(ctx);
      if (action === "Attach application") return this.attachFromCatalog(ctx);
      if (action === "Open application in new Pi session") return this.openInNewSession(ctx);
      if (action === "Detach current application from session") {
        await this.detachAttachedApplication(ctx);
        return;
      }
      if (action === "Activate Career assistance") return this.activateAssistance(ctx);
    }
  }
  async attachedMutation(ctx) {
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") throw workflowError("interactive_mode_required");
    if (!ctx.isIdle()) throw workflowError("workspace_unavailable");
    let records = replayApplicationSessionRecords(ctx.sessionManager.getBranch(), ctx.sessionManager.getEntries());
    if (records.integrity !== "valid" || records.attachment === void 0)
      throw workflowError("attachment_unavailable");
    let loaded = await inspectAttachedApplication(this.options.agentDir, records.attachment), application = loaded.inspected;
    if (loaded.snapshot.config.application_workspace === null || application.identity === void 0)
      throw workflowError("attachment_unavailable");
    await validateSelectedBinding(loaded.snapshot.config, application.head.selected_original);
    let identity2 = sessionIdentity(ctx);
    if (identity2 !== void 0 && (identity2.identity.application_id !== application.manifest.application_id || identity2.identity.created_at !== application.manifest.application_created_at || identity2.identity.company_label !== application.identity.company_label || identity2.identity.role_label !== application.identity.role_label)) throw workflowError("workspace_identity_conflict");
    return {
      loaded,
      application,
      identity: identity2,
      target: {
        directoryPath: application.directoryPath,
        applicationId: application.manifest.application_id,
        applicationCreatedAt: application.manifest.application_created_at,
        companyLabel: application.identity.company_label,
        roleLabel: application.identity.role_label
      }
    };
  }
  async publishAttachedRevision(ctx, mutation, operation, mutationId, createdAt, files, stateBuffer, revisionAdditions, successMessage, sourceValidation) {
    let configured = mutation.loaded.snapshot.config.application_workspace;
    if (configured === null) throw workflowError("attachment_unavailable");
    for (let file of files) await requireAbsent(file.final);
    assertApplicationCapacity(mutation.application, files, revisionAdditions), ctx.sessionManager.getSessionFile() === void 0 && ctx.ui.notify("Transient session warning: this approved revision outlives the current Pi process.", "warning");
    let root = await inspectRoot(configured.root_path, {
      expectedRootId: configured.root_id,
      currentApplication: mutation.target
    }), plan = buildPlan(
      this.options,
      ctx,
      operation,
      mutation.application.manifest.application_id,
      mutation.identity,
      mutation.loaded.snapshot.sha256,
      mutation.application.headFile.sha256,
      files.map((file) => createPreview(file.final, file.bytes)),
      [],
      [workspaceLockPath(configured.root_path), ...files.map((file) => file.temp)],
      ctx.sessionManager.getSessionFile() === void 0 ? ["Transient session: the revision outlives this process."] : [],
      mutationId,
      createdAt
    );
    return await approve(plan, ctx) ? (await this.commitRevision(
      plan,
      ctx,
      { snapshot: mutation.loaded.snapshot, root, application: mutation.application },
      mutation.identity,
      files,
      stateBuffer,
      async () => {
        await validateSelectedBinding(mutation.loaded.snapshot.config, mutation.application.head.selected_original), await sourceValidation?.();
      },
      mutation.target
    ), ctx.ui.notify(successMessage, "info"), "written") : "cancelled";
  }
  async writeAttachedVacancy(ctx, text) {
    let mutation = await this.attachedMutation(ctx), { application } = mutation, nextBytes = text === null ? void 0 : Buffer.from(text, "utf8");
    if (text !== null && (nextBytes === void 0 || nextBytes.length === 0 || nextBytes.length > VACANCY_MAX_BYTES || text.includes("\r") || hasUnpairedSurrogate(text) || !isWithinCoreCharacterLimit(text) || sha256(text) !== hashBytes2(nextBytes)))
      throw workflowError("invalid_command_arguments");
    let current = application.head.vacancy;
    if (text === null ? current === null : current !== null && nextBytes !== void 0 && current.content_sha256 === hashBytes2(nextBytes) && current.utf8_bytes === nextBytes.length)
      return ctx.ui.notify("Workspace vacancy already matches this input; no revision was added.", "info"), "unchanged";
    let mutationId = this.options.uuid().toLowerCase(), prepared = prepareV2Mutation(application, mutationId, this.options.now().toISOString()), { createdAt, sequence } = prepared;
    if (sequence > STATE_MAX_REVISIONS) throw workflowError("workspace_limit_reached");
    let vacancyName = `vacancy-${String(sequence).padStart(6, "0")}.md`, nextVacancy = text === null || nextBytes === void 0 ? null : vacancyBindingFromBytes(vacancyName, nextBytes, this.options.uuid().toLowerCase()), state = {
      schema_version: STATE_SCHEMA_V2,
      kind: "application_state_revision",
      application_id: application.manifest.application_id,
      sequence,
      parent_sha256: prepared.parentSha256,
      status: application.head.status,
      vacancy: nextVacancy,
      selected_original: application.head.selected_original,
      resume_artifact: application.head.resume_artifact,
      cover_letter_artifact: prepared.coverLetterArtifact,
      updated_at: createdAt
    }, stateBuffer = stateBytes(state);
    return this.publishAttachedRevision(
      ctx,
      mutation,
      "update_vacancy",
      mutationId,
      createdAt,
      [
        ...prepared.transitionFiles,
        ...nextBytes === void 0 ? [] : [{
          final: path6.join(application.directoryPath, vacancyName),
          temp: path6.join(application.directoryPath, `.pi-career-${mutationId}-vacancy.tmp`),
          bytes: nextBytes
        }],
        {
          final: path6.join(application.directoryPath, stateName(sequence)),
          temp: path6.join(application.directoryPath, `.pi-career-${mutationId}-state.tmp`),
          bytes: stateBuffer
        }
      ],
      stateBuffer,
      prepared.revisionAdditions,
      `Recorded immutable workspace vacancy revision ${sequence}. Earlier vacancy files remain unchanged.`
    );
  }
  async selectAttachedOriginal(ctx) {
    let mutation = await this.attachedMutation(ctx), { application } = mutation;
    if (application.head.resume_artifact !== null) throw workflowError("workspace_unavailable");
    let selected = await chooseSelectedOriginal(mutation.loaded.snapshot.config, ctx);
    if (selected === void 0) return "cancelled";
    let binding = selectedOriginalBinding(selected);
    if (JSON.stringify(binding) === JSON.stringify(application.head.selected_original))
      return ctx.ui.notify("The selected original binding is already current; no revision was added.", "info"), "unchanged";
    let revision = prepareSelectedOriginalRevision(
      this.options,
      application,
      application.manifest.application_id,
      binding
    );
    return this.publishAttachedRevision(
      ctx,
      mutation,
      "select_original",
      revision.mutationId,
      revision.createdAt,
      revision.files,
      revision.stateBuffer,
      revision.revisionAdditions,
      `Recorded selected-original binding in immutable revision ${revision.sequence}; no original bytes were copied or changed.`,
      async () => {
        freshRecord(await scanLibrary(mutation.loaded.snapshot.config), selected);
      }
    );
  }
  async writeAttachedStatus(ctx, status) {
    if (!APPLICATION_STATUSES2.has(status)) throw workflowError("invalid_command_arguments");
    let mutation = await this.attachedMutation(ctx), { application } = mutation;
    if (application.head.status === status)
      return ctx.ui.notify("Workspace status already matches this input; no revision was added.", "info"), "unchanged";
    let mutationId = this.options.uuid().toLowerCase(), prepared = prepareV2Mutation(application, mutationId, this.options.now().toISOString()), { createdAt, sequence } = prepared;
    if (sequence > STATE_MAX_REVISIONS) throw workflowError("workspace_limit_reached");
    let state = {
      schema_version: STATE_SCHEMA_V2,
      kind: "application_state_revision",
      application_id: application.manifest.application_id,
      sequence,
      parent_sha256: prepared.parentSha256,
      status,
      vacancy: application.head.vacancy,
      selected_original: application.head.selected_original,
      resume_artifact: application.head.resume_artifact,
      cover_letter_artifact: prepared.coverLetterArtifact,
      updated_at: createdAt
    }, stateBuffer = stateBytes(state);
    return this.publishAttachedRevision(
      ctx,
      mutation,
      "record_state",
      mutationId,
      createdAt,
      [
        ...prepared.transitionFiles,
        {
          final: path6.join(application.directoryPath, stateName(sequence)),
          temp: path6.join(application.directoryPath, `.pi-career-${mutationId}-state.tmp`),
          bytes: stateBuffer
        }
      ],
      stateBuffer,
      prepared.revisionAdditions,
      `Recorded immutable workspace status revision ${sequence}. Workspace files besides the new state were not changed.`
    );
  }
  async detachAttachedApplication(ctx) {
    let records = this.sessionRecords(ctx);
    if (records.attachment === void 0) throw workflowError("attachment_unavailable");
    if (await ctx.ui.confirm(
      "Detach current application",
      "Detach this application from the Pi session? Workspace files are not changed."
    ) !== !0) return "cancelled";
    let latest = this.sessionRecords(ctx);
    if (latest.attachment === void 0 || latest.attachment.attachment_id !== records.attachment.attachment_id)
      throw workflowError("workspace_unavailable");
    return this.requireAppender()(
      APPLICATION_ATTACHMENT_CUSTOM_TYPE,
      createApplicationDetachmentEntry(latest.attachment, this.options)
    ), ctx.ui.notify("Application detached from the session. Workspace files were not changed.", "info"), latest.activation !== void 0 && await ctx.reload(), "detached";
  }
  async prepareAssistanceHandoff(ctx) {
    let records = this.sessionRecords(ctx);
    if (records.attachment === void 0) throw workflowError("attachment_unavailable");
    if (await validateApplicationAttachment(this.options.agentDir, records.attachment), records.activation !== void 0) {
      ctx.ui.setEditorText(CAREER_ASSISTANCE_HANDOFF), ctx.ui.notify("Career assistance is already active. Review the editor handoff; nothing was submitted.", "info");
      return;
    }
    await this.activateAssistance(ctx);
  }
  async menuState(ctx, identity2) {
    let records = replayApplicationSessionRecords(ctx.sessionManager.getBranch(), ctx.sessionManager.getEntries()), sessionFlags = {
      canAttach: !1,
      ...await this.catalogMenuFlags(records),
      canDetachSession: records.integrity === "valid" && records.attachment !== void 0,
      canActivateAssistance: records.integrity === "valid" && records.attachment !== void 0 && records.activation === void 0
    }, unavailable = {
      canInitialize: !1,
      canMigrate: !1,
      canRecord: !1,
      canSelectOriginal: !1,
      ...sessionFlags
    };
    if (identity2 === void 0) return unavailable;
    try {
      let attachment = await attachmentFor(this.options.agentDir, identity2);
      return attachment.snapshot.config.application_workspace === null ? unavailable : attachment.application === void 0 ? { ...unavailable, canInitialize: !0 } : attachment.application.identity === void 0 ? { ...unavailable, canMigrate: !0 } : {
        canInitialize: !1,
        canMigrate: !1,
        canRecord: attachment.application.head.status !== identity2.current.status || !sameSessionVacancy(attachment.application.head, identity2.vacancy),
        canSelectOriginal: attachment.application.head.resume_artifact === null,
        canAttach: records.integrity === "valid" && records.attachment === void 0 && (records.used_application_id === void 0 || records.used_application_id === identity2.identity.application_id),
        canAttachCatalog: sessionFlags.canAttachCatalog,
        canOpenInNewSession: sessionFlags.canOpenInNewSession,
        canDetachSession: sessionFlags.canDetachSession,
        canActivateAssistance: sessionFlags.canActivateAssistance
      };
    } catch {
      return unavailable;
    }
  }
  requireAppender() {
    if (this.options.appendEntry === void 0) throw workflowError("workspace_unavailable");
    return this.options.appendEntry;
  }
  sessionRecords(ctx) {
    let records = replayApplicationSessionRecords(ctx.sessionManager.getBranch(), ctx.sessionManager.getEntries());
    if (records.integrity !== "valid") throw workflowError("attachment_unavailable");
    return records;
  }
  async catalogMenuFlags(records) {
    if (records.integrity !== "valid") return { canAttachCatalog: !1, canOpenInNewSession: !1 };
    let items = await this.listAttachable();
    return {
      canAttachCatalog: items.length > 0 && records.attachment === void 0 && records.used_application_id === void 0,
      canOpenInNewSession: items.length > 0 && records.used_application_id !== void 0
    };
  }
  async listAttachable() {
    return listCatalogApplications(this.options.agentDir);
  }
  async attachCatalogPointer(ctx, pointer) {
    let records = this.sessionRecords(ctx);
    if (records.used_application_id !== void 0 && records.used_application_id !== pointer.applicationId) {
      let entry = createApplicationAttachmentEntry(pointer, this.options);
      return await validateApplicationAttachment(this.options.agentDir, entry), ctx.ui.notify(
        "This session already belongs to another application. The selected application was not attached.",
        "warning"
      ), this.openEntryInNewSession(ctx, entry);
    }
    return this.commitAttachment(
      ctx,
      pointer,
      "Attach application",
      "Attach this application to the Pi session? Only identity pointers are stored. Career model tools stay inactive."
    );
  }
  async initializeCurrentApplication(ctx) {
    return this.initialize(ctx);
  }
  async selectAttachable(ctx, title) {
    let items = await this.listAttachable();
    if (items.length === 0) throw workflowError("attachment_unavailable");
    let byOption = new Map(items.map((item2) => [item2.option, item2.pointer]));
    if (byOption.size !== items.length) throw workflowError("workspace_drift");
    let chosen = await ctx.ui.select(title, [...byOption.keys()]);
    if (chosen === void 0) return;
    let pointer = byOption.get(chosen);
    if (pointer === void 0) throw workflowError("workspace_unavailable");
    return pointer;
  }
  async commitAttachment(ctx, pointer, title, message) {
    let entry = createApplicationAttachmentEntry(pointer, this.options);
    if (await validateApplicationAttachment(this.options.agentDir, entry), await ctx.ui.confirm(title, message) !== !0) return !1;
    await validateApplicationAttachment(this.options.agentDir, entry);
    let latest = this.sessionRecords(ctx);
    if (latest.attachment !== void 0) throw workflowError("workspace_unavailable");
    if (latest.used_application_id !== void 0 && latest.used_application_id !== pointer.applicationId)
      throw workflowError("workspace_identity_conflict");
    return this.requireAppender()(APPLICATION_ATTACHMENT_CUSTOM_TYPE, entry), ctx.ui.notify("Application attached. Career assistance remains inactive.", "info"), !0;
  }
  async attachFromCatalog(ctx) {
    let records = this.sessionRecords(ctx);
    if (records.attachment !== void 0 || records.used_application_id !== void 0)
      throw workflowError("workspace_identity_conflict");
    let pointer = await this.selectAttachable(ctx, "Attach application");
    pointer !== void 0 && await this.commitAttachment(
      ctx,
      pointer,
      "Attach application",
      "Attach this application to the Pi session? Only identity pointers are stored. Career model tools stay inactive."
    );
  }
  async openInNewSession(ctx) {
    let pointer = await this.selectAttachable(ctx, "Open application in new Pi session");
    pointer !== void 0 && await this.openEntryInNewSession(ctx, createApplicationAttachmentEntry(pointer, this.options));
  }
  async openEntryInNewSession(ctx, entry) {
    if (await validateApplicationAttachment(this.options.agentDir, entry), await ctx.ui.confirm(
      "Open application in new Pi session",
      "Open this application in a new Pi session? The current session is unchanged."
    ) !== !0) return !1;
    await validateApplicationAttachment(this.options.agentDir, entry);
    let parentSession = ctx.sessionManager.getSessionFile();
    return (await ctx.newSession({
      ...parentSession === void 0 ? {} : { parentSession },
      setup: async (sessionManager) => {
        sessionManager.appendCustomEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, entry);
      },
      withSession: async (replacement) => {
        replacement.ui.notify("Application attached in the new session. Career assistance remains inactive.", "info");
      }
    })).cancelled ? (ctx.ui.notify("New session cancelled. This session was not changed.", "info"), !1) : !0;
  }
  async attachCurrent(ctx) {
    let identity2 = sessionIdentity(ctx);
    if (identity2 === void 0) throw workflowError("workspace_unavailable");
    let records = this.sessionRecords(ctx);
    if (records.used_application_id !== void 0 && records.used_application_id !== identity2.identity.application_id)
      throw workflowError("workspace_identity_conflict");
    if (records.attachment !== void 0) throw workflowError("workspace_unavailable");
    let inspected = await attachmentFor(this.options.agentDir, identity2);
    if (inspected.application?.identity === void 0) throw workflowError("attachment_unavailable");
    await this.commitAttachment(
      ctx,
      {
        applicationId: inspected.application.manifest.application_id,
        rootId: inspected.root.marker.root_id,
        rootCreatedAt: inspected.root.marker.created_at,
        applicationCreatedAt: inspected.application.manifest.application_created_at,
        workspaceCreatedAt: inspected.application.manifest.workspace_created_at
      },
      "Attach current application",
      "Attach this application to the Pi session? Only identity pointers are stored. Career model tools stay inactive."
    );
  }
  async activateAssistance(ctx) {
    let records = this.sessionRecords(ctx);
    if (records.attachment === void 0 || records.activation !== void 0)
      throw workflowError("attachment_unavailable");
    if (await validateApplicationAttachment(this.options.agentDir, records.attachment), await ctx.ui.confirm(
      "Activate Career assistance",
      "Prepare a Career Skill handoff in the editor? Nothing will be submitted."
    ) !== !0) return;
    let latest = this.sessionRecords(ctx);
    if (latest.attachment === void 0 || latest.activation !== void 0 || latest.attachment.attachment_id !== records.attachment.attachment_id)
      throw workflowError("workspace_unavailable");
    await validateApplicationAttachment(this.options.agentDir, latest.attachment), this.requireAppender()(
      APPLICATION_ASSISTANCE_CUSTOM_TYPE,
      createApplicationAssistanceActivationEntry(latest.attachment, this.options)
    ), ctx.ui.setEditorText(CAREER_ASSISTANCE_HANDOFF), ctx.ui.notify("Career assistance prepared in the editor. Review and submit manually.", "info"), await ctx.reload();
  }
  async status(ctx) {
    let identity2 = sessionIdentity(ctx), snapshot;
    try {
      snapshot = await loadConfigSnapshot(this.options.agentDir);
    } catch {
      throw workflowError("workspace_config_invalid");
    }
    try {
      await lstat4(configLockPath(this.options.agentDir)), ctx.ui.notify("Crash-left config lock detected. Workspace mutations are blocked; reconciliation made no change.", "warning");
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        ctx.ui.notify("Workspace config drift detected. Mutations are blocked; reconciliation made no change.", "warning");
        return;
      }
    }
    let configured = snapshot.config.application_workspace;
    if (configured === null) {
      ctx.ui.notify("Application workspace root: detached. No file was changed.", "info");
      return;
    }
    let attachment;
    try {
      attachment = await attachmentFor(this.options.agentDir, identity2);
    } catch {
      let classification = await reconciliationClassification(configured.root_path);
      ctx.ui.notify(`${privacyDisplayPath(configured.root_path)} • ${classification}`, "warning");
      return;
    }
    if (identity2 === void 0) {
      ctx.ui.notify(`Application workspace root: attached (${privacyDisplayPath(configured.root_path)}). No active application on this branch.`, "info");
      return;
    }
    let application = attachment.application;
    if (application === void 0) {
      ctx.ui.notify(`Application workspace root: attached (${privacyDisplayPath(configured.root_path)}). Current session · Not persisted.`, "info");
      return;
    }
    if (application.identity === void 0) {
      ctx.ui.notify([
        `Application workspace: attached • ${privacyDisplayPath(application.directoryPath)}`,
        "Legacy identity: immutable state is readable, but ordinary mutations are blocked.",
        "Use Finish application migration for an exact preview and separate confirmation."
      ].join(`
`), "warning");
      return;
    }
    try {
      await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original);
    } catch {
      ctx.ui.notify("Selected-original binding drift detected. Mutations are blocked; reconciliation made no change.", "warning");
      return;
    }
    let drift = application.head.status !== identity2.current.status || !sameSessionVacancy(application.head, identity2.vacancy);
    ctx.ui.notify([
      `Application workspace: attached • ${privacyDisplayPath(application.directoryPath)}`,
      `Workspace status: ${application.head.status} • session status: ${identity2.current.status}`,
      `State revisions: ${application.revisions.length} • selected original: ${application.head.selected_original === null ? "none" : "bound"}`,
      drift ? "Session and workspace differ. Use Record current status and vacancy for an explicit direction-specific write." : "Session and workspace status are reconciled."
    ].join(`
`), "info");
  }
  async configureRoot(ctx) {
    let rootInput = await ctx.ui.input("Application workspace root", "Canonical absolute existing 0700 directory");
    if (rootInput === void 0) return;
    let session = sessionIdentity(ctx), snapshot;
    try {
      snapshot = await loadConfigSnapshot(this.options.agentDir);
    } catch {
      throw workflowError("workspace_config_invalid");
    }
    let rootPath = rootInput, configuredRoot = snapshot.config.application_workspace;
    if (configuredRoot !== null && configuredRoot.root_path !== rootPath)
      throw workflowError("workspace_unavailable");
    let initialRootMetadata = await validateApplicationRootPath(rootPath), mutationId = this.options.uuid().toLowerCase(), createdAt = this.options.now().toISOString();
    if (!validUuid(mutationId) || !validTimestamp(createdAt)) throw workflowError("workspace_verification_failed");
    await assertApplicationWorkspaceDisjoint(setApplicationWorkspace(snapshot.config, {
      root_id: mutationId,
      root_path: rootPath
    }));
    let entries = await boundedEntries(rootPath, ROOT_MAX_ENTRIES), marker, markerBytes, initialAudit, marked = !1;
    if (entries.length === 0) {
      if (configuredRoot !== null) throw workflowError("workspace_drift");
      if (marker = { schema_version: ROOT_MARKER_SCHEMA, kind: "application_workspace_root", root_id: this.options.uuid().toLowerCase(), created_at: createdAt }, !validUuid(marker.root_id)) throw workflowError("workspace_verification_failed");
      markerBytes = canonicalJson(marker);
    } else {
      let target = currentApplicationTarget(rootPath, session);
      initialAudit = await inspectRoot(rootPath, {
        ...configuredRoot === null ? {} : { expectedRootId: configuredRoot.root_id },
        ...target === void 0 ? {} : { currentApplication: target }
      }), marker = initialAudit.marker, marked = !0;
    }
    let nextConfig = setApplicationWorkspace(snapshot.config, { root_id: marker.root_id, root_path: rootPath });
    await assertApplicationWorkspaceDisjoint(nextConfig);
    let nextBytes = encodeConfig(nextConfig);
    if (nextBytes.length > CONFIG_MAX_BYTES2) throw workflowError("workspace_config_invalid");
    let configObjects = configPreview(snapshot, nextBytes), markerPath = path6.join(rootPath, ROOT_MARKER_NAME), markerTemp = path6.join(rootPath, `.pi-career-${mutationId}-root-marker.tmp`), plan = buildPlan(
      this.options,
      ctx,
      "configure_root",
      session?.identity.application_id ?? null,
      session,
      snapshot.sha256,
      null,
      [...markerBytes === void 0 ? [] : [createPreview(markerPath, markerBytes)], ...configObjects.creates],
      configObjects.replaces,
      [
        configLockPath(this.options.agentDir),
        ...marked ? [workspaceLockPath(rootPath)] : [],
        ...markerBytes === void 0 ? [] : [markerTemp],
        configTemporaryPath(this.options.agentDir, mutationId)
      ],
      [],
      mutationId,
      createdAt
    );
    if (!await approve(plan, ctx)) return;
    assertSessionPlan(plan, ctx);
    let queuePaths = [snapshot.filePath, ...markerBytes === void 0 ? [] : [markerPath]];
    await withQueues2(queuePaths, async () => {
      let configLock = await acquireMutationLock(configLockPath(this.options.agentDir), "config_mutation_lock", mutationId, createdAt), rootLock, publishedMarker, configCommitStarted = !1;
      try {
        assertSessionPlan(plan, ctx), await assertConfigSnapshotCurrent(snapshot);
        let currentRootMetadata = await validateApplicationRootPath(rootPath);
        if (!sameInode(initialRootMetadata, currentRootMetadata)) throw workflowError("workspace_drift");
        if (marked) {
          rootLock = await acquireMutationLock(workspaceLockPath(rootPath), "workspace_mutation_lock", mutationId, createdAt);
          let target = currentApplicationTarget(rootPath, session), audit = await inspectRoot(rootPath, {
            expectedRootId: marker.root_id,
            ownedLock: rootLock.path,
            ...target === void 0 ? {} : { currentApplication: target }
          });
          if (initialAudit === void 0) throw workflowError("workspace_drift");
          if (assertRootPlanCurrent(initialAudit, audit), audit.markerFile.sha256 !== hashBytes2(canonicalJson(marker))) throw workflowError("workspace_drift");
        } else {
          if ((await boundedEntries(rootPath, 1)).length !== 0 || markerBytes === void 0) throw workflowError("workspace_drift");
          if (ctx.signal?.aborted) throw workflowError("workflow_cancelled");
          if (publishedMarker = await publishFile(markerPath, markerTemp, markerBytes), (await readExactFile(markerPath, parseMarker)).value.root_id !== marker.root_id) throw workflowError("workspace_status_unknown");
        }
        if (await assertApplicationWorkspaceDisjoint(nextConfig), ctx.signal?.aborted && publishedMarker === void 0) throw workflowError("workflow_cancelled");
        configCommitStarted = !0, await commitConfigUnderLock(snapshot, nextConfig, configTemporaryPath(this.options.agentDir, mutationId), "v2");
      } catch (error) {
        if (publishedMarker !== void 0) {
          let configIsUnchanged = !configCommitStarted;
          if (configCommitStarted)
            try {
              await assertConfigSnapshotCurrent(snapshot), configIsUnchanged = !0;
            } catch {
            }
          if (configIsUnchanged)
            try {
              let currentEntries = await boundedEntries(rootPath, 1);
              currentEntries.length === 1 && currentEntries[0] === ROOT_MARKER_NAME && (await unlinkOwned(publishedMarker), await syncDirectory2(rootPath));
            } catch {
            }
        }
        throw error;
      } finally {
        try {
          rootLock !== void 0 && await releaseMutationLock(rootLock);
        } finally {
          await releaseMutationLock(configLock);
        }
      }
    }), ctx.ui.notify(`Application workspace root attached: ${privacyDisplayPath(rootPath)}. Existing workspace files remain unchanged.`, "info");
  }
  async detachRoot(ctx) {
    let session = sessionIdentity(ctx), snapshot;
    try {
      snapshot = await loadConfigSnapshot(this.options.agentDir);
    } catch {
      throw workflowError("workspace_config_invalid");
    }
    let configured = snapshot.config.application_workspace;
    if (configured === null) throw workflowError("workspace_unavailable");
    await assertApplicationWorkspaceDisjoint(snapshot.config);
    let target = currentApplicationTarget(configured.root_path, session), initialRoot = await inspectRoot(configured.root_path, {
      expectedRootId: configured.root_id,
      ...target === void 0 ? {} : { currentApplication: target }
    }), nextConfig = setApplicationWorkspace(snapshot.config, null), nextBytes = encodeConfig(nextConfig), configObjects = configPreview(snapshot, nextBytes), mutationId = this.options.uuid().toLowerCase(), createdAt = this.options.now().toISOString(), plan = buildPlan(
      this.options,
      ctx,
      "detach_root",
      session?.identity.application_id ?? null,
      session,
      snapshot.sha256,
      null,
      configObjects.creates,
      configObjects.replaces,
      [
        configLockPath(this.options.agentDir),
        workspaceLockPath(configured.root_path),
        configTemporaryPath(this.options.agentDir, mutationId)
      ],
      ["Detaching changes config only. The root marker and every application file remain."],
      mutationId,
      createdAt
    );
    await approve(plan, ctx) && (assertSessionPlan(plan, ctx), await withQueues2([snapshot.filePath], async () => {
      let configLock = await acquireMutationLock(configLockPath(this.options.agentDir), "config_mutation_lock", mutationId, createdAt), rootLock;
      try {
        rootLock = await acquireMutationLock(workspaceLockPath(configured.root_path), "workspace_mutation_lock", mutationId, createdAt), assertSessionPlan(plan, ctx), await assertConfigSnapshotCurrent(snapshot);
        let currentRoot = await inspectRoot(configured.root_path, {
          expectedRootId: configured.root_id,
          ownedLock: rootLock.path,
          ...target === void 0 ? {} : { currentApplication: target }
        });
        if (assertRootPlanCurrent(initialRoot, currentRoot), ctx.signal?.aborted) throw workflowError("workflow_cancelled");
        await commitConfigUnderLock(snapshot, nextConfig, configTemporaryPath(this.options.agentDir, mutationId), "v2");
      } finally {
        try {
          rootLock !== void 0 && await releaseMutationLock(rootLock);
        } finally {
          await releaseMutationLock(configLock);
        }
      }
    }), ctx.ui.notify("Application workspace root detached from config. No workspace file was changed or deleted.", "info"));
  }
  async finishMigration(ctx) {
    let identity2 = sessionIdentity(ctx);
    if (identity2 === void 0) throw workflowError("workspace_unavailable");
    let attachment = await attachmentFor(this.options.agentDir, identity2), configured = attachment.snapshot.config.application_workspace, application = attachment.application;
    if (configured === null || application === void 0) throw workflowError("workspace_unavailable");
    if (application.identity !== void 0) {
      ctx.ui.notify("The application identity migration is already complete and valid.", "info");
      return;
    }
    await this.publishIdentityMigration(ctx, attachment.snapshot, attachment.root, application, identity2.identity, identity2);
  }
  async migrateCatalogApplication(ctx, applicationId, companyLabel, roleLabel) {
    if (ctx.mode !== "tui" && ctx.mode !== "rpc" || !ctx.isIdle() || !validUuid(applicationId) || !boundedLabel(companyLabel) || !boundedLabel(roleLabel)) throw workflowError("invalid_command_arguments");
    let snapshot = await loadConfigSnapshot(this.options.agentDir).catch(() => {
      throw workflowError("workspace_config_invalid");
    }), configured = snapshot.config.application_workspace;
    if (configured === null) throw workflowError("workspace_unavailable");
    await assertApplicationWorkspaceDisjoint(snapshot.config);
    let evidence = await deriveApplicationCatalog(configured.root_path, configured.root_id), matches = evidence.validatedApplications.filter(({ record }) => record.application_id === applicationId);
    if (evidence.applicationClaims.filter((id) => id === applicationId).length !== 1 || matches.length !== 1 || matches[0].record.classification !== "legacy") throw workflowError("workspace_identity_conflict");
    let application = matches[0].inspected, identity2 = {
      application_id: applicationId,
      company_label: companyLabel,
      role_label: roleLabel,
      created_at: application.manifest.application_created_at
    };
    if (path6.basename(application.directoryPath) !== expectedIdentityBasename(identity2))
      throw workflowError("workspace_identity_conflict");
    let target = {
      directoryPath: application.directoryPath,
      applicationId,
      applicationCreatedAt: identity2.created_at,
      companyLabel,
      roleLabel
    }, root = await inspectRoot(configured.root_path, { expectedRootId: configured.root_id, currentApplication: target }), current = root.currentApplication;
    if (current === void 0 || current.identity !== void 0 || current.headFile.sha256 !== application.headFile.sha256)
      throw workflowError("workspace_drift");
    return this.publishIdentityMigration(ctx, snapshot, root, current, identity2);
  }
  async publishIdentityMigration(ctx, snapshot, root, application, identity2, session) {
    let configured = snapshot.config.application_workspace;
    if (configured === null) throw workflowError("workspace_unavailable");
    let bytes = applicationIdentityBytes(identity2, application.manifest);
    if (application.entries.length + 1 > APPLICATION_MAX_ENTRIES || application.managedBytes + bytes.length > APPLICATION_MAX_MANAGED_BYTES) throw workflowError("workspace_limit_reached");
    let mutationId = this.options.uuid().toLowerCase(), createdAt = this.options.now().toISOString(), final = path6.join(application.directoryPath, IDENTITY_NAME), temporary = path6.join(application.directoryPath, `.pi-career-${mutationId}-identity.tmp`);
    await requireAbsent(final);
    let transient = ctx.sessionManager.getSessionFile() === void 0;
    transient && ctx.ui.notify("Transient session warning: the approved identity file outlives this Pi process.", "warning");
    let plan = buildPlan(
      this.options,
      ctx,
      "finish_application_migration",
      identity2.application_id,
      session,
      snapshot.sha256,
      application.headFile.sha256,
      [createPreview(final, bytes)],
      [],
      [workspaceLockPath(configured.root_path), temporary],
      [
        "Migration adds only the exact display-identity file; manifest, states, artifacts, and directory names remain unchanged.",
        ...transient ? ["Transient session: the identity file outlives this process."] : []
      ],
      mutationId,
      createdAt
    );
    return await approve(plan, ctx) ? (session === void 0 ? assertPlanContext(plan, ctx) : assertSessionPlan(plan, ctx), await this.withMutationQueues([final], async () => {
      await this.options.beforeWorkspaceLockAcquire?.("finish_application_migration", mutationId);
      let rootLock = await acquireMutationLock(
        workspaceLockPath(configured.root_path),
        "workspace_mutation_lock",
        mutationId,
        createdAt
      ), published, migrationIsComplete = async () => {
        let stored = await readApplicationIdentity(application.directoryPath, application.manifest);
        return stored === void 0 || !canonicalJson(stored).equals(bytes) ? !1 : (await inspectApplicationDirectory(
          application.directoryPath,
          configured.root_id,
          path6.basename(application.directoryPath),
          stored
        )).headFile.sha256 === application.headFile.sha256;
      };
      try {
        if (await this.afterWorkspaceLockAcquired("finish_application_migration", mutationId), session === void 0) assertPlanContext(plan, ctx);
        else if (assertSessionPlan(plan, ctx)?.identity.application_id !== identity2.application_id) throw workflowError("workspace_identity_conflict");
        await assertConfigSnapshotCurrent(snapshot), await assertApplicationWorkspaceDisjoint(snapshot.config);
        let target = {
          directoryPath: application.directoryPath,
          applicationId: identity2.application_id,
          applicationCreatedAt: identity2.created_at,
          companyLabel: identity2.company_label,
          roleLabel: identity2.role_label
        }, currentRoot = await inspectRoot(configured.root_path, {
          expectedRootId: configured.root_id,
          ownedLock: rootLock.path,
          currentApplication: target
        });
        assertRootPlanCurrent(root, currentRoot);
        let current = currentRoot.currentApplication;
        if (current === void 0 || current.identity !== void 0 || current.headFile.sha256 !== application.headFile.sha256) throw workflowError("workspace_drift");
        if (current.entries.length + 1 > APPLICATION_MAX_ENTRIES || current.managedBytes + bytes.length > APPLICATION_MAX_MANAGED_BYTES) throw workflowError("workspace_limit_reached");
        if (await requireAbsent(final), ctx.signal?.aborted) throw workflowError("workflow_cancelled");
        if (published = await publishFile(final, temporary, bytes), await syncDirectory2(application.directoryPath), await syncDirectory2(configured.root_path), !await migrationIsComplete()) throw workflowError("workspace_status_unknown");
      } catch (error) {
        if (published !== void 0 && await migrationIsComplete().catch(() => !1)) return;
        throw published !== void 0 && (await unlinkOwned(published), await syncDirectory2(application.directoryPath), await syncDirectory2(configured.root_path)), error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError(published === void 0 ? "workspace_verification_failed" : "workspace_status_unknown");
      } finally {
        await releaseMutationLock(rootLock);
      }
    }), ctx.ui.notify("Finished application identity migration. Existing workspace bytes remain unchanged.", "info"), "written") : "cancelled";
  }
  async initialize(ctx) {
    let identity2 = sessionIdentity(ctx);
    if (identity2 === void 0) throw workflowError("workspace_unavailable");
    let attachment = await attachmentFor(this.options.agentDir, identity2), configured = attachment.snapshot.config.application_workspace;
    if (configured === null || attachment.expectedDirectoryPath === void 0) throw workflowError("workspace_unavailable");
    if (attachment.application !== void 0) {
      ctx.ui.notify("The current application workspace is already initialized and valid.", "info");
      return;
    }
    if (attachment.root.entries.length + 1 > ROOT_MAX_ENTRIES) throw workflowError("workspace_limit_reached");
    let directoryPath = attachment.expectedDirectoryPath;
    await requireAbsent(directoryPath);
    let mutationId = this.options.uuid().toLowerCase(), createdAt = this.options.now().toISOString();
    if (Date.parse(createdAt) < Date.parse(identity2.identity.created_at)) throw workflowError("workspace_unavailable");
    let manifest = {
      schema_version: MANIFEST_SCHEMA,
      kind: "career_application",
      application_id: identity2.identity.application_id,
      root_id: configured.root_id,
      application_created_at: identity2.identity.created_at,
      workspace_created_at: createdAt
    }, manifestBytes = canonicalJson(manifest), identityBytes = applicationIdentityBytes(identity2.identity, manifest), currentVacancyBytes = vacancyBytes(identity2.vacancy, identity2.identity.application_id), vacancyName = "vacancy.md", state = {
      schema_version: STATE_SCHEMA_V1,
      kind: "application_state_revision",
      application_id: identity2.identity.application_id,
      sequence: 1,
      parent_sha256: hashBytes2(manifestBytes),
      status: identity2.current.status,
      vacancy: currentVacancyBytes === void 0 || identity2.vacancy === void 0 ? null : vacancyBinding(vacancyName, currentVacancyBytes, identity2.vacancy),
      selected_original: null,
      resume_artifact: null,
      updated_at: createdAt
    }, stateFile = path6.join(directoryPath, stateName(1)), manifestFile = path6.join(directoryPath, MANIFEST_NAME), identityFile = path6.join(directoryPath, IDENTITY_NAME), vacancyFile = path6.join(directoryPath, vacancyName), stateBuffer = stateBytes(state), persistentCount = 3 + (currentVacancyBytes === void 0 ? 0 : 1), managedBytes = manifestBytes.length + identityBytes.length + stateBuffer.length + (currentVacancyBytes?.length ?? 0);
    if (persistentCount > APPLICATION_MAX_ENTRIES || managedBytes > APPLICATION_MAX_MANAGED_BYTES)
      throw workflowError("workspace_limit_reached");
    let files = [
      { final: manifestFile, temp: path6.join(directoryPath, `.pi-career-${mutationId}-manifest.tmp`), bytes: manifestBytes },
      { final: identityFile, temp: path6.join(directoryPath, `.pi-career-${mutationId}-identity.tmp`), bytes: identityBytes },
      ...currentVacancyBytes === void 0 ? [] : [{ final: vacancyFile, temp: path6.join(directoryPath, `.pi-career-${mutationId}-vacancy.tmp`), bytes: currentVacancyBytes }],
      { final: stateFile, temp: path6.join(directoryPath, `.pi-career-${mutationId}-state.tmp`), bytes: stateBuffer }
    ];
    ctx.sessionManager.getSessionFile() === void 0 && ctx.ui.notify("Transient session warning: approved workspace files outlive this Pi process and cannot recreate session identity after shutdown.", "warning");
    let plan = buildPlan(
      this.options,
      ctx,
      "initialize_application",
      identity2.identity.application_id,
      identity2,
      attachment.snapshot.sha256,
      null,
      [createDirectoryPreview(directoryPath), ...files.map((file) => createPreview(file.final, file.bytes))],
      [],
      [workspaceLockPath(configured.root_path), ...files.map((file) => file.temp)],
      ctx.sessionManager.getSessionFile() === void 0 ? ["Transient session: workspace files outlive this process and do not recreate session identity."] : [],
      mutationId,
      createdAt
    );
    await approve(plan, ctx) && (assertSessionPlan(plan, ctx), await this.withMutationQueues([directoryPath, ...files.map((file) => file.final)], async () => {
      await this.options.beforeWorkspaceLockAcquire?.("initialize_application", mutationId);
      let rootLock = await acquireMutationLock(
        workspaceLockPath(configured.root_path),
        "workspace_mutation_lock",
        mutationId,
        createdAt
      ), published = [], createdDirectory;
      try {
        await this.afterWorkspaceLockAcquired("initialize_application", mutationId);
        let currentIdentity = assertSessionPlan(plan, ctx);
        if (currentIdentity === void 0) throw workflowError("workspace_identity_conflict");
        await assertConfigSnapshotCurrent(attachment.snapshot), await assertApplicationWorkspaceDisjoint(attachment.snapshot.config);
        let root = await inspectRoot(configured.root_path, {
          expectedRootId: configured.root_id,
          ownedLock: rootLock.path,
          currentApplication: {
            directoryPath,
            applicationId: identity2.identity.application_id,
            applicationCreatedAt: identity2.identity.created_at,
            companyLabel: identity2.identity.company_label,
            roleLabel: identity2.identity.role_label
          }
        });
        if (assertRootPlanCurrent(attachment.root, root), root.currentApplication !== void 0)
          throw workflowError("workspace_identity_conflict");
        if (root.entries.filter((entry) => entry !== path6.basename(rootLock.path)).length + 1 > ROOT_MAX_ENTRIES) throw workflowError("workspace_limit_reached");
        if (await requireAbsent(directoryPath), vacancyBytes(currentIdentity.vacancy, currentIdentity.identity.application_id), ctx.signal?.aborted) throw workflowError("workflow_cancelled");
        if (await mkdir2(directoryPath, { recursive: !1, mode: 448 }), createdDirectory = await lstat4(directoryPath), await chmod(directoryPath, 448), createdDirectory = await lstat4(directoryPath), !privateMetadata(createdDirectory, 448, "directory") || await realpath4(directoryPath) !== directoryPath)
          throw workflowError("workspace_verification_failed");
        await syncDirectory2(configured.root_path);
        for (let file of files) published.push(await publishFile(file.final, file.temp, file.bytes));
        await syncDirectory2(directoryPath), await syncDirectory2(configured.root_path);
        let storedIdentity = await readApplicationIdentity(directoryPath, manifest);
        if (storedIdentity === void 0 || !canonicalJson(storedIdentity).equals(identityBytes))
          throw workflowError("workspace_status_unknown");
        if ((await inspectApplicationDirectory(
          directoryPath,
          configured.root_id,
          path6.basename(directoryPath),
          storedIdentity
        )).headFile.sha256 !== hashBytes2(stateBuffer)) throw workflowError("workspace_status_unknown");
      } catch (error) {
        if (await readApplicationIdentity(directoryPath, manifest).then((storedIdentity) => storedIdentity === void 0 || !canonicalJson(storedIdentity).equals(identityBytes) ? !1 : inspectApplicationDirectory(directoryPath, configured.root_id, path6.basename(directoryPath), storedIdentity).then((value) => value.headFile.sha256 === hashBytes2(stateBuffer), () => !1), () => !1)) return;
        for (let item2 of [...published].reverse()) await unlinkOwned(item2);
        if (createdDirectory !== void 0)
          try {
            let current = await lstat4(directoryPath);
            current.dev === createdDirectory.dev && current.ino === createdDirectory.ino && (await boundedEntries(directoryPath, 0)).length === 0 && await rmdir(directoryPath);
          } catch {
          }
        throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError(createdDirectory !== void 0 || published.length > 0 ? "workspace_status_unknown" : "workspace_verification_failed");
      } finally {
        await releaseMutationLock(rootLock);
      }
    }), ctx.ui.notify(`Initialized application workspace: ${privacyDisplayPath(directoryPath)}. No resume artifact was saved.`, "info"));
  }
  async record(ctx) {
    let identity2 = sessionIdentity(ctx);
    if (identity2 === void 0) throw workflowError("workspace_unavailable");
    let attachment = await attachmentFor(this.options.agentDir, identity2), application = attachment.application, configured = attachment.snapshot.config.application_workspace;
    if (configured === null || application === void 0 || application.identity === void 0)
      throw workflowError("workspace_unavailable");
    if (await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original), application.head.status === identity2.current.status && sameSessionVacancy(application.head, identity2.vacancy)) {
      ctx.ui.notify("Workspace status and vacancy already match this session; no revision was added.", "info");
      return;
    }
    let mutationId = this.options.uuid().toLowerCase(), prepared = prepareV2Mutation(application, mutationId, this.options.now().toISOString()), { createdAt, sequence } = prepared;
    if (sequence > STATE_MAX_REVISIONS) throw workflowError("workspace_limit_reached");
    let currentVacancyBytes = vacancyBytes(identity2.vacancy, identity2.identity.application_id), vacancyChanged = !sameSessionVacancy(application.head, identity2.vacancy), vacancyName = `vacancy-${String(sequence).padStart(6, "0")}.md`, vacancyFile = path6.join(application.directoryPath, vacancyName), nextVacancy = identity2.vacancy === void 0 ? null : vacancyChanged && currentVacancyBytes !== void 0 ? vacancyBinding(vacancyName, currentVacancyBytes, identity2.vacancy) : application.head.vacancy, state = {
      schema_version: STATE_SCHEMA_V2,
      kind: "application_state_revision",
      application_id: identity2.identity.application_id,
      sequence,
      parent_sha256: prepared.parentSha256,
      status: identity2.current.status,
      vacancy: nextVacancy,
      selected_original: application.head.selected_original,
      resume_artifact: application.head.resume_artifact,
      cover_letter_artifact: prepared.coverLetterArtifact,
      updated_at: createdAt
    }, stateBuffer = stateBytes(state), files = [
      ...prepared.transitionFiles,
      ...vacancyChanged && currentVacancyBytes !== void 0 ? [{ final: vacancyFile, temp: path6.join(application.directoryPath, `.pi-career-${mutationId}-vacancy.tmp`), bytes: currentVacancyBytes }] : [],
      {
        final: path6.join(application.directoryPath, stateName(sequence)),
        temp: path6.join(application.directoryPath, `.pi-career-${mutationId}-state.tmp`),
        bytes: stateBuffer
      }
    ];
    for (let file of files) await requireAbsent(file.final);
    assertApplicationCapacity(application, files, prepared.revisionAdditions), ctx.sessionManager.getSessionFile() === void 0 && ctx.ui.notify("Transient session warning: this approved revision outlives the current Pi process.", "warning");
    let plan = buildPlan(
      this.options,
      ctx,
      "record_state",
      identity2.identity.application_id,
      identity2,
      attachment.snapshot.sha256,
      application.headFile.sha256,
      files.map((file) => createPreview(file.final, file.bytes)),
      [],
      [workspaceLockPath(configured.root_path), ...files.map((file) => file.temp)],
      ctx.sessionManager.getSessionFile() === void 0 ? ["Transient session: the revision outlives this process."] : [],
      mutationId,
      createdAt
    );
    await approve(plan, ctx) && (await this.commitRevision(plan, ctx, attachment, identity2, files, stateBuffer, async (current) => {
      if (current === void 0 || current.current.status !== identity2.current.status || (current.vacancy?.state_id ?? null) !== (identity2.vacancy?.state_id ?? null))
        throw workflowError("workspace_identity_conflict");
      await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original);
    }, {
      directoryPath: application.directoryPath,
      applicationId: identity2.identity.application_id,
      applicationCreatedAt: identity2.identity.created_at,
      companyLabel: identity2.identity.company_label,
      roleLabel: identity2.identity.role_label
    }), ctx.ui.notify(`Recorded immutable workspace state revision ${sequence}. Earlier vacancy files remain unchanged.`, "info"));
  }
  async selectOriginal(ctx) {
    let identity2 = sessionIdentity(ctx);
    if (identity2 === void 0) throw workflowError("workspace_unavailable");
    let attachment = await attachmentFor(this.options.agentDir, identity2), application = attachment.application, configured = attachment.snapshot.config.application_workspace;
    if (configured === null || application === void 0 || application.identity === void 0 || application.head.resume_artifact !== null)
      throw workflowError("workspace_unavailable");
    await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original);
    let selected = await chooseSelectedOriginal(attachment.snapshot.config, ctx);
    if (selected === void 0) return;
    let binding = selectedOriginalBinding(selected);
    if (JSON.stringify(binding) === JSON.stringify(application.head.selected_original)) {
      ctx.ui.notify("The selected original binding is already current; no revision was added.", "info");
      return;
    }
    let revision = prepareSelectedOriginalRevision(
      this.options,
      application,
      identity2.identity.application_id,
      binding
    );
    for (let file of revision.files) await requireAbsent(file.final);
    assertApplicationCapacity(application, revision.files, revision.revisionAdditions);
    let plan = buildPlan(
      this.options,
      ctx,
      "select_original",
      identity2.identity.application_id,
      identity2,
      attachment.snapshot.sha256,
      application.headFile.sha256,
      revision.files.map((file) => createPreview(file.final, file.bytes)),
      [],
      [workspaceLockPath(configured.root_path), ...revision.files.map((file) => file.temp)],
      [],
      revision.mutationId,
      revision.createdAt
    );
    await approve(plan, ctx) && (await this.commitRevision(plan, ctx, attachment, identity2, revision.files, revision.stateBuffer, async () => {
      let freshScan = await scanLibrary(attachment.snapshot.config);
      freshRecord(freshScan, selected);
    }, {
      directoryPath: application.directoryPath,
      applicationId: identity2.identity.application_id,
      applicationCreatedAt: identity2.identity.created_at,
      companyLabel: identity2.identity.company_label,
      roleLabel: identity2.identity.role_label
    }), ctx.ui.notify(`Recorded selected-original binding in immutable revision ${revision.sequence}; no original bytes were copied or changed.`, "info"));
  }
  async commitRevision(plan, ctx, attachment, identity2, files, stateBuffer, sourceValidation, target) {
    let configured = attachment.snapshot.config.application_workspace, application = attachment.application;
    if (configured === null || application === void 0) throw workflowError("workspace_unavailable");
    let inspectCommitted = async () => {
      let storedIdentity = await readApplicationIdentity(application.directoryPath, application.manifest);
      return inspectApplicationDirectory(
        application.directoryPath,
        configured.root_id,
        path6.basename(application.directoryPath),
        storedIdentity
      );
    };
    await this.withMutationQueues(files.map((file) => file.final), async () => {
      await this.options.beforeWorkspaceLockAcquire?.("record_state", plan.envelope.mutation_id);
      let rootLock = await acquireMutationLock(
        workspaceLockPath(configured.root_path),
        "workspace_mutation_lock",
        plan.envelope.mutation_id,
        plan.createdAt
      ), published = [];
      try {
        await this.afterWorkspaceLockAcquired("record_state", plan.envelope.mutation_id);
        let current = assertSessionPlan(plan, ctx);
        if (identity2 === void 0 != (current === void 0) || identity2 !== void 0 && current?.identity.application_id !== identity2.identity.application_id || target.applicationId !== application.manifest.application_id)
          throw workflowError("workspace_identity_conflict");
        await assertConfigSnapshotCurrent(attachment.snapshot), await assertApplicationWorkspaceDisjoint(attachment.snapshot.config);
        let root = await inspectRoot(configured.root_path, {
          expectedRootId: configured.root_id,
          ownedLock: rootLock.path,
          currentApplication: target
        });
        assertRootPlanCurrent(attachment.root, root);
        let currentApplication = root.currentApplication;
        if (currentApplication === void 0 || currentApplication.headFile.sha256 !== application.headFile.sha256)
          throw workflowError("workspace_drift");
        await sourceValidation(current);
        for (let file of files) await requireAbsent(file.final);
        let revisionAdditions = files.filter((file) => STATE_BASENAME.test(path6.basename(file.final))).length;
        if (assertApplicationCapacity(currentApplication, files, revisionAdditions), ctx.signal?.aborted) throw workflowError("workflow_cancelled");
        for (let file of files) published.push(await publishFile(file.final, file.temp, file.bytes));
        if (await this.options.afterRevisionPublished?.(plan.envelope.mutation_id), (await inspectCommitted()).headFile.sha256 !== hashBytes2(stateBuffer)) throw workflowError("workspace_status_unknown");
      } catch (error) {
        if (await inspectCommitted().then((value) => value.headFile.sha256 === hashBytes2(stateBuffer), () => !1)) return;
        for (let item2 of [...published].reverse()) await unlinkOwned(item2);
        throw error instanceof Error && error.name === "CareerWorkflowError" ? error : workflowError(published.length > 0 ? "workspace_status_unknown" : "workspace_verification_failed");
      } finally {
        await releaseMutationLock(rootLock);
      }
    });
  }
};

// src/managed/schema.ts
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
var RAW_TOOL_NAMES = [
  "career_core_discover",
  "career_core_resume",
  "career_core_job"
], MANAGED_TOOL_NAME = "career_run", CAREER_RUN_COMMANDS = [
  "context",
  "consent",
  "analyze",
  "match",
  "suggestion-review",
  "replacement-review",
  "variant-review",
  "materialize",
  "detail"
], DETAIL_SECTIONS = [
  "summary",
  "warnings",
  "checks",
  "evidence",
  "changes",
  "document",
  "raw"
], careerRunParameters = Type.Object({
  command: StringEnum(CAREER_RUN_COMMANDS),
  handle: Type.Optional(Type.String({
    pattern: "^(resume|result|review|variant):[a-f0-9-]{8,64}$",
    maxLength: 80
  })),
  payload: Type.Optional(Type.Unknown({
    description: "Native command payload; never a JSON string or complete Core envelope."
  }))
}, { additionalProperties: !1 });

// src/workflow/session-model-surface.ts
var CAREER_MODEL_TOOL_NAMES = [MANAGED_TOOL_NAME, ...RAW_TOOL_NAMES], INACTIVE_CAREER_MODEL_SURFACE = {
  careerRunActive: !1,
  skillDiscoverable: !1
}, ACTIVE_MANAGED_CAREER_MODEL_SURFACE = {
  careerRunActive: !0,
  skillDiscoverable: !0
};
async function resolveCareerModelSurface(branchEntries, allEntries = branchEntries, validateAttachment) {
  let records = replayApplicationSessionRecords(branchEntries, allEntries);
  if (records.integrity !== "valid" || records.attachment === void 0 || records.activation === void 0 || validateAttachment === void 0) return INACTIVE_CAREER_MODEL_SURFACE;
  try {
    await validateAttachment(records.attachment);
  } catch {
    return INACTIVE_CAREER_MODEL_SURFACE;
  }
  return ACTIVE_MANAGED_CAREER_MODEL_SURFACE;
}
function applyCareerToolSurface(getActiveTools, setActiveTools, surface, includeRaw = !1) {
  let next = [...getActiveTools().filter(
    (name) => !CAREER_MODEL_TOOL_NAMES.includes(name)
  )];
  surface.careerRunActive && next.push(MANAGED_TOOL_NAME), surface.careerRunActive && includeRaw && next.push(...RAW_TOOL_NAMES), setActiveTools([...new Set(next)]);
}

// src/managed/errors.ts
var MESSAGES = {
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
  assistance_required: "Career assistance is inactive in this session.",
  variant_save_unavailable: "The materialized variant is unavailable, stale, or ineligible for local saving.",
  variant_save_destination_invalid: "The managed variants destination is unavailable or does not meet the private-directory contract.",
  variant_save_preview_changed: "The exact save preview changed or was cancelled; no file was written.",
  variant_save_collision: "A save destination already exists; no existing file was replaced.",
  variant_save_verification_failed: "The saved variant could not be verified as an excluded assisted artifact.",
  variant_save_status_unknown: "The save reached an indeterminate local-filesystem state; inspect the approved destination before retrying."
}, CareerRunError = class extends Error {
  code;
  constructor(code) {
    super(JSON.stringify({
      schema_version: "pi.career.run_error.v1",
      code,
      message: MESSAGES[code]
    })), this.name = "CareerRunError", this.code = code;
  }
};
function careerRunErrorMessage(code) {
  return MESSAGES[code];
}
function careerRunError(code) {
  return new CareerRunError(code);
}
function managedFailure(error) {
  return error instanceof CareerRunError ? error : error instanceof Error && error.message === "managed_contract_invalid" ? careerRunError("managed_contract_invalid") : error instanceof Error && error.message === "managed_payload_invalid" ? careerRunError("invalid_request") : careerRunError("managed_result_invalid");
}

// src/managed/proposals.ts
var SECTIONS = /* @__PURE__ */ new Set([
  "contact",
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "other"
]);
function isRecord8(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function hasExactKeys(value, keys) {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function boundedString(value, minimum, maximum) {
  if (typeof value != "string") return !1;
  let length = [...value].length;
  return length >= minimum && length <= maximum;
}
function boundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
function stringList(value, minimum, maximum, itemMaximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || !value.every((item2) => boundedString(item2, 1, itemMaximum))) return;
  let strings = value;
  return new Set(strings).size === strings.length ? [...strings] : void 0;
}
function parseVariantChange(value) {
  if (!isRecord8(value) || !hasExactKeys(value, [
    "section",
    "start_line",
    "end_line",
    "original_text",
    "proposed_text",
    "resume_evidence",
    "vacancy_evidence"
  ])) return;
  let resumeEvidence = stringList(value.resume_evidence, 1, 5, 300), vacancyEvidence = stringList(value.vacancy_evidence, 1, 5, 300);
  if (!(typeof value.section != "string" || !SECTIONS.has(value.section) || !boundedInteger(value.start_line, 1, 2e3) || !boundedInteger(value.end_line, 1, 2e3) || !boundedString(value.original_text, 1, 1e4) || !boundedString(value.proposed_text, 0, 1e4) || resumeEvidence === void 0 || vacancyEvidence === void 0))
    return {
      section: value.section,
      start_line: value.start_line,
      end_line: value.end_line,
      original_text: value.original_text,
      proposed_text: value.proposed_text,
      resume_evidence: resumeEvidence,
      vacancy_evidence: vacancyEvidence
    };
}
function parseAnalysisSuggestion(value) {
  if (!isRecord8(value) || !hasExactKeys(value, [
    "basis_check_id",
    "start_line",
    "end_line",
    "source_target",
    "source_evidence",
    "suggestion"
  ])) return;
  let evidence = stringList(value.source_evidence, 1, 2, 240);
  if (!(!boundedString(value.basis_check_id, 1, 100) || !/^[a-z0-9_]+$/.test(value.basis_check_id) || !boundedInteger(value.start_line, 1, 2e3) || !boundedInteger(value.end_line, 1, 2e3) || !boundedString(value.source_target, 1, 500) || evidence === void 0 || !boundedString(value.suggestion, 1, 600)))
    return {
      basis_check_id: value.basis_check_id,
      start_line: value.start_line,
      end_line: value.end_line,
      source_target: value.source_target,
      source_evidence: evidence,
      suggestion: value.suggestion
    };
}
function parseAnalysisReplacement(value) {
  if (!isRecord8(value) || !hasExactKeys(value, [
    "basis_check_id",
    "start_line",
    "end_line",
    "source_target",
    "source_evidence",
    "proposed_replacement"
  ])) return;
  let evidence = stringList(value.source_evidence, 1, 2, 240);
  if (!(!boundedString(value.basis_check_id, 1, 100) || !/^[a-z0-9_]+$/.test(value.basis_check_id) || !boundedInteger(value.start_line, 1, 2e3) || !boundedInteger(value.end_line, 1, 2e3) || !boundedString(value.source_target, 1, 500) || evidence === void 0 || !boundedString(value.proposed_replacement, 0, 600)))
    return {
      basis_check_id: value.basis_check_id,
      start_line: value.start_line,
      end_line: value.end_line,
      source_target: value.source_target,
      source_evidence: evidence,
      proposed_replacement: value.proposed_replacement
    };
}
function parseVariantChanges(payload) {
  if (!isRecord8(payload) || !hasExactKeys(payload, ["changes"]) || !Array.isArray(payload.changes) || payload.changes.length > 50)
    throw new Error("managed_payload_invalid");
  let changes = payload.changes.map(parseVariantChange);
  if (changes.some((change) => change === void 0)) throw new Error("managed_payload_invalid");
  return changes;
}
function parseAnalysisSuggestions(payload) {
  if (!isRecord8(payload) || !hasExactKeys(payload, ["suggestions"]) || !Array.isArray(payload.suggestions) || payload.suggestions.length > 3)
    throw new Error("managed_payload_invalid");
  let suggestions = payload.suggestions.map(parseAnalysisSuggestion);
  if (suggestions.some((suggestion) => suggestion === void 0))
    throw new Error("managed_payload_invalid");
  return suggestions;
}
function parseAnalysisReplacements(payload) {
  if (!isRecord8(payload) || !hasExactKeys(payload, ["replacements"]) || !Array.isArray(payload.replacements) || payload.replacements.length > 3)
    throw new Error("managed_payload_invalid");
  let replacements = payload.replacements.map(parseAnalysisReplacement);
  if (replacements.some((replacement) => replacement === void 0))
    throw new Error("managed_payload_invalid");
  return replacements;
}
function parseSelectedChangeIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50 || !value.every((item2) => typeof item2 == "string" && /^change-[0-9]{4}$/.test(item2)) || new Set(value).size !== value.length) throw new Error("managed_payload_invalid");
  return [...value];
}

// src/managed/registry.ts
var HANDLE_SUFFIX_PATTERN = /^[a-f0-9-]{8,64}$/;
function handlePrefix(kind) {
  return kind === "review" ? "review" : kind === "variant" ? "variant" : "result";
}
function entryBytes(entry) {
  return Buffer.byteLength(entry.json, "utf8") + (entry.reviewInput === void 0 ? 0 : Buffer.byteLength(JSON.stringify(entry.reviewInput), "utf8")) + (entry.variantSource === void 0 ? 0 : Buffer.byteLength(JSON.stringify(entry.variantSource), "utf8"));
}
var ManagedRegistry = class {
  constructor(uuid, now) {
    this.uuid = uuid;
    this.now = now;
  }
  uuid;
  now;
  sessionId;
  contextReady = !1;
  entries = /* @__PURE__ */ new Map();
  totalBytes = 0;
  enterSession(sessionId) {
    this.sessionId !== sessionId && (this.clear(), this.sessionId = sessionId);
  }
  resetSession(sessionId) {
    this.clear(), this.sessionId = sessionId;
  }
  markContextReady(sessionId) {
    this.enterSession(sessionId), this.contextReady = !0;
  }
  hasContext(sessionId) {
    return this.sessionId === sessionId && this.contextReady;
  }
  store(entry) {
    let bytes = entryBytes(entry);
    if (bytes > 67108864) throw new Error("managed_result_capacity");
    for (; this.entries.size >= 16 || this.totalBytes + bytes > 67108864; ) {
      let oldest = this.entries.keys().next().value;
      if (oldest === void 0) break;
      this.delete(oldest);
    }
    let handle;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let suffix = this.uuid().toLowerCase().replace(/[^a-f0-9-]/g, "").slice(0, 24);
      if (!HANDLE_SUFFIX_PATTERN.test(suffix)) throw new Error("managed_result_capacity");
      let candidate = `${handlePrefix(entry.kind)}:${suffix}`;
      if (!this.entries.has(candidate)) {
        handle = candidate;
        break;
      }
    }
    if (handle === void 0) throw new Error("managed_result_capacity");
    let stored = {
      ...entry,
      handle,
      createdAt: this.now().getTime(),
      bytes
    };
    return this.entries.set(handle, stored), this.totalBytes += bytes, stored;
  }
  get(handle, kind) {
    let entry = this.entries.get(handle);
    if (!(entry === void 0 || kind !== void 0 && entry.kind !== kind))
      return entry;
  }
  clear() {
    this.entries.clear(), this.totalBytes = 0, this.contextReady = !1, this.sessionId = void 0;
  }
  delete(handle) {
    let entry = this.entries.get(handle);
    entry !== void 0 && (this.totalBytes -= entry.bytes, this.entries.delete(handle));
  }
};

// src/managed/engine.ts
var MODEL_DETAIL_MAX_BYTES = 5e4;
function isRecord9(value) {
  return value !== null && typeof value == "object" && !Array.isArray(value);
}
function stringArray(value) {
  return Array.isArray(value) && value.every((item2) => typeof item2 == "string");
}
function validVariantSelectionChange(value, expectedId) {
  return isRecord9(value) ? [
    value.change_id === expectedId,
    typeof value.section == "string",
    Number.isSafeInteger(value.start_line),
    Number.isSafeInteger(value.end_line),
    typeof value.original_text == "string",
    typeof value.proposed_text == "string",
    stringArray(value.resume_evidence),
    stringArray(value.vacancy_evidence)
  ].every(Boolean) : !1;
}
function variantSelectionChange(value, expectedId) {
  if (validVariantSelectionChange(value, expectedId))
    return {
      change_id: expectedId,
      section: value.section,
      start_line: value.start_line,
      end_line: value.end_line,
      original_text: value.original_text,
      proposed_text: value.proposed_text,
      resume_evidence: [...value.resume_evidence],
      vacancy_evidence: [...value.vacancy_evidence]
    };
}
function arrayField2(value, field) {
  let found = value[field];
  if (!Array.isArray(found)) throw careerRunError("managed_result_invalid");
  return found;
}
function warnings(value) {
  return arrayField2(value, "warnings");
}
function exactDefinedKeys(params, allowed) {
  if (Object.entries(params).filter(([, value]) => value !== void 0).map(([key]) => key).some((key) => !allowed.includes(key))) throw careerRunError("invalid_request");
}
function parseConsentDecision(payload) {
  if (payload !== "approve" && payload !== "decline") throw careerRunError("invalid_request");
  return payload;
}
function parseMaterializeRequest(payload) {
  if (!isRecord9(payload) || Object.keys(payload).join("") !== "selected_change_ids")
    throw careerRunError("invalid_request");
  return parseSelectedChangeIds(payload.selected_change_ids);
}
function parseDetailRequest(payload) {
  if (!isRecord9(payload)) throw careerRunError("invalid_request");
  let keys = Object.keys(payload).sort().join("\0");
  if (keys !== "section" && keys !== "item\0section") throw careerRunError("invalid_request");
  if (!DETAIL_SECTIONS.includes(payload.section))
    throw careerRunError("invalid_request");
  if (payload.item !== void 0 && (typeof payload.item != "string" || !/^(change|suggestion|replacement)-[0-9]{4}$/.test(payload.item)))
    throw careerRunError("invalid_request");
  return {
    section: payload.section,
    ...payload.item === void 0 ? {} : { item: payload.item }
  };
}
function resultEnvelope(command, body, details) {
  let text = JSON.stringify({ schema_version: "pi.career.run_result.v1", command, ...body });
  if (Buffer.byteLength(text, "utf8") > MODEL_DETAIL_MAX_BYTES)
    throw careerRunError("detail_too_large");
  return {
    content: [{ type: "text", text }],
    details: { schema_version: "pi.career.run_details.v1", command, ...details }
  };
}
function resumeHandles(records) {
  let shortCounts = /* @__PURE__ */ new Map();
  for (let record of records) {
    let short = record.id.slice(0, 16);
    shortCounts.set(short, (shortCounts.get(short) ?? 0) + 1);
  }
  return new Map(records.map((record) => {
    let short = record.id.slice(0, 16);
    return [`resume:${shortCounts.get(short) === 1 ? short : record.id.slice(0, 24)}`, record];
  }));
}
function persisted(ctx) {
  return ctx.sessionManager.getSessionFile() !== void 0;
}
function persistenceConsent(ctx) {
  if (!persisted(ctx)) return "not_required";
  let consent = reconstructWorkflowState(ctx.sessionManager.getBranch()).consent;
  return consent?.granted === !0 ? "approved" : consent?.granted === !1 ? "declined" : "required";
}
function requireConsent(ctx) {
  let consent = persistenceConsent(ctx);
  if (consent === "required") throw careerRunError("consent_required");
  if (consent === "declined") throw careerRunError("consent_declined");
}
async function currentResumes(agentDir) {
  let config = await loadConfig(agentDir), scan = await scanLibrary(config);
  return resumeHandles(eligibleOriginals(scan));
}
function mapAttachedCareerError(error) {
  if (error instanceof CareerWorkflowError) {
    if (error.code === "attachment_unavailable" || error.code === "workspace_identity_conflict")
      throw careerRunError("assistance_required");
    if (error.code === "workspace_drift") throw careerRunError("resume_not_found");
  }
  throw error;
}
async function preflightCareerSessionRecords(agentDir, ctx) {
  let allEntries = typeof ctx.sessionManager.getEntries == "function" ? ctx.sessionManager.getEntries() : ctx.sessionManager.getBranch();
  if (!allEntries.some((entry) => entry.type === "custom" && (entry.customType === APPLICATION_ATTACHMENT_CUSTOM_TYPE || entry.customType === APPLICATION_ASSISTANCE_CUSTOM_TYPE))) return;
  let branch = ctx.sessionManager.getBranch(), records = replayApplicationSessionRecords(branch, allEntries);
  if (records.integrity !== "valid") throw careerRunError("assistance_required");
  if (records.attachment !== void 0) {
    if (records.activation === void 0) throw careerRunError("assistance_required");
    try {
      await loadAttachedApplicationSources(agentDir, records.attachment);
    } catch (error) {
      throw error instanceof CareerWorkflowError && (error.code === "attachment_unavailable" || error.code === "workspace_identity_conflict" || error.code === "workspace_drift") ? careerRunError("assistance_required") : error;
    }
  }
}
async function attachedCareerSources(agentDir, ctx) {
  let branch = ctx.sessionManager.getBranch(), allEntries = typeof ctx.sessionManager.getEntries == "function" ? ctx.sessionManager.getEntries() : branch, records = replayApplicationSessionRecords(branch, allEntries);
  if (!(records.integrity !== "valid" || records.attachment === void 0)) {
    if (records.activation === void 0) throw careerRunError("assistance_required");
    try {
      return await loadAttachedApplicationSources(agentDir, records.attachment);
    } catch (error) {
      return mapAttachedCareerError(error);
    }
  }
}
function attachedResumeHandles(sources) {
  let records = [
    ...sources.selected_original === void 0 ? [] : [sources.selected_original],
    ...sources.effective_resume === void 0 || sources.effective_resume.id === sources.selected_original?.id ? [] : [sources.effective_resume]
  ];
  return resumeHandles(records);
}
async function resolveResume(agentDir, ctx, registry, handle, role = "analyze") {
  if (!registry.hasContext(ctx.sessionManager.getSessionId())) throw careerRunError("context_required");
  if (handle === void 0) throw careerRunError("invalid_request");
  let attached = await attachedCareerSources(agentDir, ctx);
  if (attached !== void 0) {
    let required = role === "match" ? attached.effective_resume : attached.selected_original;
    if (required === void 0) throw careerRunError("resume_not_found");
    let found = attachedResumeHandles(attached).get(handle);
    if (found === void 0 || found.id !== required.id) throw careerRunError("resume_not_found");
    return found;
  }
  let resume = (await currentResumes(agentDir)).get(handle);
  if (resume === void 0) throw careerRunError("resume_not_found");
  return resume;
}
async function resolveVacancy(agentDir, ctx) {
  let attached = await attachedCareerSources(agentDir, ctx);
  if (attached !== void 0) {
    if (attached.vacancy === void 0) throw careerRunError("vacancy_not_found");
    return attached.vacancy;
  }
  let vacancy = reconstructWorkflowState(ctx.sessionManager.getBranch()).vacancy;
  if (vacancy === void 0) throw careerRunError("vacancy_not_found");
  return vacancy;
}
function ensureSchema(value, schema) {
  if (value.schema_version !== schema) throw careerRunError("managed_result_invalid");
}
function safeSummary(value) {
  return typeof value == "number" || typeof value == "string" ? String(value) : "complete";
}
function compactAnalyze(result) {
  let projection = projectResumeAnalysis(result);
  return {
    result_schema: result.schema_version,
    overall_score: projection.summary.overall_score,
    category_scores: projection.summary.category_scores,
    confidence_context: projection.summary.confidence_context,
    top_strengths: projection.summary.top_strengths,
    top_weaknesses: projection.summary.top_weaknesses,
    improvement_actions: projection.summary.improvement_actions,
    warnings: warnings(result)
  };
}
function compactMatch(result) {
  let projection = projectJobMatch(result);
  return {
    result_schema: result.schema_version,
    overall_score: projection.summary.overall_score,
    category_scores: projection.summary.category_scores,
    confidence_context: projection.summary.confidence_context,
    top_strengths: projection.summary.top_strengths,
    top_gaps: projection.summary.top_gaps,
    recommendation: projection.summary.recommendation,
    warnings: warnings(result)
  };
}
function validateAuthority(result) {
  if (result.authority !== "assisted_non_authoritative")
    throw careerRunError("managed_result_invalid");
}
function compactSuggestionReview(result) {
  return ensureSchema(result, "career.resume_analysis_suggestion_review.v1"), validateAuthority(result), {
    result_schema: result.schema_version,
    authority: result.authority,
    suggestions: arrayField2(result, "suggestions"),
    discarded_suggestions: arrayField2(result, "discarded_suggestions"),
    warnings: warnings(result)
  };
}
function compactReplacementReview(result) {
  return ensureSchema(result, "career.resume_analysis_replacement_review.v1"), validateAuthority(result), {
    result_schema: result.schema_version,
    authority: result.authority,
    replacements: arrayField2(result, "replacements"),
    discarded_replacements: arrayField2(result, "discarded_replacements"),
    warnings: warnings(result)
  };
}
function compactCanonicalChanges(changes) {
  return changes.map((change) => isRecord9(change) ? {
    change_id: change.change_id,
    section: change.section,
    start_line: change.start_line,
    end_line: change.end_line
  } : change);
}
function compactVariantReview(result) {
  ensureSchema(result, "career.resume_variant_review.v1"), validateAuthority(result);
  let changes = arrayField2(result, "changes");
  return {
    result_schema: result.schema_version,
    authority: result.authority,
    retained_change_count: changes.length,
    changes: compactCanonicalChanges(changes),
    discarded_changes: arrayField2(result, "discarded_changes"),
    warnings: warnings(result),
    detail_guidance: "Use career_run detail with section=changes; add item=change-NNNN for one exact canonical change."
  };
}
function compactVariant(result) {
  ensureSchema(result, "career.resume_variant.v1"), validateAuthority(result);
  let selected = arrayField2(result, "selected_changes");
  return {
    result_schema: result.schema_version,
    authority: result.authority,
    selected_change_count: selected.length,
    selected_changes: compactCanonicalChanges(selected),
    warnings: warnings(result),
    detail_guidance: "Use career_run detail with section=document for assisted text or section=changes plus an item for one canonical change."
  };
}
function evidenceDetail(value) {
  let analysis = isRecord9(value.baseline_analysis) ? value.baseline_analysis : value;
  return (isRecord9(analysis) && Array.isArray(analysis.checks) ? analysis.checks : []).flatMap((check) => isRecord9(check) && Array.isArray(check.evidence) ? [{ check_id: check.check_id, evidence: check.evidence }] : []);
}
var DETAIL_SUMMARIES = {
  "resume.analyze": compactAnalyze,
  "job.match": compactMatch,
  "resume.analysis-suggestions.review": compactSuggestionReview,
  "resume.analysis-replacements.review": compactReplacementReview,
  "resume.variant.review": compactVariantReview,
  "resume.variant.materialize": compactVariant
};
function analysisChecks(value) {
  let analysis = isRecord9(value.baseline_analysis) ? value.baseline_analysis : value;
  return isRecord9(analysis) && Array.isArray(analysis.checks) ? analysis.checks : [];
}
function reviewedItems(value) {
  let items = value.changes ?? value.suggestions ?? value.replacements ?? value.selected_changes ?? [];
  if (!Array.isArray(items)) throw careerRunError("managed_result_invalid");
  return items;
}
function exactReviewedItem(items, item2) {
  let found = items.find((candidate) => isRecord9(candidate) && (candidate.change_id === item2 || candidate.suggestion_id === item2 || candidate.replacement_id === item2));
  if (found === void 0) throw careerRunError("result_not_found");
  return found;
}
function detailValue(entry, request) {
  let value = entry.value;
  if (request.section === "summary")
    return DETAIL_SUMMARIES[entry.operation]?.(value) ?? { schema_version: value.schema_version };
  if (request.section === "warnings") return warnings(value);
  if (request.section === "checks") return analysisChecks(value);
  if (request.section === "evidence") return evidenceDetail(value);
  if (request.section === "changes") {
    let items = reviewedItems(value);
    return request.item === void 0 ? items : exactReviewedItem(items, request.item);
  }
  if (request.section === "document")
    return value.assisted_resume_text ?? value.proposed_preview_text ?? null;
  if (request.section === "raw") return value;
  throw careerRunError("invalid_request");
}
function mapInternalError(error) {
  throw error instanceof CareerRunError || error instanceof CareerInvocationError ? error : error instanceof Error && error.message === "session_changed" ? careerRunError("session_changed") : error instanceof Error && error.message === "managed_result_capacity" ? careerRunError("managed_result_capacity") : managedFailure(error);
}
function selectableVariantReview(review) {
  if (review === void 0) throw careerRunError("review_not_found");
  if (![review.operation === "resume.variant.review", review.retainedChangeIds !== void 0].every(Boolean))
    throw careerRunError("review_not_found");
  if (review.materializationAllowed !== !0) throw careerRunError("pdf_materialization_unsupported");
  return ensureSchema(review.value, "career.resume_variant_review.v1"), validateAuthority(review.value), review;
}
function selectableVariantChanges(review) {
  let values = arrayField2(review.value, "changes");
  if (values.length !== review.retainedChangeIds.length) throw careerRunError("managed_result_invalid");
  let changes = values.map((value, index) => variantSelectionChange(value, review.retainedChangeIds[index]));
  if (changes.some((change) => change === void 0)) throw careerRunError("managed_result_invalid");
  return changes;
}
var CareerRunEngine = class {
  constructor(options) {
    this.options = options;
    this.registry = new ManagedRegistry(options.uuid, options.now), this.dependencies = {
      agentDir: options.agentDir,
      invoke: options.invoke,
      uuid: options.uuid,
      now: options.now
    };
  }
  options;
  registry;
  contracts = new ManagedContractCache();
  dependencies;
  enterSession(sessionId) {
    this.registry.enterSession(sessionId);
  }
  resetSession(sessionId) {
    this.registry.resetSession(sessionId);
  }
  shutdown() {
    this.registry.clear();
  }
  materializedVariantForSave(handle, ctx) {
    try {
      let sessionId = ctx.sessionManager.getSessionId();
      if (this.registry.enterSession(sessionId), requireConsent(ctx), !this.registry.hasContext(sessionId)) throw careerRunError("context_required");
      let entry = this.registry.get(handle, "variant");
      if (entry === void 0 || entry.operation !== "resume.variant.materialize" || entry.variantSource === void 0) throw careerRunError("variant_save_unavailable");
      ensureSchema(entry.value, "career.resume_variant.v1"), validateAuthority(entry.value);
      let assistedText = entry.value.assisted_resume_text, selected = arrayField2(entry.value, "selected_changes");
      if (typeof assistedText != "string" || selected.length === 0)
        throw careerRunError("managed_result_invalid");
      let selectedChangeIds = selected.map((change) => isRecord9(change) && typeof change.change_id == "string" ? change.change_id : "");
      if (selectedChangeIds.some((id) => !/^change-[0-9]{4}$/.test(id)))
        throw careerRunError("managed_result_invalid");
      return {
        handle: entry.handle,
        assistedText,
        selectedChangeIds,
        source: { ...entry.variantSource }
      };
    } catch (error) {
      mapInternalError(error);
    }
  }
  variantSelectionReview(handle, ctx) {
    try {
      let sessionId = ctx.sessionManager.getSessionId();
      if (this.registry.enterSession(sessionId), requireConsent(ctx), !this.registry.hasContext(sessionId)) throw careerRunError("context_required");
      let review = selectableVariantReview(this.registry.get(handle, "review"));
      return {
        handle: review.handle,
        authority: "assisted_non_authoritative",
        changes: selectableVariantChanges(review),
        discarded_changes: arrayField2(review.value, "discarded_changes"),
        warnings: warnings(review.value)
      };
    } catch (error) {
      mapInternalError(error);
    }
  }
  async run(params, signal, ctx) {
    try {
      this.registry.enterSession(ctx.sessionManager.getSessionId()), exactDefinedKeys(params, ["command", "handle", "payload"]);
      try {
        await preflightCareerSessionRecords(this.options.agentDir, ctx);
      } catch (error) {
        throw this.registry.resetSession(ctx.sessionManager.getSessionId()), applyCareerToolSurface(
          () => this.options.pi.getActiveTools(),
          (names) => this.options.pi.setActiveTools(names),
          INACTIVE_CAREER_MODEL_SURFACE
        ), this.options.onUnavailable?.(), error;
      }
      let managed = await this.contracts.load(this.options.invoke, signal);
      switch (params.command) {
        case "context":
          return await this.context(params, ctx, managed.coreVersion);
        case "consent":
          return this.consent(params, ctx);
        case "analyze":
          return await this.analyze(params, signal, ctx);
        case "match":
          return await this.match(params, signal, ctx);
        case "suggestion-review":
          return await this.suggestionReview(params, signal, ctx);
        case "replacement-review":
          return await this.replacementReview(params, signal, ctx);
        case "variant-review":
          return await this.variantReview(params, signal, ctx);
        case "materialize":
          return await this.materialize(params, signal, ctx);
        case "detail":
          return this.detail(params, ctx);
      }
    } catch (error) {
      mapInternalError(error);
    }
  }
  consent(params, ctx) {
    if (exactDefinedKeys(params, ["command", "payload"]), !persisted(ctx)) throw careerRunError("invalid_request");
    let granted = parseConsentDecision(params.payload) === "approve";
    return this.options.pi.appendEntry(
      WORKFLOW_CUSTOM_TYPE,
      createConsentEntry(granted, this.dependencies)
    ), granted || this.registry.resetSession(ctx.sessionManager.getSessionId()), resultEnvelope("consent", {
      persistence: "persistent",
      consent: granted ? "approved" : "declined",
      next_action: granted ? "Run career_run context." : "Start a new `pi --no-session` run."
    }, {
      status: "complete",
      summary: granted ? "Session persistence approved" : "Session persistence declined"
    });
  }
  async context(params, ctx, coreVersion) {
    exactDefinedKeys(params, ["command"]);
    let consent = persistenceConsent(ctx);
    if (consent === "required" || consent === "declined")
      return this.consentRequiredContext(coreVersion, consent);
    let attached = await attachedCareerSources(this.options.agentDir, ctx), config = await loadConfig(this.options.agentDir), scan = await scanLibrary(config), resumes = attached === void 0 ? resumeHandles(eligibleOriginals(scan)) : attachedResumeHandles(attached), state = reconstructWorkflowState(ctx.sessionManager.getBranch()), vacancy = attached === void 0 ? state.vacancy : attached.vacancy, application = attached === void 0 ? state.application === void 0 ? null : { company: state.application.company_label, role: state.application.role_label } : { company: attached.company_label, role: attached.role_label };
    return this.registry.markContextReady(ctx.sessionManager.getSessionId()), resultEnvelope("context", {
      core_version: coreVersion,
      persistence: persisted(ctx) ? "persistent" : "transient",
      consent,
      resume_count: resumes.size,
      resumes: [...resumes].slice(0, 100).map(([handle, resume]) => ({
        handle,
        label: resume.label,
        format: resume.format
      })),
      resumes_omitted: Math.max(0, resumes.size - 100),
      vacancy: vacancy === void 0 ? null : { handle: "vacancy:current", label: vacancy.vacancy_label },
      application,
      notices: scan.warnings.length
    }, {
      status: "ready",
      summary: `${resumes.size} original resume${resumes.size === 1 ? "" : "s"}`
    });
  }
  consentRequiredContext(coreVersion, consent) {
    return resultEnvelope("context", {
      core_version: coreVersion,
      persistence: "persistent",
      consent: consent === "required" ? "consent_required" : "declined",
      resumes: [],
      next_action: consent === "required" ? "Ask whether this Pi session may persist private career content, then call career_run consent. Recommend `pi --no-session` when persistence is unwanted." : "Start a new `pi --no-session` run."
    }, {
      status: "consent_required",
      summary: consent === "required" ? "Persistence decision required" : "Persistence declined"
    });
  }
  preparePrivateCommand(params, ctx) {
    if (requireConsent(ctx), !this.registry.hasContext(ctx.sessionManager.getSessionId()))
      throw careerRunError("context_required");
  }
  async analyze(params, signal, ctx) {
    exactDefinedKeys(params, ["command", "handle"]), this.preparePrivateCommand(params, ctx);
    let resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle), invocation = await this.options.invoke(
      { kind: "resume", operation: "analyze", inputJson: serializeCoreInput(buildResumeInput(resume)) },
      signal,
      MANAGED_INVOKE_OPTIONS
    ), value = parseCoreJson(invocation.json);
    ensureSchema(value, "career.resume_analysis.v1");
    let entry = this.registry.store({
      kind: "result",
      operation: "resume.analyze",
      json: invocation.json,
      value
    }), summary = compactAnalyze(value);
    return resultEnvelope("analyze", { result: entry.handle, ...summary }, {
      status: "complete",
      handle: entry.handle,
      summary: `Score ${safeSummary(summary.overall_score)}`
    });
  }
  async match(params, signal, ctx) {
    exactDefinedKeys(params, ["command", "handle"]), this.preparePrivateCommand(params, ctx);
    let resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle, "match"), vacancy = await resolveVacancy(this.options.agentDir, ctx), current = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle, "match");
    if (current.id !== resume.id || current.text_sha256 !== resume.text_sha256 || current.text !== resume.text) throw careerRunError("resume_not_found");
    let invocation = await this.options.invoke(
      { kind: "job", operation: "match", inputJson: serializeCoreInput(buildJobMatchInput(current, vacancy)) },
      signal,
      MANAGED_INVOKE_OPTIONS
    ), value = parseCoreJson(invocation.json);
    ensureSchema(value, "career.job_match.v1");
    let entry = this.registry.store({
      kind: "result",
      operation: "job.match",
      json: invocation.json,
      value
    }), summary = compactMatch(value);
    return resultEnvelope("match", { result: entry.handle, ...summary }, {
      status: "complete",
      handle: entry.handle,
      summary: `Match ${safeSummary(summary.overall_score)}`
    });
  }
  async suggestionReview(params, signal, ctx) {
    exactDefinedKeys(params, ["command", "handle", "payload"]), this.preparePrivateCommand(params, ctx);
    let resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle), input = {
      schema_version: "career.resume_analysis_suggestion_review_input.v1",
      expected_analysis_policy_version: "resume_analysis_v1",
      resume: buildResumeInput(resume),
      proposal: {
        schema_version: "career.resume_analysis_suggestion_proposal.v1",
        suggestions: parseAnalysisSuggestions(params.payload)
      }
    }, invocation = await this.options.invoke(
      { kind: "resume", operation: "analysis-suggestions-review", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS
    ), value = parseCoreJson(invocation.json), summary = compactSuggestionReview(value), entry = this.registry.store({
      kind: "review",
      operation: "resume.analysis-suggestions.review",
      json: invocation.json,
      value
    });
    return resultEnvelope("suggestion-review", { review: entry.handle, ...summary }, {
      status: "complete",
      handle: entry.handle,
      summary: `${arrayField2(value, "suggestions").length} retained suggestion(s)`
    });
  }
  async replacementReview(params, signal, ctx) {
    exactDefinedKeys(params, ["command", "handle", "payload"]), this.preparePrivateCommand(params, ctx);
    let resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle), input = {
      schema_version: "career.resume_analysis_replacement_review_input.v1",
      expected_analysis_policy_version: "resume_analysis_v1",
      resume: buildResumeInput(resume),
      proposal: {
        schema_version: "career.resume_analysis_replacement_proposal.v1",
        replacements: parseAnalysisReplacements(params.payload)
      }
    }, invocation = await this.options.invoke(
      { kind: "resume", operation: "analysis-replacements-review", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS
    ), value = parseCoreJson(invocation.json), summary = compactReplacementReview(value), entry = this.registry.store({
      kind: "review",
      operation: "resume.analysis-replacements.review",
      json: invocation.json,
      value
    });
    return resultEnvelope("replacement-review", { review: entry.handle, ...summary }, {
      status: "complete",
      handle: entry.handle,
      summary: `${arrayField2(value, "replacements").length} retained replacement(s)`
    });
  }
  async variantReview(params, signal, ctx) {
    exactDefinedKeys(params, ["command", "handle", "payload"]), this.preparePrivateCommand(params, ctx);
    let resume = await resolveResume(this.options.agentDir, ctx, this.registry, params.handle, "match"), vacancy = await resolveVacancy(this.options.agentDir, ctx), input = {
      schema_version: "career.resume_variant_review_input.v1",
      resume: buildResumeInput(resume),
      vacancy: {
        schema_version: "career.job_input.v1",
        text: vacancy.vacancy_text,
        metadata: { document_id: vacancy.state_id }
      },
      proposal: {
        schema_version: "career.resume_variant_proposal.v1",
        changes: parseVariantChanges(params.payload)
      }
    }, invocation = await this.options.invoke(
      { kind: "resume", operation: "variant-review", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS
    ), value = parseCoreJson(invocation.json), summary = compactVariantReview(value), retainedChangeIds = this.retainedChangeIds(value), entry = this.registry.store({
      kind: "review",
      operation: "resume.variant.review",
      json: invocation.json,
      value,
      reviewInput: input,
      retainedChangeIds,
      materializationAllowed: resume.format !== "pdf",
      variantSource: {
        resumeId: resume.id,
        rootId: resume.root_id,
        format: resume.format,
        textSha256: resume.text_sha256
      }
    });
    return resultEnvelope("variant-review", {
      review: entry.handle,
      ...summary,
      next_action: resume.format === "pdf" ? "Stop this turn. Present the reviewed changes as manual-application guidance only; extracted PDF text cannot be materialized as a styled resume." : `Stop this turn. In TUI, ask the user to run /career-review ${entry.handle}; otherwise show exact change details and ask for explicit canonical IDs. Only a later user turn may materialize the selected IDs.`
    }, {
      status: "complete",
      handle: entry.handle,
      action: resume.format === "pdf" ? "pdf_manual" : "review_select",
      summary: resume.format === "pdf" ? `${retainedChangeIds.length} retained change(s) • PDF manual application only` : `${retainedChangeIds.length} retained change(s) • explicit selection required`
    });
  }
  retainedChangeIds(value) {
    let changes = arrayField2(value, "changes"), ids = changes.flatMap(
      (change) => isRecord9(change) && typeof change.change_id == "string" ? [change.change_id] : []
    );
    if (ids.length !== changes.length || new Set(ids).size !== ids.length || ids.some((id) => !/^change-[0-9]{4}$/.test(id))) throw careerRunError("managed_result_invalid");
    return ids;
  }
  async materialize(params, signal, ctx) {
    if (exactDefinedKeys(params, ["command", "handle", "payload"]), this.preparePrivateCommand(params, ctx), params.handle === void 0) throw careerRunError("invalid_request");
    let review = this.registry.get(params.handle, "review");
    if (review === void 0 || review.operation !== "resume.variant.review" || review.reviewInput === void 0 || review.retainedChangeIds === void 0)
      throw careerRunError("review_not_found");
    if (review.materializationAllowed !== !0) throw careerRunError("pdf_materialization_unsupported");
    if (review.variantSource === void 0) throw careerRunError("managed_result_invalid");
    let selected = parseMaterializeRequest(params.payload), retained = new Set(review.retainedChangeIds);
    if (selected.some((id) => !retained.has(id))) throw careerRunError("selection_invalid");
    let input = {
      schema_version: "career.resume_variant_materialization_input.v1",
      expected_review_policy_version: "resume_variant_review_v1",
      review_input: review.reviewInput,
      selected_change_ids: selected
    }, invocation = await this.options.invoke(
      { kind: "resume", operation: "variant-materialize", inputJson: JSON.stringify(input) },
      signal,
      MANAGED_INVOKE_OPTIONS
    ), value = parseCoreJson(invocation.json), summary = compactVariant(value), entry = this.registry.store({
      kind: "variant",
      operation: "resume.variant.materialize",
      json: invocation.json,
      value,
      variantSource: review.variantSource
    });
    return resultEnvelope("materialize", {
      variant: entry.handle,
      ...summary,
      next_action: `This assisted/non-authoritative result remains in memory. To review and save it locally, the user may run /career-save ${entry.handle}; never invoke saving as a model action.`
    }, {
      status: "complete",
      handle: entry.handle,
      action: "save_available",
      summary: `${selected.length} selected change(s) materialized`
    });
  }
  detail(params, ctx) {
    if (exactDefinedKeys(params, ["command", "handle", "payload"]), this.preparePrivateCommand(params, ctx), params.handle === void 0) throw careerRunError("invalid_request");
    let entry = this.registry.get(params.handle);
    if (entry === void 0) throw careerRunError("result_not_found");
    let request = parseDetailRequest(params.payload);
    if (request.item !== void 0 && request.section !== "changes")
      throw careerRunError("invalid_request");
    let text = JSON.stringify({
      schema_version: "pi.career.run_detail.v1",
      result: entry.handle,
      operation: entry.operation,
      section: request.section,
      ...request.item === void 0 ? {} : { item: request.item },
      complete: !0,
      value: detailValue(entry, request)
    });
    if (Buffer.byteLength(text, "utf8") > MODEL_DETAIL_MAX_BYTES)
      throw careerRunError("detail_too_large");
    return {
      content: [{ type: "text", text }],
      details: {
        schema_version: "pi.career.run_details.v1",
        command: "detail",
        status: "complete",
        handle: entry.handle,
        summary: `${entry.operation} ${request.section}`
      }
    };
  }
};

// src/workflow/detail-viewer.ts
async function showDetailText(ctx, label, text) {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(text, "info");
    return;
  }
  await ctx.ui.custom((tui, theme, keybindings, done) => new DetailViewer(
    label,
    text,
    theme,
    keybindings,
    Math.max(1, Math.min(20, tui.terminal.rows - 6)),
    () => tui.requestRender(),
    () => done(void 0)
  ));
}

// src/managed/review-selector.ts
var CONTINUE = "Continue with selected changes", BACK_TO_REVIEW = "Back to reviewed changes", CANCEL = "Cancel", REPEAT_SELECTION = { done: !1 };
function lineRange(change) {
  return change.start_line === change.end_line ? `line ${change.start_line}` : `lines ${change.start_line}-${change.end_line}`;
}
function exactChangeValue(change) {
  return {
    change_id: change.change_id,
    section: change.section,
    start_line: change.start_line,
    end_line: change.end_line,
    original_text: change.original_text,
    proposed_text: change.proposed_text,
    resume_evidence: change.resume_evidence,
    vacancy_evidence: change.vacancy_evidence
  };
}
function exactChangeText(change) {
  return JSON.stringify(exactChangeValue(change), null, 2);
}
function selectedChangeText(change, index, total) {
  return [
    `Change ${index + 1} of ${total}`,
    `ID: ${JSON.stringify(change.change_id)}`,
    `Section: ${JSON.stringify(change.section)}`,
    `Line bounds: ${change.start_line}-${change.end_line}`,
    `Before: ${JSON.stringify(change.original_text)}`,
    `After: ${JSON.stringify(change.proposed_text)}`,
    `Resume evidence (${change.resume_evidence.length}): ${JSON.stringify(change.resume_evidence)}`,
    `Vacancy evidence (${change.vacancy_evidence.length}): ${JSON.stringify(change.vacancy_evidence)}`
  ].join(`
`);
}
function selectedChangesText(review, selected) {
  return [
    `Authority: ${review.authority}`,
    `Selected changes: ${selected.length}`,
    "",
    selected.map((change, index) => selectedChangeText(change, index, selected.length)).join(`

`)
  ].join(`
`);
}
function noticeText(review) {
  return JSON.stringify({
    authority: review.authority,
    warnings: review.warnings,
    discarded_changes: review.discarded_changes
  }, null, 2);
}
function changeOption(change, included) {
  return `${change.change_id} • ${change.section} • ${lineRange(change)} • ${included ? "included" : "excluded"}`;
}
function noticesOption(review, reviewed) {
  return `Warnings and discards • ${review.warnings.length} warnings • ${review.discarded_changes.length} discarded • ${reviewed ? "reviewed" : "review required"}`;
}
function changeOptions(review, included) {
  return new Map(review.changes.map((change) => [
    changeOption(change, included.has(change.change_id)),
    change
  ]));
}
function selectedAction(selected, notices, byOption) {
  let fixed = /* @__PURE__ */ new Map([
    [void 0, { kind: "cancel" }],
    [CANCEL, { kind: "cancel" }],
    [notices, { kind: "notices" }],
    [CONTINUE, { kind: "continue" }]
  ]), change = byOption.get(selected ?? "");
  return fixed.get(selected) ?? (change === void 0 ? { kind: "cancel" } : { kind: "change", change });
}
async function nextReviewAction(ctx, review, state) {
  let notices = noticesOption(review, state.noticesReviewed), byOption = changeOptions(review, state.included), selected = await ctx.ui.select(
    `Career reviewed changes • assisted/non-authoritative • ${state.included.size} selected`,
    [notices, ...byOption.keys(), CONTINUE, CANCEL]
  );
  return selectedAction(selected, notices, byOption);
}
function selectionOptions(wasIncluded) {
  return wasIncluded ? ["Keep included", "Exclude", "Back without changing"] : ["Include", "Keep excluded", "Back without changing"];
}
async function exactSelection(ctx, change, included) {
  await showDetailText(
    ctx,
    `${change.change_id} • ${change.section} • ${lineRange(change)}`,
    exactChangeText(change)
  );
  let decision = await ctx.ui.select(
    `Explicit selection • ${change.change_id}`,
    selectionOptions(included.has(change.change_id))
  );
  (/* @__PURE__ */ new Map([
    ["Include", () => included.add(change.change_id)],
    ["Keep included", () => included.add(change.change_id)],
    ["Exclude", () => included.delete(change.change_id)],
    ["Keep excluded", () => included.delete(change.change_id)]
  ])).get(decision)?.();
}
function completeSelection(ctx, review, state) {
  if (!state.noticesReviewed) {
    ctx.ui.notify("Review all Career Core warnings and discarded-change reasons before continuing.", "warning");
    return;
  }
  if (state.included.size === 0) {
    ctx.ui.notify("Include at least one exact canonical change before continuing.", "warning");
    return;
  }
  return review.changes.filter((change) => state.included.has(change.change_id));
}
function prepareOption(count) {
  return `Prepare ${count} selected change ID${count === 1 ? "" : "s"}`;
}
function finalChangeOption(change, index, total) {
  return `Review selected ${index + 1}/${total} • ${change.change_id} • ${change.section} • ${lineRange(change)}`;
}
function confirmationOutcome(decision, prepare, selected) {
  return (/* @__PURE__ */ new Map([
    [void 0, { done: !0 }],
    [CANCEL, { done: !0 }],
    [BACK_TO_REVIEW, REPEAT_SELECTION],
    [prepare, { done: !0, selection: selected.map((change) => change.change_id) }]
  ])).get(decision) ?? { done: !0 };
}
async function confirmSelection(ctx, selected) {
  let prepare = prepareOption(selected.length), byOption = new Map(selected.map((change, index) => [
    finalChangeOption(change, index, selected.length),
    { change, index }
  ]));
  for (; ; ) {
    let decision = await ctx.ui.select(
      "Final selection • inspect, prepare, or go back • nothing runs automatically",
      [...byOption.keys(), prepare, BACK_TO_REVIEW, CANCEL]
    ), target = byOption.get(decision ?? "");
    if (target === void 0) return confirmationOutcome(decision, prepare, selected);
    await showDetailText(
      ctx,
      `Selected ${target.index + 1}/${selected.length} • ${target.change.change_id}`,
      selectedChangeText(target.change, target.index, selected.length)
    );
  }
}
async function continueSelection(ctx, review, state) {
  let selected = completeSelection(ctx, review, state);
  return selected === void 0 ? REPEAT_SELECTION : (await showDetailText(
    ctx,
    `${selected.length} selected change${selected.length === 1 ? "" : "s"} • final review`,
    selectedChangesText(review, selected)
  ), await confirmSelection(ctx, selected));
}
async function reviewNotices(ctx, review, state) {
  return await showDetailText(ctx, "Warnings and discarded changes", noticeText(review)), state.noticesReviewed = !0, REPEAT_SELECTION;
}
async function reviewChange(ctx, state, change) {
  return await exactSelection(ctx, change, state.included), REPEAT_SELECTION;
}
async function applyAction(ctx, review, state, action) {
  return await {
    cancel: async () => ({ done: !0 }),
    notices: async () => await reviewNotices(ctx, review, state),
    continue: async () => await continueSelection(ctx, review, state),
    change: async () => await reviewChange(
      ctx,
      state,
      action.change
    )
  }[action.kind]();
}
function noticesRequired(review) {
  return [review.warnings.length > 0, review.discarded_changes.length > 0].some(Boolean);
}
function selectableReview(ctx, review) {
  return [ctx.mode === "tui", review.changes.length > 0].every(Boolean);
}
async function selectVariantChanges(ctx, review) {
  if (!selectableReview(ctx, review)) return;
  let state = {
    included: /* @__PURE__ */ new Set(),
    noticesReviewed: !noticesRequired(review)
  };
  for (; ; ) {
    let action = await nextReviewAction(ctx, review, state), outcome = await applyAction(ctx, review, state, action);
    if (outcome.done) return outcome.selection;
  }
}
function materializeEditorText(reviewHandle, selectedChangeIds) {
  return [
    "I explicitly reviewed and selected these canonical Career Core changes in /career-review.",
    "",
    `Call career_run with exactly this request: ${JSON.stringify({
      command: "materialize",
      handle: reviewHandle,
      payload: { selected_change_ids: selectedChangeIds }
    })}`,
    "",
    "Use exactly these selected IDs and the unchanged review handle. Keep the result assisted/non-authoritative. Do not analyze or match it as an original, and do not save or write any file."
  ].join(`
`);
}

// src/workflow/variant-save.ts
import { createHash as createHash5 } from "node:crypto";
import { constants as constants3 } from "node:fs";
import {
  chmod as chmod2,
  link as link3,
  lstat as lstat5,
  mkdir as mkdir3,
  open as open3,
  readFile as readFile5,
  readdir,
  realpath as realpath5,
  unlink as unlink3
} from "node:fs/promises";
import path7 from "node:path";
import { TextDecoder as TextDecoder6 } from "node:util";
import {
  withFileMutationQueue as withFileMutationQueue3
} from "@earendil-works/pi-coding-agent";
var ARTIFACT_MAX_BYTES = 262144, PREVIEW_MAX_BYTES2 = 524288, PATH_MAX_BYTES4 = 4096, CONFIRM_TIMEOUT_MS2 = 600 * 1e3, UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, VARIANT_HANDLE = /^variant:[a-f0-9-]{8,64}$/, SHA2565 = /^[a-f0-9]{64}$/, CHANGE_ID = /^change-[0-9]{4}$/, DEFAULT_FS = {
  chmod: chmod2,
  link: link3,
  lstat: lstat5,
  mkdir: mkdir3,
  open: open3,
  readFile: readFile5,
  readdir,
  realpath: realpath5,
  unlink: unlink3
};
function isNodeError(error, code) {
  return error !== null && typeof error == "object" && error.code === code;
}
function hash(value) {
  return createHash5("sha256").update(value).digest("hex");
}
function hasUnpairedSurrogate2(value) {
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      let next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343)) return !0;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return !0;
  }
  return !1;
}
function sameCandidate(left, right) {
  return left.handle === right.handle && left.assistedText === right.assistedText && left.selectedChangeIds.join("\0") === right.selectedChangeIds.join("\0") && left.source.resumeId === right.source.resumeId && left.source.rootId === right.source.rootId && left.source.format === right.source.format && left.source.textSha256 === right.source.textSha256;
}
function validCandidateIdentity(candidate) {
  return VARIANT_HANDLE.test(candidate.handle) && SHA2565.test(candidate.source.resumeId) && SHA2565.test(candidate.source.rootId) && SHA2565.test(candidate.source.textSha256) && (candidate.source.format === "markdown" || candidate.source.format === "text");
}
function validSelectedChanges(selectedChangeIds) {
  return selectedChangeIds.length > 0 && new Set(selectedChangeIds).size === selectedChangeIds.length && selectedChangeIds.every((id) => CHANGE_ID.test(id));
}
function validateCandidate(candidate) {
  if (!validCandidateIdentity(candidate) || !validSelectedChanges(candidate.selectedChangeIds) || candidate.assistedText.length === 0 || candidate.assistedText.includes("\r") || hasUnpairedSurrogate2(candidate.assistedText))
    throw careerRunError("variant_save_unavailable");
  let bytes = Buffer.from(candidate.assistedText, "utf8");
  if (bytes.length === 0 || bytes.length > ARTIFACT_MAX_BYTES)
    throw careerRunError("variant_save_unavailable");
  return bytes;
}
function effectiveUserId3() {
  return process.geteuid?.() ?? process.getuid?.();
}
function privateMetadata2(metadata, mode) {
  let userId = effectiveUserId3();
  return userId !== void 0 && metadata.uid === userId && (metadata.mode & 511) === mode;
}
function directManagedRoot(config, root) {
  let configured = config.generated_variants_root === null ? void 0 : path7.resolve(config.generated_variants_root);
  return configured !== void 0 && path7.dirname(configured) === root.path ? configured : path7.join(root.path, "variants");
}
function validBoundedPath(value) {
  return path7.isAbsolute(value) && path7.normalize(value) === value && Buffer.byteLength(value, "utf8") <= PATH_MAX_BYTES4 && !/[\u0000-\u001f\u007f]/.test(value);
}
function validDestination(config, root, directoryPath) {
  return validBoundedPath(root.path) && validBoundedPath(directoryPath) && path7.dirname(directoryPath) === root.path && directoryPath !== root.path && !config.library_roots.some((configuredRoot) => configuredRoot.path === directoryPath);
}
function basicTimestamp(createdAt) {
  return createdAt.replace(/[-:.]/g, "");
}
function canonicalJson2(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function fileNameFor(candidate, createdAt, saveId) {
  let extension = candidate.source.format === "markdown" ? "md" : "txt", suffix = saveId.replaceAll("-", "").slice(0, 8);
  return `resume-assisted-${basicTimestamp(createdAt)}-${suffix}.${extension}`;
}
var VariantSaveWorkflow = class {
  constructor(options) {
    this.options = options;
    this.fs = options.fs ?? DEFAULT_FS;
  }
  options;
  fs;
  receipts = /* @__PURE__ */ new Map();
  rootLocks = /* @__PURE__ */ new Map();
  clearReceipts() {
    this.receipts.clear();
  }
  async run(handle, ctx, resolveCandidate) {
    if (!ctx.isIdle()) throw careerRunError("variant_save_unavailable");
    let candidate = resolveCandidate(), existing = this.receipts.get(handle);
    if (existing !== void 0) {
      if (!sameCandidate(existing.plan.candidate, candidate) || existing.plan.sessionId !== ctx.sessionManager.getSessionId())
        throw careerRunError("variant_save_unavailable");
      if (!await this.verifyPublishedPair(existing.plan))
        throw careerRunError("variant_save_verification_failed");
      return await this.verifyRescan(existing.plan), {
        status: "existing",
        artifactPath: existing.plan.artifactPath,
        sidecarPath: existing.plan.sidecarPath
      };
    }
    let plan = await this.preparePlan(candidate, ctx.sessionManager.getSessionId()), reviewed = await ctx.ui.editor("Review exact assisted-variant save plan", plan.previewText);
    if (reviewed === void 0) return { status: "cancelled" };
    if (reviewed !== plan.previewText) throw careerRunError("variant_save_preview_changed");
    if (!await ctx.ui.confirm(
      "Save assisted resume variant?",
      [
        `Save ID: ${plan.saveId}`,
        `Directory: ${plan.directoryPath}`,
        `Artifact: ${path7.basename(plan.artifactPath)} (${plan.artifactBytes.length} bytes, ${hash(plan.artifactBytes)})`,
        `Sidecar: ${path7.basename(plan.sidecarPath)} (${plan.sidecarBytes.length} bytes, ${hash(plan.sidecarBytes)})`,
        ...plan.markerBytes === void 0 ? [] : [
          `Create managed marker: ${MANAGED_VARIANTS_MARKER_NAME} (${plan.markerBytes.length} bytes, ${hash(plan.markerBytes)})`
        ],
        "This is assisted/non-authoritative. Existing files will never be replaced."
      ].join(`
`),
      { timeout: CONFIRM_TIMEOUT_MS2 }
    ) || ctx.signal?.aborted) return { status: "cancelled" };
    let current = resolveCandidate();
    if (!sameCandidate(plan.candidate, current) || plan.sessionId !== ctx.sessionManager.getSessionId())
      throw careerRunError("variant_save_unavailable");
    let paths = [plan.artifactPath, plan.sidecarPath, ...plan.markerBytes === void 0 ? [] : [plan.markerPath]].sort();
    return await this.withRootLock(plan.directoryPath, () => this.withMutationQueues(paths, async () => {
      let lockedCandidate = resolveCandidate();
      if (!sameCandidate(plan.candidate, lockedCandidate) || plan.sessionId !== ctx.sessionManager.getSessionId() || !ctx.isIdle() || ctx.signal?.aborted)
        throw careerRunError("variant_save_unavailable");
      await this.revalidatePlan(plan), await this.publishPlan(plan);
    })), this.receipts.set(handle, { plan }), await this.verifyRescan(plan), { status: "saved", artifactPath: plan.artifactPath, sidecarPath: plan.sidecarPath };
  }
  async currentOriginal(candidate) {
    let config = await loadConfig(this.options.agentDir), scan = await scanLibrary(config), root = config.library_roots.find((value) => value.id === candidate.source.rootId), rootSummary = scan.roots.find((value) => value.root_id === candidate.source.rootId), matches = eligibleOriginals(scan).filter((record) => record.id === candidate.source.resumeId && record.root_id === candidate.source.rootId && record.format === candidate.source.format && record.text_sha256 === candidate.source.textSha256);
    if (root === void 0 || rootSummary === void 0 || rootSummary.stale || rootSummary.capped || scan.total_capped || matches.length !== 1) throw careerRunError("variant_save_unavailable");
    let directoryPath = directManagedRoot(config, root);
    if (!validDestination(config, root, directoryPath))
      throw careerRunError("variant_save_destination_invalid");
    let destination = await this.inspectDestination(directoryPath, root);
    return { config, root, record: matches[0], destination };
  }
  async inspectDestination(directoryPath, root) {
    let markerPath = path7.join(directoryPath, MANAGED_VARIANTS_MARKER_NAME), metadata;
    try {
      metadata = await this.fs.lstat(directoryPath);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return { kind: "absent", directoryPath, markerPath };
      throw careerRunError("variant_save_destination_invalid");
    }
    let canonical = await this.fs.realpath(directoryPath).catch(() => {
    });
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== directoryPath || !privateMetadata2(metadata, 448)) throw careerRunError("variant_save_destination_invalid");
    let entries = await this.fs.readdir(directoryPath).catch(() => {
    });
    if (entries === void 0) throw careerRunError("variant_save_destination_invalid");
    let markerState = await this.inspectMarker(markerPath, root.id);
    if (markerState === "valid") return { kind: "managed", directoryPath, markerPath };
    if (markerState === "invalid" || entries.length !== 0)
      throw careerRunError("variant_save_destination_invalid");
    return { kind: "empty", directoryPath, markerPath };
  }
  async inspectMarker(markerPath, expectedRootId) {
    try {
      let marker = await this.fs.lstat(markerPath);
      if (!marker.isFile() || marker.isSymbolicLink() || !privateMetadata2(marker, 384) || marker.size <= 0 || marker.size > ASSISTED_SIDECAR_MAX_BYTES) return "invalid";
      let bytes = await this.fs.readFile(markerPath);
      if (bytes.length !== marker.size) return "invalid";
      let text = new TextDecoder6("utf-8", { fatal: !0 }).decode(bytes);
      return parseManagedVariantsMarker(text, expectedRootId) === void 0 ? "invalid" : "valid";
    } catch (error) {
      return isNodeError(error, "ENOENT") ? "absent" : "invalid";
    }
  }
  async preparePlan(candidate, sessionId) {
    let artifactBytes = validateCandidate(candidate), prepared = await this.currentOriginal(candidate), saveId = this.options.uuid().toLowerCase(), createdAt = this.options.now().toISOString();
    if (!UUID4.test(saveId)) throw careerRunError("variant_save_unavailable");
    let fileName = fileNameFor(candidate, createdAt, saveId), artifactPath = path7.join(prepared.destination.directoryPath, fileName), sidecarPath2 = path7.join(
      prepared.destination.directoryPath,
      `${fileName.slice(0, -path7.extname(fileName).length)}.pi-career.json`
    );
    if (![prepared.destination.markerPath, artifactPath, sidecarPath2].every(validBoundedPath))
      throw careerRunError("variant_save_destination_invalid");
    await this.requireAbsent(artifactPath), await this.requireAbsent(sidecarPath2);
    let sidecarBytes = encodeAssistedVariantMetadataV2({
      base_document_id: candidate.source.resumeId,
      base_text_sha256: candidate.source.textSha256,
      artifact_sha256: sha256Bytes(artifactBytes),
      created_at: createdAt
    }), markerBytes = prepared.destination.kind === "managed" ? void 0 : encodeManagedVariantsMarker(prepared.root.id, createdAt);
    if (sidecarBytes.length > ASSISTED_SIDECAR_MAX_BYTES || markerBytes !== void 0 && markerBytes.length > ASSISTED_SIDECAR_MAX_BYTES)
      throw careerRunError("variant_save_unavailable");
    let preview = {
      schema_version: "pi.career.variant_save_preview.v1",
      save_id: saveId,
      initialize_directory: markerBytes !== void 0,
      directory_path: prepared.destination.directoryPath,
      marker: markerBytes === void 0 ? null : {
        path: prepared.destination.markerPath,
        utf8_bytes: markerBytes.length,
        sha256: hash(markerBytes),
        text: markerBytes.toString("utf8")
      },
      artifact: {
        path: artifactPath,
        format: candidate.source.format,
        utf8_bytes: artifactBytes.length,
        sha256: hash(artifactBytes),
        text: candidate.assistedText
      },
      sidecar: {
        path: sidecarPath2,
        utf8_bytes: sidecarBytes.length,
        sha256: hash(sidecarBytes),
        text: sidecarBytes.toString("utf8")
      }
    }, previewText2 = canonicalJson2(preview);
    if (Buffer.byteLength(previewText2, "utf8") > PREVIEW_MAX_BYTES2)
      throw careerRunError("variant_save_unavailable");
    return {
      saveId,
      sessionId,
      candidate,
      createdAt,
      directoryPath: prepared.destination.directoryPath,
      markerPath: prepared.destination.markerPath,
      artifactPath,
      sidecarPath: sidecarPath2,
      artifactBytes,
      sidecarBytes,
      ...markerBytes === void 0 ? {} : { markerBytes },
      initialDestinationKind: prepared.destination.kind,
      previewText: previewText2
    };
  }
  async revalidatePlan(plan) {
    validateCandidate(plan.candidate);
    let prepared = await this.currentOriginal(plan.candidate);
    if (prepared.destination.directoryPath !== plan.directoryPath || prepared.destination.markerPath !== plan.markerPath || prepared.destination.kind !== plan.initialDestinationKind) throw careerRunError("variant_save_destination_invalid");
    await this.requireAbsent(plan.artifactPath), await this.requireAbsent(plan.sidecarPath);
  }
  async requireAbsent(file) {
    try {
      throw await this.fs.lstat(file), careerRunError("variant_save_collision");
    } catch (error) {
      if (error instanceof CareerRunError) throw error;
      if (!isNodeError(error, "ENOENT")) throw careerRunError("variant_save_destination_invalid");
    }
  }
  async publishPlan(plan) {
    plan.markerBytes !== void 0 && await this.initializeDirectory(plan);
    let sidecarTemp, artifactTemp, sidecarLinked = !1, artifactLinked = !1;
    try {
      if (sidecarTemp = await this.writeTemp(plan, "sidecar", plan.sidecarBytes), artifactTemp = await this.writeTemp(plan, "artifact", plan.artifactBytes), await this.publishTemp(sidecarTemp, plan.sidecarPath), sidecarLinked = !0, await this.publishTemp(artifactTemp, plan.artifactPath), artifactLinked = !0, await this.safeUnlink(sidecarTemp.path), await this.safeUnlink(artifactTemp.path), await this.syncDirectory(plan.directoryPath), !await this.verifyPublishedPair(plan, sidecarTemp.metadata, artifactTemp.metadata))
        throw careerRunError("variant_save_status_unknown");
    } catch (error) {
      if (sidecarTemp !== void 0 && await this.safeUnlink(sidecarTemp.path), artifactTemp !== void 0 && await this.safeUnlink(artifactTemp.path), sidecarTemp !== void 0 && artifactTemp !== void 0 && await this.verifyPublishedPair(plan, sidecarTemp.metadata, artifactTemp.metadata)) return;
      !artifactLinked && sidecarTemp !== void 0 && await this.unlinkIfIdentity(plan.sidecarPath, sidecarTemp.metadata), this.throwPublicationFailure(error, sidecarLinked, artifactLinked);
    }
  }
  throwPublicationFailure(error, sidecarLinked, artifactLinked) {
    throw error instanceof CareerRunError ? error : isNodeError(error, "EEXIST") ? careerRunError("variant_save_collision") : careerRunError(sidecarLinked || artifactLinked ? "variant_save_status_unknown" : "variant_save_destination_invalid");
  }
  async initializeDirectory(plan) {
    if (plan.markerBytes === void 0) return;
    if (plan.initialDestinationKind === "absent") {
      try {
        await this.fs.mkdir(plan.directoryPath, { mode: 448, recursive: !1 });
      } catch (error) {
        throw isNodeError(error, "EEXIST") ? careerRunError("variant_save_collision") : careerRunError("variant_save_destination_invalid");
      }
      await this.fs.chmod(plan.directoryPath, 448).catch(() => {
        throw careerRunError("variant_save_destination_invalid");
      });
    }
    let directory = await this.fs.lstat(plan.directoryPath).catch(() => {
      throw careerRunError("variant_save_destination_invalid");
    }), canonical = await this.fs.realpath(plan.directoryPath).catch(() => {
      throw careerRunError("variant_save_destination_invalid");
    });
    if (!directory.isDirectory() || directory.isSymbolicLink() || canonical !== plan.directoryPath || !privateMetadata2(directory, 448)) throw careerRunError("variant_save_destination_invalid");
    await this.requireAbsent(plan.markerPath);
    let markerTemp = await this.writeTemp(plan, "marker", plan.markerBytes);
    try {
      if (await this.publishTemp(markerTemp, plan.markerPath), await this.safeUnlink(markerTemp.path), await this.syncDirectory(plan.directoryPath), !await this.verifyExactFile(plan.markerPath, plan.markerBytes, markerTemp.metadata))
        throw careerRunError("variant_save_status_unknown");
    } catch (error) {
      throw await this.safeUnlink(markerTemp.path), error instanceof CareerRunError ? error : isNodeError(error, "EEXIST") ? careerRunError("variant_save_collision") : careerRunError("variant_save_destination_invalid");
    }
  }
  async writeTemp(plan, role, bytes) {
    let temporary = path7.join(plan.directoryPath, `.pi-career-${plan.saveId}-${role}.tmp`), handle;
    try {
      handle = await this.fs.open(
        temporary,
        constants3.O_CREAT | constants3.O_EXCL | constants3.O_WRONLY | constants3.O_NOFOLLOW,
        384
      ), await handle.writeFile(bytes), await handle.sync(), await handle.chmod(384);
      let metadata = await handle.stat();
      if (await handle.close(), handle = void 0, !metadata.isFile() || metadata.isSymbolicLink() || !privateMetadata2(metadata, 384) || metadata.size !== bytes.length)
        throw careerRunError("variant_save_destination_invalid");
      if (!(await this.fs.readFile(temporary)).equals(bytes)) throw careerRunError("variant_save_destination_invalid");
      return { path: temporary, metadata };
    } catch (error) {
      throw handle !== void 0 && await handle.close().catch(() => {
      }), await this.safeUnlink(temporary), error instanceof CareerRunError ? error : isNodeError(error, "EEXIST") ? careerRunError("variant_save_collision") : careerRunError("variant_save_destination_invalid");
    }
  }
  async publishTemp(temporary, finalPath) {
    await this.fs.link(temporary.path, finalPath);
  }
  async verifyExactFile(file, expected, identity2) {
    try {
      let metadata = await this.fs.lstat(file);
      return !metadata.isFile() || metadata.isSymbolicLink() || !privateMetadata2(metadata, 384) || metadata.size !== expected.length || identity2 !== void 0 && (metadata.dev !== identity2.dev || metadata.ino !== identity2.ino) ? !1 : (await this.fs.readFile(file)).equals(expected);
    } catch {
      return !1;
    }
  }
  async verifyPublishedPair(plan, sidecarIdentity, artifactIdentity) {
    if (!await this.verifyExactFile(plan.sidecarPath, plan.sidecarBytes, sidecarIdentity) || !await this.verifyExactFile(plan.artifactPath, plan.artifactBytes, artifactIdentity)) return !1;
    try {
      let text = new TextDecoder6("utf-8", { fatal: !0 }).decode(await this.fs.readFile(plan.sidecarPath));
      return parseAssistedVariantMetadata(text, plan.artifactBytes)?.baseDocumentId === plan.candidate.source.resumeId;
    } catch {
      return !1;
    }
  }
  async verifyRescan(plan) {
    let config = await loadConfig(this.options.agentDir), scan = await scanLibrary(config), root = scan.roots.find((value) => value.root_id === plan.candidate.source.rootId), configuredRoot = config.library_roots.find((value) => value.id === plan.candidate.source.rootId), relativePath = configuredRoot === void 0 ? void 0 : path7.relative(configuredRoot.path, plan.artifactPath).split(path7.sep).join("/"), records = scan.records.filter((record) => record.path === plan.artifactPath), eligible = eligibleOriginals(scan).some((record) => record.path === plan.artifactPath);
    if (root === void 0 || configuredRoot === void 0 || relativePath === void 0 || root.stale || root.capped || scan.total_capped || records.length !== 1 || records[0].format !== plan.candidate.source.format || records[0].text !== plan.candidate.assistedText || records[0].kind !== "assisted_variant" || records[0].variant_group_id !== plan.candidate.source.resumeId || eligible || scan.warnings.some((warning) => warning.code === "invalid_assisted_sidecar" && warning.root_id === plan.candidate.source.rootId && warning.relative_path === relativePath)) throw careerRunError("variant_save_verification_failed");
  }
  async unlinkIfIdentity(file, identity2) {
    try {
      let metadata = await this.fs.lstat(file);
      metadata.dev === identity2.dev && metadata.ino === identity2.ino && await this.fs.unlink(file);
    } catch {
    }
  }
  async safeUnlink(file) {
    await this.fs.unlink(file).catch(() => {
    });
  }
  async syncDirectory(directory) {
    let handle;
    try {
      handle = await this.fs.open(directory, constants3.O_RDONLY), await handle.sync(), await handle.close();
    } catch {
      throw handle !== void 0 && await handle.close().catch(() => {
      }), careerRunError("variant_save_status_unknown");
    }
  }
  async withMutationQueues(paths, operation) {
    let run = (index) => index >= paths.length ? operation() : withFileMutationQueue3(paths[index], () => run(index + 1));
    return run(0);
  }
  async withRootLock(root, operation) {
    let previous = this.rootLocks.get(root) ?? Promise.resolve(), release = () => {
    }, gate = new Promise((resolve) => {
      release = resolve;
    }), current = previous.then(() => gate);
    this.rootLocks.set(root, current), await previous;
    try {
      return await operation();
    } finally {
      release(), this.rootLocks.get(root) === current && this.rootLocks.delete(root);
    }
  }
};

// src/managed/tool.ts
var REVIEW_HANDLE_PATTERN = /^review:[a-f0-9-]{8,64}$/, VARIANT_HANDLE_PATTERN = /^variant:[a-f0-9-]{8,64}$/;
function setCareerToolSurface(pi, surface, includeRaw = !1) {
  applyCareerToolSurface(() => pi.getActiveTools(), (names) => pi.setActiveTools(names), surface, includeRaw);
}
function registerCareerRun(pi, options = {}) {
  let agentDir = options.agentDir ?? getAgentDir(), now = options.now ?? (() => /* @__PURE__ */ new Date()), uuid = options.uuid ?? randomUUID2, surfaceState = INACTIVE_CAREER_MODEL_SURFACE, rawRequested = !1, deactivateSurface = () => {
    surfaceState = INACTIVE_CAREER_MODEL_SURFACE, rawRequested = !1, setCareerToolSurface(pi, surfaceState);
  }, engine = new CareerRunEngine({
    pi,
    agentDir,
    invoke: options.invoke ?? invokeCareerCli,
    now,
    uuid,
    onUnavailable: deactivateSurface
  }), variantSave = new VariantSaveWorkflow({ agentDir, now, uuid });
  pi.registerTool({
    name: MANAGED_TOOL_NAME,
    label: "Career",
    description: "Run managed local Career Core workflows with ephemeral handles and native payload objects instead of nested JSON strings.",
    promptGuidelines: [
      "Start with context. If consent is required, ask first; consent payload is `approve` or `decline`. Use returned handles; match/variant-review use the current vacancy implicitly.",
      "Proposal payloads use Core fields. Materialize payload is {selected_change_ids:[...]}; detail payload is {section,item?}. Preserve warnings/uncertainty/authority, and never select changes automatically.",
      "career_run variant-review must end its turn. For non-PDF originals in TUI, direct the user to /career-review with the returned review handle; only a later user-submitted turn may materialize explicitly selected IDs. PDF changes remain manual guidance only.",
      "After materialization, never initiate persistence. The user alone may run /career-save with the returned variant handle for exact local preview and confirmation."
    ],
    parameters: careerRunParameters,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({
        content: [{ type: "text", text: `Running career ${params.command}…` }],
        details: { schema_version: "pi.career.run_details.v1", command: params.command }
      });
      let result = await engine.run(params, signal, ctx);
      return params.command === "consent" && params.payload === "decline" && variantSave.clearReceipts(), params.command === "variant-review" ? { ...result, terminate: !0 } : result;
    },
    renderCall(args, theme) {
      return new Text2(
        theme.fg("toolTitle", theme.bold("career ")) + theme.fg("accent", args.command ?? "run"),
        0,
        0
      );
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text2(theme.fg("warning", "Running Career Core…"), 0, 0);
      let details = result.details;
      if (details === void 0) return new Text2(theme.fg("dim", "Career result unavailable"), 0, 0);
      let lines = [
        theme.fg(details.status === "consent_required" ? "warning" : "success", details.summary),
        ...details.action === "review_select" && details.handle !== void 0 ? [theme.fg("accent", `Run /career-review ${details.handle}`)] : [],
        ...details.action === "save_available" && details.handle !== void 0 ? [theme.fg("accent", `User may run /career-save ${details.handle}`)] : [],
        ...expanded && details.handle !== void 0 && details.action !== "review_select" && details.action !== "save_available" ? [theme.fg("dim", details.handle)] : []
      ];
      return new Text2(lines.join(`
`), 0, 0);
    }
  }), pi.registerCommand("career-review", {
    description: "Review and explicitly select retained variant changes in TUI",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/career-review requires TUI mode.", "error");
        return;
      }
      let handle = args.trim();
      if (!REVIEW_HANDLE_PATTERN.test(handle)) {
        ctx.ui.notify("Usage: /career-review review:<ephemeral-handle>", "warning");
        return;
      }
      try {
        await ctx.waitForIdle();
        let review = engine.variantSelectionReview(handle, ctx);
        if (review.changes.length === 0) {
          ctx.ui.notify("This review has no retained changes to select.", "warning");
          return;
        }
        let selected = await selectVariantChanges(ctx, review);
        if (selected === void 0) return;
        ctx.ui.setEditorText(materializeEditorText(review.handle, selected)), ctx.ui.notify(
          `${selected.length} reviewed change ID${selected.length === 1 ? "" : "s"} prepared in the editor. Review and submit manually; nothing was materialized, sent, saved, or written.`,
          "info"
        );
      } catch (error) {
        if (error instanceof CareerRunError) {
          ctx.ui.notify(careerRunErrorMessage(error.code), "error");
          return;
        }
        ctx.ui.notify("The reviewed-change selector failed without persisting a selection.", "error");
      }
    }
  }), pi.registerCommand("career-save", {
    description: "Preview and explicitly save one current assisted Markdown/text materialization",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
        ctx.ui.notify("/career-save requires TUI or RPC mode.", "error");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current agent run to settle before saving.", "warning");
        return;
      }
      let handle = args.trim();
      if (!VARIANT_HANDLE_PATTERN.test(handle)) {
        ctx.ui.notify("Usage: /career-save variant:<ephemeral-handle>", "warning");
        return;
      }
      try {
        let outcome = await variantSave.run(
          handle,
          ctx,
          () => engine.materializedVariantForSave(handle, ctx)
        );
        if (outcome.status === "cancelled") {
          ctx.ui.notify("Assisted-variant save cancelled; no file was written.", "info");
          return;
        }
        ctx.ui.notify(
          `${outcome.status === "existing" ? "Verified existing" : "Saved"} assisted variant: ${outcome.artifactPath}
Sidecar: ${outcome.sidecarPath}`,
          "info"
        );
      } catch (error) {
        if (error instanceof CareerRunError) {
          ctx.ui.notify(careerRunErrorMessage(error.code), "error");
          return;
        }
        ctx.ui.notify("The assisted variant could not be saved or verified.", "error");
      }
    }
  }), pi.registerCommand("career-tools", {
    description: "Choose managed or advanced raw Career Core tools",
    getArgumentCompletions: (prefix) => ["managed", "raw", "status"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      let mode = args.trim();
      if (mode === "raw" && !surfaceState.careerRunActive) {
        ctx.ui.notify(careerRunErrorMessage("assistance_required"), "warning");
        return;
      }
      if (mode === "managed")
        rawRequested = !1, setCareerToolSurface(pi, surfaceState, !1);
      else if (mode === "raw")
        rawRequested = !0, setCareerToolSurface(pi, surfaceState, !0);
      else if (mode !== "status" && mode !== "") {
        ctx.ui.notify("Usage: /career-tools managed|raw|status", "warning");
        return;
      }
      let active = pi.getActiveTools(), activeRaw = RAW_TOOL_NAMES.filter((name) => active.includes(name));
      ctx.ui.notify(
        surfaceState.careerRunActive ? `Career tools: career_run active; raw Career Core tools ${activeRaw.length === 0 ? "inactive" : "active"}.` : "Career tools inactive.",
        "info"
      );
    }
  });
  let refreshSurface = async (ctx) => (surfaceState = await resolveCareerModelSurface(
    ctx.sessionManager.getBranch(),
    ctx.sessionManager.getEntries(),
    (attachment) => validateApplicationAttachment(agentDir, attachment)
  ), surfaceState.careerRunActive || (rawRequested = !1), setCareerToolSurface(pi, surfaceState, rawRequested), surfaceState);
  pi.on("session_start", async (_event, ctx) => {
    if (variantSave.clearReceipts(), ctx.mode !== "tui" && ctx.mode !== "rpc") {
      engine.shutdown(), surfaceState = INACTIVE_CAREER_MODEL_SURFACE, rawRequested = !1, setCareerToolSurface(pi, surfaceState);
      return;
    }
    engine.enterSession(ctx.sessionManager.getSessionId()), rawRequested = !1, await refreshSurface(ctx);
  }), pi.on("session_tree", async (_event, ctx) => {
    if (variantSave.clearReceipts(), ctx.mode !== "tui" && ctx.mode !== "rpc") {
      engine.shutdown(), surfaceState = INACTIVE_CAREER_MODEL_SURFACE, rawRequested = !1, setCareerToolSurface(pi, surfaceState);
      return;
    }
    engine.resetSession(ctx.sessionManager.getSessionId()), rawRequested = !1, await refreshSurface(ctx);
  }), pi.on("resources_discover", () => surfaceState.skillDiscoverable ? { skillPaths: [careerSkillsDirectory()] } : {}), pi.on("input", async (event, ctx) => {
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") return { action: "continue" };
    let skillCommand = event.text.startsWith("/skill:career-core");
    if (!surfaceState.skillDiscoverable && !skillCommand) return { action: "continue" };
    let previous = surfaceState.skillDiscoverable;
    return await refreshSurface(ctx), surfaceState.skillDiscoverable ? { action: "continue" } : skillCommand || previous ? (ctx.ui.notify(careerRunErrorMessage("assistance_required"), "warning"), { action: "handled" }) : { action: "continue" };
  }), pi.on("session_shutdown", () => {
    variantSave.clearReceipts(), engine.shutdown(), rawRequested = !1, surfaceState = INACTIVE_CAREER_MODEL_SURFACE;
  });
}

// src/workflow/commands.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import {
  BorderedLoader,
  getAgentDir as getAgentDir2
} from "@earendil-works/pi-coding-agent";

// src/workflow/career-ui.ts
import { Key as Key2, matchesKey as matchesKey2, truncateToWidth as truncateToWidth2, visibleWidth, wrapTextWithAnsi as wrapTextWithAnsi2 } from "@earendil-works/pi-tui";
var CAREER_UI_VIEWS = [
  "setup",
  "library",
  "applications",
  "vacancy",
  "match",
  "analyze",
  "workbench",
  "workspace"
];
var CAREER_UI_VIEW_LABELS = {
  setup: "Setup",
  library: "Library",
  applications: "Applications",
  vacancy: "Job description",
  match: "Match",
  analyze: "Analyze",
  workbench: "Workbench",
  workspace: "Workspace"
}, VIEW_MARKS = {
  setup: "◆",
  library: "▤",
  applications: "●",
  vacancy: "✎",
  match: "◎",
  analyze: "▦",
  workbench: "✦",
  workspace: "▣"
}, CAREER_UI_RPC_ACTIONS = {
  switchView: "Switch view",
  close: "Close",
  back: "Back",
  attach: "Attach",
  migrate: "Finish migration",
  addRoot: "Add root",
  removeRoot: "Remove root",
  rescan: "Rescan",
  create: "Create application",
  analyze: "Run analyze",
  match: "Run match",
  editVacancy: "Edit job description",
  updateStatus: "Update status",
  workspace: "Manage workspace",
  askPi: "Ask Pi",
  detach: "Detach",
  clearVacancy: "Clear job description",
  selectOriginal: "Select original resume",
  preview: "Preview document (local only)"
};
function unavailablePane() {
  return { intro: "Local career data is unavailable.", items: [] };
}
function item(id, label, detail, pointer) {
  return pointer === void 0 ? { id, label, detail } : { id, label, detail, pointer };
}
function resumePreview(source, record) {
  return { source, digest: record.text_sha256, id: record.id, rootId: record.root_id, format: record.format };
}
var PREVIEW_MAX_BYTES3 = 12e3;
function previewText(text) {
  return Buffer.byteLength(text, "utf8") <= PREVIEW_MAX_BYTES3 && !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text);
}
function eligiblePreview(text) {
  return text !== void 0 && previewText(text) ? text : void 0;
}
async function freshLibraryPreview(agentDir, reference) {
  let scan = await scanLibrary(await loadConfig(agentDir)), root = scan.roots.find((entry) => entry.root_id === reference.rootId);
  if (scan.total_capped || root === void 0 || root.capped || root.stale) return;
  let matches = scan.records.filter((record) => record.kind === "original" && record.id === reference.id && record.root_id === reference.rootId && record.format === reference.format && record.text_sha256 === reference.digest && record.too_large_for_core_input !== !0);
  return matches.length === 1 ? matches[0]?.text : void 0;
}
async function freshAttachedPreview(agentDir, ctx, reference) {
  let attached = await attachedApplicationSourcesForSession(
    agentDir,
    ctx.sessionManager.getBranch(),
    ctx.sessionManager.getEntries()
  );
  if (reference.source === "vacancy")
    return attached?.vacancy?.vacancy_text_sha256 !== reference.digest || attached.application_id !== reference.id ? void 0 : attached.vacancy.vacancy_text;
  let record = reference.source === "original" ? attached?.selected_original : attached?.effective_resume;
  return freshResumeText(record, reference);
}
function samePreviewRecord(record, reference) {
  return record.id === reference.id && record.root_id === reference.rootId && record.format === reference.format && record.text_sha256 === reference.digest;
}
function freshResumeText(record, reference) {
  if (!(record === void 0 || record.too_large_for_core_input === !0 || !samePreviewRecord(record, reference))) {
    if (reference.source === "original") return record.kind === "original" ? record.text : void 0;
    if (!(reference.source === "effective" && record.kind !== "original" && record.kind !== "assisted_variant"))
      return record.text;
  }
}
async function freshPreviewForView(agentDir, ctx, view, reference) {
  return view === "library" && reference.source === "library" ? freshLibraryPreview(agentDir, reference) : view === "vacancy" && reference.source === "vacancy" || view === "analyze" && reference.source === "original" || view === "match" && reference.source === "effective" ? freshAttachedPreview(agentDir, ctx, reference) : void 0;
}
function careerPreviewLoader(agentDir, ctx) {
  return async (view, reference) => {
    try {
      return eligiblePreview(await freshPreviewForView(agentDir, ctx, view, reference));
    } catch {
      return;
    }
  };
}
function emptyCursors() {
  return {
    setup: 0,
    library: 0,
    applications: 0,
    vacancy: 0,
    match: 0,
    analyze: 0,
    workbench: 0,
    workspace: 0
  };
}
function viewTitle(view) {
  return `Career • ${CAREER_UI_VIEW_LABELS[view]}`;
}
async function buildCareerUiModel(agentDir, ctx) {
  let persisted3 = ctx.sessionManager.getSessionFile() !== void 0, empty = {
    setup: { intro: "pi-career is not configured. Press n to add a resume root.", items: [] },
    library: { intro: "No resume library is configured. Press n to add a root, r to rescan.", items: [] },
    applications: { intro: "Application workspace is not configured. Open Workspace and press m to configure, then c to create.", items: [] },
    vacancy: { intro: "No application is attached. Attach one, then press e to paste a job description.", items: [] },
    match: { intro: "No application is attached. Attach one or press g to match library originals against the current vacancy.", items: [] },
    analyze: { intro: "No application is attached. Press g to analyze an original resume.", items: [] },
    workbench: { intro: "Press p to prepare Ask Pi. Nothing is submitted from this view.", items: [] },
    workspace: { intro: "Press m to manage the application workspace. Opening this view does not mutate files.", items: [] }
  };
  try {
    let config = await loadConfig(agentDir), scan = await scanLibrary(config);
    empty.setup = {
      intro: setupSummary(config, scan, persisted3),
      items: config.library_roots.map((root) => item(
        root.id,
        root.label,
        `${root.label}
${privacyDisplayPath(root.path)}
Indexed resumes stay local. Opening a root does not call Core.`
      ))
    }, empty.library = {
      intro: scan.records.length === 0 ? "No indexed resumes. Press n to add a root, r to rescan." : `${scan.records.length} indexed resume${scan.records.length === 1 ? "" : "s"}. Assisted variants are not originals.`,
      items: scan.records.map((record) => {
        let badges2 = [
          record.format,
          ...record.kind === "assisted_variant" ? ["assisted variant"] : [],
          ...record.too_large_for_core_input === !0 ? ["too large"] : []
        ].join(" • "), row = item(
          record.id,
          `${record.label} — ${badges2}`,
          `${record.label}
${badges2}
Overlay browse does not analyze or attach this resume.`
        );
        return record.kind === "original" && record.too_large_for_core_input !== !0 && (row.preview = resumePreview("library", record)), row;
      })
    };
    let workspace = config.application_workspace;
    if (workspace !== null) {
      let catalog = await readApplicationCatalog(workspace.root_path, workspace.root_id), pointers = new Map(
        (await listCatalogApplications(agentDir)).map((entry) => [entry.pointer.applicationId, entry.pointer])
      );
      empty.applications = {
        intro: catalog.applications.length === 0 ? "No persistent applications. Press c to create one. Creating does not attach." : "Browse applications without attaching. Enter opens local detail. a attaches, c creates, s updates status, d detaches.",
        items: catalog.applications.map((application) => {
          let pointer = pointers.get(application.application_id), label = application.identity === void 0 ? `Legacy application — ${application.status}` : `${application.identity.company_label} — ${application.identity.role_label} — ${application.status}`, detail = application.identity === void 0 ? `Legacy application
Status: ${application.status}
Classification: ${application.classification}
Opening does not attach this application.` : `${application.identity.company_label} — ${application.identity.role_label}
Status: ${application.status}
Classification: ${application.classification}
Opening does not attach. Press a to attach this application without activating assistance.`, row = item(application.application_id, label, detail, pointer);
          return application.classification === "legacy" && (row.legacyMigration = !0), row;
        })
      };
    }
  } catch {
    empty.setup = unavailablePane(), empty.library = unavailablePane(), empty.applications = unavailablePane();
  }
  try {
    let attached = await attachedApplicationSourcesForSession(
      agentDir,
      ctx.sessionManager.getBranch(),
      ctx.sessionManager.getEntries()
    );
    if (attached !== void 0) {
      let heading = `${attached.company_label} — ${attached.role_label} — ${attached.status}`, pack = `Job description: ${attached.vacancy === void 0 ? "missing" : "ready"} · Selected original: ${attached.selected_original === void 0 ? "missing" : "ready"} · Effective resume: ${attached.effective_resume === void 0 ? "missing" : "ready"}`;
      empty.library.canSelectOriginal = attached.can_select_original, empty.vacancy = {
        intro: `${heading}
${pack}`,
        items: attached.vacancy === void 0 ? [] : [{
          ...item("vacancy", "Current job description", `${heading}
Current job description is ready. Browse does not replace workspace files.`),
          preview: { source: "vacancy", id: attached.application_id, digest: attached.vacancy.vacancy_text_sha256 }
        }]
      }, attached.vacancy === void 0 && (empty.vacancy.intro = `${heading}
${pack}
No current job description. Press e to paste one.`), empty.match = {
        intro: `${heading}
${pack}`,
        canSelectOriginal: attached.can_select_original,
        items: attached.effective_resume === void 0 ? [] : [{
          ...item("effective", `Effective Resume (${attached.effective_resume.kind === "assisted_variant" ? "tailored assisted" : "original"}): ${attached.effective_resume.label}`, `${heading}
Effective Resume (${attached.effective_resume.kind === "assisted_variant" ? "tailored assisted" : "original"}): ${attached.effective_resume.label}
Match is not run by opening this view.`),
          preview: resumePreview("effective", attached.effective_resume)
        }]
      }, attached.effective_resume === void 0 && (empty.match.intro = `${heading}
${pack}
No effective Resume is available.`), empty.analyze = {
        intro: `${heading}
${pack}`,
        canSelectOriginal: attached.can_select_original,
        items: attached.selected_original === void 0 ? [] : [{
          ...item("original", attached.selected_original.label, `${heading}
Selected original: ${attached.selected_original.label}
Analyze is not run by opening this view.`),
          preview: resumePreview("original", attached.selected_original)
        }]
      }, attached.selected_original === void 0 && (empty.analyze.intro = `${heading}
${pack}
No selected original Resume is available.`), empty.workbench = {
        intro: `${heading}
${pack}
Press p to prepare Ask Pi. Nothing is submitted.`,
        items: [item("workbench", "Career assistance", `${heading}
Explicit activation remains a separate action. Overlay browse does not submit a message.`)]
      }, empty.workspace = {
        intro: `${heading}
Workspace files are the current application authority.`,
        items: [item("workspace", "Workspace", `${heading}
Opening this view does not mutate files or attach another application.`)]
      };
    }
  } catch {
    empty.vacancy = unavailablePane(), empty.match = unavailablePane(), empty.analyze = unavailablePane();
  }
  let branch = ctx.sessionManager.getBranch(), state = reconstructWorkflowState(branch), sessionIdentity2;
  try {
    sessionIdentity2 = workspaceApplicationIdentity(branch);
  } catch {
  }
  let records = replayApplicationSessionRecords(branch, ctx.sessionManager.getEntries());
  if (sessionIdentity2 !== void 0 && records.integrity === "valid" && records.attachment === void 0 && !empty.applications.items.some((entry) => entry.id === sessionIdentity2.identity.application_id)) {
    let application = sessionIdentity2.current, sessionRow = item(
      application.application_id,
      `Current session · Not persisted — ${application.company_label} — ${application.role_label} — ${application.status}`,
      `${application.company_label} — ${application.role_label}
Status: ${application.status}
Current session · Not persisted. Opening does not attach this application.`
    );
    empty.applications.items.length === 0 && (empty.applications.intro = "Session application is not in the workspace catalog. Press m on Workspace to persist it. Opening does not attach."), empty.applications.items = [sessionRow, ...empty.applications.items];
  }
  let analyzeCards = state.result_cards.filter((card) => card.workflow === "analyze").slice(-5), matchCards = state.result_cards.filter((card) => card.workflow === "match").slice(-5);
  return analyzeCards.length > 0 && (empty.analyze.items = [
    ...empty.analyze.items,
    ...analyzeCards.map((card) => item(`analyze:${card.state_id}`, plainResultCard(card).split(`
`)[0] ?? card.resume_label, plainResultCard(card)))
  ]), matchCards.length > 0 && (empty.match.items = [
    ...empty.match.items,
    ...matchCards.map((card) => item(`match:${card.state_id}`, plainResultCard(card).split(`
`)[0] ?? card.resume_label, plainResultCard(card)))
  ]), empty;
}
var CareerUiSession = class {
  constructor(view, model, actions = {}, reloadModel, loadPreview) {
    this.actions = actions;
    this.reloadModel = reloadModel;
    this.loadPreview = loadPreview;
    this.current = view, this.model = model, this.cursors = emptyCursors();
  }
  actions;
  reloadModel;
  loadPreview;
  current;
  cursors;
  detail = !1;
  previewBody;
  previewFailed = !1;
  previewGeneration = 0;
  busyFlag = !1;
  model;
  get view() {
    return this.current;
  }
  get showingDetail() {
    return this.detail;
  }
  get preview() {
    return this.previewBody;
  }
  get previewError() {
    return this.previewFailed ? "Document preview unavailable or changed. Refresh and try again." : void 0;
  }
  cancelPreview() {
    this.previewGeneration++, this.previewBody = void 0, this.previewFailed = !1;
  }
  get canPreview() {
    return this.detail && this.previewBody === void 0 && this.selected?.preview !== void 0 && this.loadPreview !== void 0 && !this.busyFlag;
  }
  get cursor() {
    return this.cursors[this.current];
  }
  get pane() {
    return this.model[this.current];
  }
  get selected() {
    return this.pane.items[this.cursor];
  }
  get busy() {
    return this.busyFlag;
  }
  get canAttach() {
    return this.selected?.pointer !== void 0 && this.actions.attach !== void 0 && !this.busyFlag;
  }
  get canMigrate() {
    return this.current === "applications" && this.selected?.legacyMigration === !0 && this.actions.migrate !== void 0 && !this.busyFlag;
  }
  get canAddRoot() {
    return (this.current === "setup" || this.current === "library") && this.actions.addRoot !== void 0 && !this.busyFlag;
  }
  get canRemoveRoot() {
    return this.current === "setup" && this.selected !== void 0 && this.actions.removeRoot !== void 0 && !this.busyFlag;
  }
  get canRescan() {
    return (this.current === "setup" || this.current === "library") && this.actions.rescan !== void 0 && !this.busyFlag;
  }
  get canCreate() {
    return this.current === "applications" && this.actions.createApplication !== void 0 && !this.busyFlag;
  }
  get canAnalyze() {
    return this.current === "analyze" && this.actions.analyze !== void 0 && !this.busyFlag;
  }
  get canMatch() {
    return this.current === "match" && this.actions.match !== void 0 && !this.busyFlag;
  }
  get canEditVacancy() {
    return this.current === "vacancy" && this.actions.editVacancy !== void 0 && !this.busyFlag;
  }
  get canUpdateStatus() {
    return this.current === "applications" && this.actions.updateStatus !== void 0 && !this.busyFlag;
  }
  get canWorkspace() {
    return this.current === "workspace" && this.actions.workspace !== void 0 && !this.busyFlag;
  }
  get canAskPi() {
    return this.current === "workbench" && this.actions.askPi !== void 0 && !this.busyFlag;
  }
  get canDetach() {
    return this.current === "applications" && this.actions.detach !== void 0 && !this.busyFlag;
  }
  get canClearVacancy() {
    return this.current === "vacancy" && this.actions.clearVacancy !== void 0 && !this.busyFlag;
  }
  get canSelectOriginal() {
    return this.pane.canSelectOriginal === !0 && this.actions.selectOriginal !== void 0 && !this.busyFlag;
  }
  actionEntries() {
    return [
      [CAREER_UI_RPC_ACTIONS.attach, this.canAttach, () => this.attach()],
      [CAREER_UI_RPC_ACTIONS.migrate, this.canMigrate, () => this.migrate()],
      [CAREER_UI_RPC_ACTIONS.create, this.canCreate, () => this.createApplication()],
      [CAREER_UI_RPC_ACTIONS.addRoot, this.canAddRoot, () => this.addRoot()],
      [CAREER_UI_RPC_ACTIONS.removeRoot, this.canRemoveRoot, () => this.removeRoot()],
      [CAREER_UI_RPC_ACTIONS.rescan, this.canRescan, () => this.rescan()],
      [CAREER_UI_RPC_ACTIONS.analyze, this.canAnalyze, () => this.analyze()],
      [CAREER_UI_RPC_ACTIONS.match, this.canMatch, () => this.match()],
      [CAREER_UI_RPC_ACTIONS.editVacancy, this.canEditVacancy, () => this.editVacancy()],
      [CAREER_UI_RPC_ACTIONS.updateStatus, this.canUpdateStatus, () => this.updateStatus()],
      [CAREER_UI_RPC_ACTIONS.workspace, this.canWorkspace, () => this.workspace()],
      [CAREER_UI_RPC_ACTIONS.askPi, this.canAskPi, () => this.askPi()],
      [CAREER_UI_RPC_ACTIONS.detach, this.canDetach, () => this.detach()],
      [CAREER_UI_RPC_ACTIONS.clearVacancy, this.canClearVacancy, () => this.clearVacancy()],
      [CAREER_UI_RPC_ACTIONS.selectOriginal, this.canSelectOriginal, () => this.selectOriginal()],
      [CAREER_UI_RPC_ACTIONS.preview, this.canPreview, () => this.openPreview()]
    ];
  }
  rpcActions() {
    return this.actionEntries().filter(([, enabled]) => enabled).map(([label]) => label);
  }
  switchView(view) {
    this.busyFlag || (this.current = view, this.detail = !1, this.cancelPreview());
  }
  move(delta) {
    let items = this.pane.items;
    items.length !== 0 && (this.cursors[this.current] = (this.cursor + delta + items.length) % items.length);
  }
  highlight(index) {
    this.pane.items[index] !== void 0 && (this.cursors[this.current] = index);
  }
  open() {
    return this.busyFlag || this.detail || this.selected === void 0 ? !1 : (this.detail = !0, this.cancelPreview(), !0);
  }
  openItem(entry) {
    let index = this.pane.items.indexOf(entry);
    return index < 0 ? !1 : (this.cursors[this.current] = index, this.open());
  }
  back() {
    return this.previewBody !== void 0 ? (this.cancelPreview(), "list") : this.detail ? (this.detail = !1, this.cancelPreview(), "list") : "close";
  }
  async runBound(enabled, operation) {
    if (!enabled || this.busyFlag) return !1;
    this.busyFlag = !0;
    try {
      let ok = await operation();
      return ok === !0 && this.reloadModel !== void 0 && (this.model = await this.reloadModel()), ok === !0;
    } catch {
      return !1;
    } finally {
      this.busyFlag = !1;
    }
  }
  async openPreview() {
    if (!this.canPreview || this.loadPreview === void 0) return !1;
    let reference = this.selected?.preview;
    if (reference === void 0) return !1;
    let view = this.current, generation = ++this.previewGeneration;
    this.previewFailed = !1, this.busyFlag = !0;
    try {
      let text = await this.loadPreview(view, reference);
      return generation !== this.previewGeneration ? !1 : text === void 0 || !previewText(text) || this.current !== view || this.selected?.preview !== reference || !this.detail ? (this.previewFailed = !0, !1) : (this.previewBody = text, !0);
    } catch {
      return generation === this.previewGeneration && (this.previewFailed = !0), !1;
    } finally {
      this.busyFlag = !1;
    }
  }
  async attach() {
    let pointer = this.selected?.pointer, action = this.actions.attach;
    return pointer === void 0 || action === void 0 ? !1 : this.runBound(!0, () => action(pointer));
  }
  async migrate() {
    let action = this.actions.migrate, applicationId = this.selected?.id;
    return action === void 0 || applicationId === void 0 ? !1 : this.runBound(this.canMigrate, () => action(applicationId));
  }
  async addRoot() {
    let action = this.actions.addRoot;
    return action === void 0 ? !1 : this.runBound(this.canAddRoot, action);
  }
  async removeRoot() {
    let action = this.actions.removeRoot, id = this.selected?.id;
    return action === void 0 || id === void 0 ? !1 : this.runBound(this.canRemoveRoot, () => action(id));
  }
  async rescan() {
    let action = this.actions.rescan;
    return action === void 0 ? !1 : this.runBound(this.canRescan, action);
  }
  async createApplication() {
    let action = this.actions.createApplication;
    return action === void 0 ? !1 : this.runBound(this.canCreate, action);
  }
  async analyze() {
    let action = this.actions.analyze;
    return action === void 0 ? !1 : this.runBound(this.canAnalyze, action);
  }
  async match() {
    let action = this.actions.match;
    return action === void 0 ? !1 : this.runBound(this.canMatch, action);
  }
  async editVacancy() {
    let action = this.actions.editVacancy;
    return action === void 0 ? !1 : this.runBound(this.canEditVacancy, action);
  }
  async updateStatus() {
    let action = this.actions.updateStatus;
    return action === void 0 ? !1 : this.runBound(this.canUpdateStatus, action);
  }
  async workspace() {
    let action = this.actions.workspace;
    return action === void 0 ? !1 : this.runBound(this.canWorkspace, action);
  }
  async askPi() {
    let action = this.actions.askPi;
    return action === void 0 ? !1 : this.runBound(this.canAskPi, action);
  }
  async detach() {
    let action = this.actions.detach;
    return action === void 0 ? !1 : this.runBound(this.canDetach, action);
  }
  async clearVacancy() {
    let action = this.actions.clearVacancy;
    return action === void 0 ? !1 : this.runBound(this.canClearVacancy, action);
  }
  async selectOriginal() {
    let action = this.actions.selectOriginal;
    return action === void 0 ? !1 : this.runBound(this.canSelectOriginal, action);
  }
  async runRpcAction(choice) {
    let action = this.actionEntries().find(([label]) => label === choice);
    return action === void 0 ? !1 : action[2]();
  }
};
function uniqueItemOptions(items) {
  let counts = /* @__PURE__ */ new Map();
  for (let entry of items) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  let seen = /* @__PURE__ */ new Map(), options = /* @__PURE__ */ new Map();
  for (let entry of items) {
    let total = counts.get(entry.label) ?? 1, next = (seen.get(entry.label) ?? 0) + 1;
    seen.set(entry.label, next), options.set(total === 1 ? entry.label : `${entry.label} · ${next}`, entry);
  }
  return options;
}
async function switchViewRpc(ctx, session) {
  let labels = CAREER_UI_VIEWS.map((view2) => CAREER_UI_VIEW_LABELS[view2]), chosen = await ctx.ui.select(CAREER_UI_RPC_ACTIONS.switchView, labels), index = chosen === void 0 ? -1 : labels.indexOf(chosen), view = index < 0 ? void 0 : CAREER_UI_VIEWS[index];
  view !== void 0 && session.switchView(view);
}
async function rpcListStep(ctx, session) {
  let options = uniqueItemOptions(session.pane.items), choice = await ctx.ui.select(`${viewTitle(session.view)}
${session.pane.intro}`, [
    ...options.keys(),
    ...session.rpcActions(),
    CAREER_UI_RPC_ACTIONS.switchView,
    CAREER_UI_RPC_ACTIONS.close
  ]);
  if (choice === void 0 || choice === CAREER_UI_RPC_ACTIONS.close)
    return session.cancelPreview(), !1;
  if (choice === CAREER_UI_RPC_ACTIONS.switchView)
    await switchViewRpc(ctx, session);
  else if (session.rpcActions().includes(choice))
    await session.runRpcAction(choice);
  else {
    let entry = options.get(choice);
    if (entry === void 0) return !1;
    session.openItem(entry);
  }
  return !0;
}
function rpcDetailTitle(session) {
  let preview = session.preview;
  return preview !== void 0 ? `Local document preview (exact text; close with Back)
${preview}` : `${session.selected?.detail ?? session.pane.intro}${session.previewError === void 0 ? "" : `
${session.previewError}`}`;
}
async function rpcDetailStep(ctx, session) {
  let preview = session.preview, choice = await ctx.ui.select(rpcDetailTitle(session), [
    CAREER_UI_RPC_ACTIONS.back,
    ...preview === void 0 ? session.rpcActions() : [],
    CAREER_UI_RPC_ACTIONS.switchView,
    CAREER_UI_RPC_ACTIONS.close
  ]);
  return choice === void 0 || choice === CAREER_UI_RPC_ACTIONS.close ? (session.cancelPreview(), !1) : (choice === CAREER_UI_RPC_ACTIONS.back ? session.back() : choice === CAREER_UI_RPC_ACTIONS.switchView ? await switchViewRpc(ctx, session) : session.preview === void 0 && session.rpcActions().includes(choice) && await session.runRpcAction(choice), !0);
}
async function runCareerUiRpc(ctx, session) {
  for (; await (session.showingDetail ? rpcDetailStep(ctx, session) : rpcListStep(ctx, session)); )
    ;
}
function rule(theme, width) {
  return theme.fg("border", "─".repeat(Math.max(1, width)));
}
function styledLines(text, width, style) {
  return text.length === 0 ? [] : wrapTextWithAnsi2(style(text), Math.max(1, width)).map((line) => truncateToWidth2(line, width));
}
function exactPreviewLines(text, width, style) {
  let segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" }), lines = [];
  for (let sourceLine of text.split(`
`)) {
    let current = "";
    for (let { segment } of segmenter.segment(sourceLine)) {
      if (visibleWidth(segment) > width) return;
      current && visibleWidth(current + segment) > width && (lines.push(style(current)), current = ""), current += segment;
    }
    lines.push(current ? style(current) : "");
  }
  return lines;
}
function packChips(chips, width) {
  let lines = [], current = "";
  for (let chip of chips) {
    let next = current.length === 0 ? chip : `${current}  ${chip}`;
    current.length > 0 && visibleWidth(next) > width ? (lines.push(current), current = chip) : current = next;
  }
  return current.length > 0 && lines.push(current), lines.length === 0 ? [""] : lines;
}
function itemMark(view, entry) {
  return entry.pointer !== void 0 ? "◎" : view === "library" ? "▤" : view === "setup" ? "◆" : "·";
}
var CareerOverlay = class {
  constructor(session, theme, keybindings, requestRender, close) {
    this.session = session;
    this.theme = theme;
    this.keybindings = keybindings;
    this.requestRender = requestRender;
    this.close = close;
  }
  session;
  theme;
  keybindings;
  requestRender;
  close;
  previewPage = 0;
  get currentView() {
    return this.session.view;
  }
  get showingDetail() {
    return this.session.showingDetail;
  }
  get cursor() {
    return this.session.cursor;
  }
  get currentItem() {
    return this.session.selected;
  }
  handlePreviewInput(data) {
    this.keybindings.matches(data, "tui.select.up") || matchesKey2(data, Key2.up) ? (this.previewPage = Math.max(0, this.previewPage - 1), this.requestRender()) : (this.keybindings.matches(data, "tui.select.down") || matchesKey2(data, Key2.down)) && (this.previewPage++, this.requestRender());
  }
  renderPreview(text, width) {
    let lines = exactPreviewLines(text, width, (value) => this.theme.fg("text", value)), pages = Math.max(1, Math.ceil((lines?.length ?? 0) / 6));
    return this.previewPage = Math.min(this.previewPage, pages - 1), lines === void 0 ? ["", truncateToWidth2(this.theme.fg("muted", "Preview unavailable at this width; widen terminal"), width)] : [
      "",
      truncateToWidth2(this.theme.fg("muted", `Local preview · page ${this.previewPage + 1}/${pages} · exact text, soft-wrapped`), width),
      ...lines.slice(this.previewPage * 6, (this.previewPage + 1) * 6)
    ];
  }
  keyedAction(key) {
    return [
      ["v", this.session.canPreview, () => this.session.openPreview()],
      ["a", this.session.canAttach, () => this.session.attach()],
      ["i", this.session.canMigrate, () => this.session.migrate()],
      ["n", this.session.canAddRoot, () => this.session.addRoot()],
      ["x", this.session.canRemoveRoot, () => this.session.removeRoot()],
      ["r", this.session.canRescan, () => this.session.rescan()],
      ["c", this.session.canCreate, () => this.session.createApplication()],
      ["g", this.session.canAnalyze, () => this.session.analyze()],
      ["g", this.session.canMatch, () => this.session.match()],
      ["e", this.session.canEditVacancy, () => this.session.editVacancy()],
      ["s", this.session.canUpdateStatus, () => this.session.updateStatus()],
      ["m", this.session.canWorkspace, () => this.session.workspace()],
      ["p", this.session.canAskPi, () => this.session.askPi()],
      ["d", this.session.canDetach, () => this.session.detach()],
      ["k", this.session.canClearVacancy, () => this.session.clearVacancy()],
      ["o", this.session.canSelectOriginal, () => this.session.selectOriginal()]
    ].find(([name, enabled]) => name === key && enabled)?.[2]();
  }
  handleCancel() {
    if (this.session.showingDetail && !this.session.busy) {
      this.session.back(), this.previewPage = 0, this.requestRender();
      return;
    }
    this.session.cancelPreview(), this.close();
  }
  listMovement(data) {
    if (this.keybindings.matches(data, "tui.select.up") || matchesKey2(data, Key2.up)) return -1;
    if (this.keybindings.matches(data, "tui.select.down") || matchesKey2(data, Key2.down)) return 1;
  }
  handleListInput(data) {
    if (this.session.showingDetail) return;
    let delta = this.listMovement(data);
    if (delta !== void 0) {
      this.session.move(delta), this.requestRender();
      return;
    }
    (this.keybindings.matches(data, "tui.select.confirm") || matchesKey2(data, Key2.return) || matchesKey2(data, Key2.enter)) && this.session.open() && this.requestRender();
  }
  handleInput(data) {
    if (this.keybindings.matches(data, "tui.select.cancel") || matchesKey2(data, Key2.escape)) {
      this.handleCancel();
      return;
    }
    if (this.session.busy) return;
    if (this.session.preview !== void 0) {
      this.handlePreviewInput(data);
      return;
    }
    let index = Number.parseInt(data, 10), next = CAREER_UI_VIEWS[index - 1];
    if (next !== void 0) {
      this.session.switchView(next), this.requestRender();
      return;
    }
    let key = data.length === 1 ? data.toLowerCase() : data, keyed = this.keyedAction(key);
    if (keyed !== void 0) {
      keyed.finally(() => this.requestRender());
      return;
    }
    this.handleListInput(data);
  }
  footerHints() {
    let hints = this.session.showingDetail ? ["esc back"] : ["↑↓ move", "enter open", "esc close"];
    this.session.canPreview && hints.push("v preview locally"), this.session.preview !== void 0 && hints.push("↑↓ preview pages · soft-wrapped");
    let actions = [
      [this.session.preview === void 0 && this.session.canAttach, "a attach"],
      [this.session.canMigrate, "i migrate"],
      [this.session.canCreate, "c create"],
      [this.session.canAddRoot, "n add root"],
      [this.session.canRemoveRoot, "x remove"],
      [this.session.canRescan, "r rescan"],
      [this.session.canAnalyze, "g analyze"],
      [this.session.canMatch, "g match"],
      [this.session.canEditVacancy, "e edit"],
      [this.session.canUpdateStatus, "s status"],
      [this.session.canWorkspace, "m workspace"],
      [this.session.canAskPi, "p ask Pi"],
      [this.session.canDetach, "d detach"],
      [this.session.canClearVacancy, "k clear"],
      [this.session.canSelectOriginal, "o original"]
    ];
    return hints.push(...actions.filter(([enabled]) => enabled).map(([, label]) => label), "1-8 view"), hints;
  }
  render(width) {
    let renderWidth = Math.max(1, width), theme = this.theme, view = this.session.view, pane = this.session.pane, selected = this.session.selected, header = `${theme.bold(theme.fg("accent", "◆  Career"))}${theme.fg("dim", "  ·  ")}${theme.bold(theme.fg("accent", CAREER_UI_VIEW_LABELS[view]))}${theme.fg("dim", `  ${VIEW_MARKS[view]}`)}`, fullChips = CAREER_UI_VIEWS.map((name, index) => {
      let chip = `${index + 1} ${VIEW_MARKS[name]} ${CAREER_UI_VIEW_LABELS[name]}`;
      return name === view ? theme.bold(theme.fg("accent", chip)) : theme.fg("dim", chip);
    }), compactChips = CAREER_UI_VIEWS.map((name, index) => {
      let chip = `${index + 1}${VIEW_MARKS[name]}`;
      return name === view ? theme.bold(theme.fg("accent", chip)) : theme.fg("dim", chip);
    }), fullNav = packChips(fullChips, renderWidth), navLines = fullNav.length > 2 ? packChips(compactChips, renderWidth) : fullNav, footer = this.footerHints().join("   ");
    this.session.preview === void 0 && (this.previewPage = 0);
    let body = this.session.preview !== void 0 ? this.renderPreview(this.session.preview, renderWidth) : this.session.showingDetail && selected !== void 0 ? [
      "",
      ...styledLines(selected.label, renderWidth, (text) => theme.bold(theme.fg("accent", text))),
      ...selected.detail.split(`
`).flatMap((line) => styledLines(line, renderWidth, (text) => theme.fg("text", text))),
      ...this.session.previewError === void 0 ? [] : styledLines(this.session.previewError, renderWidth, (text) => theme.fg("muted", text))
    ] : [
      "",
      ...pane.intro.split(`
`).flatMap((line) => styledLines(line, renderWidth, (text) => theme.fg("muted", text))),
      "",
      ...pane.items.length === 0 ? styledLines("·  nothing here yet", renderWidth, (text) => theme.fg("dim", text)) : pane.items.map((entry, index) => {
        let mark = itemMark(view, entry), line = index === this.session.cursor ? `▸ ${mark}  ${entry.label}` : `  ${mark}  ${entry.label}`;
        return truncateToWidth2(
          index === this.session.cursor ? theme.bold(theme.fg("accent", line)) : theme.fg("text", line),
          renderWidth
        );
      })
    ];
    return [
      truncateToWidth2(header, renderWidth),
      truncateToWidth2(rule(theme, renderWidth), renderWidth),
      ...navLines.map((line) => truncateToWidth2(line, renderWidth)),
      truncateToWidth2(rule(theme, renderWidth), renderWidth),
      ...body,
      "",
      truncateToWidth2(rule(theme, renderWidth), renderWidth),
      ...styledLines(footer, renderWidth, (text) => theme.fg("dim", text))
    ];
  }
  invalidate() {
  }
};
async function openCareerUi(ctx, view, agentDir, actions = {}) {
  let reload = () => buildCareerUiModel(agentDir, ctx), session = new CareerUiSession(view, await reload(), actions, reload, careerPreviewLoader(agentDir, ctx));
  if (ctx.mode === "tui") {
    await ctx.ui.custom((tui, theme, keybindings, done) => new CareerOverlay(
      session,
      theme,
      keybindings,
      () => tui.requestRender(),
      () => done(void 0)
    ), {
      overlay: !0,
      overlayOptions: { width: "90%", maxHeight: "80%", anchor: "center", margin: 1 }
    });
    return;
  }
  await runCareerUiRpc(ctx, session);
}

// src/workflow/commands.ts
var SETUP_BANNER = "pi-career not configured — run /career-setup", EMPTY_LIBRARY_BANNER = "No resumes found — add a searchable PDF, Markdown, or text file to a configured root, then run /career-library.", CONSENT_COPY = "Pi may save private vacancy/resume text and result cards in the current session JSONL. `pi-career` does not write documents outside the files you chose. Use `pi --no-session` for an ephemeral run. This is not secure erasure.", TRANSIENT_NOTICE = "Transient session: pi-career workflow entries are not written to a session JSONL.", MAX_FILTER_CHARACTERS = 200, RunOwner = class {
  constructor(uuid) {
    this.uuid = uuid;
  }
  uuid;
  sequence = 0;
  current;
  start(ctx) {
    this.current?.controller.abort();
    let run = {
      sequence: ++this.sequence,
      runId: this.uuid(),
      sessionId: ctx.sessionManager.getSessionId(),
      controller: new AbortController()
    };
    return this.current = run, run;
  }
  assert(run, ctx) {
    if (this.current !== run || run.controller.signal.aborted || ctx.sessionManager.getSessionId() !== run.sessionId) throw workflowError("workflow_stale");
  }
  invalidate() {
    this.sequence += 1, this.current?.controller.abort(), this.current = void 0;
  }
};
function persisted2(ctx) {
  return ctx.sessionManager.getSessionFile() !== void 0;
}
function requireInteractive(ctx) {
  if (ctx.mode !== "tui" && ctx.mode !== "rpc" || !ctx.hasUI) throw workflowError("interactive_mode_required");
}
function parseStatusArgument(args) {
  let value = args.trim();
  if (value === "") return "default";
  if (value === "status") return "status";
  throw workflowError("invalid_command_arguments");
}
function parseFilter(args) {
  let value = args.trim();
  if (value.length > MAX_FILTER_CHARACTERS || /[\u0000-\u001f\u007f]/.test(value))
    throw workflowError("invalid_command_arguments");
  return value.toLowerCase();
}
function validApplicationLabel(value) {
  return value !== void 0 && value.trim().length > 0 && [...value.trim()].length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
}
function applicationSummary(application) {
  return `${application.company_label} — ${application.role_label} — ${application.status}`;
}
function safeAdapterCode(error) {
  return error instanceof CareerInvocationError ? error.payload.code : void 0;
}
function isOversizeCode(code) {
  return code === "result_too_large" || code === "result_too_many_lines";
}
async function runOperation(ctx, owner, run, label, operation) {
  if (owner.assert(run, ctx), ctx.mode !== "tui") {
    ctx.ui.notify(label, "info");
    let value = await operation(run.controller.signal);
    return owner.assert(run, ctx), value;
  }
  let result = await ctx.ui.custom((tui, theme, _keybindings, done) => {
    let loader = new BorderedLoader(tui, theme, label), settled = !1, finish = (value) => {
      settled || (settled = !0, done(value));
    };
    return loader.onAbort = () => {
      run.controller.abort(), finish(null);
    }, operation(run.controller.signal).then((value) => finish({ ok: !0, value })).catch((error) => finish({ ok: !1, error })), loader;
  });
  if (result === null) throw workflowError("workflow_cancelled");
  if (!result.ok) throw result.error;
  return owner.assert(run, ctx), result.value;
}
function retainOversizeFailure(error, resume, unavailable) {
  let code = safeAdapterCode(error);
  return isOversizeCode(code) ? (unavailable.set(resume.id, { resume, code }), !0) : !1;
}
async function executeMatchQueue(dependencies, resumes, vacancy, signal, freshSources) {
  let unavailable = /* @__PURE__ */ new Map(), normalized = await dependencies.invoke(
    { kind: "job", operation: "normalize", inputJson: serializeCoreInput(buildJobInput((await freshSources()).vacancy)) },
    signal
  );
  if (parseCoreJson(normalized.json).schema_version !== "career.job_normalization.v1")
    throw workflowError("core_result_invalid");
  for (let resume of resumes) {
    if (signal.aborted) throw workflowError("workflow_cancelled");
    try {
      let invocation = await dependencies.invoke(
        { kind: "resume", operation: "analyze", inputJson: serializeCoreInput(buildResumeInput((await freshSources()).resume)) },
        signal
      );
      projectResumeAnalysis(parseCoreJson(invocation.json));
    } catch (error) {
      if (!retainOversizeFailure(error, resume, unavailable)) throw error;
    }
  }
  let matches = [];
  for (let resume of resumes) {
    if (signal.aborted) throw workflowError("workflow_cancelled");
    try {
      let fresh = await freshSources(), invocation = await dependencies.invoke(
        { kind: "job", operation: "match", inputJson: serializeCoreInput(buildJobMatchInput(fresh.resume, fresh.vacancy)) },
        signal
      ), result = parseCoreJson(invocation.json);
      unavailable.has(resume.id) || matches.push({ resume, result });
    } catch (error) {
      if (!retainOversizeFailure(error, resume, unavailable)) throw error;
    }
  }
  return { matches, unavailable };
}
async function loadLibrary(dependencies) {
  let config = await loadConfig(dependencies.agentDir);
  return { config, scan: await scanLibrary(config) };
}
function appendData(pi, owner, run, ctx, data) {
  owner.assert(run, ctx), pi.appendEntry(WORKFLOW_CUSTOM_TYPE, data);
}
function registerCareerCommands(pi, options = {}) {
  let dependencies = {
    agentDir: options.agentDir ?? getAgentDir2(),
    invoke: options.invoke ?? invokeCareerCli,
    now: options.now ?? (() => /* @__PURE__ */ new Date()),
    uuid: options.uuid ?? randomUUID3
  }, owner = new RunOwner(dependencies.uuid), applicationWorkspace = new ApplicationWorkspaceWorkflow({
    agentDir: dependencies.agentDir,
    now: dependencies.now,
    uuid: dependencies.uuid,
    appendEntry: (customType, data) => pi.appendEntry(customType, data)
  }), transientNoticeSession, renderedData = /* @__PURE__ */ new Map(), renderedTieStateIds = /* @__PURE__ */ new Set(), attachedSources = (ctx) => attachedApplicationSourcesForSession(
    dependencies.agentDir,
    ctx.sessionManager.getBranch(),
    ctx.sessionManager.getEntries()
  ), freshOriginal = async (expected) => {
    let { scan } = await loadLibrary(dependencies), current = eligibleOriginals(scan).find((record) => record.id === expected.id);
    if (current === void 0 || current.root_id !== expected.root_id || current.format !== expected.format || current.text_sha256 !== expected.text_sha256 || sha256(current.text) !== expected.text_sha256) throw workflowError("workspace_drift");
    return current;
  }, ensureConsent = async (ctx, run) => {
    if (!persisted2(ctx)) {
      transientNoticeSession !== run.sessionId && (ctx.ui.notify(TRANSIENT_NOTICE, "info"), transientNoticeSession = run.sessionId);
      return;
    }
    if (reconstructWorkflowState(ctx.sessionManager.getBranch()).consent?.granted === !0) return;
    let choice = await ctx.ui.select(CONSENT_COPY, [
      "Continue in this session",
      "Cancel and restart with --no-session"
    ]);
    owner.assert(run, ctx);
    let granted = choice === "Continue in this session";
    if (appendData(pi, owner, run, ctx, createConsentEntry(granted, dependencies)), !granted) throw workflowError("consent_required");
  }, openUi = async (ctx, view) => {
    await openCareerUi(ctx, view, dependencies.agentDir, {
      attach: (pointer) => applicationWorkspace.attachCatalogPointer(ctx, pointer),
      migrate: async (applicationId) => {
        let company = await ctx.ui.input("Exact company label", "Company name");
        if (company === void 0) return !1;
        let role = await ctx.ui.input("Exact role label", "Role title");
        if (role === void 0) return !1;
        if (!validApplicationLabel(company) || !validApplicationLabel(role)) throw workflowError("invalid_command_arguments");
        return await applicationWorkspace.migrateCatalogApplication(ctx, applicationId, company, role) === "written";
      },
      addRoot: async () => {
        let rootPath = await ctx.ui.input("Resume root", "Absolute path");
        if (rootPath === void 0 || await ctx.ui.confirm(
          "Add resume root",
          "Add this resume library root to config? Indexed resumes stay local. No directory is created and Core is not called."
        ) !== !0) return !1;
        let config = await loadConfig(dependencies.agentDir), updated = await addLibraryRoot(config, rootPath);
        return await writeConfig(dependencies.agentDir, updated, dependencies.uuid), ctx.ui.notify("Resume root added. No files were created.", "info"), !0;
      },
      removeRoot: async (rootId2) => {
        if (await ctx.ui.confirm(
          "Remove resume root",
          "Remove this resume root from config? No files are changed."
        ) !== !0) return !1;
        let config = await loadConfig(dependencies.agentDir), updated = removeLibraryRoot(config, rootId2);
        return await writeConfig(dependencies.agentDir, updated, dependencies.uuid), ctx.ui.notify("Resume root removed from config; no files were changed.", "info"), !0;
      },
      rescan: async () => !0,
      createApplication: async () => {
        let state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        if (state.application !== void 0)
          return ctx.ui.notify("This session already has an application. Use /new before creating another.", "warning"), !1;
        if (state.application_context_seen === !0)
          return ctx.ui.notify("This session already contained an application. Run /new, then create another application, to keep company contexts separate.", "warning"), !1;
        let company = await ctx.ui.input("Company", "Company name");
        if (company === void 0) return !1;
        if (!validApplicationLabel(company)) throw workflowError("invalid_command_arguments");
        let role = await ctx.ui.input("Role", "Role title");
        if (role === void 0) return !1;
        if (!validApplicationLabel(role)) throw workflowError("invalid_command_arguments");
        if (await ctx.ui.confirm(
          "Create application",
          "Create this application? It is not attached until you confirm attach. Career assistance stays inactive."
        ) !== !0) return !1;
        let run = owner.start(ctx);
        await ensureConsent(ctx, run);
        let created = createApplicationEntry(company, role, "preparing", dependencies);
        return appendData(pi, owner, run, ctx, created), pi.getSessionName() === void 0 && pi.setSessionName(`${created.company_label} — ${created.role_label}`), (await loadConfig(dependencies.agentDir)).application_workspace !== null ? await applicationWorkspace.initializeCurrentApplication(ctx) : ctx.ui.notify(
          `${applicationSummary(created)}
Application context is session-scoped; no workspace files were created.`,
          "info"
        ), !0;
      },
      updateStatus: async () => {
        let statuses = /* @__PURE__ */ new Map([
          ["Preparing", "preparing"],
          ["Applied", "applied"],
          ["Interviewing", "interviewing"],
          ["Closed", "closed"]
        ]), selected = await ctx.ui.select("Application status", [...statuses.keys()]), status = selected === void 0 ? void 0 : statuses.get(selected);
        if (status === void 0) return !1;
        if (await attachedSources(ctx) !== void 0)
          return await applicationWorkspace.writeAttachedStatus(ctx, status) === "written";
        let state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        if (state.application === void 0)
          return ctx.ui.notify("No active career application.", "warning"), !1;
        let run = owner.start(ctx);
        await ensureConsent(ctx, run);
        let updated = createApplicationEntry(
          state.application.company_label,
          state.application.role_label,
          status,
          dependencies,
          state.application.application_id
        );
        return appendData(pi, owner, run, ctx, updated), ctx.ui.notify(applicationSummary(updated), "info"), !0;
      },
      editVacancy: async () => {
        let attached = await attachedSources(ctx), state = reconstructWorkflowState(ctx.sessionManager.getBranch()), current = attached?.vacancy ?? state.vacancy, edited = await ctx.ui.editor(
          current === void 0 ? "Paste career vacancy" : "Replace career vacancy",
          current?.vacancy_text ?? ""
        );
        if (edited === void 0) return !1;
        let text = edited.replace(/\r\n?/g, `
`);
        if (text.trim().length === 0 || !isWithinCoreCharacterLimit(text))
          throw workflowError("invalid_command_arguments");
        let run = owner.start(ctx), applicationId = attached?.application_id ?? state.application?.application_id, vacancy = createVacancyEntry(text, current === void 0 ? "paste" : "replace", {
          ...dependencies,
          ...applicationId === void 0 ? {} : { applicationId }
        });
        return await runOperation(ctx, owner, run, "Validating vacancy with Career Core…", async (signal) => {
          let result = await dependencies.invoke(
            { kind: "job", operation: "normalize", inputJson: serializeCoreInput(buildJobInput(vacancy)) },
            signal
          );
          if (parseCoreJson(result.json).schema_version !== "career.job_normalization.v1") throw workflowError("core_result_invalid");
        }), attached !== void 0 ? await applicationWorkspace.writeAttachedVacancy(ctx, text) === "written" : (await ensureConsent(ctx, run), appendData(pi, owner, run, ctx, vacancy), ctx.ui.notify(`Current vacancy: ${vacancy.vacancy_label}`, "info"), !0);
      },
      selectOriginal: async () => {
        if (await attachedSources(ctx) === void 0)
          return ctx.ui.notify("Attach an application before binding its selected original. No files were changed.", "warning"), !1;
        let outcome = await applicationWorkspace.selectAttachedOriginal(ctx);
        return outcome === "written" || outcome === "unchanged";
      },
      analyze: async () => {
        let attached = await attachedSources(ctx);
        if (attached !== void 0 && attached.selected_original === void 0)
          return ctx.ui.notify("Select an original resume with o before analyzing this attached application.", "warning"), !1;
        if (await ctx.ui.confirm(
          "Run analyze",
          "Run deterministic resume analysis with Career Core? This does not call a model or attach an application."
        ) !== !0) return !1;
        let run = owner.start(ctx), { scan } = await refreshState(ctx), resume = attached?.selected_original;
        if (resume === void 0) {
          let originals = eligibleOriginals(scan);
          if (originals.length === 0) throw workflowError("library_empty");
          if (originals.length === 1)
            resume = originals[0];
          else {
            let byOption = new Map(selectedOriginalOptions(originals).map(({ option, record }) => [option, record])), chosen = await ctx.ui.select("Choose an original resume", [...byOption.keys()]);
            if (resume = chosen === void 0 ? void 0 : byOption.get(chosen), resume === void 0) return !1;
          }
        }
        if (resume === void 0) throw workflowError("library_empty");
        await ensureConsent(ctx, run);
        let result;
        try {
          result = await runOperation(ctx, owner, run, "Running deterministic resume analysis…", async (signal) => {
            let current;
            if (attached !== void 0) {
              let fresh = await attachedSources(ctx);
              if (owner.assert(run, ctx), fresh?.application_id !== attached.application_id || fresh.selected_original?.text_sha256 !== resume.text_sha256 || fresh.selected_original?.id !== resume.id || fresh.selected_original === void 0 || sha256(fresh.selected_original.text) !== resume.text_sha256) throw workflowError("workspace_drift");
              current = fresh.selected_original;
            } else
              current = await freshOriginal(resume);
            if (owner.assert(run, ctx), signal.aborted) throw workflowError("workflow_cancelled");
            let invocation = await dependencies.invoke(
              { kind: "resume", operation: "analyze", inputJson: serializeCoreInput(buildResumeInput(current)) },
              signal
            );
            return parseCoreJson(invocation.json);
          });
        } catch (error) {
          let code = safeAdapterCode(error);
          if (isOversizeCode(code))
            return ctx.ui.notify(oversizeResultMessage("career-analyze", run.runId, code), "error"), !1;
          throw error;
        }
        let projection = projectResumeAnalysis(result), currentState = reconstructWorkflowState(ctx.sessionManager.getBranch()), applicationId = attached?.application_id ?? currentState.application?.application_id, card = createResultCard({
          workflow: "analyze",
          ...applicationId === void 0 ? {} : { applicationId },
          runId: run.runId,
          resume,
          projection,
          uuid: dependencies.uuid,
          now: dependencies.now
        });
        return appendData(pi, owner, run, ctx, card), renderedData.set(card.state_id, card), ctx.ui.notify(plainResultCard(card), "info"), !0;
      },
      match: async () => {
        let attached = await attachedSources(ctx);
        if (attached !== void 0 && attached.effective_resume === void 0)
          return ctx.ui.notify("Select an original resume with o before matching this attached application.", "warning"), !1;
        if (await ctx.ui.confirm(
          "Run match",
          "Run deterministic career match with Career Core? This does not call a model or attach an application."
        ) !== !0) return !1;
        let run = owner.start(ctx), { scan } = await refreshState(ctx), state = reconstructWorkflowState(ctx.sessionManager.getBranch()), vacancy = attached === void 0 ? state.vacancy : attached.vacancy;
        if (vacancy === void 0) throw workflowError("vacancy_required");
        let selected = attached?.effective_resume === void 0 ? eligibleOriginals(scan) : [attached.effective_resume];
        if (selected.length === 0) throw workflowError("library_empty");
        if (attached === void 0 && selected.length > 1) {
          let options2 = selectedOriginalOptions(selected), byOption = new Map(options2.map(({ option, record }) => [option, record])), chosen = await ctx.ui.select("Choose an original resume", [...byOption.keys()]), resume = chosen === void 0 ? void 0 : byOption.get(chosen);
          if (resume === void 0) return !1;
          selected = [resume];
        }
        await ensureConsent(ctx, run);
        let expectedResume = selected[0], queue = await runOperation(
          ctx,
          owner,
          run,
          "Running deterministic career match queue…",
          async (signal) => executeMatchQueue(dependencies, selected, vacancy, signal, async () => {
            let current, currentVacancy;
            if (attached !== void 0) {
              let fresh = await attachedSources(ctx);
              if (fresh?.application_id !== attached.application_id || fresh.effective_resume?.text_sha256 !== expectedResume.text_sha256 || fresh.effective_resume?.id !== expectedResume.id || fresh.vacancy?.vacancy_text_sha256 !== vacancy.vacancy_text_sha256 || fresh.effective_resume === void 0 || fresh.vacancy === void 0)
                throw workflowError("workspace_drift");
              current = fresh.effective_resume, currentVacancy = fresh.vacancy;
            } else {
              current = await freshOriginal(expectedResume);
              let fresh = reconstructWorkflowState(ctx.sessionManager.getBranch()).vacancy;
              if (fresh === void 0 || fresh.state_id !== vacancy.state_id || fresh.vacancy_text_sha256 !== vacancy.vacancy_text_sha256) throw workflowError("workspace_drift");
              currentVacancy = fresh;
            }
            if (owner.assert(run, ctx), signal.aborted) throw workflowError("workflow_cancelled");
            if (sha256(current.text) !== expectedResume.text_sha256 || sha256(currentVacancy.vacancy_text) !== vacancy.vacancy_text_sha256) throw workflowError("workspace_drift");
            return { resume: current, vacancy: currentVacancy };
          })
        ), ranked = rankMatches(queue.matches), applicationId = attached?.application_id ?? state.application?.application_id, cards = ranked.map((item2) => createResultCard({
          workflow: "match",
          ...applicationId === void 0 ? {} : { applicationId },
          runId: run.runId,
          resume: item2.resume,
          vacancy,
          projection: item2.projection,
          uuid: dependencies.uuid,
          now: dependencies.now
        }));
        for (let card of cards)
          appendData(pi, owner, run, ctx, card), renderedData.set(card.state_id, card);
        let unavailableRows = [...queue.unavailable.values()].map(
          (item2) => unavailableMatchResultMessage(run.runId, item2.resume.label, item2.code)
        );
        return ctx.ui.notify(
          [
            ...cards.slice(0, 20).map((card, index) => `${index + 1}. ${plainResultCard(card, ranked[index]?.tie === !0)}`),
            ...unavailableRows
          ].join(`

`),
          ranked.length === 0 ? "error" : "info"
        ), ranked.length > 0;
      },
      workspace: async () => (await applicationWorkspace.run("", ctx), !0),
      askPi: async () => await attachedSources(ctx) === void 0 ? (ctx.ui.notify("Attach an application before Ask Pi. Nothing was submitted.", "warning"), !1) : (await applicationWorkspace.prepareAssistanceHandoff(ctx), !0),
      detach: async () => {
        let outcome = await applicationWorkspace.detachAttachedApplication(ctx);
        return outcome === "cancelled" ? (ctx.ui.notify("Detach cancelled; workspace and session application files were not changed.", "info"), !1) : outcome === "detached";
      },
      clearVacancy: async () => {
        let attached = await attachedSources(ctx);
        if (attached !== void 0)
          return attached.vacancy === void 0 ? !1 : await applicationWorkspace.writeAttachedVacancy(ctx, null) === "written";
        let state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        if (state.vacancy === void 0) return !1;
        let run = owner.start(ctx);
        return appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies)), ctx.ui.notify("Current career vacancy cleared.", "info"), !0;
      }
    });
  }, refreshState = async (ctx) => {
    let library = await (options.loadLibrary ?? loadLibrary)(dependencies), branch = ctx.sessionManager.getBranch(), attached = await attachedSources(ctx), state = withCurrentStaleness(
      reconstructWorkflowState(branch),
      library.scan,
      attached === void 0 ? void 0 : attached.vacancy?.vacancy_text_sha256 ?? null,
      [
        ...attached?.selected_original === void 0 ? [] : [attached.selected_original],
        ...attached?.effective_resume === void 0 ? [] : [attached.effective_resume]
      ]
    );
    renderedData.clear();
    for (let entry of [
      ...state.application === void 0 ? [] : [state.application],
      ...state.vacancy === void 0 ? [] : [state.vacancy],
      ...state.consent === void 0 ? [] : [state.consent],
      ...state.result_cards
    ]) renderedData.set(entry.state_id, entry);
    renderedTieStateIds.clear();
    for (let stateId of deriveMatchTieStateIds(workflowResultCards(branch)))
      renderedTieStateIds.add(stateId);
    return library;
  };
  registerWorkflowEntryRenderer(
    pi,
    (stateId) => renderedData.get(stateId),
    (stateId) => renderedTieStateIds.has(stateId)
  );
  let handle = async (ctx, action) => {
    try {
      await action();
    } catch (error) {
      if (!ctx.hasUI || ctx.mode !== "tui" && ctx.mode !== "rpc")
        throw error instanceof CareerWorkflowError ? workflowError(error.code) : error instanceof CareerInvocationError ? payloadFreeAdapterError(error) : workflowError("workflow_failed");
      if (error instanceof CareerWorkflowError) {
        let type = error.code === "workflow_cancelled" || error.code === "workflow_stale" ? "info" : "error";
        ctx.ui.notify(workflowErrorMessage(error.code), type);
        return;
      }
      if (error instanceof CareerInvocationError) {
        ctx.ui.notify(publicAdapterMessage(error), "error");
        return;
      }
      ctx.ui.notify(workflowErrorMessage("workflow_failed"), "error");
    }
  };
  pi.registerCommand("career", {
    description: "Open Career",
    handler: async (args, ctx) => handle(ctx, async () => {
      if (args.trim() !== "") throw workflowError("invalid_command_arguments");
      requireInteractive(ctx), await openUi(ctx, "applications");
    })
  }), pi.registerCommand("career-workspace", {
    description: "Open the Career workspace view",
    handler: async (args, ctx) => handle(ctx, async () => {
      if (args.trim() !== "") throw workflowError("invalid_command_arguments");
      requireInteractive(ctx), await openUi(ctx, "workspace");
    })
  }), pi.registerCommand("career-setup", {
    description: "Open Career setup or show configuration status",
    getArgumentCompletions: (prefix) => "status".startsWith(prefix) ? [{ value: "status", label: "status" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      if (requireInteractive(ctx), parseStatusArgument(args) === "default") {
        await openUi(ctx, "setup");
        return;
      }
      let run = owner.start(ctx), { config, scan } = await refreshState(ctx);
      owner.assert(run, ctx), ctx.ui.notify([setupSummary(config, scan, persisted2(ctx)), libraryWarningPreview(config, scan)].filter(Boolean).join(`
`), "info");
    })
  }), pi.registerCommand("career-library", {
    description: "Open the Career library or show library status",
    getArgumentCompletions: (prefix) => "status".startsWith(prefix) ? [{ value: "status", label: "status" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      if (requireInteractive(ctx), parseStatusArgument(args) === "default") {
        await openUi(ctx, "library");
        return;
      }
      let run = owner.start(ctx), { config, scan } = await refreshState(ctx);
      owner.assert(run, ctx), ctx.ui.notify([librarySummary(config, scan, persisted2(ctx)), libraryWarningPreview(config, scan)].filter(Boolean).join(`
`), "info");
    })
  }), pi.registerCommand("career-application", {
    description: "Open Career applications, or show or clear application context",
    getArgumentCompletions: (prefix) => ["status", "clear"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      let argument = args.trim();
      if (argument !== "" && argument !== "status" && argument !== "clear")
        throw workflowError("invalid_command_arguments");
      if (argument === "") {
        await openUi(ctx, "applications");
        return;
      }
      let run = owner.start(ctx), attached = await attachedSources(ctx);
      if (owner.assert(run, ctx), attached !== void 0) {
        let summary = `${attached.company_label} — ${attached.role_label} — ${attached.status}`;
        if (argument === "status") {
          ctx.ui.notify(summary, "info");
          return;
        }
        let outcome = await applicationWorkspace.detachAttachedApplication(ctx);
        owner.assert(run, ctx), outcome === "cancelled" && ctx.ui.notify("Detach cancelled; workspace and session application files were not changed.", "info");
        return;
      }
      let state = reconstructWorkflowState(ctx.sessionManager.getBranch()), application = state.application;
      if (argument === "status") {
        ctx.ui.notify(
          application === void 0 ? "No active career application." : applicationSummary(application),
          "info"
        );
        return;
      }
      application !== void 0 && (state.vacancy !== void 0 && appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies)), appendData(pi, owner, run, ctx, createApplicationClearEntry(application, dependencies)), ctx.ui.notify("Active application and its current vacancy were cleared; no files were changed. Use /new before creating another application.", "info"));
    })
  }), pi.registerCommand("career-vacancy", {
    description: "Open the Career job description view, or clear the current vacancy",
    getArgumentCompletions: (prefix) => "clear".startsWith(prefix) ? [{ value: "clear", label: "clear" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      let argument = args.trim();
      if (argument !== "" && argument !== "clear") throw workflowError("invalid_command_arguments");
      if (requireInteractive(ctx), argument === "") {
        await openUi(ctx, "vacancy");
        return;
      }
      let run = owner.start(ctx), attached = await attachedSources(ctx);
      if (owner.assert(run, ctx), attached !== void 0) {
        if (attached.vacancy !== void 0) {
          let outcome = await applicationWorkspace.writeAttachedVacancy(ctx, null);
          owner.assert(run, ctx), outcome === "cancelled" && ctx.ui.notify("Vacancy change cancelled; workspace and session were not changed.", "info");
        }
        return;
      }
      let state = reconstructWorkflowState(ctx.sessionManager.getBranch());
      state.vacancy !== void 0 && (appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies)), ctx.hasUI && ctx.ui.notify("Current career vacancy cleared.", "info"));
    })
  }), pi.registerCommand("career-workbench", {
    description: "Open the Career workbench view",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx), parseFilter(args), await openUi(ctx, "workbench");
    })
  }), pi.registerCommand("career-analyze", {
    description: "Open the Career analyze view",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx), parseFilter(args), await openUi(ctx, "analyze");
    })
  }), pi.registerCommand("career-match", {
    description: "Open the Career match view",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx), parseFilter(args), await openUi(ctx, "match");
    })
  }), pi.on("session_start", async (_event, ctx) => {
    if (owner.invalidate(), !(ctx.mode !== "tui" && ctx.mode !== "rpc"))
      try {
        let { config, scan } = await refreshState(ctx);
        ctx.hasUI && config.library_roots.length === 0 ? ctx.ui.setWidget("pi-career-setup", [SETUP_BANNER]) : ctx.hasUI && scan.records.length === 0 ? ctx.ui.setWidget("pi-career-setup", [EMPTY_LIBRARY_BANNER]) : ctx.hasUI && ctx.ui.setWidget("pi-career-setup", void 0);
      } catch {
        ctx.hasUI && ctx.ui.setWidget("pi-career-setup", [SETUP_BANNER]);
      }
  }), pi.on("session_tree", async (_event, ctx) => {
    if (owner.invalidate(), ctx.mode !== "tui" && ctx.mode !== "rpc") {
      renderedData.clear(), renderedTieStateIds.clear();
      return;
    }
    try {
      await refreshState(ctx);
    } catch {
      renderedData.clear(), renderedTieStateIds.clear();
    }
  }), pi.on("session_shutdown", (_event, ctx) => {
    owner.invalidate(), renderedData.clear(), renderedTieStateIds.clear(), ctx.hasUI && ctx.ui.setWidget("pi-career-setup", void 0);
  });
}

// src/index.ts
var DISCOVERY_OPERATIONS = [
  "capabilities",
  "operations",
  "schema-list",
  "schema-export",
  "schema-bundle"
], RESUME_OPERATIONS = [
  "evaluate",
  "analyze",
  "analysis-suggestions-review",
  "analysis-replacements-review",
  "normalize",
  "enrich",
  "variant-review",
  "variant-materialize"
], JOB_OPERATIONS = ["normalize", "match"], discoveryParameters = Type2.Object(
  {
    operation: StringEnum2(DISCOVERY_OPERATIONS, {
      description: "Discover capabilities/operations, list schemas, or export/bundle one schema."
    }),
    schema_id: Type2.Optional(
      Type2.String({
        description: "Required only for schema-export/schema-bundle; use an exact ID from schema-list.",
        minLength: 1,
        maxLength: 100,
        pattern: "^career\\.[a-z0-9_.-]+\\.v[0-9]+$"
      })
    )
  },
  { additionalProperties: !1 }
), resumeParameters = Type2.Object(
  {
    operation: StringEnum2(RESUME_OPERATIONS, {
      description: "One available deterministic resume CLI operation."
    }),
    input_json: Type2.String({
      description: "Exactly one versioned JSON input object as a string. Discover the operation schema first. Private arguments may be stored by Pi unless the session is transient.",
      minLength: 2,
      maxLength: COMPOSITE_INPUT_MAX_BYTES
    })
  },
  { additionalProperties: !1 }
), jobParameters = Type2.Object(
  {
    operation: StringEnum2(JOB_OPERATIONS, {
      description: "Normalize a caller-supplied job description or match original resume/job inputs."
    }),
    input_json: Type2.String({
      description: "Exactly one versioned JSON input object as a string. Discover the operation schema first. Private arguments may be stored by Pi unless the session is transient.",
      minLength: 2,
      maxLength: COMPOSITE_INPUT_MAX_BYTES
    })
  },
  { additionalProperties: !1 }
), privacyGuideline = "Before using career_core_resume or career_core_job with private career content, require an explicit user decision about Pi session persistence and recommend starting a new `pi --no-session` transient run; do not claim secure erasure.";
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
  assertSupportedPlatform(), registerCareerCommands(pi), pi.registerTool({
    name: "career_core_discover",
    label: "Career Core Discovery",
    description: "Discover deterministic Career Core capabilities and embedded JSON schemas through the reviewed external resolver. May acquire the exact pinned Career package unless PI_OFFLINE=1; never calls a model.",
    promptSnippet: "Discover compatible Career Core capabilities and exact embedded schemas before document operations",
    promptGuidelines: [
      "Use career_core_discover before career_core_resume or career_core_job; invoke only capabilities reported as available and do not infer contract shapes."
    ],
    parameters: discoveryParameters,
    async execute(_toolCallId, params, signal) {
      try {
        let result = await invokeCareerCli(
          {
            kind: "discovery",
            operation: params.operation,
            ...params.schema_id === void 0 ? {} : { schemaId: params.schema_id }
          },
          signal
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw payloadFreeAdapterError(publicAdapterError(error));
      }
    }
  }), pi.registerTool({
    name: "career_core_resume",
    label: "Career Core Resume",
    description: "Run one bounded compatible Career Core resume operation with JSON over stdin. Returns the complete authoritative JSON or fails without truncation. Runtime acquisition, when needed, completes before private stdin opens.",
    promptSnippet: "Evaluate, analyze, normalize, or review bounded resume inputs through the compatible deterministic runtime",
    promptGuidelines: [
      privacyGuideline,
      "Use career_core_resume only with an exact schema discovered through career_core_discover; preserve every warning, evidence item, uncertainty status, baseline boundary, and assisted/non-authoritative label returned by the tool.",
      "If career_core_resume reports result_too_large or result_too_many_lines, do not request or use partial output; full-result export is not yet available through pi-career."
    ],
    parameters: resumeParameters,
    async execute(_toolCallId, params, signal) {
      try {
        let result = await invokeCareerCli(
          {
            kind: "resume",
            operation: params.operation,
            inputJson: params.input_json
          },
          signal
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw payloadFreeAdapterError(publicAdapterError(error));
      }
    }
  }), pi.registerTool({
    name: "career_core_job",
    label: "Career Core Job",
    description: "Run compatible Career Core job normalization or conservative matching with JSON over stdin. Returns complete authoritative JSON or fails without truncation. Never fetches vacancy URLs or invokes Cargo/a provider.",
    promptSnippet: "Normalize job text or conservatively match original resume and job inputs through the compatible deterministic runtime",
    promptGuidelines: [
      privacyGuideline,
      "Use career_core_job only with an exact schema discovered through career_core_discover; preserve source spans, confidence, warnings, uncertainty, conservative equivalence, and recommendation limitations exactly.",
      "If career_core_job reports result_too_large or result_too_many_lines, do not request or use partial output; full-result export is not yet available through pi-career."
    ],
    parameters: jobParameters,
    async execute(_toolCallId, params, signal) {
      try {
        let result = await invokeCareerCli(
          {
            kind: "job",
            operation: params.operation,
            inputJson: params.input_json
          },
          signal
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw payloadFreeAdapterError(publicAdapterError(error));
      }
    }
  }), registerCareerRun(pi);
}
export {
  careerCoreExtension as default
};
