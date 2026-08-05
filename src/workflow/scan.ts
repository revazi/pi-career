// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from "node:crypto";
import { lstat, opendir, readFile, realpath } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

import { isWithinCoreCharacterLimit } from "./text-limit.ts";
import type {
  CareerConfig,
  LibraryRoot,
  LibraryScan,
  ResumeFormat,
  ResumeRecord,
  RootScanSummary,
  ScanWarning,
} from "./types.ts";

export { CORE_MAX_CHARACTERS } from "./text-limit.ts";

const SCAN_MAX_DEPTH = 8;
export const SCAN_MAX_FILES_PER_ROOT = 500;
const SCAN_MAX_FILES_TOTAL = 2_000;
export const SCAN_MAX_RAW_BYTES = 256 * 1_024;
const SIDECAR_MAX_BYTES = 16_384;
const MAX_DIRECTORY_ENTRIES_PER_ROOT = 10_000;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeDocumentText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function supportedFormat(file: string): ResumeFormat | undefined {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".md") return "markdown";
  if (extension === ".txt") return "text";
  return undefined;
}

function safeLabel(value: string, fallback: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 120);
}

function resumeLabel(file: string, format: ResumeFormat, text: string): string {
  const fallback = path.basename(file, path.extname(file));
  if (format === "markdown") {
    let nonEmpty = 0;
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      nonEmpty += 1;
      const match = line.match(/^#\s+(.+?)\s*#*\s*$/);
      if (match?.[1]) return safeLabel(match[1], fallback);
      if (nonEmpty >= 32) break;
    }
  }
  return safeLabel(fallback, "Resume");
}

interface SidecarResult {
  kind: "original" | "assisted_variant";
  variantGroupId?: string;
  invalid: boolean;
}

