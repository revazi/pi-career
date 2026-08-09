// SPDX-License-Identifier: MIT OR Apache-2.0

import { spawn } from "node:child_process";
import { constants as fsConstants, type Stats } from "node:fs";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { TextDecoder } from "node:util";

import { adapterError, CareerInvocationError } from "./errors.ts";

const CAREER_PACKAGE_NAME = "@revazi/career";
const CAREER_PACKAGE_VERSION = "0.1.0";
export const CAREER_PACKAGE_SPEC = `${CAREER_PACKAGE_NAME}@${CAREER_PACKAGE_VERSION}`;

const EXECUTABLE_MAX_BYTES = 4_096;
const PATH_MAX_BYTES = 65_536;
const PACKAGE_MANIFEST_MAX_BYTES = 32_768;
const LAUNCHER_MAX_BYTES = 65_536;
const ACQUISITION_STDOUT_MAX_BYTES = 8_192;
const ACQUISITION_STDERR_MAX_BYTES = 16_384;
const ACQUISITION_TIMEOUT_MS = 120_000;
const TERMINATION_GRACE_MS = 250;
const CANONICAL_NPM_REGISTRY = "https://registry.npmjs.org/";
const SOURCE_ORDER = ["path", "package-local", "acquired"] as const;
const requireFromPackage = createRequire(import.meta.url);

export type RuntimeRouteSource = "explicit" | "path" | "package-local" | "acquired";

export interface RuntimeRoute {
  readonly command: string;
  readonly argumentPrefix: readonly string[];
  readonly source: RuntimeRouteSource;
  readonly identity: string;
}

export type RuntimeProbe = (route: RuntimeRoute, signal?: AbortSignal) => Promise<void>;

export interface RuntimeResolverDependencies {
  resolvePackageManifest?: () => string | undefined;
  acquireLauncher?: (
    signal: AbortSignal | undefined,
    environment: Readonly<Record<string, string | undefined>>,
  ) => Promise<string>;
  execPath?: string;
  cwd?: string;
}

export interface RuntimeResolutionOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  signal?: AbortSignal;
  probe: RuntimeProbe;
  afterSource?: RuntimeRouteSource;
  dependencies?: RuntimeResolverDependencies;
}

interface CachedResolution {
  environmentKey: string;
  route: RuntimeRoute;
}

interface PendingResolution {
  environmentKey: string;
  promise: Promise<RuntimeRoute>;
}

let cachedResolution: CachedResolution | undefined;
let pendingResolution: PendingResolution | undefined;

function environmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  return environment[key];
}

function runtimeEnvironmentKey(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  return JSON.stringify([
    environmentValue(environment, "CAREER_CLI_PATH") ?? null,
    environmentValue(environment, "PATH") ?? null,
  ]);
}

export function clearRuntimeResolutionCache(): void {
  cachedResolution = undefined;
  pendingResolution = undefined;
}

export function resolveCareerExecutable(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const override = environmentValue(environment, "CAREER_CLI_PATH");
  if (override === undefined) return undefined;
  if (
    override.length === 0 ||
    override.includes("\0") ||
    Buffer.byteLength(override, "utf8") > EXECUTABLE_MAX_BYTES ||
    !path.isAbsolute(override)
  ) {
    throw adapterError("invalid_executable_override");
  }
  return override;
}

function route(
  command: string,
  argumentPrefix: readonly string[],
  source: RuntimeRouteSource,
): RuntimeRoute {
  return Object.freeze({
    command,
    argumentPrefix: Object.freeze([...argumentPrefix]),
    source,
    identity: `${source}\0${command}\0${argumentPrefix.join("\0")}`,
  });
}

function explicitRoute(executable: string): RuntimeRoute {
  return route(executable, [], "explicit");
}

function pathEntries(environmentPath: string | undefined, cwd: string): string[] {
  if (
    environmentPath === undefined ||
    environmentPath.includes("\0") ||
    Buffer.byteLength(environmentPath, "utf8") > PATH_MAX_BYTES
  ) return [];
  return environmentPath.split(path.delimiter).map((entry) => path.resolve(entry || cwd));
}

