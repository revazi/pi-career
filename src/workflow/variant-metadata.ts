// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from "node:crypto";

import { parseStrictJson } from "./strict-json.ts";

export const ASSISTED_SIDECAR_MAX_BYTES = 16_384;
export const MANAGED_VARIANTS_MARKER_NAME = ".pi-career-variants.json";
const MANAGED_VARIANTS_MARKER_SCHEMA = "pi.career.variants_directory.v1";
const ASSISTED_VARIANT_SCHEMA_V1 = "pi.career.assisted_variant_meta.v1";
const ASSISTED_VARIANT_SCHEMA_V2 = "pi.career.assisted_variant_meta.v2";

const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LEGACY_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

interface ManagedVariantsMarker {
  schema_version: typeof MANAGED_VARIANTS_MARKER_SCHEMA;
  kind: "managed_variants_directory";
  library_root_id: string;
  created_at: string;
}

export interface AssistedVariantMetadataV2 {
  schema_version: typeof ASSISTED_VARIANT_SCHEMA_V2;
  kind: "assisted_variant";
  authority: "assisted_non_authoritative";
  base_document_id: string;
  base_text_sha256: string;
  artifact_sha256: string;
  created_at: string;
}

export interface ParsedAssistedVariantMetadata {
  schemaVersion: typeof ASSISTED_VARIANT_SCHEMA_V1 | typeof ASSISTED_VARIANT_SCHEMA_V2;
  baseDocumentId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function validCanonicalTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    CANONICAL_TIMESTAMP.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function encodeCanonical(value: Record<string, unknown>): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function encodeManagedVariantsMarker(
  libraryRootId: string,
  createdAt: string,
): Buffer {
  if (!validSha256(libraryRootId) || !validCanonicalTimestamp(createdAt)) {
    throw new TypeError("invalid managed variants marker");
  }
  return encodeCanonical({
    schema_version: MANAGED_VARIANTS_MARKER_SCHEMA,
    kind: "managed_variants_directory",
    library_root_id: libraryRootId,
    created_at: createdAt,
  });
}

export function parseManagedVariantsMarker(
  text: string,
  expectedLibraryRootId: string,
): ManagedVariantsMarker | undefined {
  try {
    const value = parseStrictJson(text);
    if (!isRecord(value) || !exactKeys(value, [
      "schema_version", "kind", "library_root_id", "created_at",
    ])) return undefined;
    if (
      value.schema_version !== MANAGED_VARIANTS_MARKER_SCHEMA ||
      value.kind !== "managed_variants_directory" ||
      value.library_root_id !== expectedLibraryRootId ||
      !validSha256(value.library_root_id) ||
      !validCanonicalTimestamp(value.created_at)
    ) return undefined;
    return value as unknown as ManagedVariantsMarker;
  } catch {
    return undefined;
  }
}

export function encodeAssistedVariantMetadataV2(
  metadata: Omit<AssistedVariantMetadataV2, "schema_version" | "kind" | "authority">,
): Buffer {
  if (
    !validSha256(metadata.base_document_id) ||
    !validSha256(metadata.base_text_sha256) ||
    !validSha256(metadata.artifact_sha256) ||
    !validCanonicalTimestamp(metadata.created_at)
  ) throw new TypeError("invalid assisted variant metadata");
  return encodeCanonical({
    schema_version: ASSISTED_VARIANT_SCHEMA_V2,
    kind: "assisted_variant",
    authority: "assisted_non_authoritative",
    base_document_id: metadata.base_document_id,
    base_text_sha256: metadata.base_text_sha256,
    artifact_sha256: metadata.artifact_sha256,
    created_at: metadata.created_at,
  });
}

function parseLegacyMetadata(
  value: Record<string, unknown>,
): ParsedAssistedVariantMetadata | undefined {
  if (!exactKeys(value, ["schema_version", "kind", "base_document_id", "created_at"])) {
    return undefined;
  }
  if (
    value.kind !== "assisted_variant" ||
    !validSha256(value.base_document_id) ||
    typeof value.created_at !== "string" ||
    !LEGACY_TIMESTAMP.test(value.created_at) ||
    !Number.isFinite(Date.parse(value.created_at))
  ) return undefined;
  return { schemaVersion: ASSISTED_VARIANT_SCHEMA_V1, baseDocumentId: value.base_document_id };
}

function parseHashBoundMetadata(
  value: Record<string, unknown>,
  artifactBytes: Uint8Array,
): ParsedAssistedVariantMetadata | undefined {
  if (!exactKeys(value, [
    "schema_version", "kind", "authority", "base_document_id", "base_text_sha256",
    "artifact_sha256", "created_at",
  ])) return undefined;
  if (
    value.kind !== "assisted_variant" ||
    value.authority !== "assisted_non_authoritative" ||
    !validSha256(value.base_document_id) ||
    !validSha256(value.base_text_sha256) ||
    !validSha256(value.artifact_sha256) ||
    value.artifact_sha256 !== sha256Bytes(artifactBytes) ||
    !validCanonicalTimestamp(value.created_at)
  ) return undefined;
  return { schemaVersion: ASSISTED_VARIANT_SCHEMA_V2, baseDocumentId: value.base_document_id };
}

export function parseAssistedVariantMetadata(
  text: string,
  artifactBytes: Uint8Array,
): ParsedAssistedVariantMetadata | undefined {
  try {
    const value = parseStrictJson(text);
    if (!isRecord(value)) return undefined;
    if (value.schema_version === ASSISTED_VARIANT_SCHEMA_V1) return parseLegacyMetadata(value);
    if (value.schema_version === ASSISTED_VARIANT_SCHEMA_V2) {
      return parseHashBoundMetadata(value, artifactBytes);
    }
    return undefined;
  } catch {
    return undefined;
  }
}
