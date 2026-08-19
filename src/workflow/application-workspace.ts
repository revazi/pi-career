// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  rmdir,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import {
  withFileMutationQueue,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

import {
  acquireMutationLock,
  assertApplicationWorkspaceDisjoint,
  assertConfigSnapshotCurrent,
  commitConfigUnderLock,
  configLockPath,
  configTemporaryPath,
  encodeConfig,
  loadConfigSnapshot,
  releaseMutationLock,
  setApplicationWorkspace,
  validateApplicationRootPath,
  workspaceLockPath,
  type ConfigSnapshot,
} from "./config.ts";
import { privacyDisplayPath } from "./renderers.ts";
import { eligibleOriginals, scanLibrary } from "./scan.ts";
import { parseStrictJson } from "./strict-json.ts";
import {
  workspaceApplicationIdentity,
  type WorkspaceApplicationIdentity,
} from "./session-state.ts";
import { isWithinCoreCharacterLimit } from "./text-limit.ts";
import {
  type ApplicationStatus,
  type CareerConfig,
  CareerWorkflowError,
  type ResumeFormat,
  type ResumeRecord,
  type VacancyEntry,
  workflowError,
} from "./types.ts";

const ROOT_MARKER_NAME = ".pi-career-applications.json";
const MANIFEST_NAME = "application.json";
const ROOT_MARKER_SCHEMA = "pi.career.application_root.v1";
const MANIFEST_SCHEMA = "pi.career.application_manifest.v1";
const STATE_SCHEMA = "pi.career.application_state.v1";
const PREVIEW_SCHEMA = "pi.career.workspace_mutation_preview.v1";
const METADATA_MAX_BYTES = 16_384;
const CONFIG_MAX_BYTES = 65_536;
const PREVIEW_MAX_BYTES = 5_242_880;
const VACANCY_MAX_BYTES = 262_144;
const ROOT_MAX_ENTRIES = 1_024;
const APPLICATION_MAX_ENTRIES = 160;
const APPLICATION_MAX_MANAGED_BYTES = 2_097_152;
const STATE_MAX_REVISIONS = 64;
const PATH_MAX_BYTES = 4_096;
const BASENAME_MAX_BYTES = 180;
const CONFIRM_TIMEOUT_MS = 10 * 60 * 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STATE_BASENAME = /^\.pi-career-state-([0-9]{6})\.json$/;
const VACANCY_BASENAME = /^vacancy(?:-([0-9]{6}))?\.md$/;
const APPLICATION_BASENAME = /^([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?|company)--([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?|role)--([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const APPLICATION_STATUSES = new Set<ApplicationStatus>(["preparing", "applied", "interviewing", "closed"]);

interface WorkspaceOptions {
  agentDir: string;
  now: () => Date;
  uuid: () => string;
}

interface RootMarker {
  schema_version: typeof ROOT_MARKER_SCHEMA;
  kind: "application_workspace_root";
  root_id: string;
  created_at: string;
}

interface ApplicationManifest {
  schema_version: typeof MANIFEST_SCHEMA;
  kind: "career_application";
  application_id: string;
  root_id: string;
  application_created_at: string;
  workspace_created_at: string;
}

interface VacancyBinding {
  relative_path: string;
  content_sha256: string;
  utf8_bytes: number;
  source_state_id: string;
}

interface SelectedOriginalBinding {
  document_id: string;
  library_root_id: string;
  text_sha256: string;
  format: ResumeFormat;
}

interface ResumeArtifactBinding {
  relative_path: string;
  artifact_sha256: string;
  sidecar_relative_path: string;
  sidecar_sha256: string;
}

interface ApplicationStateRevision {
  schema_version: typeof STATE_SCHEMA;
  kind: "application_state_revision";
  application_id: string;
  sequence: number;
  parent_sha256: string;
  status: ApplicationStatus;
  vacancy: VacancyBinding | null;
  selected_original: SelectedOriginalBinding | null;
  resume_artifact: ResumeArtifactBinding | null;
  updated_at: string;
}

interface ExactFile {
  path: string;
  bytes: Buffer;
  metadata: Stats;
  sha256: string;
}

interface InspectedApplication {
  directoryPath: string;
  metadata: Stats;
  manifestFile: ExactFile;
  manifest: ApplicationManifest;
  revisions: Array<{ file: ExactFile; state: ApplicationStateRevision }>;
  head: ApplicationStateRevision;
  headFile: ExactFile;
  entries: string[];
  managedBytes: number;
}

interface AuditedApplication {
  directoryPath: string;
  metadata: Stats;
  manifestFile: ExactFile;
  manifest: ApplicationManifest;
}

interface CurrentApplicationTarget {
  directoryPath: string;
  applicationId: string;
  applicationCreatedAt: string;
}

interface RootInspectionOptions {
  expectedRootId?: string;
  ownedLock?: string;
  currentApplication?: CurrentApplicationTarget;
}

interface RootAudit {
  metadata: Stats;
  markerFile: ExactFile;
  marker: RootMarker;
  entries: string[];
  applications: AuditedApplication[];
  currentApplication?: InspectedApplication;
}

interface Attachment {
  snapshot: ConfigSnapshot;
  root: RootAudit;
  application?: InspectedApplication;
  expectedDirectoryPath?: string;
}

interface FileCreatePreview {
  path: string;
  object_type: "file" | "directory";
  mode: "0600" | "0700";
  utf8_bytes: number | null;
  sha256: string | null;
  text: string | null;
}

interface BytePreview {
  utf8_bytes: number;
  sha256: string;
  text: string;
}

interface FileReplacePreview {
  path: string;
  object_type: "file";
  mode: "0600";
  expected: BytePreview;
  replacement: BytePreview;
}

type WorkspaceOperation = "configure_root" | "detach_root" | "initialize_application" | "record_state" | "select_original";

interface PreviewEnvelope {
  schema_version: typeof PREVIEW_SCHEMA;
  mutation_id: string;
  mutation_class: "workspace_file";
  operation: WorkspaceOperation;
  application_id: string | null;
  expected_config_sha256: string | null;
  expected_state_sha256: string | null;
  creates: FileCreatePreview[];
  replaces: FileReplacePreview[];
  deletes: never[];
  temporary_paths: string[];
  warnings: string[];
}

interface WorkspacePlan {
  envelope: PreviewEnvelope;
  previewText: string;
  sessionId: string;
  identityStateId: string | null;
  currentStateId: string | null;
  vacancyStateId: string | null;
  vacancySha256: string | null;
  createdAt: string;
}

interface PublishedFile {
  finalPath: string;
  metadata: Stats;
  bytes: Buffer;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function validSessionUuid(value: unknown): value is string {
  return typeof value === "string" && SESSION_UUID.test(value);
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function validRelativeBasename(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." &&
    path.basename(value) === value && !path.isAbsolute(value) &&
    Buffer.byteLength(value, "utf8") <= BASENAME_MAX_BYTES &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function canonicalJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function effectiveUserId(): number {
  const value = process.geteuid?.() ?? process.getuid?.();
  if (value === undefined) throw workflowError("workspace_verification_failed");
  return value;
}

function privateMetadata(metadata: Stats, mode: number, kind: "file" | "directory"): boolean {
  const correctType = kind === "file" ? metadata.isFile() : metadata.isDirectory();
  return correctType && !metadata.isSymbolicLink() && metadata.uid === effectiveUserId() &&
    (metadata.mode & 0o7777) === mode && (kind === "directory" || metadata.nlink === 1);
}

function sameInode(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function persistentRootEntries(root: RootAudit): string[] {
  const lockName = path.basename(workspaceLockPath(path.dirname(root.markerFile.path)));
  return root.entries.filter((entry) => entry !== lockName);
}

function assertRootPlanCurrent(expected: RootAudit, current: RootAudit): void {
  if (!sameInode(expected.metadata, current.metadata) ||
    !sameInode(expected.markerFile.metadata, current.markerFile.metadata) ||
    JSON.stringify(persistentRootEntries(expected)) !== JSON.stringify(persistentRootEntries(current)) ||
    expected.applications.length !== current.applications.length) {
    throw workflowError("workspace_drift");
  }
  const currentApplications = new Map(current.applications.map((application) => [application.directoryPath, application]));
  for (const application of expected.applications) {
    const replacement = currentApplications.get(application.directoryPath);
    if (replacement === undefined || !sameInode(application.metadata, replacement.metadata) ||
      !sameInode(application.manifestFile.metadata, replacement.manifestFile.metadata) ||
      application.manifestFile.sha256 !== replacement.manifestFile.sha256) {
      throw workflowError("workspace_drift");
    }
  }
  if (expected.currentApplication !== undefined) {
    const application = current.currentApplication;
    if (application === undefined || !sameInode(expected.currentApplication.headFile.metadata, application.headFile.metadata)) {
      throw workflowError("workspace_drift");
    }
  }
}

function parseMarker(value: unknown): RootMarker | undefined {
  if (!isRecord(value) || !exactKeys(value, ["schema_version", "kind", "root_id", "created_at"]) ||
    value.schema_version !== ROOT_MARKER_SCHEMA || value.kind !== "application_workspace_root" ||
    !validUuid(value.root_id) || !validTimestamp(value.created_at)) return undefined;
  return {
    schema_version: ROOT_MARKER_SCHEMA,
    kind: "application_workspace_root",
    root_id: value.root_id,
    created_at: value.created_at,
  };
}

function parseManifest(value: unknown): ApplicationManifest | undefined {
  if (!isRecord(value) || !exactKeys(value, [
    "schema_version", "kind", "application_id", "root_id", "application_created_at", "workspace_created_at",
  ]) || value.schema_version !== MANIFEST_SCHEMA || value.kind !== "career_application" ||
    !validUuid(value.application_id) || !validUuid(value.root_id) ||
    !validTimestamp(value.application_created_at) || !validTimestamp(value.workspace_created_at) ||
    Date.parse(value.workspace_created_at) < Date.parse(value.application_created_at)) return undefined;
  return {
    schema_version: MANIFEST_SCHEMA,
    kind: "career_application",
    application_id: value.application_id,
    root_id: value.root_id,
    application_created_at: value.application_created_at,
    workspace_created_at: value.workspace_created_at,
  };
}

function parseVacancyBinding(value: unknown): VacancyBinding | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["relative_path", "content_sha256", "utf8_bytes", "source_state_id"]) ||
    !validRelativeBasename(value.relative_path) || !VACANCY_BASENAME.test(value.relative_path) ||
    !validHash(value.content_sha256) || !Number.isSafeInteger(value.utf8_bytes) ||
    (value.utf8_bytes as number) < 1 || (value.utf8_bytes as number) > VACANCY_MAX_BYTES ||
    !validSessionUuid(value.source_state_id)) return undefined;
  return {
    relative_path: value.relative_path,
    content_sha256: value.content_sha256,
    utf8_bytes: value.utf8_bytes as number,
    source_state_id: value.source_state_id,
  };
}

function parseSelectedOriginal(value: unknown): SelectedOriginalBinding | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["document_id", "library_root_id", "text_sha256", "format"]) ||
    !validHash(value.document_id) || !validHash(value.library_root_id) || !validHash(value.text_sha256) ||
    !["markdown", "text", "pdf"].includes(value.format as string)) return undefined;
  return {
    document_id: value.document_id,
    library_root_id: value.library_root_id,
    text_sha256: value.text_sha256,
    format: value.format as ResumeFormat,
  };
}

function parseResumeArtifact(value: unknown): ResumeArtifactBinding | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, [
    "relative_path", "artifact_sha256", "sidecar_relative_path", "sidecar_sha256",
  ]) || !validRelativeBasename(value.relative_path) || !["resume.md", "resume.txt"].includes(value.relative_path as string) ||
    !validHash(value.artifact_sha256) || value.sidecar_relative_path !== "resume.pi-career.json" ||
    !validHash(value.sidecar_sha256)) return undefined;
  return {
    relative_path: value.relative_path,
    artifact_sha256: value.artifact_sha256,
    sidecar_relative_path: "resume.pi-career.json",
    sidecar_sha256: value.sidecar_sha256,
  };
}

