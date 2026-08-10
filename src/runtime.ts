// SPDX-License-Identifier: MIT OR Apache-2.0

import { spawn } from "node:child_process";
import { constants as fsConstants, type Stats } from "node:fs";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { TextDecoder } from "node:util";

import { adapterError, CareerInvocationError } from "./errors.ts";

const CAREER_PACKAGE_NAME = "@revazi/career";
const CAREER_PACKAGE_VERSION = "0.1.1";
const CAREER_LAUNCHER_SCHEMA = "career.npm_launcher.v2";
const CAREER_TARGET_CATALOG = "targets.json";
const CAREER_PLATFORM_PACKAGES = Object.freeze([
  "@revazi/career-darwin-arm64",
  "@revazi/career-darwin-x64",
  "@revazi/career-linux-x64-gnu",
  "@revazi/career-linux-arm64-gnu",
  "@revazi/career-linux-x64-musl",
  "@revazi/career-linux-arm64-musl",
  "@revazi/career-win32-x64-msvc",
  "@revazi/career-win32-arm64-msvc",
]);
const CAREER_LAUNCHER_FILES = Object.freeze([
  "bin/career.js",
  CAREER_TARGET_CATALOG,
  "README.md",
  "LICENSE-MIT",
  "LICENSE-APACHE",
  "THIRD_PARTY_NOTICES.md",
]);
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

function executableNames(): string[] {
  // Windows batch/cmd shims require a command shell. Package launchers are handled
  // through the package-local/acquired routes; PATH remains direct argv only.
  return process.platform === "win32" ? ["career.exe", "career.com", "career"] : ["career"];
}

