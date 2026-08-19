// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

import { parseStrictJson } from "./strict-json.ts";
import {
  type ApplicationWorkspaceConfig,
  type CareerConfig,
  type LibraryRoot,
  workflowError,
} from "./types.ts";

const CONFIG_V1_SCHEMA = "pi.career.config.v1";
const CONFIG_V2_SCHEMA = "pi.career.config.v2";
const CONFIG_MAX_BYTES = 65_536;
const LABEL_MAX_CHARACTERS = 80;
const PATH_MAX_BYTES = 4_096;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONFIG_LOCK_SCHEMA = "pi.career.workspace_lock.v1";

interface FileIdentity {
  dev: number;
  ino: number;
  size: number;
  uid: number;
  mode: number;
  nlink: number;
}

export type ConfigSourceFormat = "absent" | "v1" | "v2";
type ConfigFileFormat = Exclude<ConfigSourceFormat, "absent">;

export interface ConfigSnapshot {
  readonly config: CareerConfig;
  readonly filePath: string;
  readonly directoryPath: string;
  readonly bytes: Buffer | null;
  readonly sha256: string | null;
  readonly identity: FileIdentity | null;
  readonly sourceFormat: ConfigSourceFormat;
}

interface DecodedConfig {
  config: CareerConfig;
  sourceFormat: ConfigFileFormat;
}

interface ConfigWriteOptions {
  now?: () => Date;
}

interface ConfigLock {
  path: string;
  identity: FileIdentity;
}

const SNAPSHOTS = new WeakMap<CareerConfig, ConfigSnapshot>();

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function identity(metadata: Stats): FileIdentity {
  return {
    dev: metadata.dev,
    ino: metadata.ino,
    size: metadata.size,
    uid: metadata.uid,
    mode: metadata.mode,
    nlink: metadata.nlink,
  };
}

function sameIdentity(metadata: Stats, expected: FileIdentity): boolean {
  return metadata.dev === expected.dev && metadata.ino === expected.ino &&
    metadata.size === expected.size && metadata.uid === expected.uid &&
    metadata.mode === expected.mode && metadata.nlink === expected.nlink;
}

function effectiveUserId(): number {
  const value = process.geteuid?.() ?? process.getuid?.();
  if (value === undefined) throw workflowError("config_invalid");
  return value;
}

function exactPrivateMode(metadata: Stats, expected: number): boolean {
  return metadata.uid === effectiveUserId() && (metadata.mode & 0o7777) === expected;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function validLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= LABEL_MAX_CHARACTERS &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function canonicalBoundedAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && path.isAbsolute(value) &&
    Buffer.byteLength(value, "utf8") <= PATH_MAX_BYTES &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    path.resolve(value) === value && path.parse(value).root !== value &&
    !value.endsWith(path.sep);
}

function normalizeLegacyGeneratedVariantsRoot(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || !path.isAbsolute(value) ||
    Buffer.byteLength(value, "utf8") > PATH_MAX_BYTES || /[\u0000-\u001f\u007f]/.test(value)) return undefined;
  const normalized = path.resolve(value);
  return path.dirname(normalized) === normalized ? undefined : normalized;
}

export function rootId(canonicalPath: string): string {
  return createHash("sha256").update(canonicalPath).digest("hex");
}

function parseRoot(value: unknown): LibraryRoot | undefined {
  if (!isPlainRecord(value) || !exactKeys(value, ["id", "path", "label"])) return undefined;
  if (typeof value.id !== "string" || !SHA256.test(value.id) ||
    typeof value.path !== "string" || !path.isAbsolute(value.path) ||
    !canonicalBoundedAbsolutePath(value.path) ||
    value.id !== rootId(value.path) || !validLabel(value.label)) return undefined;
  return { id: value.id, path: value.path, label: value.label };
}

function parseRoots(value: unknown): LibraryRoot[] {
  if (!Array.isArray(value)) throw workflowError("config_invalid");
  const roots: LibraryRoot[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const candidate of value) {
    const root = parseRoot(candidate);
    if (root === undefined || ids.has(root.id) || paths.has(root.path)) throw workflowError("config_invalid");
    ids.add(root.id);
    paths.add(root.path);
    roots.push(root);
  }
  return roots;
}

