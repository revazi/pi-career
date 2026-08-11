// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { parseStrictJson } from "../../src/workflow/strict-json.ts";
import {
  encodeAssistedVariantMetadataV2,
  encodeManagedVariantsMarker,
  parseAssistedVariantMetadata,
  parseManagedVariantsMarker,
  sha256Bytes,
} from "../../src/workflow/variant-metadata.ts";

test("strict JSON rejects duplicate decoded keys and trailing content", () => {
  assert.throws(() => parseStrictJson('{"kind":"one","\\u006bind":"two"}'));
  assert.throws(() => parseStrictJson('{"kind":"one"} trailing'));
  assert.deepEqual(parseStrictJson('{"kind":"one","nested":{"ok":true}}'), {
    kind: "one", nested: { ok: true },
  });
});

test("managed markers and assisted v2 sidecars are canonical and hash-bound", () => {
  const rootId = "0".repeat(64);
  const baseTextHash = "1".repeat(64);
  const createdAt = "2026-08-11T03:04:05.123Z";
  const artifact = Buffer.from("# Synthetic assisted\n", "utf8");
  const marker = encodeManagedVariantsMarker(rootId, createdAt);
  assert.deepEqual(parseManagedVariantsMarker(marker.toString("utf8"), rootId), {
    schema_version: "pi.career.variants_directory.v1",
    kind: "managed_variants_directory",
    library_root_id: rootId,
    created_at: createdAt,
  });
  assert.equal(parseManagedVariantsMarker(marker.toString("utf8"), "2".repeat(64)), undefined);

  const sidecar = encodeAssistedVariantMetadataV2({
    base_document_id: rootId,
    base_text_sha256: baseTextHash,
    artifact_sha256: sha256Bytes(artifact),
    created_at: createdAt,
  });
  assert.deepEqual(parseAssistedVariantMetadata(sidecar.toString("utf8"), artifact), {
    schemaVersion: "pi.career.assisted_variant_meta.v2",
    baseDocumentId: rootId,
  });
  assert.equal(
    parseAssistedVariantMetadata(sidecar.toString("utf8"), Buffer.from("# Edited\n")),
    undefined,
  );
  assert.equal(sidecar.at(-1), 0x0a);
});

test("legacy sidecars retain the reviewed UTC timestamp boundary", () => {
  const base = `"kind":"assisted_variant","base_document_id":"${"0".repeat(64)}"`;
  const valid = `{"schema_version":"pi.career.assisted_variant_meta.v1",${base},"created_at":"2026-08-04T17:56:06Z"}`;
  const dateOnly = `{"schema_version":"pi.career.assisted_variant_meta.v1",${base},"created_at":"2026-08-04"}`;
  assert.equal(parseAssistedVariantMetadata(valid, Buffer.alloc(0))?.baseDocumentId, "0".repeat(64));
  assert.equal(parseAssistedVariantMetadata(dateOnly, Buffer.alloc(0)), undefined);
});
