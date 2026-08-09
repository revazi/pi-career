// SPDX-License-Identifier: MIT OR Apache-2.0

import type { CoreResult } from "../workflow/result-projection.ts";

const MAX_ENTRY_COUNT = 16;
const MAX_TOTAL_BYTES = 67_108_864;
const HANDLE_SUFFIX_PATTERN = /^[a-f0-9-]{8,64}$/;

export type ManagedEntryKind = "result" | "review" | "variant";

export interface ManagedEntry {
  handle: string;
  kind: ManagedEntryKind;
  operation: string;
  json: string;
  value: CoreResult;
  createdAt: number;
  reviewInput?: Record<string, unknown>;
  retainedChangeIds?: string[];
}

interface StoredEntry extends ManagedEntry {
  bytes: number;
}

function handlePrefix(kind: ManagedEntryKind): string {
  return kind === "review" ? "review" : kind === "variant" ? "variant" : "result";
}

function entryBytes(entry: Omit<ManagedEntry, "handle" | "createdAt">): number {
  return Buffer.byteLength(entry.json, "utf8") +
    (entry.reviewInput === undefined ? 0 : Buffer.byteLength(JSON.stringify(entry.reviewInput), "utf8"));
}

export class ManagedRegistry {
  private sessionId: string | undefined;
  private contextReady = false;
  private entries = new Map<string, StoredEntry>();
  private totalBytes = 0;

  constructor(private readonly uuid: () => string, private readonly now: () => Date) {}

  enterSession(sessionId: string): void {
    if (this.sessionId === sessionId) return;
    this.clear();
    this.sessionId = sessionId;
  }

  resetSession(sessionId: string): void {
    this.clear();
    this.sessionId = sessionId;
  }

  markContextReady(sessionId: string): void {
    this.enterSession(sessionId);
    this.contextReady = true;
  }

  hasContext(sessionId: string): boolean {
    return this.sessionId === sessionId && this.contextReady;
  }

  store(entry: Omit<ManagedEntry, "handle" | "createdAt">): ManagedEntry {
    const bytes = entryBytes(entry);
    if (bytes > MAX_TOTAL_BYTES) throw new Error("managed_result_capacity");
    while (this.entries.size >= MAX_ENTRY_COUNT || this.totalBytes + bytes > MAX_TOTAL_BYTES) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    let handle: string | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const suffix = this.uuid().toLowerCase().replace(/[^a-f0-9-]/g, "").slice(0, 24);
      if (!HANDLE_SUFFIX_PATTERN.test(suffix)) throw new Error("managed_result_capacity");
      const candidate = `${handlePrefix(entry.kind)}:${suffix}`;
      if (!this.entries.has(candidate)) {
        handle = candidate;
        break;
      }
    }
    if (handle === undefined) throw new Error("managed_result_capacity");
    const stored: StoredEntry = {
      ...entry,
      handle,
      createdAt: this.now().getTime(),
      bytes,
    };
    this.entries.set(handle, stored);
    this.totalBytes += bytes;
    return stored;
  }

  get(handle: string, kind?: ManagedEntryKind): ManagedEntry | undefined {
    const entry = this.entries.get(handle);
    if (entry === undefined || (kind !== undefined && entry.kind !== kind)) return undefined;
    return entry;
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
    this.contextReady = false;
    this.sessionId = undefined;
  }

  private delete(handle: string): void {
    const entry = this.entries.get(handle);
    if (entry === undefined) return;
    this.totalBytes -= entry.bytes;
    this.entries.delete(handle);
  }
}