function componentOverlap(left: string, right: string): boolean {
  if (left === right) return true;
  const relativeLeft = path.relative(left, right);
  if (relativeLeft !== "" && relativeLeft !== ".." && !relativeLeft.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeLeft)) return true;
  const relativeRight = path.relative(right, left);
  return relativeRight !== "" && relativeRight !== ".." &&
    !relativeRight.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeRight);
}

function parseApplicationWorkspace(value: unknown): ApplicationWorkspaceConfig | null {
  if (value === null) return null;
  if (!isPlainRecord(value) || !exactKeys(value, ["root_id", "root_path"]) ||
    typeof value.root_id !== "string" || !UUID.test(value.root_id) ||
    !canonicalBoundedAbsolutePath(value.root_path)) throw workflowError("config_invalid");
  return { root_id: value.root_id, root_path: value.root_path };
}

function canonicalConfig(value: CareerConfig): CareerConfig {
  return {
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: value.library_roots.map((root) => ({ id: root.id, path: root.path, label: root.label })),
    generated_variants_root: value.generated_variants_root,
    application_workspace: value.application_workspace === null ? null : {
      root_id: value.application_workspace.root_id,
      root_path: value.application_workspace.root_path,
    },
  };
}

function parseV1(value: Record<string, unknown>): CareerConfig {
  if (!exactKeys(value, ["schema_version", "library_roots"], ["generated_variants_root"]) ||
    value.schema_version !== CONFIG_V1_SCHEMA) throw workflowError("config_invalid");
  const roots = parseRoots(value.library_roots);
  const generated = value.generated_variants_root === undefined
    ? undefined
    : normalizeLegacyGeneratedVariantsRoot(value.generated_variants_root);
  if (value.generated_variants_root !== undefined &&
    (generated === undefined || generated !== value.generated_variants_root ||
      roots.some((root) => root.path === generated))) throw workflowError("config_invalid");
  return {
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: roots,
    generated_variants_root: generated ?? null,
    application_workspace: null,
  };
}

function parseV2(value: Record<string, unknown>): CareerConfig {
  if (!exactKeys(value, ["schema_version", "library_roots", "generated_variants_root", "application_workspace"]) ||
    value.schema_version !== CONFIG_V2_SCHEMA) throw workflowError("config_invalid");
  const roots = parseRoots(value.library_roots);
  const generated = value.generated_variants_root === null
    ? null
    : canonicalBoundedAbsolutePath(value.generated_variants_root) ? value.generated_variants_root : undefined;
  if (generated === undefined || (generated !== null && roots.some((root) => root.path === generated))) {
    throw workflowError("config_invalid");
  }
  const applicationWorkspace = parseApplicationWorkspace(value.application_workspace);
  if (applicationWorkspace !== null && [
    ...roots.map((root) => root.path),
    ...(generated === null ? [] : [generated]),
  ].some((candidate) => componentOverlap(applicationWorkspace.root_path, candidate))) {
    throw workflowError("config_invalid");
  }
  return canonicalConfig({
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: roots,
    generated_variants_root: generated,
    application_workspace: applicationWorkspace,
  });
}

function boundedConfigBytes(value: unknown): Buffer {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (bytes.length > CONFIG_MAX_BYTES) throw workflowError("config_invalid");
  return bytes;
}

function encodeConfigV1(config: CareerConfig): Buffer {
  if (config.application_workspace !== null) throw workflowError("config_invalid");
  const value = {
    schema_version: CONFIG_V1_SCHEMA,
    library_roots: config.library_roots.map((root) => ({ id: root.id, path: root.path, label: root.label })),
    ...(config.generated_variants_root === null
      ? {}
      : { generated_variants_root: config.generated_variants_root }),
  };
  parseV1(value);
  return boundedConfigBytes(value);
}

function encodeConfigV2(config: CareerConfig): Buffer {
  const validated = parseV2(canonicalConfig(config) as unknown as Record<string, unknown>);
  return boundedConfigBytes(validated);
}

export function encodeConfig(config: CareerConfig): Buffer {
  return encodeConfigV2(config);
}

function encodeConfigForFormat(config: CareerConfig, format: ConfigFileFormat): Buffer {
  return format === "v1" ? encodeConfigV1(config) : encodeConfigV2(config);
}

