// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import {
  withFileMutationQueue,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

import { loadConfig } from "./config.ts";
import { eligibleOriginals, scanLibrary } from "./scan.ts";
import type { CareerConfig, LibraryRoot, ResumeRecord } from "./types.ts";
import {
  ASSISTED_SIDECAR_MAX_BYTES,
  MANAGED_VARIANTS_MARKER_NAME,
  encodeAssistedVariantMetadataV2,
  encodeManagedVariantsMarker,
  parseAssistedVariantMetadata,
  parseManagedVariantsMarker,
  sha256Bytes,
} from "./variant-metadata.ts";
import { CareerRunError, careerRunError } from "../managed/errors.ts";
import type { MaterializedVariantCandidate } from "../managed/engine.ts";

const ARTIFACT_MAX_BYTES = 262_144;
const PREVIEW_MAX_BYTES = 524_288;
const PATH_MAX_BYTES = 4_096;
const CONFIRM_TIMEOUT_MS = 10 * 60 * 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VARIANT_HANDLE = /^variant:[a-f0-9-]{8,64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CHANGE_ID = /^change-[0-9]{4}$/;

interface VariantSaveFileSystem {
  chmod: typeof chmod;
  link: typeof link;
  lstat: typeof lstat;
  mkdir: typeof mkdir;
  open: typeof open;
  readFile: typeof readFile;
  readdir: typeof readdir;
  realpath: typeof realpath;
  unlink: typeof unlink;
}

const DEFAULT_FS: VariantSaveFileSystem = {
  chmod, link, lstat, mkdir, open, readFile, readdir, realpath, unlink,
};

interface VariantSaveOptions {
  agentDir: string;
  now: () => Date;
  uuid: () => string;
  fs?: VariantSaveFileSystem;
}

interface DestinationState {
  kind: "absent" | "empty" | "managed";
  directoryPath: string;
  markerPath: string;
}

interface PreparedOriginal {
  config: CareerConfig;
  root: LibraryRoot;
  record: ResumeRecord;
  destination: DestinationState;
}

interface SavePlan {
  saveId: string;
  sessionId: string;
  candidate: MaterializedVariantCandidate;
  createdAt: string;
  directoryPath: string;
  markerPath: string;
  artifactPath: string;
  sidecarPath: string;
  artifactBytes: Buffer;
  sidecarBytes: Buffer;
  markerBytes?: Buffer;
  initialDestinationKind: DestinationState["kind"];
  previewText: string;
}

interface PublishedReceipt {
  plan: SavePlan;
}

interface TempFile {
  path: string;
  metadata: Stats;
}

export type VariantSaveOutcome =
  | { status: "cancelled" }
  | { status: "saved" | "existing"; artifactPath: string; sidecarPath: string };

function isNodeError(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" &&
    (error as NodeJS.ErrnoException).code === code;
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function sameCandidate(left: MaterializedVariantCandidate, right: MaterializedVariantCandidate): boolean {
  return left.handle === right.handle &&
    left.assistedText === right.assistedText &&
    left.selectedChangeIds.join("\0") === right.selectedChangeIds.join("\0") &&
    left.source.resumeId === right.source.resumeId &&
    left.source.rootId === right.source.rootId &&
    left.source.format === right.source.format &&
    left.source.textSha256 === right.source.textSha256;
}

function validCandidateIdentity(candidate: MaterializedVariantCandidate): boolean {
  return VARIANT_HANDLE.test(candidate.handle) &&
    SHA256.test(candidate.source.resumeId) &&
    SHA256.test(candidate.source.rootId) &&
    SHA256.test(candidate.source.textSha256) &&
    (candidate.source.format === "markdown" || candidate.source.format === "text");
}

function validSelectedChanges(selectedChangeIds: readonly string[]): boolean {
  return selectedChangeIds.length > 0 &&
    new Set(selectedChangeIds).size === selectedChangeIds.length &&
    selectedChangeIds.every((id) => CHANGE_ID.test(id));
}

function validateCandidate(candidate: MaterializedVariantCandidate): Buffer {
  if (!validCandidateIdentity(candidate) || !validSelectedChanges(candidate.selectedChangeIds) ||
    candidate.assistedText.length === 0 || candidate.assistedText.includes("\r") ||
    hasUnpairedSurrogate(candidate.assistedText)) {
    throw careerRunError("variant_save_unavailable");
  }
  const bytes = Buffer.from(candidate.assistedText, "utf8");
  if (bytes.length === 0 || bytes.length > ARTIFACT_MAX_BYTES) {
    throw careerRunError("variant_save_unavailable");
  }
  return bytes;
}

function effectiveUserId(): number | undefined {
  return process.geteuid?.() ?? process.getuid?.();
}

function privateMetadata(metadata: Stats, mode: number): boolean {
  const userId = effectiveUserId();
  return userId !== undefined && metadata.uid === userId &&
    (metadata.mode & 0o777) === mode;
}

function directManagedRoot(config: CareerConfig, root: LibraryRoot): string {
  const configured = config.generated_variants_root === undefined
    ? undefined
    : path.resolve(config.generated_variants_root);
  return configured !== undefined && path.dirname(configured) === root.path
    ? configured
    : path.join(root.path, "variants");
}

function validBoundedPath(value: string): boolean {
  return path.isAbsolute(value) && path.normalize(value) === value &&
    Buffer.byteLength(value, "utf8") <= PATH_MAX_BYTES &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function validDestination(config: CareerConfig, root: LibraryRoot, directoryPath: string): boolean {
  return validBoundedPath(root.path) && validBoundedPath(directoryPath) &&
    path.dirname(directoryPath) === root.path && directoryPath !== root.path &&
    !config.library_roots.some((configuredRoot) => configuredRoot.path === directoryPath);
}

function basicTimestamp(createdAt: string): string {
  return createdAt.replace(/[-:.]/g, "");
}

function canonicalJson(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fileNameFor(candidate: MaterializedVariantCandidate, createdAt: string, saveId: string): string {
  const extension = candidate.source.format === "markdown" ? "md" : "txt";
  const suffix = saveId.replaceAll("-", "").slice(0, 8);
  return `resume-assisted-${basicTimestamp(createdAt)}-${suffix}.${extension}`;
}

export class VariantSaveWorkflow {
  private readonly fs: VariantSaveFileSystem;
  private readonly receipts = new Map<string, PublishedReceipt>();
  private readonly rootLocks = new Map<string, Promise<void>>();

  constructor(private readonly options: VariantSaveOptions) {
    this.fs = options.fs ?? DEFAULT_FS;
  }

  clearReceipts(): void {
    this.receipts.clear();
  }

  async run(
    handle: string,
    ctx: ExtensionCommandContext,
    resolveCandidate: () => MaterializedVariantCandidate,
  ): Promise<VariantSaveOutcome> {
    if (!ctx.isIdle()) throw careerRunError("variant_save_unavailable");
    const candidate = resolveCandidate();
    const existing = this.receipts.get(handle);
    if (existing !== undefined) {
      if (!sameCandidate(existing.plan.candidate, candidate) ||
        existing.plan.sessionId !== ctx.sessionManager.getSessionId()) {
        throw careerRunError("variant_save_unavailable");
      }
      if (!(await this.verifyPublishedPair(existing.plan))) {
        throw careerRunError("variant_save_verification_failed");
      }
      await this.verifyRescan(existing.plan);
      return {
        status: "existing",
        artifactPath: existing.plan.artifactPath,
        sidecarPath: existing.plan.sidecarPath,
      };
    }

    const plan = await this.preparePlan(candidate, ctx.sessionManager.getSessionId());
    const reviewed = await ctx.ui.editor("Review exact assisted-variant save plan", plan.previewText);
    if (reviewed === undefined) return { status: "cancelled" };
    if (reviewed !== plan.previewText) throw careerRunError("variant_save_preview_changed");
    const confirmed = await ctx.ui.confirm(
      "Save assisted resume variant?",
      [
        `Save ID: ${plan.saveId}`,
        `Directory: ${plan.directoryPath}`,
        `Artifact: ${path.basename(plan.artifactPath)} (${plan.artifactBytes.length} bytes, ${hash(plan.artifactBytes)})`,
        `Sidecar: ${path.basename(plan.sidecarPath)} (${plan.sidecarBytes.length} bytes, ${hash(plan.sidecarBytes)})`,
        ...(plan.markerBytes === undefined ? [] : [
          `Create managed marker: ${MANAGED_VARIANTS_MARKER_NAME} (${plan.markerBytes.length} bytes, ${hash(plan.markerBytes)})`,
        ]),
        "This is assisted/non-authoritative. Existing files will never be replaced.",
      ].join("\n"),
      { timeout: CONFIRM_TIMEOUT_MS },
    );
    if (!confirmed || ctx.signal?.aborted) return { status: "cancelled" };

    const current = resolveCandidate();
    if (!sameCandidate(plan.candidate, current) ||
      plan.sessionId !== ctx.sessionManager.getSessionId()) {
      throw careerRunError("variant_save_unavailable");
    }

    const paths = [plan.artifactPath, plan.sidecarPath, ...(plan.markerBytes === undefined ? [] : [plan.markerPath])]
      .sort();
    await this.withRootLock(plan.directoryPath, () =>
      this.withMutationQueues(paths, async () => {
        const lockedCandidate = resolveCandidate();
        if (!sameCandidate(plan.candidate, lockedCandidate) ||
          plan.sessionId !== ctx.sessionManager.getSessionId() || !ctx.isIdle() || ctx.signal?.aborted) {
          throw careerRunError("variant_save_unavailable");
        }
        await this.revalidatePlan(plan);
        await this.publishPlan(plan);
      }));

    this.receipts.set(handle, { plan });
    await this.verifyRescan(plan);
    return { status: "saved", artifactPath: plan.artifactPath, sidecarPath: plan.sidecarPath };
  }

  private async currentOriginal(candidate: MaterializedVariantCandidate): Promise<PreparedOriginal> {
    const config = await loadConfig(this.options.agentDir);
    const scan = await scanLibrary(config);
    const root = config.library_roots.find((value) => value.id === candidate.source.rootId);
    const rootSummary = scan.roots.find((value) => value.root_id === candidate.source.rootId);
    const matches = eligibleOriginals(scan).filter((record) =>
      record.id === candidate.source.resumeId &&
      record.root_id === candidate.source.rootId &&
      record.format === candidate.source.format &&
      record.text_sha256 === candidate.source.textSha256);
    if (
      root === undefined || rootSummary === undefined || rootSummary.stale || rootSummary.capped ||
      scan.total_capped || matches.length !== 1
    ) throw careerRunError("variant_save_unavailable");
    const directoryPath = directManagedRoot(config, root);
    if (!validDestination(config, root, directoryPath)) {
      throw careerRunError("variant_save_destination_invalid");
    }
    const destination = await this.inspectDestination(directoryPath, root);
    return { config, root, record: matches[0]!, destination };
  }

  private async inspectDestination(directoryPath: string, root: LibraryRoot): Promise<DestinationState> {
    const markerPath = path.join(directoryPath, MANAGED_VARIANTS_MARKER_NAME);
    let metadata: Stats;
    try {
      metadata = await this.fs.lstat(directoryPath);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return { kind: "absent", directoryPath, markerPath };
      throw careerRunError("variant_save_destination_invalid");
    }
    const canonical = await this.fs.realpath(directoryPath).catch(() => undefined);
    if (
      !metadata.isDirectory() || metadata.isSymbolicLink() || canonical !== directoryPath ||
      !privateMetadata(metadata, 0o700)
    ) throw careerRunError("variant_save_destination_invalid");
    const entries = await this.fs.readdir(directoryPath).catch(() => undefined);
    if (entries === undefined) throw careerRunError("variant_save_destination_invalid");
    const markerState = await this.inspectMarker(markerPath, root.id);
    if (markerState === "valid") return { kind: "managed", directoryPath, markerPath };
    if (markerState === "invalid" || entries.length !== 0) {
      throw careerRunError("variant_save_destination_invalid");
    }
    return { kind: "empty", directoryPath, markerPath };
  }

  private async inspectMarker(
    markerPath: string,
    expectedRootId: string,
  ): Promise<"absent" | "valid" | "invalid"> {
    try {
      const marker = await this.fs.lstat(markerPath);
      if (
        !marker.isFile() || marker.isSymbolicLink() || !privateMetadata(marker, 0o600) ||
        marker.size <= 0 || marker.size > ASSISTED_SIDECAR_MAX_BYTES
      ) return "invalid";
      const bytes = await this.fs.readFile(markerPath);
      if (bytes.length !== marker.size) return "invalid";
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return parseManagedVariantsMarker(text, expectedRootId) === undefined ? "invalid" : "valid";
    } catch (error) {
      return isNodeError(error, "ENOENT") ? "absent" : "invalid";
    }
  }

  private async preparePlan(
    candidate: MaterializedVariantCandidate,
    sessionId: string,
  ): Promise<SavePlan> {
    const artifactBytes = validateCandidate(candidate);
    const prepared = await this.currentOriginal(candidate);
    const saveId = this.options.uuid().toLowerCase();
    const createdAt = this.options.now().toISOString();
    if (!UUID.test(saveId)) throw careerRunError("variant_save_unavailable");
    const fileName = fileNameFor(candidate, createdAt, saveId);
    const artifactPath = path.join(prepared.destination.directoryPath, fileName);
    const sidecarPath = path.join(
      prepared.destination.directoryPath,
      `${fileName.slice(0, -path.extname(fileName).length)}.pi-career.json`,
    );
    if (![prepared.destination.markerPath, artifactPath, sidecarPath].every(validBoundedPath)) {
      throw careerRunError("variant_save_destination_invalid");
    }
    await this.requireAbsent(artifactPath);
    await this.requireAbsent(sidecarPath);
    const sidecarBytes = encodeAssistedVariantMetadataV2({
      base_document_id: candidate.source.resumeId,
      base_text_sha256: candidate.source.textSha256,
      artifact_sha256: sha256Bytes(artifactBytes),
      created_at: createdAt,
    });
    const markerBytes = prepared.destination.kind === "managed"
      ? undefined
      : encodeManagedVariantsMarker(prepared.root.id, createdAt);
    if (sidecarBytes.length > ASSISTED_SIDECAR_MAX_BYTES ||
      (markerBytes !== undefined && markerBytes.length > ASSISTED_SIDECAR_MAX_BYTES)) {
      throw careerRunError("variant_save_unavailable");
    }
    const preview = {
      schema_version: "pi.career.variant_save_preview.v1",
      save_id: saveId,
      initialize_directory: markerBytes !== undefined,
      directory_path: prepared.destination.directoryPath,
      marker: markerBytes === undefined ? null : {
        path: prepared.destination.markerPath,
        utf8_bytes: markerBytes.length,
        sha256: hash(markerBytes),
        text: markerBytes.toString("utf8"),
      },
      artifact: {
        path: artifactPath,
        format: candidate.source.format,
        utf8_bytes: artifactBytes.length,
        sha256: hash(artifactBytes),
        text: candidate.assistedText,
      },
      sidecar: {
        path: sidecarPath,
        utf8_bytes: sidecarBytes.length,
        sha256: hash(sidecarBytes),
        text: sidecarBytes.toString("utf8"),
      },
    };
    const previewText = canonicalJson(preview);
    if (Buffer.byteLength(previewText, "utf8") > PREVIEW_MAX_BYTES) {
      throw careerRunError("variant_save_unavailable");
    }
    return {
      saveId,
      sessionId,
      candidate,
      createdAt,
      directoryPath: prepared.destination.directoryPath,
      markerPath: prepared.destination.markerPath,
      artifactPath,
      sidecarPath,
      artifactBytes,
      sidecarBytes,
      ...(markerBytes === undefined ? {} : { markerBytes }),
      initialDestinationKind: prepared.destination.kind,
      previewText,
    };
  }

  private async revalidatePlan(plan: SavePlan): Promise<void> {
    validateCandidate(plan.candidate);
    const prepared = await this.currentOriginal(plan.candidate);
    if (
      prepared.destination.directoryPath !== plan.directoryPath ||
      prepared.destination.markerPath !== plan.markerPath ||
      prepared.destination.kind !== plan.initialDestinationKind
    ) throw careerRunError("variant_save_destination_invalid");
    await this.requireAbsent(plan.artifactPath);
    await this.requireAbsent(plan.sidecarPath);
  }

  private async requireAbsent(file: string): Promise<void> {
    try {
      await this.fs.lstat(file);
      throw careerRunError("variant_save_collision");
    } catch (error) {
      if (error instanceof CareerRunError) throw error;
      if (!isNodeError(error, "ENOENT")) throw careerRunError("variant_save_destination_invalid");
    }
  }

  private async publishPlan(plan: SavePlan): Promise<void> {
    if (plan.markerBytes !== undefined) await this.initializeDirectory(plan);
    let sidecarTemp: TempFile | undefined;
    let artifactTemp: TempFile | undefined;
    let sidecarLinked = false;
    let artifactLinked = false;
    try {
      sidecarTemp = await this.writeTemp(plan, "sidecar", plan.sidecarBytes);
      artifactTemp = await this.writeTemp(plan, "artifact", plan.artifactBytes);
      await this.publishTemp(sidecarTemp, plan.sidecarPath);
      sidecarLinked = true;
      await this.publishTemp(artifactTemp, plan.artifactPath);
      artifactLinked = true;
      await this.safeUnlink(sidecarTemp.path);
      await this.safeUnlink(artifactTemp.path);
      await this.syncDirectory(plan.directoryPath);
      if (!(await this.verifyPublishedPair(plan, sidecarTemp.metadata, artifactTemp.metadata))) {
        throw careerRunError("variant_save_status_unknown");
      }
    } catch (error) {
      if (sidecarTemp !== undefined) await this.safeUnlink(sidecarTemp.path);
      if (artifactTemp !== undefined) await this.safeUnlink(artifactTemp.path);
      if (sidecarTemp !== undefined && artifactTemp !== undefined &&
        await this.verifyPublishedPair(plan, sidecarTemp.metadata, artifactTemp.metadata)) return;
      if (!artifactLinked && sidecarTemp !== undefined) {
        await this.unlinkIfIdentity(plan.sidecarPath, sidecarTemp.metadata);
      }
      this.throwPublicationFailure(error, sidecarLinked, artifactLinked);
    }
  }

  private throwPublicationFailure(
    error: unknown,
    sidecarLinked: boolean,
    artifactLinked: boolean,
  ): never {
    if (error instanceof CareerRunError) throw error;
    if (isNodeError(error, "EEXIST")) throw careerRunError("variant_save_collision");
    throw careerRunError(sidecarLinked || artifactLinked
      ? "variant_save_status_unknown"
      : "variant_save_destination_invalid");
  }

  private async initializeDirectory(plan: SavePlan): Promise<void> {
    if (plan.markerBytes === undefined) return;
    if (plan.initialDestinationKind === "absent") {
      try {
        await this.fs.mkdir(plan.directoryPath, { mode: 0o700, recursive: false });
      } catch (error) {
        if (isNodeError(error, "EEXIST")) throw careerRunError("variant_save_collision");
        throw careerRunError("variant_save_destination_invalid");
      }
      await this.fs.chmod(plan.directoryPath, 0o700).catch(() => {
        throw careerRunError("variant_save_destination_invalid");
      });
    }
    const directory = await this.fs.lstat(plan.directoryPath).catch(() => {
      throw careerRunError("variant_save_destination_invalid");
    });
    const canonical = await this.fs.realpath(plan.directoryPath).catch(() => {
      throw careerRunError("variant_save_destination_invalid");
    });
    if (
      !directory.isDirectory() || directory.isSymbolicLink() || canonical !== plan.directoryPath ||
      !privateMetadata(directory, 0o700)
    ) throw careerRunError("variant_save_destination_invalid");
    await this.requireAbsent(plan.markerPath);
    const markerTemp = await this.writeTemp(plan, "marker", plan.markerBytes);
    try {
      await this.publishTemp(markerTemp, plan.markerPath);
      await this.safeUnlink(markerTemp.path);
      await this.syncDirectory(plan.directoryPath);
      if (!(await this.verifyExactFile(plan.markerPath, plan.markerBytes, markerTemp.metadata))) {
        throw careerRunError("variant_save_status_unknown");
      }
    } catch (error) {
      await this.safeUnlink(markerTemp.path);
      if (error instanceof CareerRunError) throw error;
      if (isNodeError(error, "EEXIST")) throw careerRunError("variant_save_collision");
      throw careerRunError("variant_save_destination_invalid");
    }
  }

  private async writeTemp(plan: SavePlan, role: string, bytes: Buffer): Promise<TempFile> {
    const temporary = path.join(plan.directoryPath, `.pi-career-${plan.saveId}-${role}.tmp`);
    let handle: FileHandle | undefined;
    try {
      handle = await this.fs.open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.chmod(0o600);
      const metadata = await handle.stat();
      await handle.close();
      handle = undefined;
      if (!metadata.isFile() || metadata.isSymbolicLink() || !privateMetadata(metadata, 0o600) ||
        metadata.size !== bytes.length) {
        throw careerRunError("variant_save_destination_invalid");
      }
      const checked = await this.fs.readFile(temporary);
      if (!checked.equals(bytes)) throw careerRunError("variant_save_destination_invalid");
      return { path: temporary, metadata };
    } catch (error) {
      if (handle !== undefined) await handle.close().catch(() => undefined);
      await this.safeUnlink(temporary);
      if (error instanceof CareerRunError) throw error;
      if (isNodeError(error, "EEXIST")) throw careerRunError("variant_save_collision");
      throw careerRunError("variant_save_destination_invalid");
    }
  }

  private async publishTemp(temporary: TempFile, finalPath: string): Promise<void> {
    await this.fs.link(temporary.path, finalPath);
  }

  private async verifyExactFile(
    file: string,
    expected: Buffer,
    identity?: Stats,
  ): Promise<boolean> {
    try {
      const metadata = await this.fs.lstat(file);
      if (
        !metadata.isFile() || metadata.isSymbolicLink() || !privateMetadata(metadata, 0o600) ||
        metadata.size !== expected.length ||
        (identity !== undefined && (metadata.dev !== identity.dev || metadata.ino !== identity.ino))
      ) return false;
      const bytes = await this.fs.readFile(file);
      return bytes.equals(expected);
    } catch {
      return false;
    }
  }

  private async verifyPublishedPair(
    plan: SavePlan,
    sidecarIdentity?: Stats,
    artifactIdentity?: Stats,
  ): Promise<boolean> {
    if (!(await this.verifyExactFile(plan.sidecarPath, plan.sidecarBytes, sidecarIdentity)) ||
      !(await this.verifyExactFile(plan.artifactPath, plan.artifactBytes, artifactIdentity))) return false;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await this.fs.readFile(plan.sidecarPath));
      const parsed = parseAssistedVariantMetadata(text, plan.artifactBytes);
      return parsed?.baseDocumentId === plan.candidate.source.resumeId;
    } catch {
      return false;
    }
  }

  private async verifyRescan(plan: SavePlan): Promise<void> {
    const config = await loadConfig(this.options.agentDir);
    const scan = await scanLibrary(config);
    const root = scan.roots.find((value) => value.root_id === plan.candidate.source.rootId);
    const configuredRoot = config.library_roots.find((value) => value.id === plan.candidate.source.rootId);
    const relativePath = configuredRoot === undefined
      ? undefined
      : path.relative(configuredRoot.path, plan.artifactPath).split(path.sep).join("/");
    const records = scan.records.filter((record) => record.path === plan.artifactPath);
    const eligible = eligibleOriginals(scan).some((record) => record.path === plan.artifactPath);
    if (
      root === undefined || configuredRoot === undefined || relativePath === undefined ||
      root.stale || root.capped || scan.total_capped || records.length !== 1 ||
      records[0]!.format !== plan.candidate.source.format ||
      records[0]!.text !== plan.candidate.assistedText ||
      records[0]!.kind !== "assisted_variant" ||
      records[0]!.variant_group_id !== plan.candidate.source.resumeId || eligible ||
      scan.warnings.some((warning) =>
        warning.code === "invalid_assisted_sidecar" &&
        warning.root_id === plan.candidate.source.rootId && warning.relative_path === relativePath)
    ) throw careerRunError("variant_save_verification_failed");
  }

  private async unlinkIfIdentity(file: string, identity: Stats): Promise<void> {
    try {
      const metadata = await this.fs.lstat(file);
      if (metadata.dev === identity.dev && metadata.ino === identity.ino) await this.fs.unlink(file);
    } catch {
      // Best-effort cleanup only; errors remain payload-free at the caller boundary.
    }
  }

  private async safeUnlink(file: string): Promise<void> {
    await this.fs.unlink(file).catch(() => undefined);
  }

  private async syncDirectory(directory: string): Promise<void> {
    let handle: FileHandle | undefined;
    try {
      handle = await this.fs.open(directory, constants.O_RDONLY);
      await handle.sync();
      await handle.close();
    } catch {
      if (handle !== undefined) await handle.close().catch(() => undefined);
      throw careerRunError("variant_save_status_unknown");
    }
  }

  private async withMutationQueues<T>(paths: string[], operation: () => Promise<T>): Promise<T> {
    const run = (index: number): Promise<T> => index >= paths.length
      ? operation()
      : withFileMutationQueue(paths[index]!, () => run(index + 1));
    return run(0);
  }

  private async withRootLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.rootLocks.get(root) ?? Promise.resolve();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const current = previous.then(() => gate);
    this.rootLocks.set(root, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.rootLocks.get(root) === current) this.rootLocks.delete(root);
    }
  }
}