async function pathRoute(
  environment: Readonly<Record<string, string | undefined>>,
  cwd: string,
): Promise<RuntimeRoute | undefined> {
  for (const directory of pathEntries(environmentValue(environment, "PATH"), cwd)) {
    for (const name of executableNames()) {
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
    (!executable || process.platform === "win32" || (metadata.mode & 0o111) !== 0);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function exactStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function launcherManifestIsValid(manifest: unknown): manifest is Record<string, unknown> {
  if (
    !isRecord(manifest) ||
    !isRecord(manifest.bin) ||
    !isRecord(manifest.optionalDependencies) ||
    !isRecord(manifest.career_launcher)
  ) return false;
  const optionalDependencies = manifest.optionalDependencies;
  return manifest.name === CAREER_PACKAGE_NAME &&
    manifest.version === CAREER_PACKAGE_VERSION &&
    exactKeys(manifest.bin, ["career"]) &&
    manifest.bin.career === "bin/career.js" &&
    exactStringArray(manifest.files, CAREER_LAUNCHER_FILES) &&
    exactKeys(optionalDependencies, CAREER_PLATFORM_PACKAGES) &&
    CAREER_PLATFORM_PACKAGES.every(
      (packageName) => optionalDependencies[packageName] === CAREER_PACKAGE_VERSION,
    ) &&
    exactKeys(manifest.career_launcher, [
      "schema_version", "executable", "target_catalog", "platform_packages",
    ]) &&
    manifest.career_launcher.schema_version === CAREER_LAUNCHER_SCHEMA &&
    manifest.career_launcher.executable === "career" &&
    manifest.career_launcher.target_catalog === CAREER_TARGET_CATALOG &&
    exactStringArray(manifest.career_launcher.platform_packages, CAREER_PLATFORM_PACKAGES);
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
    if (
      !nodeMetadata.isFile() ||
      (process.platform !== "win32" && (nodeMetadata.mode & 0o111) === 0)
    ) return undefined;
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

interface TrustedNpm {
  nodePath: string;
  npmCliPath: string;
  scriptShell: string;
  windowsSystemRoot?: string;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function environmentValues(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): Array<string | undefined> {
  return Object.entries(environment)
    .filter(([name]) => name.toLowerCase() === key.toLowerCase())
    .map(([, value]) => value);
}

async function trustedWindowsShell(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<{ scriptShell: string; systemRoot: string }> {
  const roots = environmentValues(environment, "SystemRoot");
  const suppliedShells = environmentValues(environment, "ComSpec");
  if (roots.length !== 1 || suppliedShells.length > 1) throw new Error("invalid Windows tools");
  const root = roots[0];
  if (typeof root !== "string" || !path.isAbsolute(root) || root.includes("\0")) {
    throw new Error("invalid Windows root");
  }
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error("invalid Windows root");
  }
  const realSystemRoot = await realpath(root);
  const derivedShell = path.join(realSystemRoot, "System32", "cmd.exe");
  const realShell = await realpath(derivedShell);
  if (!samePath(realShell, derivedShell)) throw new Error("invalid Windows shell path");
  const shellMetadata = await lstat(realShell);
  if (shellMetadata.isSymbolicLink() || !shellMetadata.isFile()) {
    throw new Error("invalid Windows shell");
  }
  if (suppliedShells.length === 1) {
    const suppliedShell = suppliedShells[0];
    if (typeof suppliedShell !== "string" || !path.isAbsolute(suppliedShell)) {
      throw new Error("invalid ComSpec");
    }
    if (!samePath(await realpath(suppliedShell), realShell)) throw new Error("conflicting ComSpec");
  }
  return { scriptShell: realShell, systemRoot: realSystemRoot };
}

async function trustedNpm(
  execPath: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<TrustedNpm> {
  try {
    if (!path.isAbsolute(execPath)) throw new Error("invalid node path");
    const realNodePath = await realpath(execPath);
    const nodeMetadata = await lstat(realNodePath);
    if (
      !nodeMetadata.isFile() ||
      (process.platform !== "win32" && (nodeMetadata.mode & 0o111) === 0)
    ) throw new Error("invalid node executable");
    const derivedNpmCliPath = process.platform === "win32"
      ? path.join(path.dirname(realNodePath), "node_modules", "npm", "bin", "npm-cli.js")
      : path.join(
        path.dirname(path.dirname(realNodePath)),
        "lib", "node_modules", "npm", "bin", "npm-cli.js",
      );
    const realNpmCliPath = await realpath(derivedNpmCliPath);
    if (!samePath(realNpmCliPath, derivedNpmCliPath)) throw new Error("invalid npm path");
    const npmMetadata = await lstat(realNpmCliPath);
    if (
      !npmMetadata.isFile() ||
      (process.platform !== "win32" && (npmMetadata.mode & 0o111) === 0)
    ) throw new Error("invalid npm executable");
    const supplied = npmExecPathValues(environment);
    if (supplied.length > 1) throw new Error("ambiguous npm_execpath");
    if (supplied.length === 1) {
      const suppliedPath = supplied[0];
      if (typeof suppliedPath !== "string" || !path.isAbsolute(suppliedPath)) {
        throw new Error("invalid npm_execpath");
      }
      if (!samePath(await realpath(suppliedPath), realNpmCliPath)) {
        throw new Error("conflicting npm_execpath");
      }
    }
    if (process.platform === "win32") {
      const windows = await trustedWindowsShell(environment);
      return {
        nodePath: realNodePath,
        npmCliPath: realNpmCliPath,
        scriptShell: windows.scriptShell,
        windowsSystemRoot: windows.systemRoot,
      };
    }
    return { nodePath: realNodePath, npmCliPath: realNpmCliPath, scriptShell: "/bin/sh" };
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
  trusted: TrustedNpm,
): NodeJS.ProcessEnv {
  const windowsControlled = new Set(["comspec", "pathext", "systemroot", "windir"]);
  const sanitized = Object.fromEntries(Object.entries(environment).filter(([key, value]) =>
    typeof value === "string" &&
    key.toLowerCase() !== "path" &&
    !(process.platform === "win32" && windowsControlled.has(key.toLowerCase())) &&
    !FORBIDDEN_NPM_ENVIRONMENT.has(key.toLowerCase().replaceAll("-", "_")),
  ));
  if (process.platform === "win32" && trusted.windowsSystemRoot !== undefined) {
    return {
      ...sanitized,
      PATH: [
        path.dirname(trusted.nodePath),
        path.dirname(trusted.scriptShell),
        trusted.windowsSystemRoot,
      ].join(path.delimiter),
      ComSpec: trusted.scriptShell,
      SystemRoot: trusted.windowsSystemRoot,
      WINDIR: trusted.windowsSystemRoot,
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
    };
  }
  return {
    ...sanitized,
    PATH: [path.dirname(trusted.nodePath), "/usr/bin", "/bin"].join(path.delimiter),
  };
}

const LOCATE_ACQUIRED_LAUNCHER = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const first = (process.env.PATH || "").split(path.delimiter)[0];
if (!first || !path.isAbsolute(first) || path.basename(first) !== ".bin") process.exit(2);
const modules = path.dirname(first);
if (path.basename(modules) !== "node_modules") process.exit(2);
const launcher = path.join(modules, "@revazi", "career", "bin", "career.js");
process.stdout.write(fs.realpathSync(launcher));
`;

interface AcquisitionResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  spawnError: boolean;
  terminationError?: CareerInvocationError;
  stdout: Buffer[];
  stderrBytes: number;
}

export function terminateAcquisitionProcessTree(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void {
  try {
    if (child.pid === undefined) throw new Error("missing process id");
    if (process.platform === "win32") {
      // A detached Windows child is a new process group. CTRL_BREAK reaches the
      // npm shell and locator descendants; the forced pass also ends npm itself.
      process.kill(child.pid, "SIGBREAK");
      if (signal === "SIGKILL") child.kill("SIGKILL");
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The close/error event remains authoritative.
    }
  }
}

async function runAcquisition(
  trusted: TrustedNpm,
  environment: Readonly<Record<string, string | undefined>>,
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  const { nodePath, npmCliPath, scriptShell } = trusted;
  const locatorNode = process.platform === "win32" ? path.basename(nodePath) : nodePath;
  if (signal?.aborted) throw adapterError("cancelled");
  const arguments_ = [
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
    locatorNode,
    "-e",
    LOCATE_ACQUIRED_LAUNCHER,
  ];

  const completed = await new Promise<AcquisitionResult>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(nodePath, arguments_, {
        cwd,
        detached: true,
        env: sanitizedNpmEnvironment(environment, trusted),
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
      terminateAcquisitionProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => {
        if (!closed) terminateAcquisitionProcessTree(child, "SIGKILL");
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
    trusted,
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
