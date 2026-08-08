// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

import {
  type CareerConfig,
  type LibraryRoot,
  workflowError,
} from "./types.ts";

const CONFIG_SCHEMA = "pi.career.config.v1";
const CONFIG_MAX_BYTES = 65_536;
const LABEL_MAX_CHARACTERS = 80;
const PATH_MAX_BYTES = 4_096;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function emptyConfig(): CareerConfig {
  return { schema_version: CONFIG_SCHEMA, library_roots: [] };
}

export function configPath(agentDir: string): string {
  if (!path.isAbsolute(agentDir)) throw workflowError("config_invalid");
  return path.join(agentDir, "career", "config.v1.json");
}

function rootId(canonicalPath: string): string {
  return createHash("sha256").update(canonicalPath).digest("hex");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function validLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= LABEL_MAX_CHARACTERS &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function normalizeGeneratedVariantsRoot(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > PATH_MAX_BYTES ||
    !path.isAbsolute(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return undefined;
  const normalized = path.normalize(value);
  return path.dirname(normalized) === normalized ? undefined : normalized;
}

function parseRoot(value: unknown): LibraryRoot | undefined {
  if (!isPlainRecord(value) || !exactKeys(value, ["id", "path", "label"])) return undefined;
  if (
    typeof value.id !== "string" ||
    !SHA256.test(value.id) ||
    typeof value.path !== "string" ||
    !path.isAbsolute(value.path) ||
    value.id !== rootId(value.path) ||
    !validLabel(value.label)
  ) return undefined;
  return { id: value.id, path: value.path, label: value.label };
}

function parseConfig(value: unknown): CareerConfig {
  if (
    !isPlainRecord(value) ||
    !exactKeys(value, ["schema_version", "library_roots"], ["generated_variants_root"]) ||
    value.schema_version !== CONFIG_SCHEMA ||
    !Array.isArray(value.library_roots)
  ) throw workflowError("config_invalid");

  const roots: LibraryRoot[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const candidate of value.library_roots) {
    const root = parseRoot(candidate);
    if (root === undefined || ids.has(root.id) || paths.has(root.path)) {
      throw workflowError("config_invalid");
    }
    ids.add(root.id);
    paths.add(root.path);
    roots.push(root);
  }

  const generatedVariantsRoot = value.generated_variants_root === undefined
    ? undefined
    : normalizeGeneratedVariantsRoot(value.generated_variants_root);
  if (
    value.generated_variants_root !== undefined &&
    (generatedVariantsRoot === undefined || roots.some((root) => root.path === generatedVariantsRoot))
  ) throw workflowError("config_invalid");

  return {
    schema_version: CONFIG_SCHEMA,
    library_roots: roots,
    ...(generatedVariantsRoot === undefined
      ? {}
      : { generated_variants_root: generatedVariantsRoot }),
  };
}

export async function loadConfig(agentDir: string): Promise<CareerConfig> {
  const file = configPath(agentDir);
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > CONFIG_MAX_BYTES) {
      throw workflowError("config_invalid");
    }
    if ((metadata.mode & 0o777) !== 0o600) throw workflowError("config_invalid");
    const bytes = await readFile(file);
    if (bytes.length !== metadata.size) throw workflowError("config_invalid");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseConfig(JSON.parse(text) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return emptyConfig();
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("config_invalid");
  }
}

async function canonicalizeRoot(inputPath: string): Promise<string> {
  if (
    typeof inputPath !== "string" ||
    inputPath.length === 0 ||
    inputPath.includes("\0") ||
    Buffer.byteLength(inputPath, "utf8") > 4_096
  ) throw workflowError("root_invalid");

  try {
    const absolute = path.resolve(inputPath);
    const suppliedMetadata = await lstat(absolute);
    if (!suppliedMetadata.isDirectory() || suppliedMetadata.isSymbolicLink()) {
      throw workflowError("root_invalid");
    }
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

export async function addLibraryRoot(
  config: CareerConfig,
  inputPath: string,
  label?: string,
): Promise<CareerConfig> {
  const canonical = await canonicalizeRoot(inputPath);
  const chosenLabel = label?.trim() || defaultRootLabel(canonical);
  if (!validLabel(chosenLabel)) throw workflowError("root_invalid");
  const id = rootId(canonical);
  const withoutExisting = config.library_roots.filter((root) => root.id !== id);
  return {
    ...config,
    library_roots: [...withoutExisting, { id, path: canonical, label: chosenLabel }],
  };
}

export function removeLibraryRoot(config: CareerConfig, id: string): CareerConfig {
  return { ...config, library_roots: config.library_roots.filter((root) => root.id !== id) };
}

export function suggestedGeneratedVariantsRoot(
  config: CareerConfig,
  selectedRootId?: string,
): string | undefined {
  if (config.generated_variants_root !== undefined) return config.generated_variants_root;
  const selectedRoot = selectedRootId === undefined
    ? config.library_roots[0]
    : config.library_roots.find((root) => root.id === selectedRootId);
  return selectedRoot === undefined ? undefined : path.join(selectedRoot.path, "variants");
}

export function setGeneratedVariantsRoot(
  config: CareerConfig,
  inputPath: string,
): CareerConfig & { generated_variants_root: string } {
  const normalized = normalizeGeneratedVariantsRoot(inputPath);
  if (normalized === undefined || config.library_roots.some((root) => root.path === normalized)) {
    throw workflowError("root_invalid");
  }
  return { ...config, generated_variants_root: normalized };
}

export function clearGeneratedVariantsRoot(config: CareerConfig): CareerConfig {
  const { generated_variants_root: _discarded, ...remaining } = config;
  return remaining;
}

export async function writeConfig(
  agentDir: string,
  config: CareerConfig,
  uuid: () => string = randomUUID,
): Promise<void> {
  const validated = parseConfig(config);
  const file = configPath(agentDir);
  const directory = path.dirname(file);
  const temporaryId = uuid();
  if (!UUID.test(temporaryId)) throw workflowError("config_invalid");
  const temporary = path.join(directory, `.config.v1.${temporaryId}.tmp`);
  const encoded = Buffer.from(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
  if (encoded.length > CONFIG_MAX_BYTES) throw workflowError("config_invalid");

  let handle;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryMetadata = await lstat(directory);
    if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
      throw workflowError("config_invalid");
    }
    await chmod(directory, 0o700);
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(encoded);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporary, 0o600);
    await rename(temporary, file);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw workflowError("config_invalid");
  }
}