function executableNames(environment: Readonly<Record<string, string | undefined>>): string[] {
  if (process.platform !== "win32") return ["career"];
  const pathExt = environmentValue(environment, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD";
  const extensions = pathExt.split(";").filter((value) => /^\.[A-Za-z0-9]+$/.test(value));
  return ["career", ...extensions.map((extension) => `career${extension.toLowerCase()}`)];
}

async function pathRoute(
  environment: Readonly<Record<string, string | undefined>>,
  cwd: string,
): Promise<RuntimeRoute | undefined> {
  for (const directory of pathEntries(environmentValue(environment, "PATH"), cwd)) {
    for (const name of executableNames(environment)) {
      const candidate = path.join(directory, name);
      try {
        const metadata = await lstat(candidate);
        if (!metadata.isFile() && !metadata.isSymbolicLink()) continue;
        await access(candidate, fsConstants.X_OK);
        return route(candidate, [], "path");
      } catch {
        // PATH lookup skips unavailable entries without exposing filesystem details.
      }
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedRegularFile(metadata: Stats, maximumBytes: number, executable: boolean): boolean {
  return !metadata.isSymbolicLink() &&
    metadata.isFile() &&
    metadata.size >= 2 &&
    metadata.size <= maximumBytes &&
    (!executable || (metadata.mode & 0o111) !== 0);
}

function launcherManifestIsValid(manifest: unknown): manifest is Record<string, unknown> {
  if (!isRecord(manifest) || !isRecord(manifest.bin) || !isRecord(manifest.career_launcher)) {
    return false;
  }
  const platformPackages = manifest.career_launcher.platform_packages;
  return manifest.name === CAREER_PACKAGE_NAME &&
    manifest.version === CAREER_PACKAGE_VERSION &&
    manifest.bin.career === "bin/career.js" &&
    manifest.career_launcher.schema_version === "career.npm_launcher.v1" &&
    manifest.career_launcher.executable === "career" &&
    Array.isArray(platformPackages) &&
    platformPackages.join("\0") ===
      "@revazi/career-darwin-arm64\0@revazi/career-linux-x64-gnu";
}

async function readLauncherRoute(
  manifestPath: string,
  source: "package-local" | "acquired",
  execPath: string,
): Promise<RuntimeRoute | undefined> {
  try {
    if (!path.isAbsolute(manifestPath) || !path.isAbsolute(execPath)) return undefined;
    const [manifestMetadata, realNodePath] = await Promise.all([
      lstat(manifestPath),
      realpath(execPath),
    ]);
    if (!boundedRegularFile(manifestMetadata, PACKAGE_MANIFEST_MAX_BYTES, false)) return undefined;
    const nodeMetadata = await lstat(realNodePath);
    if (!nodeMetadata.isFile() || (nodeMetadata.mode & 0o111) === 0) return undefined;
    const bytes = await readFile(manifestPath);
    if (bytes.length !== manifestMetadata.size) return undefined;
    const manifest: unknown = JSON.parse(bytes.toString("utf8"));
    if (!launcherManifestIsValid(manifest)) return undefined;
    const launcherPath = path.join(path.dirname(manifestPath), "bin", "career.js");
    const launcherMetadata = await lstat(launcherPath);
    if (!boundedRegularFile(launcherMetadata, LAUNCHER_MAX_BYTES, true)) return undefined;
    return route(realNodePath, [launcherPath], source);
  } catch {
    return undefined;
  }
}

function defaultPackageManifest(): string | undefined {
  try {
    return requireFromPackage.resolve(`${CAREER_PACKAGE_NAME}/package.json`);
  } catch {
    return undefined;
  }
}

async function packageLocalRoute(
  dependencies: RuntimeResolverDependencies,
): Promise<RuntimeRoute | undefined> {
  const manifestPath = (dependencies.resolvePackageManifest ?? defaultPackageManifest)();
  if (manifestPath === undefined) return undefined;
  return readLauncherRoute(
    manifestPath,
    "package-local",
    dependencies.execPath ?? process.execPath,
  );
}

function npmExecPathValues(
  environment: Readonly<Record<string, string | undefined>>,
): Array<string | undefined> {
  return Object.entries(environment)
    .filter(([key]) => key.toLowerCase() === "npm_execpath")
    .map(([, value]) => value);
}

async function trustedNpm(
  execPath: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<{ nodePath: string; npmCliPath: string }> {
  try {
    if (!path.isAbsolute(execPath)) throw new Error("invalid node path");
    const realNodePath = await realpath(execPath);
    const nodeMetadata = await lstat(realNodePath);
    if (!nodeMetadata.isFile() || (nodeMetadata.mode & 0o111) === 0) {
      throw new Error("invalid node executable");
    }
    const prefix = path.dirname(path.dirname(realNodePath));
    const derivedNpmCliPath = path.join(prefix, "lib", "node_modules", "npm", "bin", "npm-cli.js");
    const realNpmCliPath = await realpath(derivedNpmCliPath);
    if (realNpmCliPath !== derivedNpmCliPath) throw new Error("invalid npm path");
    const npmMetadata = await lstat(realNpmCliPath);
    if (!npmMetadata.isFile() || (npmMetadata.mode & 0o111) === 0) {
      throw new Error("invalid npm executable");
    }
    const supplied = npmExecPathValues(environment);
    if (supplied.length > 1) throw new Error("ambiguous npm_execpath");
    if (supplied.length === 1) {
      const suppliedPath = supplied[0];
      if (typeof suppliedPath !== "string" || !path.isAbsolute(suppliedPath)) {
        throw new Error("invalid npm_execpath");
      }
      if (await realpath(suppliedPath) !== realNpmCliPath) {
        throw new Error("conflicting npm_execpath");
      }
    }
    return { nodePath: realNodePath, npmCliPath: realNpmCliPath };
  } catch {
    throw adapterError("runtime_acquisition_failed");
  }
}

const FORBIDDEN_NPM_ENVIRONMENT = new Set([
  "node_env",
  "node_options",
  "npm_config_audit_level",
  "npm_config_global",
  "npm_config_include",
  "npm_config_omit",
  "npm_config_prefix",
  "npm_config_registry",
  "npm_config_script_shell",
]);

function sanitizedNpmEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  nodePath: string,
): NodeJS.ProcessEnv {
  const sanitized = Object.fromEntries(Object.entries(environment).filter(([key, value]) =>
    typeof value === "string" &&
    key.toLowerCase() !== "path" &&
    !FORBIDDEN_NPM_ENVIRONMENT.has(key.toLowerCase().replaceAll("-", "_")),
  ));
  return {
    ...sanitized,
    PATH: [path.dirname(nodePath), "/usr/bin", "/bin"].join(path.delimiter),
  };
}

const LOCATE_ACQUIRED_LAUNCHER = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const first = (process.env.PATH || "").split(path.delimiter)[0];
if (!first || !path.isAbsolute(first)) process.exit(2);
const name = process.platform === "win32" ? "career.cmd" : "career";
process.stdout.write(fs.realpathSync(path.join(first, name)));
`;

interface AcquisitionResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  spawnError: boolean;
  terminationError?: CareerInvocationError;
  stdout: Buffer[];
  stderrBytes: number;
}

function terminateProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== "win32" && child.pid !== undefined) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The close/error event remains authoritative.
    }
  }
}

async function runAcquisition(
  nodePath: string,
  npmCliPath: string,
  environment: Readonly<Record<string, string | undefined>>,
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw adapterError("cancelled");
  const arguments_ = [
    npmCliPath,
    "exec",
    "--yes",
    "--ignore-scripts",
    "--include=optional",
    "--node-options=",
    "--script-shell=/bin/sh",
    `--registry=${CANONICAL_NPM_REGISTRY}`,
    `--package=${CAREER_PACKAGE_SPEC}`,
    "--",
    nodePath,
    "-e",
    LOCATE_ACQUIRED_LAUNCHER,
  ];

  const completed = await new Promise<AcquisitionResult>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(nodePath, arguments_, {
        cwd,
        detached: process.platform !== "win32",
        env: sanitizedNpmEnvironment(environment, nodePath),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      resolve({ code: null, signal: null, spawnError: true, stdout: [], stderrBytes: 0 });
      return;
    }
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let closed = false;
    let spawnError = false;
    let terminationError: CareerInvocationError | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = (error: CareerInvocationError) => {
      if (terminationError !== undefined || closed) return;
      terminationError = error;
      terminateProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => {
        if (!closed) terminateProcessTree(child, "SIGKILL");
      }, TERMINATION_GRACE_MS);
      killTimer.unref();
    };
    const timeout = setTimeout(
      () => terminate(adapterError("timeout")),
      ACQUISITION_TIMEOUT_MS,
    );
    timeout.unref();
    const onAbort = () => terminate(adapterError("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });

    child.once("error", () => {
      spawnError = true;
    });
    child.stdout!.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > ACQUISITION_STDOUT_MAX_BYTES) terminate(adapterError("stdout_overflow"));
      else stdout.push(Buffer.from(chunk));
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > ACQUISITION_STDERR_MAX_BYTES) terminate(adapterError("stderr_overflow"));
    });
    child.once("close", (code, childSignal) => {
      closed = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      resolve({
        code,
        signal: childSignal,
        spawnError,
        ...(terminationError === undefined ? {} : { terminationError }),
        stdout,
        stderrBytes,
      });
    });
  });

  if (completed.terminationError !== undefined) throw completed.terminationError;
  if (
    completed.spawnError ||
    completed.code !== 0 ||
    completed.signal !== null
  ) throw adapterError("runtime_acquisition_failed");
  try {
    const launcher = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(completed.stdout));
    if (
      launcher.length === 0 ||
      launcher.includes("\0") ||
      Buffer.byteLength(launcher, "utf8") > EXECUTABLE_MAX_BYTES ||
      !path.isAbsolute(launcher)
    ) throw new Error("invalid acquired launcher");
    return launcher;
  } catch {
    throw adapterError("runtime_acquisition_failed");
  }
}

async function defaultAcquireLauncher(
  signal: AbortSignal | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: RuntimeResolverDependencies,
): Promise<string> {
  const trusted = await trustedNpm(dependencies.execPath ?? process.execPath, environment);
  return runAcquisition(
    trusted.nodePath,
    trusted.npmCliPath,
    environment,
    path.dirname(trusted.nodePath),
    signal,
  );
}

async function acquiredRoute(
  signal: AbortSignal | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: RuntimeResolverDependencies,
): Promise<RuntimeRoute> {
  if (environmentValue(environment, "PI_OFFLINE") === "1") {
    throw adapterError("runtime_unavailable");
  }
  const launcherPath = dependencies.acquireLauncher === undefined
    ? await defaultAcquireLauncher(signal, environment, dependencies)
    : await dependencies.acquireLauncher(signal, environment);
  const manifestPath = path.join(path.dirname(path.dirname(launcherPath)), "package.json");
  const found = await readLauncherRoute(
    manifestPath,
    "acquired",
    dependencies.execPath ?? process.execPath,
  );
  if (found === undefined || found.argumentPrefix[0] !== launcherPath) {
    throw adapterError("runtime_acquisition_failed");
  }
  return found;
}

function terminalProbeError(error: unknown): error is CareerInvocationError {
  return error instanceof CareerInvocationError &&
    (error.payload.code === "cancelled" || error.payload.code === "timeout");
}

function explicitProbeError(error: unknown): CareerInvocationError {
  if (error instanceof CareerInvocationError) {
    if (
      error.payload.code === "missing_executable" ||
      error.payload.code === "executable_unavailable" ||
      error.payload.code === "cancelled" ||
      error.payload.code === "timeout"
    ) return error;
  }
  return adapterError("managed_contract_invalid");
}

function sourceStart(afterSource: RuntimeRouteSource | undefined): number {
  if (afterSource === undefined || afterSource === "explicit") return 0;
  const index = SOURCE_ORDER.indexOf(afterSource as typeof SOURCE_ORDER[number]);
  return index < 0 ? 0 : index + 1;
}

async function probeCandidate(
  candidate: RuntimeRoute,
  probe: RuntimeProbe,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    await probe(candidate, signal);
    return true;
  } catch (error) {
    if (terminalProbeError(error)) throw error;
    if (candidate.source === "explicit") throw explicitProbeError(error);
    return false;
  }
}

async function resolveUncached(options: RuntimeResolutionOptions): Promise<RuntimeRoute> {
  const environment = options.environment ?? process.env;
  const dependencies = options.dependencies ?? {};
  if (options.signal?.aborted) throw adapterError("cancelled");
  const override = resolveCareerExecutable(environment);
  if (override !== undefined) {
    const candidate = explicitRoute(override);
    await probeCandidate(candidate, options.probe, options.signal);
    return candidate;
  }

  for (let index = sourceStart(options.afterSource); index < SOURCE_ORDER.length; index += 1) {
    const source = SOURCE_ORDER[index];
    let candidate: RuntimeRoute | undefined;
    if (source === "path") {
      candidate = await pathRoute(environment, dependencies.cwd ?? process.cwd());
    } else if (source === "package-local") {
      candidate = await packageLocalRoute(dependencies);
    } else {
      candidate = await acquiredRoute(options.signal, environment, dependencies);
    }
    if (candidate !== undefined && await probeCandidate(candidate, options.probe, options.signal)) {
      return candidate;
    }
  }
  throw adapterError("runtime_unavailable");
}

export async function resolveCareerRuntime(
  options: RuntimeResolutionOptions,
): Promise<RuntimeRoute> {
  const environment = options.environment ?? process.env;
  const environmentKey = runtimeEnvironmentKey(environment);
  const useCache = options.afterSource === undefined && options.dependencies === undefined;
  if (
    options.afterSource !== undefined &&
    cachedResolution?.environmentKey === environmentKey &&
    cachedResolution.route.source === options.afterSource
  ) cachedResolution = undefined;
  if (useCache && cachedResolution?.environmentKey === environmentKey) {
    return cachedResolution.route;
  }
  if (useCache && pendingResolution?.environmentKey === environmentKey) {
    return pendingResolution.promise;
  }
  if (cachedResolution?.environmentKey !== environmentKey) cachedResolution = undefined;

  const promise = resolveUncached(options);
  if (useCache) pendingResolution = { environmentKey, promise };
  try {
    const resolved = await promise;
    if (useCache && pendingResolution?.promise === promise) {
      cachedResolution = { environmentKey, route: resolved };
    } else if (options.afterSource !== undefined && options.dependencies === undefined) {
      cachedResolution = { environmentKey, route: resolved };
    }
    return resolved;
  } finally {
    if (useCache && pendingResolution?.promise === promise) pendingResolution = undefined;
  }
}