function decodeConfig(bytes: Buffer): DecodedConfig {
  if (bytes.length === 0 || bytes.length > CONFIG_MAX_BYTES ||
    (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    throw workflowError("config_invalid");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw workflowError("config_invalid");
  }
  let value: unknown;
  try {
    value = parseStrictJson(text);
  } catch {
    throw workflowError("config_invalid");
  }
  if (!isPlainRecord(value)) throw workflowError("config_invalid");
  if (value.schema_version === CONFIG_V1_SCHEMA) return { config: parseV1(value), sourceFormat: "v1" };
  const config = parseV2(value);
  if (!bytes.equals(encodeConfigV2(config))) throw workflowError("config_invalid");
  return { config, sourceFormat: "v2" };
}

export function emptyConfig(): CareerConfig {
  const config: CareerConfig = {
    schema_version: CONFIG_V2_SCHEMA,
    library_roots: [],
    generated_variants_root: null,
    application_workspace: null,
  };
  SNAPSHOTS.set(config, {
    config,
    filePath: "",
    directoryPath: "",
    bytes: null,
    sha256: null,
    identity: null,
    sourceFormat: "absent",
  });
  return config;
}

export function configPath(agentDir: string): string {
  if (!path.isAbsolute(agentDir)) throw workflowError("config_invalid");
  return path.join(agentDir, "career", "config.v1.json");
}

function attachSnapshot(config: CareerConfig, snapshot: Omit<ConfigSnapshot, "config">): ConfigSnapshot {
  const complete = { ...snapshot, config };
  SNAPSHOTS.set(config, complete);
  return complete;
}

function inheritSnapshot(source: CareerConfig, target: CareerConfig): CareerConfig {
  const snapshot = SNAPSHOTS.get(source);
  if (snapshot !== undefined) attachSnapshot(target, {
    filePath: snapshot.filePath,
    directoryPath: snapshot.directoryPath,
    bytes: snapshot.bytes,
    sha256: snapshot.sha256,
    identity: snapshot.identity,
    sourceFormat: snapshot.sourceFormat,
  });
  return target;
}

async function noSymlinkComponentWalk(
  value: string,
  errorCode: "config_invalid" | "workspace_root_invalid",
): Promise<void> {
  const parsed = path.parse(value);
  let current = parsed.root;
  try {
    for (const component of value.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw workflowError(errorCode);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError(errorCode);
  }
}

async function configDirectoryMetadata(directory: string, allowMissing: boolean): Promise<Stats | undefined> {
  try {
    return await lstat(directory);
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    throw workflowError("config_invalid");
  }
}

async function validatePresentConfigDirectory(directory: string, metadata: Stats): Promise<void> {
  try {
    await noSymlinkComponentWalk(directory, "config_invalid");
    const canonical = await realpath(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== directory ||
      !exactPrivateMode(metadata, 0o700)) throw workflowError("config_invalid");
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("config_invalid");
  }
}

async function validateConfigDirectory(directory: string, allowMissing = false): Promise<boolean> {
  if (!canonicalBoundedAbsolutePath(directory)) throw workflowError("config_invalid");
  const metadata = await configDirectoryMetadata(directory, allowMissing);
  if (metadata === undefined) return false;
  await validatePresentConfigDirectory(directory, metadata);
  return true;
}

async function readPresentSnapshot(file: string, directory: string): Promise<ConfigSnapshot> {
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 ||
      metadata.size > CONFIG_MAX_BYTES || metadata.nlink !== 1 || !exactPrivateMode(metadata, 0o600)) {
      throw workflowError("config_invalid");
    }
    const bytes = await readFile(file);
    if (bytes.length !== metadata.size) throw workflowError("config_invalid");
    const decoded = decodeConfig(bytes);
    return attachSnapshot(decoded.config, {
      filePath: file,
      directoryPath: directory,
      bytes,
      sha256: hashBytes(bytes),
      identity: identity(metadata),
      sourceFormat: decoded.sourceFormat,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("config_invalid");
  }
}

async function loadConfigSnapshotInternal(agentDir: string, allowMissingDirectory: boolean): Promise<ConfigSnapshot> {
  const file = configPath(agentDir);
  const directory = path.dirname(file);
  const directoryExists = await validateConfigDirectory(directory, allowMissingDirectory);
  const absent = (): ConfigSnapshot => {
    const config = emptyConfig();
    return attachSnapshot(config, {
      filePath: file,
      directoryPath: directory,
      bytes: null,
      sha256: null,
      identity: null,
      sourceFormat: "absent",
    });
  };
  if (!directoryExists) return absent();

  try {
    await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw workflowError("config_invalid");
    return absent();
  }
  return readPresentSnapshot(file, directory);
}

export async function loadConfigSnapshot(agentDir: string): Promise<ConfigSnapshot> {
  return loadConfigSnapshotInternal(agentDir, false);
}

export async function loadConfig(agentDir: string): Promise<CareerConfig> {
  return (await loadConfigSnapshotInternal(agentDir, true)).config;
}

async function canonicalizeRoot(inputPath: string): Promise<string> {
  if (typeof inputPath !== "string" || inputPath.length === 0 || inputPath.includes("\0") ||
    Buffer.byteLength(inputPath, "utf8") > PATH_MAX_BYTES) throw workflowError("root_invalid");
  try {
    const absolute = path.resolve(inputPath);
    const suppliedMetadata = await lstat(absolute);
    if (!suppliedMetadata.isDirectory() || suppliedMetadata.isSymbolicLink()) throw workflowError("root_invalid");
    const canonical = await realpath(absolute);
    const metadata = await lstat(canonical);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw workflowError("root_invalid");
    await access(canonical, constants.R_OK);
    return canonical;
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("root_invalid");
  }
}

function defaultRootLabel(canonicalPath: string): string {
  const label = path.basename(canonicalPath).trim();
  return (label || "Resume library").slice(0, LABEL_MAX_CHARACTERS);
}

export async function addLibraryRoot(config: CareerConfig, inputPath: string, label?: string): Promise<CareerConfig> {
  const canonical = await canonicalizeRoot(inputPath);
  const chosenLabel = label?.trim() || defaultRootLabel(canonical);
  if (!validLabel(chosenLabel)) throw workflowError("root_invalid");
  const id = rootId(canonical);
  const withoutExisting = config.library_roots.filter((root) => root.id !== id);
  return inheritSnapshot(config, canonicalConfig({
    ...config,
    library_roots: [...withoutExisting, { id, path: canonical, label: chosenLabel }],
  }));
}

export function removeLibraryRoot(config: CareerConfig, id: string): CareerConfig {
  return inheritSnapshot(config, canonicalConfig({
    ...config,
    library_roots: config.library_roots.filter((root) => root.id !== id),
  }));
}

export function suggestedGeneratedVariantsRoot(config: CareerConfig, selectedRootId?: string): string | undefined {
  if (config.generated_variants_root !== null) return config.generated_variants_root;
  const selectedRoot = selectedRootId === undefined
    ? config.library_roots[0]
    : config.library_roots.find((root) => root.id === selectedRootId);
  return selectedRoot === undefined ? undefined : path.join(selectedRoot.path, "variants");
}

export function setGeneratedVariantsRoot(config: CareerConfig, inputPath: string): CareerConfig {
  const normalized = normalizeLegacyGeneratedVariantsRoot(inputPath);
  if (normalized === undefined || config.library_roots.some((root) => root.path === normalized)) {
    throw workflowError("root_invalid");
  }
  return inheritSnapshot(config, canonicalConfig({ ...config, generated_variants_root: normalized }));
}

export function clearGeneratedVariantsRoot(config: CareerConfig): CareerConfig {
  return inheritSnapshot(config, canonicalConfig({ ...config, generated_variants_root: null }));
}

export function setApplicationWorkspace(
  config: CareerConfig,
  applicationWorkspace: ApplicationWorkspaceConfig | null,
): CareerConfig {
  return inheritSnapshot(config, canonicalConfig({ ...config, application_workspace: applicationWorkspace }));
}

export async function validateApplicationRootPath(value: string): Promise<Stats> {
  if (!canonicalBoundedAbsolutePath(value) ||
    Buffer.byteLength(path.join(value, "x".repeat(180)), "utf8") > PATH_MAX_BYTES) {
    throw workflowError("workspace_root_invalid");
  }
  try {
    await noSymlinkComponentWalk(value, "workspace_root_invalid");
    const metadata = await lstat(value);
    const canonical = await realpath(value);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== value ||
      !exactPrivateMode(metadata, 0o700)) throw workflowError("workspace_root_invalid");
    await access(value, constants.R_OK | constants.W_OK | constants.X_OK);
    return metadata;
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_root_invalid");
  }
}

async function currentDirectoryIdentity(value: string, application = false): Promise<Stats> {
  try {
    const metadata = application ? await validateApplicationRootPath(value) : await lstat(value);
    const canonical = await realpath(value);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== value) {
      throw workflowError(application ? "workspace_root_invalid" : "workspace_root_overlap");
    }
    return metadata;
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError(application ? "workspace_root_invalid" : "workspace_root_overlap");
  }
}

