// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { adapterError, CareerInvocationError } from "./errors.ts";

const MANIFEST_MAX_BYTES = 65_536;
const RUNTIME_MAX_BYTES = 16_777_216;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type RuntimeTargetKey = "darwin-arm64" | "linux-x64-gnu";

export interface RuntimePlatformInfo {
  platform: string;
  arch: string;
  glibcVersionRuntime?: string;
}

interface RuntimeTargetManifest {
  platform: string;
  arch: string;
  libc: string | null;
  target_triple: string;
  path: string;
  provenance_path: string;
  sha256: string;
  size_bytes: number;
  mode: string;
  version_output: string;
}

interface RuntimeManifest {
  schema_version: string;
  career_core?: {
    commit?: unknown;
  };
  targets?: Partial<Record<RuntimeTargetKey, RuntimeTargetManifest>>;
}

interface RuntimeResolutionOptions {
  platformInfo?: RuntimePlatformInfo;
  manifestPath?: string;
  runtimeRoot?: string;
}

const TARGET_LAYOUT: Readonly<
  Record<
    RuntimeTargetKey,
    {
      platform: string;
      arch: string;
      libc: string | null;
      targetTriple: string;
      relativePath: string;
      provenancePath: string;
    }
  >
> = {
  "darwin-arm64": {
    platform: "darwin",
    arch: "arm64",
    libc: null,
    targetTriple: "aarch64-apple-darwin",
    relativePath: "runtime/darwin-arm64/career",
    provenancePath: "runtime/darwin-arm64/provenance.json",
  },
  "linux-x64-gnu": {
    platform: "linux",
    arch: "x64",
    libc: "gnu",
    targetTriple: "x86_64-unknown-linux-gnu",
    relativePath: "runtime/linux-x64-gnu/career",
    provenancePath: "runtime/linux-x64-gnu/provenance.json",
  },
};

const verifiedRuntimeKeys = new Set<string>();
const pendingRuntimeVerifications = new Map<string, Promise<void>>();

function detectedGlibcVersion(): string | undefined {
  if (process.platform !== "linux") return undefined;
  try {
    const report = process.report?.getReport() as { header?: Record<string, unknown> } | undefined;
    const header = report?.header;
    const version = header?.glibcVersionRuntime;
    return typeof version === "string" && version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}

function currentPlatformInfo(): RuntimePlatformInfo {
  const glibcVersionRuntime = detectedGlibcVersion();
  return {
    platform: process.platform,
    arch: process.arch,
    ...(glibcVersionRuntime === undefined ? {} : { glibcVersionRuntime }),
  };
}

export function selectRuntimeTarget(info: RuntimePlatformInfo): RuntimeTargetKey {
  if (info.platform === "darwin" && info.arch === "arm64") return "darwin-arm64";
  if (
    info.platform === "linux" &&
    info.arch === "x64" &&
    typeof info.glibcVersionRuntime === "string" &&
    info.glibcVersionRuntime.length > 0
  ) {
    return "linux-x64-gnu";
  }
  throw adapterError("unsupported_platform");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isBoundedPositiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

async function readRuntimeManifest(manifestPath: string): Promise<RuntimeManifest> {
  try {
    const metadata = await lstat(manifestPath);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MANIFEST_MAX_BYTES) {
      throw adapterError("bundled_runtime_invalid");
    }
    const bytes = await readFile(manifestPath);
    if (bytes.length !== metadata.size) throw adapterError("bundled_runtime_invalid");
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(parsed)) throw adapterError("bundled_runtime_invalid");
    return parsed as unknown as RuntimeManifest;
  } catch (error) {
    if (error instanceof CareerInvocationError) throw error;
    throw adapterError("bundled_runtime_invalid");
  }
}

function manifestHeaderIsValid(manifest: RuntimeManifest): boolean {
  return (
    manifest.schema_version === "pi.career.runtime_manifest.v1" &&
    typeof manifest.career_core?.commit === "string" &&
    /^[a-f0-9]{40}$/.test(manifest.career_core.commit)
  );
}

function targetMatchesLayout(
  target: unknown,
  layout: (typeof TARGET_LAYOUT)[RuntimeTargetKey],
): target is RuntimeTargetManifest {
  if (!isRecord(target)) return false;
  return [
    target.platform === layout.platform,
    target.arch === layout.arch,
    target.libc === layout.libc,
    target.target_triple === layout.targetTriple,
    target.path === layout.relativePath,
    target.provenance_path === layout.provenancePath,
    isSha256(target.sha256),
    isBoundedPositiveInteger(target.size_bytes, RUNTIME_MAX_BYTES),
    target.mode === "0755",
    isBoundedText(target.version_output, 100),
  ].every(Boolean);
}

function validatedTarget(
  manifest: RuntimeManifest,
  targetKey: RuntimeTargetKey,
): RuntimeTargetManifest {
  const target = manifest.targets?.[targetKey];
  if (!manifestHeaderIsValid(manifest) || !targetMatchesLayout(target, TARGET_LAYOUT[targetKey])) {
    throw adapterError("bundled_runtime_invalid");
  }
  return target;
}

export async function verifyRuntimeBinary(
  executablePath: string,
  expected: Pick<RuntimeTargetManifest, "sha256" | "size_bytes" | "mode">,
): Promise<void> {
  try {
    if (!path.isAbsolute(executablePath)) throw adapterError("bundled_runtime_invalid");
    const metadata = await lstat(executablePath);
    if (
      !metadata.isFile() ||
      metadata.size !== expected.size_bytes ||
      (metadata.mode & 0o777) !== 0o755 ||
      expected.mode !== "0755"
    ) {
      throw adapterError("bundled_runtime_invalid");
    }
    const bytes = await readFile(executablePath);
    if (bytes.length !== expected.size_bytes) throw adapterError("bundled_runtime_invalid");
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== expected.sha256) throw adapterError("bundled_runtime_invalid");
  } catch (error) {
    if (error instanceof CareerInvocationError) throw error;
    throw adapterError("bundled_runtime_invalid");
  }
}

function defaultManifestPath(): string {
  return fileURLToPath(new URL("../runtime/manifest.json", import.meta.url));
}

function defaultRuntimeRoot(): string {
  return fileURLToPath(new URL("../runtime", import.meta.url));
}

export async function resolveBundledRuntime(
  options: RuntimeResolutionOptions = {},
): Promise<string> {
  const targetKey = selectRuntimeTarget(options.platformInfo ?? currentPlatformInfo());
  const manifestPath = options.manifestPath ?? defaultManifestPath();
  const runtimeRoot = options.runtimeRoot ?? defaultRuntimeRoot();
  if (!path.isAbsolute(manifestPath) || !path.isAbsolute(runtimeRoot)) {
    throw adapterError("bundled_runtime_invalid");
  }

  const manifest = await readRuntimeManifest(manifestPath);
  const target = validatedTarget(manifest, targetKey);
  const executablePath = path.join(runtimeRoot, targetKey, "career");
  const verificationKey = `${executablePath}\0${target.size_bytes}\0${target.sha256}`;
  if (verifiedRuntimeKeys.has(verificationKey)) return executablePath;

  let pending = pendingRuntimeVerifications.get(verificationKey);
  if (pending === undefined) {
    pending = verifyRuntimeBinary(executablePath, target);
    pendingRuntimeVerifications.set(verificationKey, pending);
  }
  try {
    await pending;
    verifiedRuntimeKeys.add(verificationKey);
    return executablePath;
  } finally {
    pendingRuntimeVerifications.delete(verificationKey);
  }
}