function parseState(value: unknown): ApplicationStateRevision | undefined {
  if (!isRecord(value) || !exactKeys(value, [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status", "vacancy",
    "selected_original", "resume_artifact", "updated_at",
  ]) || value.schema_version !== STATE_SCHEMA || value.kind !== "application_state_revision" ||
    !validUuid(value.application_id) || !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1 || (value.sequence as number) > STATE_MAX_REVISIONS ||
    !validHash(value.parent_sha256) || typeof value.status !== "string" ||
    !APPLICATION_STATUSES.has(value.status as ApplicationStatus) || !validTimestamp(value.updated_at)) return undefined;
  const vacancy = parseVacancyBinding(value.vacancy);
  const selected = parseSelectedOriginal(value.selected_original);
  const artifact = parseResumeArtifact(value.resume_artifact);
  if (vacancy === undefined || selected === undefined || artifact === undefined) return undefined;
  return {
    schema_version: STATE_SCHEMA,
    kind: "application_state_revision",
    application_id: value.application_id,
    sequence: value.sequence as number,
    parent_sha256: value.parent_sha256,
    status: value.status as ApplicationStatus,
    vacancy,
    selected_original: selected,
    resume_artifact: artifact,
    updated_at: value.updated_at,
  };
}

function decodeCanonical<T>(bytes: Buffer, parser: (value: unknown) => T | undefined): T {
  if (bytes.length === 0 || bytes.length > METADATA_MAX_BYTES ||
    (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    throw workflowError("workspace_drift");
  }
  let text: string;
  let value: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = parseStrictJson(text);
  } catch {
    throw workflowError("workspace_drift");
  }
  const parsed = parser(value);
  if (parsed === undefined || !canonicalJson(parsed).equals(bytes)) throw workflowError("workspace_drift");
  return parsed;
}