function sidecarPath(file: string): string {
  return path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.pi-career.json`);
}

function validSidecar(value: unknown): value is Record<string, unknown> & { base_document_id: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = "base_document_id,created_at,kind,schema_version";
  if (Object.keys(record).sort().join(",") !== keys) return false;
  if (record.schema_version !== "pi.career.assisted_variant_meta.v1" || record.kind !== "assisted_variant") {
    return false;
  }
  if (typeof record.base_document_id !== "string" || !SHA256.test(record.base_document_id)) return false;
  return typeof record.created_at === "string" &&
    ISO_UTC.test(record.created_at) &&
    Number.isFinite(Date.parse(record.created_at));
}

async function readSidecar(file: string): Promise<SidecarResult> {
  const sidecar = sidecarPath(file);
  try {
    const metadata = await lstat(sidecar);
    const invalidMetadata = !metadata.isFile() || metadata.isSymbolicLink() ||
      metadata.size <= 0 || metadata.size > SIDECAR_MAX_BYTES;
    if (invalidMetadata) return { kind: "original", invalid: true };
    const bytes = await readFile(sidecar);
    if (bytes.length !== metadata.size) return { kind: "original", invalid: true };
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (!validSidecar(parsed)) return { kind: "original", invalid: true };
    return { kind: "assisted_variant", variantGroupId: parsed.base_document_id, invalid: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { kind: "original", invalid: false };
    return { kind: "original", invalid: true };
  }
}

interface Candidate {
  absolute: string;
  relative: string;
  format: ResumeFormat;
}

interface PendingEntry {
  absolute: string;
  relative: string;
  depth: number;
  kind: "directory" | "file";
}

async function scanRootIsCurrent(root: LibraryRoot): Promise<boolean> {
  try {
    const metadata = await lstat(root.path);
    const canonical = await realpath(root.path);
    return metadata.isDirectory() && !metadata.isSymbolicLink() && canonical === root.path;
  } catch {
    return false;
  }
}

async function directoryChildren(
  current: PendingEntry,
  rootId: string,
  warnings: ScanWarning[],
  maximumEntries: number,
): Promise<{ children: PendingEntry[]; entryCount: number; overflow: boolean }> {
  const entries: Dirent[] = [];
  try {
    const directory = await opendir(current.absolute);
    for await (const entry of directory) {
      entries.push(entry);
      if (entries.length > maximumEntries) {
        return { children: [], entryCount: entries.length, overflow: true };
      }
    }
  } catch {
    warnings.push({ code: "scan_entry_unavailable", root_id: rootId });
    return { children: [], entryCount: 0, overflow: false };
  }
  entries.sort((left, right) => compareText(left.name, right.name));
  const children: PendingEntry[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relative = current.relative ? path.posix.join(current.relative, entry.name) : entry.name;
    const absolute = path.join(current.absolute, entry.name);
    const depth = current.depth + 1;
    if (entry.isDirectory() && depth <= SCAN_MAX_DEPTH) {
      children.push({ absolute, relative, depth, kind: "directory" });
    } else if (entry.isFile() && supportedFormat(entry.name) !== undefined) {
      children.push({ absolute, relative, depth: current.depth, kind: "file" });
    }
  }
  return { children, entryCount: entries.length, overflow: false };
}

function candidateFromPending(current: PendingEntry): Candidate | undefined {
  const format = supportedFormat(current.absolute);
  return format === undefined
    ? undefined
    : { absolute: current.absolute, relative: current.relative, format };
}

async function collectCandidates(
  root: LibraryRoot,
  maximum: number,
  warnings: ScanWarning[],
): Promise<{ candidates: Candidate[]; capped: boolean; stale: boolean }> {
  if (!(await scanRootIsCurrent(root))) {
    warnings.push({ code: "root_stale", root_id: root.id });
    return { candidates: [], capped: false, stale: true };
  }

  const pending: PendingEntry[] = [{ absolute: root.path, relative: "", depth: 0, kind: "directory" }];
  const candidates: Candidate[] = [];
  let visitedEntries = 0;
  let capped = false;

  while (pending.length > 0 && candidates.length < maximum) {
    pending.sort((left, right) => compareText(left.relative, right.relative));
    const current = pending.shift();
    if (current === undefined) break;
    if (current.kind === "file") {
      const candidate = candidateFromPending(current);
      if (candidate !== undefined) candidates.push(candidate);
      capped = candidates.length >= maximum;
      continue;
    }

    const remainingEntryBudget = MAX_DIRECTORY_ENTRIES_PER_ROOT - visitedEntries;
    const { children, entryCount, overflow } = await directoryChildren(
      current,
      root.id,
      warnings,
      remainingEntryBudget,
    );
    if (overflow) {
      capped = true;
      break;
    }
    visitedEntries += entryCount;
    pending.push(...children);
  }

  candidates.sort((left, right) => {
    const relative = compareText(left.relative, right.relative);
    if (relative !== 0) return relative;
    return compareText(path.basename(left.relative), path.basename(right.relative));
  });
  return { candidates, capped, stale: false };
}

async function scanCandidate(
  root: LibraryRoot,
  candidate: Candidate,
  warnings: ScanWarning[],
): Promise<ResumeRecord | undefined> {
  let metadata;
  let canonical;
  try {
    metadata = await lstat(candidate.absolute);
    canonical = await realpath(candidate.absolute);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      canonical !== candidate.absolute ||
      !canonical.startsWith(`${root.path}${path.sep}`)
    ) return undefined;
  } catch {
    warnings.push({ code: "scan_entry_unavailable", root_id: root.id, relative_path: candidate.relative });
    return undefined;
  }

  if (metadata.size > SCAN_MAX_RAW_BYTES) {
    warnings.push({ code: "raw_file_too_large", root_id: root.id, relative_path: candidate.relative });
    return undefined;
  }

  let decoded: string;
  try {
    const bytes = await readFile(canonical);
    if (bytes.length > SCAN_MAX_RAW_BYTES || bytes.length !== metadata.size) {
      warnings.push({ code: "raw_file_too_large", root_id: root.id, relative_path: candidate.relative });
      return undefined;
    }
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    warnings.push({ code: "invalid_utf8", root_id: root.id, relative_path: candidate.relative });
    return undefined;
  }

  const text = normalizeDocumentText(decoded);
  const id = sha256(canonical);
  const sidecar = await readSidecar(canonical);
  if (sidecar.invalid) {
    warnings.push({ code: "invalid_assisted_sidecar", root_id: root.id, relative_path: candidate.relative });
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
    ...(sidecar.variantGroupId === undefined ? {} : { variant_group_id: sidecar.variantGroupId }),
    ...(!isWithinCoreCharacterLimit(text) ? { too_large_for_core_input: true as const } : {}),
    text,
    text_sha256: sha256(text),
  };
}

export async function scanLibrary(config: CareerConfig): Promise<LibraryScan> {
  const warnings: ScanWarning[] = [];
  const records: ResumeRecord[] = [];
  const roots: RootScanSummary[] = [];
  let totalCapped = false;
  let scannedCandidateCount = 0;

  for (const root of config.library_roots) {
    const remaining = SCAN_MAX_FILES_TOTAL - scannedCandidateCount;
    if (remaining <= 0) {
      warnings.push({ code: "total_file_cap_reached", root_id: root.id });
      totalCapped = true;
      roots.push({
        root_id: root.id,
        original_count: 0,
        assisted_variant_count: 0,
        too_large_count: 0,
        stale: false,
        capped: true,
      });
      continue;
    }
    const maximum = Math.min(SCAN_MAX_FILES_PER_ROOT, remaining);
    const collected = await collectCandidates(root, maximum, warnings);
    scannedCandidateCount += collected.candidates.length;
    const rootRecords: ResumeRecord[] = [];
    for (const candidate of collected.candidates) {
      const record = await scanCandidate(root, candidate, warnings);
      if (record !== undefined) rootRecords.push(record);
    }
    records.push(...rootRecords);
    if (collected.capped) {
      warnings.push({ code: "root_file_cap_reached", root_id: root.id });
      if (maximum < SCAN_MAX_FILES_PER_ROOT) totalCapped = true;
    }
    roots.push({
      root_id: root.id,
      original_count: rootRecords.filter((record) => record.kind === "original").length,
      assisted_variant_count: rootRecords.filter((record) => record.kind === "assisted_variant").length,
      too_large_count: rootRecords.filter((record) => record.too_large_for_core_input === true).length,
      stale: collected.stale,
      capped: collected.capped,
    });
  }

  return { records, warnings, roots, total_capped: totalCapped };
}

export function eligibleOriginals(scan: LibraryScan): ResumeRecord[] {
  return scan.records.filter(
    (record) => record.kind === "original" && record.too_large_for_core_input !== true,
  );
}