export async function assertApplicationWorkspaceDisjoint(config: CareerConfig): Promise<void> {
  const application = config.application_workspace;
  if (application === null) return;
  const applicationMetadata = await currentDirectoryIdentity(application.root_path, true);
  for (const candidate of config.library_roots.map((root) => root.path)) {
    if (componentOverlap(application.root_path, candidate)) throw workflowError("workspace_root_overlap");
    const metadata = await currentDirectoryIdentity(candidate);
    if (metadata.dev === applicationMetadata.dev && metadata.ino === applicationMetadata.ino) {
      throw workflowError("workspace_root_overlap");
    }
  }
  const generated = config.generated_variants_root;
  if (generated !== null) {
    if (componentOverlap(application.root_path, generated)) throw workflowError("workspace_root_overlap");
    try {
      const metadata = await lstat(generated);
      const canonical = await realpath(generated);
      if (metadata.isSymbolicLink() || canonical !== generated ||
        (metadata.dev === applicationMetadata.dev && metadata.ino === applicationMetadata.ino)) {
        throw workflowError("workspace_root_overlap");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
        throw workflowError("workspace_root_overlap");
      }
    }
  }
}

function lockBytes(kind: "config_mutation_lock" | "workspace_mutation_lock", mutationId: string, createdAt: string): Buffer {
  return Buffer.from(`${JSON.stringify({
    schema_version: CONFIG_LOCK_SCHEMA,
    kind,
    mutation_id: mutationId,
    created_at: createdAt,
  }, null, 2)}\n`, "utf8");
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
    await handle.close();
  } catch {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    throw workflowError("workspace_status_unknown");
  }
}