async function readExactFile<T>(file: string, parser: (value: unknown) => T | undefined): Promise<{ file: ExactFile; value: T }> {
  try {
    const metadata = await lstat(file);
    if (!privateMetadata(metadata, 0o600, "file") || metadata.size <= 0 || metadata.size > METADATA_MAX_BYTES) {
      throw workflowError("workspace_drift");
    }
    const bytes = await readFile(file);
    if (bytes.length !== metadata.size) throw workflowError("workspace_drift");
    return {
      file: { path: file, bytes, metadata, sha256: hashBytes(bytes) },
      value: decodeCanonical(bytes, parser),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_drift");
  }
}

async function boundedEntries(directory: string, maximum: number): Promise<string[]> {
  try {
    const entries: string[] = [];
    const handle = await opendir(directory);
    try {
      for await (const entry of handle) {
        entries.push(entry.name);
        if (entries.length > maximum) throw workflowError("workspace_limit_reached");
      }
    } finally {
      await handle.close().catch(() => undefined);
    }
    return entries.sort();
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_drift");
  }
}

async function readContentFile(file: string, expectedSize: number, expectedHash: string): Promise<ExactFile> {
  try {
    const metadata = await lstat(file);
    if (!privateMetadata(metadata, 0o600, "file") || metadata.size !== expectedSize || metadata.size > VACANCY_MAX_BYTES) {
      throw workflowError("workspace_drift");
    }
    const bytes = await readFile(file);
    if (bytes.length !== metadata.size || hashBytes(bytes) !== expectedHash) throw workflowError("workspace_drift");
    return { path: file, bytes, metadata, sha256: expectedHash };
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_drift");
  }
}

async function inspectPrivateApplicationDirectory(
  directoryPath: string,
  expectedBasename: string | undefined,
): Promise<Stats> {
  try {
    const metadata = await lstat(directoryPath);
    const canonical = await realpath(directoryPath);
    if (!privateMetadata(metadata, 0o700, "directory") || canonical !== directoryPath ||
      (expectedBasename !== undefined && path.basename(directoryPath) !== expectedBasename)) {
      throw workflowError("workspace_drift");
    }
    return metadata;
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_drift");
  }
}

function assertManifestDirectoryBinding(directoryPath: string, rootId: string, manifest: ApplicationManifest): void {
  const basenameMatch = path.basename(directoryPath).match(APPLICATION_BASENAME);
  if (manifest.root_id !== rootId || basenameMatch === null || basenameMatch[3] !== manifest.application_id) {
    throw workflowError("workspace_drift");
  }
}

async function inspectApplicationManifest(
  directoryPath: string,
  rootId: string,
  expectedBasename?: string,
): Promise<AuditedApplication> {
  const metadata = await inspectPrivateApplicationDirectory(directoryPath, expectedBasename);
  const manifestRead = await readExactFile(path.join(directoryPath, MANIFEST_NAME), parseManifest);
  assertManifestDirectoryBinding(directoryPath, rootId, manifestRead.value);
  return {
    directoryPath,
    metadata,
    manifestFile: manifestRead.file,
    manifest: manifestRead.value,
  };
}

function orderedStateNames(entries: readonly string[]): Array<{ name: string; sequence: number }> {
  const states: Array<{ name: string; sequence: number }> = [];
  for (const entry of entries) {
    if (!entry.startsWith(".pi-career-state-")) continue;
    const match = entry.match(STATE_BASENAME);
    if (match === null) throw workflowError("workspace_drift");
    states.push({ name: entry, sequence: Number(match[1]) });
  }
  states.sort((left, right) => left.sequence - right.sequence);
  if (states.length === 0 || states.length > STATE_MAX_REVISIONS) throw workflowError("workspace_drift");
  return states;
}

function sameVacancyBinding(left: VacancyBinding | null, right: VacancyBinding | null): boolean {
  return left === null || right === null
    ? left === right
    : left.relative_path === right.relative_path && left.content_sha256 === right.content_sha256 &&
      left.utf8_bytes === right.utf8_bytes && left.source_state_id === right.source_state_id;
}

async function inspectVacancyReference(
  directoryPath: string,
  state: ApplicationStateRevision,
  previous: ApplicationStateRevision | undefined,
  referencedFiles: Map<string, ExactFile>,
): Promise<void> {
  const binding = state.vacancy;
  if (binding === null) return;
  const existing = referencedFiles.get(binding.relative_path);
  if (sameVacancyBinding(previous?.vacancy ?? null, binding)) {
    if (existing === undefined || existing.sha256 !== binding.content_sha256 ||
      existing.bytes.length !== binding.utf8_bytes) throw workflowError("workspace_drift");
    return;
  }
  const expectedName = state.sequence === 1
    ? "vacancy.md"
    : `vacancy-${String(state.sequence).padStart(6, "0")}.md`;
  if (binding.relative_path !== expectedName || existing !== undefined) throw workflowError("workspace_drift");
  referencedFiles.set(binding.relative_path, await readContentFile(
    path.join(directoryPath, binding.relative_path), binding.utf8_bytes, binding.content_sha256,
  ));
}

async function inspectArtifactFile(
  directoryPath: string,
  relativePath: string,
  expectedHash: string,
  maximumBytes: number,
): Promise<ExactFile> {
  const file = path.join(directoryPath, relativePath);
  const metadata = await lstat(file).catch(() => undefined);
  if (metadata === undefined || metadata.size > maximumBytes) throw workflowError("workspace_drift");
  return readContentFile(file, metadata.size, expectedHash);
}

async function inspectArtifactReferences(
  directoryPath: string,
  state: ApplicationStateRevision,
  referencedFiles: Map<string, ExactFile>,
): Promise<void> {
  const artifact = state.resume_artifact;
  if (artifact === null) return;
  const existingArtifact = referencedFiles.get(artifact.relative_path);
  if (existingArtifact === undefined) {
    referencedFiles.set(artifact.relative_path, await inspectArtifactFile(
      directoryPath, artifact.relative_path, artifact.artifact_sha256, VACANCY_MAX_BYTES,
    ));
  } else if (existingArtifact.sha256 !== artifact.artifact_sha256) {
    throw workflowError("workspace_drift");
  }
  const existingSidecar = referencedFiles.get(artifact.sidecar_relative_path);
  if (existingSidecar === undefined) {
    referencedFiles.set(artifact.sidecar_relative_path, await inspectArtifactFile(
      directoryPath, artifact.sidecar_relative_path, artifact.sidecar_sha256, METADATA_MAX_BYTES,
    ));
  } else if (existingSidecar.sha256 !== artifact.sidecar_sha256) {
    throw workflowError("workspace_drift");
  }
}

async function inspectStateChain(
  application: AuditedApplication,
  stateNames: ReadonlyArray<{ name: string; sequence: number }>,
): Promise<{ revisions: InspectedApplication["revisions"]; referencedFiles: Map<string, ExactFile> }> {
  const revisions: InspectedApplication["revisions"] = [];
  const referencedFiles = new Map<string, ExactFile>();
  let parentHash = application.manifestFile.sha256;
  let priorTimestamp = application.manifest.workspace_created_at;
  for (let index = 0; index < stateNames.length; index += 1) {
    const expectedSequence = index + 1;
    const stateName = stateNames[index]!;
    if (stateName.sequence !== expectedSequence) throw workflowError("workspace_drift");
    const read = await readExactFile(path.join(application.directoryPath, stateName.name), parseState);
    const timestampInvalid = expectedSequence === 1
      ? Date.parse(read.value.updated_at) < Date.parse(priorTimestamp)
      : Date.parse(read.value.updated_at) <= Date.parse(priorTimestamp);
    if (read.value.sequence !== expectedSequence ||
      read.value.application_id !== application.manifest.application_id ||
      read.value.parent_sha256 !== parentHash || timestampInvalid) throw workflowError("workspace_drift");
    await inspectVacancyReference(application.directoryPath, read.value, revisions.at(-1)?.state, referencedFiles);
    await inspectArtifactReferences(application.directoryPath, read.value, referencedFiles);
    revisions.push({ file: read.file, state: read.value });
    parentHash = read.file.sha256;
    priorTimestamp = read.value.updated_at;
  }
  return { revisions, referencedFiles };
}

function assertNoOrphanManagedFiles(entries: readonly string[], referencedFiles: ReadonlyMap<string, ExactFile>): void {
  for (const entry of entries) {
    if (VACANCY_BASENAME.test(entry) && !referencedFiles.has(entry)) throw workflowError("workspace_drift");
    if (["resume.md", "resume.txt", "resume.pi-career.json"].includes(entry) && !referencedFiles.has(entry)) {
      throw workflowError("workspace_drift");
    }
  }
}

async function inspectApplicationDirectory(
  directoryPath: string,
  rootId: string,
  expectedBasename?: string,
): Promise<InspectedApplication> {
  const application = await inspectApplicationManifest(directoryPath, rootId, expectedBasename);
  const entries = await boundedEntries(directoryPath, APPLICATION_MAX_ENTRIES);
  if (entries.some((entry) => entry.startsWith(".pi-career-") && !STATE_BASENAME.test(entry))) {
    throw workflowError("workspace_drift");
  }
  const { revisions, referencedFiles } = await inspectStateChain(application, orderedStateNames(entries));
  assertNoOrphanManagedFiles(entries, referencedFiles);
  const managedBytes = application.manifestFile.bytes.length +
    revisions.reduce((total, revision) => total + revision.file.bytes.length, 0) +
    [...referencedFiles.values()].reduce((total, file) => total + file.bytes.length, 0);
  if (managedBytes > APPLICATION_MAX_MANAGED_BYTES) throw workflowError("workspace_limit_reached");
  const head = revisions.at(-1)!;
  return {
    ...application,
    revisions,
    head: head.state,
    headFile: head.file,
    entries,
    managedBytes,
  };
}

async function inspectRootEntries(
  rootPath: string,
  ownedLock: string | undefined,
): Promise<{ entries: string[]; allowedLockName?: string }> {
  const allowedLockName = ownedLock === undefined ? undefined : path.basename(ownedLock);
  const entries = await boundedEntries(rootPath, ROOT_MAX_ENTRIES + (allowedLockName === undefined ? 0 : 1));
  if (entries.length > ROOT_MAX_ENTRIES &&
    (allowedLockName === undefined || !entries.includes(allowedLockName))) throw workflowError("workspace_limit_reached");
  if (entries.includes(path.basename(workspaceLockPath(rootPath))) && ownedLock === undefined) {
    throw workflowError("workspace_busy");
  }
  return { entries, ...(allowedLockName === undefined ? {} : { allowedLockName }) };
}

async function inspectBoundRootMarker(rootPath: string, expectedRootId: string | undefined): Promise<{
  markerFile: ExactFile;
  marker: RootMarker;
}> {
  const markerRead = await readExactFile(path.join(rootPath, ROOT_MARKER_NAME), parseMarker);
  if (expectedRootId !== undefined && markerRead.value.root_id !== expectedRootId) {
    throw workflowError("workspace_identity_conflict");
  }
  return { markerFile: markerRead.file, marker: markerRead.value };
}

async function inspectRootEnvelope(
  rootPath: string,
  options: RootInspectionOptions,
): Promise<{ metadata: Stats; entries: string[]; markerFile: ExactFile; marker: RootMarker; allowedLockName?: string }> {
  const metadata = await validateApplicationRootPath(rootPath);
  const entries = await inspectRootEntries(rootPath, options.ownedLock);
  const marker = await inspectBoundRootMarker(rootPath, options.expectedRootId);
  return { metadata, ...entries, ...marker };
}

async function inspectInactiveApplications(
  rootPath: string,
  rootId: string,
  entries: readonly string[],
  allowedLockName: string | undefined,
): Promise<AuditedApplication[]> {
  const applications: AuditedApplication[] = [];
  const applicationIds = new Set<string>();
  for (const entry of entries) {
    if (entry === ROOT_MARKER_NAME || entry === allowedLockName) continue;
    if (!APPLICATION_BASENAME.test(entry)) throw workflowError("workspace_drift");
    const application = await inspectApplicationManifest(path.join(rootPath, entry), rootId);
    if (applicationIds.has(application.manifest.application_id)) throw workflowError("workspace_identity_conflict");
    applicationIds.add(application.manifest.application_id);
    applications.push(application);
  }
  return applications;
}

async function inspectCurrentApplication(
  applications: readonly AuditedApplication[],
  target: CurrentApplicationTarget | undefined,
  rootId: string,
): Promise<InspectedApplication | undefined> {
  if (target === undefined) return undefined;
  const matching = applications.find((application) => application.manifest.application_id === target.applicationId);
  if (matching === undefined) return undefined;
  if (matching.directoryPath !== target.directoryPath ||
    matching.manifest.application_created_at !== target.applicationCreatedAt) {
    throw workflowError("workspace_identity_conflict");
  }
  return inspectApplicationDirectory(matching.directoryPath, rootId, path.basename(target.directoryPath));
}

async function inspectRoot(rootPath: string, options: RootInspectionOptions = {}): Promise<RootAudit> {
  const envelope = await inspectRootEnvelope(rootPath, options);
  const applications = await inspectInactiveApplications(
    rootPath, envelope.marker.root_id, envelope.entries, envelope.allowedLockName,
  );
  const currentApplication = await inspectCurrentApplication(
    applications, options.currentApplication, envelope.marker.root_id,
  );
  return {
    metadata: envelope.metadata,
    markerFile: envelope.markerFile,
    marker: envelope.marker,
    entries: envelope.entries,
    applications,
    ...(currentApplication === undefined ? {} : { currentApplication }),
  };
}

function slug(value: string, fallback: "company" | "role"): string {
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return normalized || fallback;
}

function applicationDirectoryBasename(identity: WorkspaceApplicationIdentity): string {
  return `${slug(identity.identity.company_label, "company")}--${slug(identity.identity.role_label, "role")}--${identity.identity.application_id}`;
}

function sessionIdentity(ctx: ExtensionCommandContext): WorkspaceApplicationIdentity | undefined {
  return workspaceApplicationIdentity(ctx.sessionManager.getBranch());
}

function expectedApplicationPath(rootPath: string, identity: WorkspaceApplicationIdentity): string {
  const basename = applicationDirectoryBasename(identity);
  const result = path.join(rootPath, basename);
  if (Buffer.byteLength(basename, "utf8") > BASENAME_MAX_BYTES ||
    Buffer.byteLength(result, "utf8") > PATH_MAX_BYTES) throw workflowError("workspace_root_invalid");
  return result;
}

function currentApplicationTarget(
  rootPath: string,
  identity: WorkspaceApplicationIdentity | undefined,
): CurrentApplicationTarget | undefined {
  return identity === undefined ? undefined : {
    directoryPath: expectedApplicationPath(rootPath, identity),
    applicationId: identity.identity.application_id,
    applicationCreatedAt: identity.identity.created_at,
  };
}

async function attachmentFor(
  agentDir: string,
  identity: WorkspaceApplicationIdentity | undefined,
): Promise<Attachment> {
  let snapshot: ConfigSnapshot;
  try {
    snapshot = await loadConfigSnapshot(agentDir);
  } catch {
    throw workflowError("workspace_config_invalid");
  }
  if (snapshot.config.application_workspace === null) {
    return { snapshot, root: undefined as never };
  }
  await assertApplicationWorkspaceDisjoint(snapshot.config);
  const configured = snapshot.config.application_workspace;
  const target = currentApplicationTarget(configured.root_path, identity);
  const root = await inspectRoot(configured.root_path, {
    expectedRootId: configured.root_id,
    ...(target === undefined ? {} : { currentApplication: target }),
  });
  if (identity === undefined || target === undefined) return { snapshot, root };
  const application = root.currentApplication;
  if (application !== undefined && application.manifest.application_created_at !== identity.identity.created_at) {
    throw workflowError("workspace_identity_conflict");
  }
  return {
    snapshot,
    root,
    ...(application === undefined ? {} : { application }),
    expectedDirectoryPath: target.directoryPath,
  };
}

function vacancyBytes(vacancy: VacancyEntry | undefined, applicationId: string): Buffer | undefined {
  if (vacancy === undefined) return undefined;
  if (vacancy.application_id !== applicationId || vacancy.vacancy_text.length === 0 ||
    vacancy.vacancy_text.includes("\r") || hasUnpairedSurrogate(vacancy.vacancy_text) ||
    !isWithinCoreCharacterLimit(vacancy.vacancy_text)) throw workflowError("workspace_identity_conflict");
  const bytes = Buffer.from(vacancy.vacancy_text, "utf8");
  if (bytes.length === 0 || bytes.length > VACANCY_MAX_BYTES || hashBytes(bytes) !== vacancy.vacancy_text_sha256) {
    throw workflowError("workspace_drift");
  }
  return bytes;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function createPreview(file: string, bytes: Buffer): FileCreatePreview {
  return {
    path: file,
    object_type: "file",
    mode: "0600",
    utf8_bytes: bytes.length,
    sha256: hashBytes(bytes),
    text: bytes.toString("utf8"),
  };
}

function createDirectoryPreview(directory: string): FileCreatePreview {
  return { path: directory, object_type: "directory", mode: "0700", utf8_bytes: null, sha256: null, text: null };
}

function bytePreview(bytes: Buffer): BytePreview {
  return { utf8_bytes: bytes.length, sha256: hashBytes(bytes), text: bytes.toString("utf8") };
}

function configPreview(
  snapshot: ConfigSnapshot,
  nextBytes: Buffer,
): { creates: FileCreatePreview[]; replaces: FileReplacePreview[] } {
  if (snapshot.bytes === null) return { creates: [createPreview(snapshot.filePath, nextBytes)], replaces: [] };
  return {
    creates: [],
    replaces: [{
      path: snapshot.filePath,
      object_type: "file",
      mode: "0600",
      expected: bytePreview(snapshot.bytes),
      replacement: bytePreview(nextBytes),
    }],
  };
}

function buildPlan(
  options: WorkspaceOptions,
  ctx: ExtensionCommandContext,
  operation: WorkspaceOperation,
  applicationId: string | null,
  identity: WorkspaceApplicationIdentity | undefined,
  expectedConfigSha: string | null,
  expectedStateSha: string | null,
  creates: FileCreatePreview[],
  replaces: FileReplacePreview[],
  temporaryPaths: string[],
  warnings: string[],
  mutationId?: string,
  createdAt?: string,
): WorkspacePlan {
  const id = (mutationId ?? options.uuid()).toLowerCase();
  const timestamp = createdAt ?? options.now().toISOString();
  if (!validUuid(id) || !validTimestamp(timestamp)) throw workflowError("workspace_verification_failed");
  const envelope: PreviewEnvelope = {
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
    warnings,
  };
  const previewText = canonicalJson(envelope).toString("utf8");
  if (Buffer.byteLength(previewText, "utf8") > PREVIEW_MAX_BYTES) throw workflowError("workspace_limit_reached");
  return {
    envelope,
    previewText,
    sessionId: ctx.sessionManager.getSessionId(),
    identityStateId: identity?.identity.state_id ?? null,
    currentStateId: identity?.current.state_id ?? null,
    vacancyStateId: operation === "initialize_application" || operation === "record_state"
      ? identity?.vacancy?.state_id ?? null
      : null,
    vacancySha256: operation === "initialize_application" || operation === "record_state"
      ? identity?.vacancy?.vacancy_text_sha256 ?? null
      : null,
    createdAt: timestamp,
  };
}

function assertSessionPlan(plan: WorkspacePlan, ctx: ExtensionCommandContext): WorkspaceApplicationIdentity | undefined {
  if (ctx.sessionManager.getSessionId() !== plan.sessionId || !ctx.isIdle()) throw workflowError("workspace_unavailable");
  const identity = sessionIdentity(ctx);
  if ((identity?.identity.state_id ?? null) !== plan.identityStateId ||
    (identity?.current.state_id ?? null) !== plan.currentStateId ||
    ((plan.envelope.operation === "initialize_application" || plan.envelope.operation === "record_state") &&
      ((identity?.vacancy?.state_id ?? null) !== plan.vacancyStateId ||
        (identity?.vacancy?.vacancy_text_sha256 ?? null) !== plan.vacancySha256))) {
    throw workflowError("workspace_identity_conflict");
  }
  return identity;
}

async function approve(plan: WorkspacePlan, ctx: ExtensionCommandContext): Promise<boolean> {
  if (ctx.mode === "rpc") {
    ctx.ui.notify(
      "RPC retention warning: the RPC client may retain the complete private workspace preview and UI responses independently of Pi session settings.",
      "warning",
    );
  }
  const reviewed = await ctx.ui.editor("Review exact application workspace mutation", plan.previewText);
  if (reviewed === undefined) return false;
  if (reviewed !== plan.previewText) throw workflowError("workspace_preview_changed");
  const finalBasenames = [
    ...plan.envelope.creates.map((item) => path.basename(item.path)),
    ...plan.envelope.replaces.map((item) => path.basename(item.path)),
  ];
  const objectDetails = [
    ...plan.envelope.creates.map((item) => item.object_type === "directory"
      ? `${path.basename(item.path)}: directory mode ${item.mode}`
      : `${path.basename(item.path)}: ${item.utf8_bytes} bytes, ${item.sha256}`),
    ...plan.envelope.replaces.map((item) =>
      `${path.basename(item.path)}: ${item.replacement.utf8_bytes} bytes, ${item.replacement.sha256}`),
  ];
  const confirmed = await ctx.ui.confirm(
    "Apply application workspace mutation?",
    [
      `Mutation ID: ${plan.envelope.mutation_id}`,
      `Class: ${plan.envelope.mutation_class}`,
      `Operation: ${plan.envelope.operation}`,
      ...(plan.envelope.application_id === null ? [] : [`Application: ${plan.envelope.application_id}`]),
      `Creates: ${plan.envelope.creates.length}; replaces: ${plan.envelope.replaces.length}; deletes: 0`,
      `Final basenames: ${finalBasenames.join(", ") || "none"}`,
      ...objectDetails,
      "Workspace-file authorization applies only to this exact mutation and is separate from session, provider, artifact-file, and deletion consent.",
      "The approved exact files persist until you remove them. Existing workspace files are never overwritten.",
    ].join("\n"),
    { timeout: CONFIRM_TIMEOUT_MS },
  );
  return confirmed === true && ctx.signal?.aborted !== true;
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

async function requireAbsent(target: string): Promise<void> {
  try {
    await lstat(target);
    throw workflowError("workspace_collision");
  } catch (error) {
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw workflowError("workspace_drift");
  }
}

async function publishFile(finalPath: string, temporaryPath: string, bytes: Buffer): Promise<PublishedFile> {
  let handle: FileHandle | undefined;
  let tempMetadata: Stats | undefined;
  let linkedFinal = false;
  try {
    handle = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.chmod(0o600);
    tempMetadata = await handle.stat();
    await handle.close();
    handle = undefined;
    if (!privateMetadata(tempMetadata, 0o600, "file") || tempMetadata.size !== bytes.length ||
      !(await readFile(temporaryPath)).equals(bytes)) throw workflowError("workspace_verification_failed");
    await link(temporaryPath, finalPath);
    linkedFinal = true;
    const linked = await lstat(finalPath);
    if (linked.dev !== tempMetadata.dev || linked.ino !== tempMetadata.ino) throw workflowError("workspace_status_unknown");
    await unlink(temporaryPath);
    await syncDirectory(path.dirname(finalPath));
    const finalMetadata = await lstat(finalPath);
    if (!privateMetadata(finalMetadata, 0o600, "file") || finalMetadata.dev !== tempMetadata.dev ||
      finalMetadata.ino !== tempMetadata.ino || finalMetadata.size !== bytes.length ||
      !(await readFile(finalPath)).equals(bytes)) throw workflowError("workspace_status_unknown");
    return { finalPath, metadata: finalMetadata, bytes };
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    if (linkedFinal && tempMetadata !== undefined) {
      try {
        const temporary = await lstat(temporaryPath).catch(() => undefined);
        if (temporary !== undefined && sameInode(temporary, tempMetadata)) await unlink(temporaryPath);
        await syncDirectory(path.dirname(finalPath));
        const finalMetadata = await lstat(finalPath);
        if (privateMetadata(finalMetadata, 0o600, "file") && sameInode(finalMetadata, tempMetadata) &&
          finalMetadata.size === bytes.length && (await readFile(finalPath)).equals(bytes)) {
          return { finalPath, metadata: finalMetadata, bytes };
        }
      } catch {
        // Continue to exact-inode cleanup when the publication cannot be settled as complete.
      }
      try {
        const finalMetadata = await lstat(finalPath);
        if (sameInode(finalMetadata, tempMetadata) && finalMetadata.size === bytes.length &&
          (await readFile(finalPath)).equals(bytes)) await unlink(finalPath);
      } catch {
        // An indeterminate or changed final inode is never removed.
      }
    }
    if (tempMetadata !== undefined) {
      try {
        const current = await lstat(temporaryPath);
        if (sameInode(current, tempMetadata)) await unlink(temporaryPath);
      } catch {
        // Best-effort cleanup is limited to the exact temporary inode.
      }
      await syncDirectory(path.dirname(finalPath)).catch(() => undefined);
    }
    if ((error as NodeJS.ErrnoException)?.code === "EEXIST") throw workflowError("workspace_collision");
    if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
    throw workflowError("workspace_status_unknown");
  }
}

async function unlinkOwned(published: PublishedFile): Promise<void> {
  try {
    const metadata = await lstat(published.finalPath);
    if (metadata.dev === published.metadata.dev && metadata.ino === published.metadata.ino) await unlink(published.finalPath);
  } catch {
    // Current-transaction cleanup is best effort and never touches an identity mismatch.
  }
}

async function withQueues<T>(paths: readonly string[], operation: () => Promise<T>): Promise<T> {
  const sorted = [...new Set(paths)].sort();
  const run = (index: number): Promise<T> => index >= sorted.length
    ? operation()
    : withFileMutationQueue(sorted[index]!, () => run(index + 1));
  return run(0);
}

function sameSessionVacancy(state: ApplicationStateRevision, vacancy: VacancyEntry | undefined): boolean {
  if (vacancy === undefined) return state.vacancy === null;
  return state.vacancy !== null && state.vacancy.source_state_id === vacancy.state_id &&
    state.vacancy.content_sha256 === vacancy.vacancy_text_sha256 &&
    state.vacancy.utf8_bytes === Buffer.byteLength(vacancy.vacancy_text, "utf8");
}

async function reconciliationClassification(rootPath: string): Promise<string> {
  try {
    await validateApplicationRootPath(rootPath);
    const entries = await boundedEntries(rootPath, ROOT_MAX_ENTRIES);
    if (entries.includes(path.basename(workspaceLockPath(rootPath)))) {
      return "Crash-left workspace lock detected. Mutations are blocked; reconciliation made no change.";
    }
    if (entries.some((entry) => entry.includes(".tmp") || entry.startsWith(".pi-career-") && entry !== ROOT_MARKER_NAME)) {
      return "Crash-left workspace temporary entry detected. Mutations are blocked; reconciliation made no change.";
    }
    for (const entry of entries) {
      if (entry === ROOT_MARKER_NAME) continue;
      const applicationPath = path.join(rootPath, entry);
      const metadata = await lstat(applicationPath).catch(() => undefined);
      if (metadata === undefined) {
        return "Application directory became unavailable during bounded reconciliation; no path was repaired or followed.";
      }
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
      let children: string[];
      try {
        children = await boundedEntries(applicationPath, APPLICATION_MAX_ENTRIES);
      } catch (error) {
        return error instanceof CareerWorkflowError && error.code === "workspace_limit_reached"
          ? "Application entry limit reached during reconciliation. Mutations are blocked; reconciliation made no change."
          : "Application directory could not be boundedly read. Mutations are blocked; reconciliation made no change.";
      }
      if (children.length === 0) {
        return "Interrupted initialization: an empty application directory is quarantined. Reconciliation made no change.";
      }
      if (children.some((name) => name.includes(".tmp") || name.startsWith(".pi-career-") && !STATE_BASENAME.test(name))) {
        return "Crash-left application temporary entry detected. Mutations are blocked; reconciliation made no change.";
      }
      const hasManifest = children.includes(MANIFEST_NAME);
      const states = children.filter((name) => STATE_BASENAME.test(name));
      if (hasManifest && states.length === 0) {
        return "Interrupted initialization: a manifest has no committed first state. Reconciliation made no change.";
      }
      if (children.some((name) => VACANCY_BASENAME.test(name)) && states.length === 0) {
        return "Orphan vacancy file detected without a committed state. Reconciliation made no change.";
      }
      if (children.includes("resume.pi-career.json") && !children.some((name) => name === "resume.md" || name === "resume.txt")) {
        return "Assisted sidecar orphan detected. It is not attached or authoritative; reconciliation made no change.";
      }
      if (children.includes("resume.pi-career.json") &&
        children.some((name) => name === "resume.md" || name === "resume.txt") && states.length === 0) {
        return "Uncommitted assisted pair orphan detected. It is not attached after restart; reconciliation made no change.";
      }
    }
    return "Workspace drift detected. Package mutations are blocked; reconciliation made no change.";
  } catch (error) {
    if (error instanceof CareerWorkflowError) {
      if (error.code === "workspace_root_invalid") {
        return "Workspace root validation failed before reconciliation access. Package mutations are blocked; no path was followed or changed.";
      }
      if (error.code === "workspace_limit_reached") {
        return "Workspace root entry limit reached during reconciliation. Package mutations are blocked; reconciliation made no change.";
      }
    }
    return "Workspace drift was detected before bounded reconciliation completed. Package mutations are blocked; reconciliation made no change.";
  }
}

async function validateSelectedBinding(config: CareerConfig, binding: SelectedOriginalBinding | null): Promise<void> {
  if (binding === null) return;
  const scan = await scanLibrary(config);
  const root = scan.roots.find((item) => item.root_id === binding.library_root_id);
  const matches = eligibleOriginals(scan).filter((record) =>
    record.id === binding.document_id && record.root_id === binding.library_root_id &&
    record.text_sha256 === binding.text_sha256 && record.format === binding.format);
  if (scan.total_capped || root === undefined || root.capped || root.stale || matches.length !== 1) {
    throw workflowError("workspace_drift");
  }
}

function stateBytes(state: ApplicationStateRevision): Buffer {
  const bytes = canonicalJson(state);
  if (bytes.length > METADATA_MAX_BYTES) throw workflowError("workspace_limit_reached");
  return bytes;
}

function stateName(sequence: number): string {
  return `.pi-career-state-${String(sequence).padStart(6, "0")}.json`;
}

function vacancyBinding(fileName: string, bytes: Buffer, vacancy: VacancyEntry): VacancyBinding {
  return {
    relative_path: fileName,
    content_sha256: hashBytes(bytes),
    utf8_bytes: bytes.length,
    source_state_id: vacancy.state_id,
  };
}

function assertApplicationCapacity(application: InspectedApplication, additions: Array<{ bytes?: Buffer }>): void {
  const entryCount = application.entries.length + additions.length;
  const byteCount = application.managedBytes + additions.reduce((total, item) => total + (item.bytes?.length ?? 0), 0);
  if (entryCount > APPLICATION_MAX_ENTRIES || byteCount > APPLICATION_MAX_MANAGED_BYTES ||
    application.revisions.length >= STATE_MAX_REVISIONS) throw workflowError("workspace_limit_reached");
}

function freshRecord(scan: Awaited<ReturnType<typeof scanLibrary>>, record: ResumeRecord): ResumeRecord {
  const root = scan.roots.find((item) => item.root_id === record.root_id);
  const matches = eligibleOriginals(scan).filter((candidate) => candidate.id === record.id &&
    candidate.root_id === record.root_id && candidate.format === record.format &&
    candidate.text_sha256 === record.text_sha256);
  if (scan.total_capped || root === undefined || root.capped || root.stale || matches.length !== 1) {
    throw workflowError("workspace_drift");
  }
  return matches[0]!;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function selectedOriginalOptions(
  records: readonly ResumeRecord[],
): Array<{ option: string; record: ResumeRecord }> {
  const ordered = [...records].sort((left, right) =>
    compareText(left.relative_path, right.relative_path) ||
    compareText(left.id, right.id) ||
    compareText(left.root_id, right.root_id));
  const options = ordered.map((record) => ({
    option: `${record.label} — ${record.format} — ${record.relative_path.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240)} — ${record.id} — ${record.root_id}`,
    record,
  }));
  if (new Set(options.map(({ option }) => option)).size !== options.length) throw workflowError("workspace_drift");
  return options;
}

export class ApplicationWorkspaceWorkflow {
  constructor(private readonly options: WorkspaceOptions) {}

  async run(args: string, ctx: ExtensionCommandContext): Promise<void> {
    if (args.trim() !== "") throw workflowError("invalid_command_arguments");
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") throw workflowError("interactive_mode_required");
    if (!ctx.isIdle()) throw workflowError("workspace_unavailable");
    const identity = sessionIdentity(ctx);
    const menuState = await this.menuState(identity);
    const action = await ctx.ui.select("Career application workspace", [
      "Status and reconcile",
      ...(menuState.canInitialize ? ["Initialize current application"] : []),
      ...(menuState.canRecord ? ["Record current status and vacancy"] : []),
      "Select original resume",
      "Configure application root",
      "Detach application root from config",
      "Close",
    ]);
    if (action === undefined || action === "Close") return;
    if (action === "Status and reconcile") return this.status(ctx);
    if (action === "Configure application root") return this.configureRoot(ctx);
    if (action === "Detach application root from config") return this.detachRoot(ctx);
    if (action === "Initialize current application") return this.initialize(ctx);
    if (action === "Record current status and vacancy") return this.record(ctx);
    if (action === "Select original resume") return this.selectOriginal(ctx);
  }

  private async menuState(identity: WorkspaceApplicationIdentity | undefined): Promise<{ canInitialize: boolean; canRecord: boolean }> {
    if (identity === undefined) return { canInitialize: false, canRecord: false };
    try {
      const attachment = await attachmentFor(this.options.agentDir, identity);
      if (attachment.snapshot.config.application_workspace === null) return { canInitialize: false, canRecord: false };
      if (attachment.application === undefined) return { canInitialize: true, canRecord: false };
      return {
        canInitialize: false,
        canRecord: attachment.application.head.status !== identity.current.status ||
          !sameSessionVacancy(attachment.application.head, identity.vacancy),
      };
    } catch {
      return { canInitialize: false, canRecord: false };
    }
  }

  private async status(ctx: ExtensionCommandContext): Promise<void> {
    const identity = sessionIdentity(ctx);
    let snapshot: ConfigSnapshot;
    try {
      snapshot = await loadConfigSnapshot(this.options.agentDir);
    } catch {
      throw workflowError("workspace_config_invalid");
    }
    try {
      await lstat(configLockPath(this.options.agentDir));
      ctx.ui.notify("Crash-left config lock detected. Workspace mutations are blocked; reconciliation made no change.", "warning");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        ctx.ui.notify("Workspace config drift detected. Mutations are blocked; reconciliation made no change.", "warning");
        return;
      }
    }
    const configured = snapshot.config.application_workspace;
    if (configured === null) {
      ctx.ui.notify("Application workspace root: detached. No file was changed.", "info");
      return;
    }
    let attachment: Attachment;
    try {
      attachment = await attachmentFor(this.options.agentDir, identity);
    } catch {
      const classification = await reconciliationClassification(configured.root_path);
      ctx.ui.notify(`${privacyDisplayPath(configured.root_path)} • ${classification}`, "warning");
      return;
    }
    if (identity === undefined) {
      ctx.ui.notify(`Application workspace root: attached (${privacyDisplayPath(configured.root_path)}). No active application on this branch.`, "info");
      return;
    }
    const application = attachment.application;
    if (application === undefined) {
      ctx.ui.notify(`Application workspace root: attached (${privacyDisplayPath(configured.root_path)}). Current application is not initialized.`, "info");
      return;
    }
    try {
      await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original);
    } catch {
      ctx.ui.notify("Selected-original binding drift detected. Mutations are blocked; reconciliation made no change.", "warning");
      return;
    }
    const drift = application.head.status !== identity.current.status ||
      !sameSessionVacancy(application.head, identity.vacancy);
    ctx.ui.notify([
      `Application workspace: attached • ${privacyDisplayPath(application.directoryPath)}`,
      `Workspace status: ${application.head.status} • session status: ${identity.current.status}`,
      `State revisions: ${application.revisions.length} • selected original: ${application.head.selected_original === null ? "none" : "bound"}`,
      drift ? "Session and workspace differ. Use Record current status and vacancy for an explicit direction-specific write." : "Session and workspace status are reconciled.",
    ].join("\n"), "info");
  }

  private async configureRoot(ctx: ExtensionCommandContext): Promise<void> {
    const rootInput = await ctx.ui.input("Application workspace root", "Canonical absolute existing 0700 directory");
    if (rootInput === undefined) return;
    const session = sessionIdentity(ctx);
    let snapshot: ConfigSnapshot;
    try {
      snapshot = await loadConfigSnapshot(this.options.agentDir);
    } catch {
      throw workflowError("workspace_config_invalid");
    }
    const rootPath = rootInput;
    const configuredRoot = snapshot.config.application_workspace;
    if (configuredRoot !== null && configuredRoot.root_path !== rootPath) {
      throw workflowError("workspace_unavailable");
    }
    const initialRootMetadata = await validateApplicationRootPath(rootPath);
    const mutationId = this.options.uuid().toLowerCase();
    const createdAt = this.options.now().toISOString();
    if (!validUuid(mutationId) || !validTimestamp(createdAt)) throw workflowError("workspace_verification_failed");
    await assertApplicationWorkspaceDisjoint(setApplicationWorkspace(snapshot.config, {
      root_id: mutationId,
      root_path: rootPath,
    }));

    const entries = await boundedEntries(rootPath, ROOT_MAX_ENTRIES);
    let marker: RootMarker;
    let markerBytes: Buffer | undefined;
    let initialAudit: RootAudit | undefined;
    let marked = false;
    if (entries.length === 0) {
      if (configuredRoot !== null) throw workflowError("workspace_drift");
      marker = { schema_version: ROOT_MARKER_SCHEMA, kind: "application_workspace_root", root_id: this.options.uuid().toLowerCase(), created_at: createdAt };
      if (!validUuid(marker.root_id)) throw workflowError("workspace_verification_failed");
      markerBytes = canonicalJson(marker);
    } else {
      const target = currentApplicationTarget(rootPath, session);
      initialAudit = await inspectRoot(rootPath, {
        ...(configuredRoot === null ? {} : { expectedRootId: configuredRoot.root_id }),
        ...(target === undefined ? {} : { currentApplication: target }),
      });
      marker = initialAudit.marker;
      marked = true;
    }
    const nextConfig = setApplicationWorkspace(snapshot.config, { root_id: marker.root_id, root_path: rootPath });
    await assertApplicationWorkspaceDisjoint(nextConfig);
    const nextBytes = encodeConfig(nextConfig);
    if (nextBytes.length > CONFIG_MAX_BYTES) throw workflowError("workspace_config_invalid");
    const configObjects = configPreview(snapshot, nextBytes);
    const markerPath = path.join(rootPath, ROOT_MARKER_NAME);
    const markerTemp = path.join(rootPath, `.pi-career-${mutationId}-root-marker.tmp`);
    const plan = buildPlan(
      this.options, ctx, "configure_root", session?.identity.application_id ?? null, session,
      snapshot.sha256, null,
      [...(markerBytes === undefined ? [] : [createPreview(markerPath, markerBytes)]), ...configObjects.creates],
      configObjects.replaces,
      [configLockPath(this.options.agentDir), ...(marked ? [workspaceLockPath(rootPath)] : []),
        ...(markerBytes === undefined ? [] : [markerTemp]), configTemporaryPath(this.options.agentDir, mutationId)],
      [], mutationId, createdAt,
    );
    if (!(await approve(plan, ctx))) return;
    assertSessionPlan(plan, ctx);

    const queuePaths = [snapshot.filePath, ...(markerBytes === undefined ? [] : [markerPath])];
    await withQueues(queuePaths, async () => {
      const configLock = await acquireMutationLock(configLockPath(this.options.agentDir), "config_mutation_lock", mutationId, createdAt);
      let rootLock: Awaited<ReturnType<typeof acquireMutationLock>> | undefined;
      let publishedMarker: PublishedFile | undefined;
      let configCommitStarted = false;
      try {
        assertSessionPlan(plan, ctx);
        await assertConfigSnapshotCurrent(snapshot);
        const currentRootMetadata = await validateApplicationRootPath(rootPath);
        if (!sameInode(initialRootMetadata, currentRootMetadata)) throw workflowError("workspace_drift");
        if (marked) {
          rootLock = await acquireMutationLock(workspaceLockPath(rootPath), "workspace_mutation_lock", mutationId, createdAt);
          const target = currentApplicationTarget(rootPath, session);
          const audit = await inspectRoot(rootPath, {
            expectedRootId: marker.root_id,
            ownedLock: rootLock.path,
            ...(target === undefined ? {} : { currentApplication: target }),
          });
          if (initialAudit === undefined) throw workflowError("workspace_drift");
          assertRootPlanCurrent(initialAudit, audit);
          if (audit.markerFile.sha256 !== hashBytes(canonicalJson(marker))) throw workflowError("workspace_drift");
        } else {
          const lockedEntries = await boundedEntries(rootPath, 1);
          if (lockedEntries.length !== 0 || markerBytes === undefined) throw workflowError("workspace_drift");
          if (ctx.signal?.aborted) throw workflowError("workflow_cancelled");
          publishedMarker = await publishFile(markerPath, markerTemp, markerBytes);
          const verifiedMarker = await readExactFile(markerPath, parseMarker);
          if (verifiedMarker.value.root_id !== marker.root_id) throw workflowError("workspace_status_unknown");
        }
        await assertApplicationWorkspaceDisjoint(nextConfig);
        if (ctx.signal?.aborted && publishedMarker === undefined) throw workflowError("workflow_cancelled");
        configCommitStarted = true;
        await commitConfigUnderLock(snapshot, nextConfig, configTemporaryPath(this.options.agentDir, mutationId), "v2");
      } catch (error) {
        if (publishedMarker !== undefined) {
          let configIsUnchanged = !configCommitStarted;
          if (configCommitStarted) {
            try {
              await assertConfigSnapshotCurrent(snapshot);
              configIsUnchanged = true;
            } catch {
              // An indeterminate or committed config keeps the valid marker for reconciliation.
            }
          }
          if (configIsUnchanged) {
            try {
              const currentEntries = await boundedEntries(rootPath, 1);
              if (currentEntries.length === 1 && currentEntries[0] === ROOT_MARKER_NAME) {
                await unlinkOwned(publishedMarker);
                await syncDirectory(rootPath);
              }
            } catch {
              // A marker-only crash state is valid and is never broadly cleaned.
            }
          }
        }
        throw error;
      } finally {
        try {
          if (rootLock !== undefined) await releaseMutationLock(rootLock);
        } finally {
          await releaseMutationLock(configLock);
        }
      }
    });
    ctx.ui.notify(`Application workspace root attached: ${privacyDisplayPath(rootPath)}. Existing workspace files remain unchanged.`, "info");
  }

  private async detachRoot(ctx: ExtensionCommandContext): Promise<void> {
    const session = sessionIdentity(ctx);
    let snapshot: ConfigSnapshot;
    try {
      snapshot = await loadConfigSnapshot(this.options.agentDir);
    } catch {
      throw workflowError("workspace_config_invalid");
    }
    const configured = snapshot.config.application_workspace;
    if (configured === null) throw workflowError("workspace_unavailable");
    await assertApplicationWorkspaceDisjoint(snapshot.config);
    const target = currentApplicationTarget(configured.root_path, session);
    const initialRoot = await inspectRoot(configured.root_path, {
      expectedRootId: configured.root_id,
      ...(target === undefined ? {} : { currentApplication: target }),
    });
    const nextConfig = setApplicationWorkspace(snapshot.config, null);
    const nextBytes = encodeConfig(nextConfig);
    const configObjects = configPreview(snapshot, nextBytes);
    const mutationId = this.options.uuid().toLowerCase();
    const createdAt = this.options.now().toISOString();
    const plan = buildPlan(
      this.options, ctx, "detach_root", session?.identity.application_id ?? null, session,
      snapshot.sha256, null, configObjects.creates, configObjects.replaces,
      [configLockPath(this.options.agentDir), workspaceLockPath(configured.root_path),
        configTemporaryPath(this.options.agentDir, mutationId)],
      ["Detaching changes config only. The root marker and every application file remain."], mutationId, createdAt,
    );
    if (!(await approve(plan, ctx))) return;
    assertSessionPlan(plan, ctx);
    await withQueues([snapshot.filePath], async () => {
      const configLock = await acquireMutationLock(configLockPath(this.options.agentDir), "config_mutation_lock", mutationId, createdAt);
      let rootLock: Awaited<ReturnType<typeof acquireMutationLock>> | undefined;
      try {
        rootLock = await acquireMutationLock(workspaceLockPath(configured.root_path), "workspace_mutation_lock", mutationId, createdAt);
        assertSessionPlan(plan, ctx);
        await assertConfigSnapshotCurrent(snapshot);
        const currentRoot = await inspectRoot(configured.root_path, {
          expectedRootId: configured.root_id,
          ownedLock: rootLock.path,
          ...(target === undefined ? {} : { currentApplication: target }),
        });
        assertRootPlanCurrent(initialRoot, currentRoot);
        if (ctx.signal?.aborted) throw workflowError("workflow_cancelled");
        await commitConfigUnderLock(snapshot, nextConfig, configTemporaryPath(this.options.agentDir, mutationId), "v2");
      } finally {
        try {
          if (rootLock !== undefined) await releaseMutationLock(rootLock);
        } finally {
          await releaseMutationLock(configLock);
        }
      }
    });
    ctx.ui.notify("Application workspace root detached from config. No workspace file was changed or deleted.", "info");
  }

  private async initialize(ctx: ExtensionCommandContext): Promise<void> {
    const identity = sessionIdentity(ctx);
    if (identity === undefined) throw workflowError("workspace_unavailable");
    const attachment = await attachmentFor(this.options.agentDir, identity);
    const configured = attachment.snapshot.config.application_workspace;
    if (configured === null || attachment.expectedDirectoryPath === undefined) throw workflowError("workspace_unavailable");
    if (attachment.application !== undefined) {
      ctx.ui.notify("The current application workspace is already initialized and valid.", "info");
      return;
    }
    if (attachment.root.entries.length + 1 > ROOT_MAX_ENTRIES) throw workflowError("workspace_limit_reached");
    const directoryPath = attachment.expectedDirectoryPath;
    await requireAbsent(directoryPath);
    const mutationId = this.options.uuid().toLowerCase();
    const createdAt = this.options.now().toISOString();
    if (Date.parse(createdAt) < Date.parse(identity.identity.created_at)) throw workflowError("workspace_unavailable");
    const manifest: ApplicationManifest = {
      schema_version: MANIFEST_SCHEMA,
      kind: "career_application",
      application_id: identity.identity.application_id,
      root_id: configured.root_id,
      application_created_at: identity.identity.created_at,
      workspace_created_at: createdAt,
    };
    const manifestBytes = canonicalJson(manifest);
    const currentVacancyBytes = vacancyBytes(identity.vacancy, identity.identity.application_id);
    const vacancyName = "vacancy.md";
    const state: ApplicationStateRevision = {
      schema_version: STATE_SCHEMA,
      kind: "application_state_revision",
      application_id: identity.identity.application_id,
      sequence: 1,
      parent_sha256: hashBytes(manifestBytes),
      status: identity.current.status,
      vacancy: currentVacancyBytes === undefined || identity.vacancy === undefined
        ? null
        : vacancyBinding(vacancyName, currentVacancyBytes, identity.vacancy),
      selected_original: null,
      resume_artifact: null,
      updated_at: createdAt,
    };
    const stateFile = path.join(directoryPath, stateName(1));
    const manifestFile = path.join(directoryPath, MANIFEST_NAME);
    const vacancyFile = path.join(directoryPath, vacancyName);
    const stateBuffer = stateBytes(state);
    const persistentCount = 2 + (currentVacancyBytes === undefined ? 0 : 1);
    const managedBytes = manifestBytes.length + stateBuffer.length + (currentVacancyBytes?.length ?? 0);
    if (persistentCount > APPLICATION_MAX_ENTRIES || managedBytes > APPLICATION_MAX_MANAGED_BYTES) {
      throw workflowError("workspace_limit_reached");
    }
    const files = [
      { final: manifestFile, temp: path.join(directoryPath, `.pi-career-${mutationId}-manifest.tmp`), bytes: manifestBytes },
      ...(currentVacancyBytes === undefined ? [] : [{ final: vacancyFile, temp: path.join(directoryPath, `.pi-career-${mutationId}-vacancy.tmp`), bytes: currentVacancyBytes }]),
      { final: stateFile, temp: path.join(directoryPath, `.pi-career-${mutationId}-state.tmp`), bytes: stateBuffer },
    ];
    if (ctx.sessionManager.getSessionFile() === undefined) {
      ctx.ui.notify("Transient session warning: approved workspace files outlive this Pi process and cannot recreate session identity after shutdown.", "warning");
    }
    const plan = buildPlan(
      this.options, ctx, "initialize_application", identity.identity.application_id, identity,
      attachment.snapshot.sha256, null,
      [createDirectoryPreview(directoryPath), ...files.map((file) => createPreview(file.final, file.bytes))], [],
      [workspaceLockPath(configured.root_path), ...files.map((file) => file.temp)],
      ctx.sessionManager.getSessionFile() === undefined
        ? ["Transient session: workspace files outlive this process and do not recreate session identity."] : [],
      mutationId, createdAt,
    );
    if (!(await approve(plan, ctx))) return;
    assertSessionPlan(plan, ctx);
    await withQueues([directoryPath, ...files.map((file) => file.final)], async () => {
      const rootLock = await acquireMutationLock(workspaceLockPath(configured.root_path), "workspace_mutation_lock", mutationId, createdAt);
      const published: PublishedFile[] = [];
      let createdDirectory: Stats | undefined;
      try {
        const currentIdentity = assertSessionPlan(plan, ctx);
        if (currentIdentity === undefined) throw workflowError("workspace_identity_conflict");
        await assertConfigSnapshotCurrent(attachment.snapshot);
        await assertApplicationWorkspaceDisjoint(attachment.snapshot.config);
        const root = await inspectRoot(configured.root_path, {
          expectedRootId: configured.root_id,
          ownedLock: rootLock.path,
          currentApplication: {
            directoryPath,
            applicationId: identity.identity.application_id,
            applicationCreatedAt: identity.identity.created_at,
          },
        });
        assertRootPlanCurrent(attachment.root, root);
        if (root.currentApplication !== undefined) {
          throw workflowError("workspace_identity_conflict");
        }
        const persistentRootEntries = root.entries.filter((entry) => entry !== path.basename(rootLock.path)).length;
        if (persistentRootEntries + 1 > ROOT_MAX_ENTRIES) throw workflowError("workspace_limit_reached");
        await requireAbsent(directoryPath);
        vacancyBytes(currentIdentity.vacancy, currentIdentity.identity.application_id);
        if (ctx.signal?.aborted) throw workflowError("workflow_cancelled");
        await mkdir(directoryPath, { recursive: false, mode: 0o700 });
        createdDirectory = await lstat(directoryPath);
        await chmod(directoryPath, 0o700);
        createdDirectory = await lstat(directoryPath);
        if (!privateMetadata(createdDirectory, 0o700, "directory") || await realpath(directoryPath) !== directoryPath) {
          throw workflowError("workspace_verification_failed");
        }
        await syncDirectory(configured.root_path);
        for (const file of files) published.push(await publishFile(file.final, file.temp, file.bytes));
        await syncDirectory(directoryPath);
        await syncDirectory(configured.root_path);
        const verified = await inspectApplicationDirectory(directoryPath, configured.root_id, path.basename(directoryPath));
        if (verified.headFile.sha256 !== hashBytes(stateBuffer)) throw workflowError("workspace_status_unknown");
      } catch (error) {
        const committed = await inspectApplicationDirectory(directoryPath, configured.root_id, path.basename(directoryPath))
          .then((value) => value.headFile.sha256 === hashBytes(stateBuffer), () => false);
        if (committed) return;
        for (const item of [...published].reverse()) await unlinkOwned(item);
        if (createdDirectory !== undefined) {
          try {
            const current = await lstat(directoryPath);
            if (current.dev === createdDirectory.dev && current.ino === createdDirectory.ino &&
              (await boundedEntries(directoryPath, 0)).length === 0) await rmdir(directoryPath);
          } catch {
            // Interrupted initialization remains visible for reconciliation.
          }
        }
        if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
        throw workflowError(createdDirectory !== undefined || published.length > 0
          ? "workspace_status_unknown"
          : "workspace_verification_failed");
      } finally {
        await releaseMutationLock(rootLock);
      }
    });
    ctx.ui.notify(`Initialized application workspace: ${privacyDisplayPath(directoryPath)}. No resume artifact was saved.`, "info");
  }

  private async record(ctx: ExtensionCommandContext): Promise<void> {
    const identity = sessionIdentity(ctx);
    if (identity === undefined) throw workflowError("workspace_unavailable");
    const attachment = await attachmentFor(this.options.agentDir, identity);
    const application = attachment.application;
    const configured = attachment.snapshot.config.application_workspace;
    if (configured === null || application === undefined) throw workflowError("workspace_unavailable");
    await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original);
    if (application.head.status === identity.current.status && sameSessionVacancy(application.head, identity.vacancy)) {
      ctx.ui.notify("Workspace status and vacancy already match this session; no revision was added.", "info");
      return;
    }
    const sequence = application.head.sequence + 1;
    if (sequence > STATE_MAX_REVISIONS) throw workflowError("workspace_limit_reached");
    const currentVacancyBytes = vacancyBytes(identity.vacancy, identity.identity.application_id);
    const vacancyChanged = !sameSessionVacancy(application.head, identity.vacancy);
    const vacancyName = `vacancy-${String(sequence).padStart(6, "0")}.md`;
    const vacancyFile = path.join(application.directoryPath, vacancyName);
    const nextVacancy = identity.vacancy === undefined ? null
      : vacancyChanged && currentVacancyBytes !== undefined
        ? vacancyBinding(vacancyName, currentVacancyBytes, identity.vacancy)
        : application.head.vacancy;
    const createdAt = this.options.now().toISOString();
    if (Date.parse(createdAt) <= Date.parse(application.head.updated_at)) throw workflowError("workspace_unavailable");
    const state: ApplicationStateRevision = {
      schema_version: STATE_SCHEMA,
      kind: "application_state_revision",
      application_id: identity.identity.application_id,
      sequence,
      parent_sha256: application.headFile.sha256,
      status: identity.current.status,
      vacancy: nextVacancy,
      selected_original: application.head.selected_original,
      resume_artifact: application.head.resume_artifact,
      updated_at: createdAt,
    };
    const stateBuffer = stateBytes(state);
    const mutationId = this.options.uuid().toLowerCase();
    const stateFile = path.join(application.directoryPath, stateName(sequence));
    const files = [
      ...(vacancyChanged && currentVacancyBytes !== undefined
        ? [{ final: vacancyFile, temp: path.join(application.directoryPath, `.pi-career-${mutationId}-vacancy.tmp`), bytes: currentVacancyBytes }]
        : []),
      { final: stateFile, temp: path.join(application.directoryPath, `.pi-career-${mutationId}-state.tmp`), bytes: stateBuffer },
    ];
    for (const file of files) await requireAbsent(file.final);
    assertApplicationCapacity(application, files);
    if (ctx.sessionManager.getSessionFile() === undefined) {
      ctx.ui.notify("Transient session warning: this approved revision outlives the current Pi process.", "warning");
    }
    const plan = buildPlan(
      this.options, ctx, "record_state", identity.identity.application_id, identity,
      attachment.snapshot.sha256, application.headFile.sha256,
      files.map((file) => createPreview(file.final, file.bytes)), [],
      [workspaceLockPath(configured.root_path), ...files.map((file) => file.temp)],
      ctx.sessionManager.getSessionFile() === undefined ? ["Transient session: the revision outlives this process."] : [],
      mutationId, createdAt,
    );
    if (!(await approve(plan, ctx))) return;
    await this.commitRevision(plan, ctx, attachment, identity, files, stateBuffer, async (current) => {
      if (current.current.status !== identity.current.status ||
        (current.vacancy?.state_id ?? null) !== (identity.vacancy?.state_id ?? null)) {
        throw workflowError("workspace_identity_conflict");
      }
      await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original);
    });
    ctx.ui.notify(`Recorded immutable workspace state revision ${sequence}. Earlier vacancy files remain unchanged.`, "info");
  }

  private async selectOriginal(ctx: ExtensionCommandContext): Promise<void> {
    const identity = sessionIdentity(ctx);
    if (identity === undefined) throw workflowError("workspace_unavailable");
    const attachment = await attachmentFor(this.options.agentDir, identity);
    const application = attachment.application;
    const configured = attachment.snapshot.config.application_workspace;
    if (configured === null || application === undefined || application.head.resume_artifact !== null) {
      throw workflowError("workspace_unavailable");
    }
    await validateSelectedBinding(attachment.snapshot.config, application.head.selected_original);
    const scan = await scanLibrary(attachment.snapshot.config);
    if (scan.total_capped) throw workflowError("workspace_limit_reached");
    const eligibleRootIds = new Set(scan.roots.filter((root) => !root.capped && !root.stale).map((root) => root.root_id));
    const originals = eligibleOriginals(scan).filter((record) => eligibleRootIds.has(record.root_id));
    if (originals.length === 0) throw workflowError("workspace_unavailable");
    const byOption = new Map(selectedOriginalOptions(originals).map(({ option, record }) => [option, record]));
    const selectedOption = await ctx.ui.select("Select original resume binding", [...byOption.keys()]);
    const selected = selectedOption === undefined ? undefined : byOption.get(selectedOption);
    if (selected === undefined) return;
    const binding: SelectedOriginalBinding = {
      document_id: selected.id,
      library_root_id: selected.root_id,
      text_sha256: selected.text_sha256,
      format: selected.format,
    };
    if (JSON.stringify(binding) === JSON.stringify(application.head.selected_original)) {
      ctx.ui.notify("The selected original binding is already current; no revision was added.", "info");
      return;
    }
    const sequence = application.head.sequence + 1;
    if (sequence > STATE_MAX_REVISIONS) throw workflowError("workspace_limit_reached");
    const createdAt = this.options.now().toISOString();
    if (Date.parse(createdAt) <= Date.parse(application.head.updated_at)) throw workflowError("workspace_unavailable");
    const state: ApplicationStateRevision = {
      schema_version: STATE_SCHEMA,
      kind: "application_state_revision",
      application_id: identity.identity.application_id,
      sequence,
      parent_sha256: application.headFile.sha256,
      status: application.head.status,
      vacancy: application.head.vacancy,
      selected_original: binding,
      resume_artifact: null,
      updated_at: createdAt,
    };
    const bytes = stateBytes(state);
    const mutationId = this.options.uuid().toLowerCase();
    const final = path.join(application.directoryPath, stateName(sequence));
    const temporary = path.join(application.directoryPath, `.pi-career-${mutationId}-state.tmp`);
    await requireAbsent(final);
    assertApplicationCapacity(application, [{ bytes }]);
    const plan = buildPlan(
      this.options, ctx, "select_original", identity.identity.application_id, identity,
      attachment.snapshot.sha256, application.headFile.sha256,
      [createPreview(final, bytes)], [], [workspaceLockPath(configured.root_path), temporary], [], mutationId, createdAt,
    );
    if (!(await approve(plan, ctx))) return;
    await this.commitRevision(plan, ctx, attachment, identity, [{ final, temp: temporary, bytes }], bytes, async () => {
      const freshScan = await scanLibrary(attachment.snapshot.config);
      freshRecord(freshScan, selected);
    });
    ctx.ui.notify(`Recorded selected-original binding in immutable revision ${sequence}; no original bytes were copied or changed.`, "info");
  }

  private async commitRevision(
    plan: WorkspacePlan,
    ctx: ExtensionCommandContext,
    attachment: Attachment,
    identity: WorkspaceApplicationIdentity,
    files: Array<{ final: string; temp: string; bytes: Buffer }>,
    stateBuffer: Buffer,
    sourceValidation: (current: WorkspaceApplicationIdentity) => Promise<void>,
  ): Promise<void> {
    const configured = attachment.snapshot.config.application_workspace;
    const application = attachment.application;
    if (configured === null || application === undefined) throw workflowError("workspace_unavailable");
    await withQueues(files.map((file) => file.final), async () => {
      const rootLock = await acquireMutationLock(
        workspaceLockPath(configured.root_path), "workspace_mutation_lock", plan.envelope.mutation_id, plan.createdAt,
      );
      const published: PublishedFile[] = [];
      try {
        const current = assertSessionPlan(plan, ctx);
        if (current === undefined || current.identity.application_id !== identity.identity.application_id) {
          throw workflowError("workspace_identity_conflict");
        }
        await assertConfigSnapshotCurrent(attachment.snapshot);
        await assertApplicationWorkspaceDisjoint(attachment.snapshot.config);
        const root = await inspectRoot(configured.root_path, {
          expectedRootId: configured.root_id,
          ownedLock: rootLock.path,
          currentApplication: {
            directoryPath: application.directoryPath,
            applicationId: identity.identity.application_id,
            applicationCreatedAt: identity.identity.created_at,
          },
        });
        assertRootPlanCurrent(attachment.root, root);
        const currentApplication = root.currentApplication;
        if (currentApplication === undefined || currentApplication.headFile.sha256 !== application.headFile.sha256) {
          throw workflowError("workspace_drift");
        }
        await sourceValidation(current);
        for (const file of files) await requireAbsent(file.final);
        assertApplicationCapacity(currentApplication, files);
        if (ctx.signal?.aborted) throw workflowError("workflow_cancelled");
        for (const file of files) published.push(await publishFile(file.final, file.temp, file.bytes));
        const verified = await inspectApplicationDirectory(application.directoryPath, configured.root_id, path.basename(application.directoryPath));
        if (verified.headFile.sha256 !== hashBytes(stateBuffer)) throw workflowError("workspace_status_unknown");
      } catch (error) {
        const committed = await inspectApplicationDirectory(application.directoryPath, configured.root_id, path.basename(application.directoryPath))
          .then((value) => value.headFile.sha256 === hashBytes(stateBuffer), () => false);
        if (committed) return;
        for (const item of [...published].reverse()) await unlinkOwned(item);
        if (error instanceof Error && error.name === "CareerWorkflowError") throw error;
        throw workflowError(published.length > 0 ? "workspace_status_unknown" : "workspace_verification_failed");
      } finally {
        await releaseMutationLock(rootLock);
      }
    });
  }
}
