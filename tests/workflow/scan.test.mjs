// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { addLibraryRoot, emptyConfig } from "../../src/workflow/config.ts";
import {
  CORE_MAX_CHARACTERS,
  eligibleOriginals,
  scanLibrary,
  SCAN_MAX_FILES_PER_ROOT,
  SCAN_MAX_RAW_BYTES,
} from "../../src/workflow/scan.ts";

test("scan is ordered, UTF-8 strict, symlink-free, sidecar-aware, and Core-bounded", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-"));
  try {
    const root = path.join(temp, "library");
    await mkdir(path.join(root, "nested"), { recursive: true });
    const depthEight = path.join(root, ...Array.from({ length: 8 }, (_, index) => `d${index}`));
    const depthNine = path.join(depthEight, "d8");
    await mkdir(depthNine, { recursive: true });
    await writeFile(path.join(depthEight, "included.txt"), "Depth eight synthetic\n");
    await writeFile(path.join(depthNine, "excluded.txt"), "Depth nine synthetic\n");
    await writeFile(path.join(root, "b.txt"), "Taylor synthetic\n");
    await writeFile(path.join(root, "a.md"), "\n# Synthetic Alpha\n\nExperience\n");
    await writeFile(path.join(root, "large.md"), `# Large\n${"x".repeat(CORE_MAX_CHARACTERS)}`);
    await writeFile(path.join(root, "raw.txt"), Buffer.alloc(SCAN_MAX_RAW_BYTES + 1, 0x61));
    await writeFile(path.join(root, "invalid.txt"), Buffer.from([0xc3, 0x28]));
    await writeFile(path.join(root, "nested", "variant.md"), "# Assisted Synthetic\n");
    await writeFile(path.join(root, "nested", "variant.pi-career.json"), JSON.stringify({
      schema_version: "pi.career.assisted_variant_meta.v1",
      kind: "assisted_variant",
      base_document_id: "0".repeat(64),
      created_at: "2026-08-04T17:56:06Z",
    }));
    await writeFile(path.join(root, "bad.txt"), "Synthetic invalid sidecar\n");
    await writeFile(path.join(root, "bad.pi-career.json"), "{}\n");
    await symlink(path.join(root, "a.md"), path.join(root, "linked.md"));
    await symlink(path.join(root, "nested"), path.join(root, "linked-dir"));

    const config = await addLibraryRoot(emptyConfig(), root, "Synthetic");
    const scan = await scanLibrary(config);
    assert.deepEqual(scan.records.map((record) => record.relative_path), [
      "a.md", "b.txt", "bad.txt", "d0/d1/d2/d3/d4/d5/d6/d7/included.txt", "large.md", "nested/variant.md",
    ]);
    assert.equal(scan.records[0].label, "Synthetic Alpha");
    assert.equal(scan.records.find((record) => record.relative_path === "large.md").too_large_for_core_input, true);
    assert.equal(scan.records.find((record) => record.relative_path === "nested/variant.md").kind, "assisted_variant");
    assert.ok(scan.warnings.some((warning) => warning.code === "invalid_utf8"));
    assert.ok(scan.warnings.some((warning) => warning.code === "raw_file_too_large"));
    assert.ok(scan.warnings.some((warning) => warning.code === "invalid_assisted_sidecar"));
    assert.deepEqual(eligibleOriginals(scan).map((record) => record.relative_path), [
      "a.md", "b.txt", "bad.txt", "d0/d1/d2/d3/d4/d5/d6/d7/included.txt",
    ]);
    assert.ok(scan.records.every((record) => record.id.length === 64 && record.text_sha256.length === 64));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Core eligibility counts Unicode code points at the exact boundary without trimming", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-unicode-limit-"));
  try {
    const root = path.join(temp, "library");
    await mkdir(root);
    const accepted = ` ${"😀".repeat(CORE_MAX_CHARACTERS - 2)} `;
    const rejected = `${accepted}😀`;
    await writeFile(path.join(root, "accepted.txt"), accepted);
    await writeFile(path.join(root, "rejected.txt"), rejected);

    const scan = await scanLibrary(await addLibraryRoot(emptyConfig(), root));
    const byPath = new Map(scan.records.map((record) => [record.relative_path, record]));
    assert.equal(byPath.get("accepted.txt").text, accepted);
    assert.equal(byPath.get("accepted.txt").too_large_for_core_input, undefined);
    assert.equal(byPath.get("rejected.txt").text, rejected);
    assert.equal(byPath.get("rejected.txt").too_large_for_core_input, true);
    assert.deepEqual(eligibleOriginals(scan).map((record) => record.relative_path), ["accepted.txt"]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("scan enforces the deterministic per-root cap", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-cap-"));
  try {
    const root = path.join(temp, "library");
    await mkdir(root);
    await Promise.all(Array.from({ length: SCAN_MAX_FILES_PER_ROOT + 2 }, (_, index) =>
      writeFile(path.join(root, `${String(index).padStart(4, "0")}.txt`), `Synthetic ${index}\n`)));
    const scan = await scanLibrary(await addLibraryRoot(emptyConfig(), root));
    assert.equal(scan.records.length, SCAN_MAX_FILES_PER_ROOT);
    assert.equal(scan.roots[0].capped, true);
    assert.ok(scan.warnings.some((warning) => warning.code === "root_file_cap_reached"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("scan enforces the 2,000-file total cap across roots", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-total-cap-"));
  try {
    let config = emptyConfig();
    for (let rootIndex = 0; rootIndex < 5; rootIndex += 1) {
      const root = path.join(temp, `library-${rootIndex}`);
      await mkdir(root);
      await Promise.all(Array.from({ length: 401 }, (_, fileIndex) =>
        writeFile(path.join(root, `${String(fileIndex).padStart(4, "0")}.txt`), "Synthetic\n")));
      config = await addLibraryRoot(config, root);
    }
    const scan = await scanLibrary(config);
    assert.equal(scan.records.length, 2_000);
    assert.equal(scan.total_capped, true);
    assert.ok(scan.warnings.some((warning) => warning.code === "root_file_cap_reached"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