async function validateConfigBootstrapParent(agentDir: string): Promise<void> {
  if (!canonicalBoundedAbsolutePath(agentDir)) throw workflowError("config_invalid");
  try {
    await noSymlinkComponentWalk(agentDir, "config_invalid");
    const metadata = await lstat(agentDir);
    const canonical = await realpath(agentDir);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== agentDir ||
      metadata.uid !== effectiveUserId()) throw workflowError("config_invalid");
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("config_invalid");
  }
}

function assertCreatedDirectoryIdentity(created: Stats, opened: Stats): void {
  if (!created.isDirectory() || created.isSymbolicLink() || created.uid !== effectiveUserId() ||
    created.dev !== opened.dev || created.ino !== opened.ino) throw workflowError("config_invalid");
}

function assertPrivateDirectoryIdentity(expected: Stats, current: Stats): void {
  if (current.dev !== expected.dev || current.ino !== expected.ino ||
    !exactPrivateMode(current, 0o700)) throw workflowError("config_invalid");
}

async function createPrivateConfigDirectory(agentDir: string, directory: string): Promise<void> {
  await mkdir(directory, { recursive: false, mode: 0o700 });
  const created = await lstat(directory);
  let handle: FileHandle | undefined;
  try {
    handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
    assertCreatedDirectoryIdentity(created, await handle.stat());
    await handle.chmod(0o700);
    const privateCreated = await handle.stat();
    await handle.close();
    handle = undefined;
    assertPrivateDirectoryIdentity(privateCreated, await lstat(directory));
    await validateConfigDirectory(directory);
    await syncDirectory(agentDir);
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined);
  }
}

async function ensureConfigDirectoryForOrdinaryWrite(agentDir: string, directory: string): Promise<void> {
  if (await validateConfigDirectory(directory, true)) return;
  await validateConfigBootstrapParent(agentDir);
  try {
    await createPrivateConfigDirectory(agentDir, directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
      await validateConfigDirectory(directory);
      return;
    }
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("config_invalid");
  }
}

export function configLockPath(agentDir: string): string {
  return path.join(path.dirname(configPath(agentDir)), ".pi-career-config.lock");
}

export function workspaceLockPath(rootPath: string): string {
  return path.join(rootPath, ".pi-career-workspace.lock");
}

export async function acquireMutationLock(
  lockPath: string,
  kind: "config_mutation_lock" | "workspace_mutation_lock",
  mutationId: string,
  createdAt: string,
): Promise<ConfigLock> {
  if (!UUID.test(mutationId) || !ISO_UTC.test(createdAt) || new Date(createdAt).toISOString() !== createdAt) {
    throw workflowError("workspace_verification_failed");
  }
  const bytes = lockBytes(kind, mutationId, createdAt);
  let handle: FileHandle | undefined;
  let createdIdentity: Pick<FileIdentity, "dev" | "ino"> | undefined;
  try {
    handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    const created = await handle.stat();
    createdIdentity = { dev: created.dev, ino: created.ino };
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.chmod(0o600);
    const metadata = await handle.stat();
    await handle.close();
    handle = undefined;
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size !== bytes.length ||
      !exactPrivateMode(metadata, 0o600) || !(await readFile(lockPath)).equals(bytes)) {
      throw workflowError("workspace_verification_failed");
    }
    await syncDirectory(path.dirname(lockPath));
    return { path: lockPath, identity: identity(metadata) };
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    if (createdIdentity !== undefined) {
      try {
        const current = await lstat(lockPath);
        if (current.dev === createdIdentity.dev && current.ino === createdIdentity.ino) {
          await unlink(lockPath);
          await syncDirectory(path.dirname(lockPath));
        }
      } catch {
        // Best-effort cleanup is limited to the exact lock inode created by this acquisition.
      }
    }
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") throw workflowError("workspace_busy");
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_verification_failed");
  }
}

export async function releaseMutationLock(lock: ConfigLock): Promise<void> {
  try {
    const metadata = await lstat(lock.path);
    if (!sameIdentity(metadata, lock.identity)) throw workflowError("workspace_status_unknown");
    await unlink(lock.path);
    await syncDirectory(path.dirname(lock.path));
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_status_unknown");
  }
}

export async function assertConfigSnapshotCurrent(snapshot: ConfigSnapshot): Promise<void> {
  try {
    await validateConfigDirectory(snapshot.directoryPath);
  } catch {
    throw workflowError("workspace_drift");
  }
  if (snapshot.bytes === null || snapshot.identity === null) {
    try {
      await lstat(snapshot.filePath);
      throw workflowError("workspace_drift");
    } catch (error) {
      if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw workflowError("workspace_drift");
      return;
    }
  }
  try {
    const metadata = await lstat(snapshot.filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || !sameIdentity(metadata, snapshot.identity) ||
      !exactPrivateMode(metadata, 0o600) || metadata.nlink !== 1) throw workflowError("workspace_drift");
    const bytes = await readFile(snapshot.filePath);
    if (!bytes.equals(snapshot.bytes) || hashBytes(bytes) !== snapshot.sha256) throw workflowError("workspace_drift");
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_drift");
  }
}

async function verifyConfigFinal(file: string, expected: Buffer, format: ConfigFileFormat): Promise<void> {
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      metadata.size !== expected.length || !exactPrivateMode(metadata, 0o600)) {
      throw workflowError("workspace_status_unknown");
    }
    const bytes = await readFile(file);
    if (!bytes.equals(expected)) throw workflowError("workspace_status_unknown");
    if (decodeConfig(bytes).sourceFormat !== format) throw workflowError("workspace_status_unknown");
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_status_unknown");
  }
}

export async function commitConfigUnderLock(
  snapshot: ConfigSnapshot,
  next: CareerConfig,
  temporaryPath: string,
  targetFormat: ConfigFileFormat,
): Promise<void> {
  const bytes = encodeConfigForFormat(next, targetFormat);
  await assertConfigSnapshotCurrent(snapshot);
  let handle: FileHandle | undefined;
  let temporaryIdentity: FileIdentity | undefined;
  let published = false;
  try {
    handle = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.chmod(0o600);
    const metadata = await handle.stat();
    await handle.close();
    handle = undefined;
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size !== bytes.length ||
      !exactPrivateMode(metadata, 0o600) || !(await readFile(temporaryPath)).equals(bytes)) {
      throw workflowError("workspace_verification_failed");
    }
    temporaryIdentity = identity(metadata);
    await assertConfigSnapshotCurrent(snapshot);
    if (snapshot.bytes === null) {
      await link(temporaryPath, snapshot.filePath);
      published = true;
      const linked = await lstat(snapshot.filePath);
      if (linked.dev !== metadata.dev || linked.ino !== metadata.ino) throw workflowError("workspace_status_unknown");
      await unlink(temporaryPath);
    } else {
      await rename(temporaryPath, snapshot.filePath);
      published = true;
    }
    await syncDirectory(snapshot.directoryPath);
    await verifyConfigFinal(snapshot.filePath, bytes, targetFormat);
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    if (published) {
      try {
        if (temporaryIdentity !== undefined) {
          const temporary = await lstat(temporaryPath).catch(() => undefined);
          if (temporary !== undefined && temporary.dev === temporaryIdentity.dev && temporary.ino === temporaryIdentity.ino) {
            await unlink(temporaryPath);
          }
        }
        await syncDirectory(snapshot.directoryPath);
        await verifyConfigFinal(snapshot.filePath, bytes, targetFormat);
        return;
      } catch {
        if (temporaryIdentity !== undefined) {
          try {
            const temporary = await lstat(temporaryPath);
            if (temporary.dev === temporaryIdentity.dev && temporary.ino === temporaryIdentity.ino) {
              await unlink(temporaryPath);
              await syncDirectory(snapshot.directoryPath);
            }
          } catch {
            // An indeterminate temporary inode is left for reconciliation.
          }
        }
        throw workflowError("workspace_status_unknown");
      }
    }
    if (temporaryIdentity !== undefined) {
      try {
        const metadata = await lstat(temporaryPath);
        if (metadata.dev === temporaryIdentity.dev && metadata.ino === temporaryIdentity.ino) {
          await unlink(temporaryPath);
          await syncDirectory(snapshot.directoryPath);
        }
      } catch {
        // Best-effort cleanup is limited to the exact temporary inode.
      }
    }
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") throw workflowError("workspace_collision");
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_status_unknown");
  }
}

export function configTemporaryPath(agentDir: string, mutationId: string): string {
  if (!UUID.test(mutationId)) throw workflowError("config_invalid");
  return path.join(path.dirname(configPath(agentDir)), `.config.v1.${mutationId}.tmp`);
}

async function withQueues<T>(keys: readonly string[], operation: () => Promise<T>): Promise<T> {
  const unique = [...new Set(keys)].sort();
  const run = (index: number): Promise<T> => index >= unique.length
    ? operation()
    : withFileMutationQueue(unique[index]!, () => run(index + 1));
  return run(0);
}

export async function writeConfig(
  agentDir: string,
  config: CareerConfig,
  uuid: () => string = randomUUID,
  options: ConfigWriteOptions = {},
): Promise<void> {
  const mutationId = uuid().toLowerCase();
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  if (!UUID.test(mutationId)) throw workflowError("config_invalid");
  const file = configPath(agentDir);
  const directory = path.dirname(file);
  const inherited = SNAPSHOTS.get(config);
  const snapshot = inherited?.filePath === file
    ? inherited
    : await loadConfigSnapshotInternal(agentDir, true);
  const targetFormat: ConfigFileFormat = snapshot.sourceFormat === "v2" ? "v2" : "v1";
  await assertApplicationWorkspaceDisjoint(config);
  const queueKeys = [file, ...(config.application_workspace === null ? [] : [config.application_workspace.root_path])];
  await withQueues(queueKeys, async () => {
    await ensureConfigDirectoryForOrdinaryWrite(agentDir, directory);
    const configLock = await acquireMutationLock(configLockPath(agentDir), "config_mutation_lock", mutationId, createdAt);
    let rootLock: ConfigLock | undefined;
    try {
      if (config.application_workspace !== null) {
        rootLock = await acquireMutationLock(
          workspaceLockPath(config.application_workspace.root_path),
          "workspace_mutation_lock",
          mutationId,
          createdAt,
        );
        await assertApplicationWorkspaceDisjoint(config);
      }
      await commitConfigUnderLock(snapshot, config, configTemporaryPath(agentDir, mutationId), targetFormat);
    } finally {
      try {
        if (rootLock !== undefined) await releaseMutationLock(rootLock);
      } finally {
        await releaseMutationLock(configLock);
      }
    }
  });
  const committed = await loadConfigSnapshot(agentDir);
  attachSnapshot(config, {
    filePath: committed.filePath,
    directoryPath: committed.directoryPath,
    bytes: committed.bytes,
    sha256: committed.sha256,
    identity: committed.identity,
    sourceFormat: committed.sourceFormat,
  });
}
