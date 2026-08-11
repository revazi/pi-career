// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { addLibraryRoot, emptyConfig } from "../../src/workflow/config.ts";
import { extractPdfText, PDF_MAX_RAW_BYTES } from "../../src/workflow/pdf.ts";
import { libraryIndexPreview, libraryWarningPreview } from "../../src/workflow/renderers.ts";
import {
  CORE_MAX_CHARACTERS,
  eligibleOriginals,
  scanLibrary,
  SCAN_MAX_FILES_PER_ROOT,
  SCAN_MAX_RAW_BYTES,
} from "../../src/workflow/scan.ts";
import {
  encodeAssistedVariantMetadataV2,
  encodeManagedVariantsMarker,
  sha256Bytes,
} from "../../src/workflow/variant-metadata.ts";
import { syntheticTextPdf } from "./helpers.mjs";

const CHROMIUM_PDF_FIXTURES = [
  {
    name: "chromium-tagged.pdf",
    sha256: "d2b37b5dcdcceeb7133ee7f4bee7a72654cea93fb3c1fe3c526dcc7e11e62ddb",
    tagged: true,
  },
  {
    name: "chromium-untagged.pdf",
    sha256: "4dcdfbc200428d7b324e9d87dcaf1a3183e89d31298f1778b1645483565d5021",
    tagged: false,
  },
];

const REPORTLAB_PDF_FIXTURE = {
  name: "reportlab-embedded-font.pdf",
  sha256: "92a51829077a0b33628ca0a3ae0fcb49c125a4c39e42b271eacd31fb5d578d5d",
  text: [
    "Synthetic ReportLab Resume",
    "synthetic@example.invalid | Example City",
    "EXPERIENCE",
    "Built deterministic TypeScript test systems.",
    "Designed bounded synthetic compatibility fixtures.",
    "SKILLS",
    "TypeScript",
    "Testing",
    "PDF compatibility",
    "Accessibility",
    "Synthetic ReportLab Resume - page 2",
    "SELECTED WORK",
    "Reviewed exact evidence before explicit selection.",
    "Kept private document handling local and bounded.",
    "EDUCATION",
    "Example Institute - Synthetic Systems",
  ].join("\n"),
};

test("scan extracts bounded searchable PDFs and reports unusable PDFs", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-pdf-"));
  try {
    const root = path.join(temp, "library");
    await mkdir(root);
    await writeFile(path.join(root, "synthetic-resume.pdf"), syntheticTextPdf([
      "Synthetic Resume",
      "Experience with TypeScript and testing.",
    ]));
    await writeFile(path.join(root, "unusable.pdf"), "%PDF-1.4\nnot a complete PDF\n");

    const scan = await scanLibrary(await addLibraryRoot(emptyConfig(), root, "Synthetic"));
    assert.equal(scan.records.length, 1);
    assert.equal(scan.records[0].relative_path, "synthetic-resume.pdf");
    assert.equal(scan.records[0].format, "pdf");
    assert.match(libraryIndexPreview(await addLibraryRoot(emptyConfig(), root, "Synthetic"), scan), /synthetic-resume — PDF/);
    assert.match(libraryWarningPreview(await addLibraryRoot(emptyConfig(), root, "Synthetic"), scan), /searchable, unencrypted PDF/);
    assert.match(scan.records[0].text, /Synthetic Resume/);
    assert.match(scan.records[0].text, /TypeScript and testing/);
    assert.deepEqual(eligibleOriginals(scan).map((record) => record.relative_path), ["synthetic-resume.pdf"]);
    assert.ok(scan.warnings.some((warning) =>
      warning.code === "pdf_text_unavailable" && warning.relative_path === "unusable.pdf"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("scan extracts reviewed Chromium tagged/untagged embedded-font multi-column fixtures", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-browser-pdf-"));
  try {
    const root = path.join(temp, "library");
    await mkdir(root);
    for (const fixture of CHROMIUM_PDF_FIXTURES) {
      const bytes = await readFile(new URL(`./fixtures/pdf/${fixture.name}`, import.meta.url));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.sha256);
      const structure = bytes.toString("latin1");
      assert.match(structure, /\/Producer \(Skia\/PDF m150\)/);
      assert.match(structure, /\/FontFile2 /);
      assert.match(structure, /\/BaseFont \/AAAAAA\+Lato-Regular/);
      assert.equal(structure.includes("/StructTreeRoot"), fixture.tagged);
      assert.equal(structure.includes("/Marked true"), fixture.tagged);
      await writeFile(path.join(root, fixture.name), bytes);
    }

    const scan = await scanLibrary(await addLibraryRoot(emptyConfig(), root, "Browser PDF"));
    assert.deepEqual(scan.records.map((record) => record.relative_path), CHROMIUM_PDF_FIXTURES.map(({ name }) => name));
    assert.deepEqual(scan.warnings, []);
    for (const record of scan.records) {
      assert.equal(record.format, "pdf");
      assert.match(record.text, /Synthetic Browser Resume/);
      assert.match(record.text, /Built deterministic TypeScript test systems/);
      assert.match(record.text, /Designed synthetic compatibility fixtures/);
      assert.match(record.text, /Accessibility/);
      assert.match(record.text, /Example Institute/);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("scan extracts the reviewed ReportLab two-page embedded-font fixture", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-reportlab-pdf-"));
  try {
    const root = path.join(temp, "library");
    await mkdir(root);
    const bytes = await readFile(new URL(`./fixtures/pdf/${REPORTLAB_PDF_FIXTURE.name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), REPORTLAB_PDF_FIXTURE.sha256);
    const structure = bytes.toString("latin1");
    assert.ok(structure.includes("/Producer (ReportLab PDF Library - \\(opensource\\))"));
    assert.ok(structure.includes("/Creator (pi-career synthetic fixture)"));
    assert.match(structure, /\/Count 2 /);
    assert.match(structure, /\/FontFile2 /);
    assert.match(structure, /\/BaseFont \/AAAAAA\+Lato-Regular/);
    assert.doesNotMatch(structure, /\/StructTreeRoot|\/BaseFont \/Helvetica/);
    await writeFile(path.join(root, REPORTLAB_PDF_FIXTURE.name), bytes);

    const scan = await scanLibrary(await addLibraryRoot(emptyConfig(), root, "ReportLab PDF"));
    assert.deepEqual(scan.warnings, []);
    assert.equal(scan.records.length, 1);
    assert.equal(scan.records[0].relative_path, REPORTLAB_PDF_FIXTURE.name);
    assert.equal(scan.records[0].format, "pdf");
    assert.equal(scan.records[0].text, REPORTLAB_PDF_FIXTURE.text);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("PDF extraction rejects image-only, malformed, and oversized inputs without OCR", async () => {
  const imageOnly = await readFile(new URL("./fixtures/pdf/image-only.pdf", import.meta.url));
  assert.equal(createHash("sha256").update(imageOnly).digest("hex"),
    "10b506dc3659b9588496395d5c466c9b780fd11920165321fbb198d55cefc13a");
  assert.deepEqual(await extractPdfText(imageOnly), { ok: false });
  assert.deepEqual(await extractPdfText(Buffer.from("%PDF-1.4\nnot a complete PDF\n")), { ok: false });
  assert.deepEqual(await extractPdfText(Buffer.alloc(PDF_MAX_RAW_BYTES + 1)), { ok: false });
});

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
    const variants = path.join(config.library_roots[0].path, "variants");
    await mkdir(variants, { mode: 0o700 });
    await chmod(variants, 0o700);
    await writeFile(
      path.join(variants, ".pi-career-variants.json"),
      encodeManagedVariantsMarker(config.library_roots[0].id, "2026-08-04T17:56:06.000Z"),
      { mode: 0o600 },
    );
    const assisted = Buffer.from("# Valid assisted synthetic\n", "utf8");
    await writeFile(path.join(variants, "valid.md"), assisted, { mode: 0o600 });
    await writeFile(path.join(variants, "valid.pi-career.json"), encodeAssistedVariantMetadataV2({
      base_document_id: "0".repeat(64),
      base_text_sha256: "1".repeat(64),
      artifact_sha256: sha256Bytes(assisted),
      created_at: "2026-08-04T17:56:06.000Z",
    }), { mode: 0o600 });
    await writeFile(path.join(variants, "missing.md"), "# Missing sidecar\n", { mode: 0o600 });
    const edited = Buffer.from("# Edited after save\n", "utf8");
    await writeFile(path.join(variants, "edited.md"), edited, { mode: 0o600 });
    await writeFile(path.join(variants, "edited.pi-career.json"), encodeAssistedVariantMetadataV2({
      base_document_id: "0".repeat(64),
      base_text_sha256: "1".repeat(64),
      artifact_sha256: sha256Bytes(Buffer.from("# Before edit\n")),
      created_at: "2026-08-04T17:56:06.000Z",
    }), { mode: 0o600 });
    await writeFile(path.join(variants, "duplicate.md"), "# Duplicate sidecar key\n", { mode: 0o600 });
    await writeFile(path.join(variants, "duplicate.pi-career.json"), [
      "{\"schema_version\":\"pi.career.assisted_variant_meta.v2\",",
      "\"kind\":\"assisted_variant\",\"kind\":\"assisted_variant\",",
      `\"authority\":\"assisted_non_authoritative\",\"base_document_id\":\"${"0".repeat(64)}\",`,
      `\"base_text_sha256\":\"${"1".repeat(64)}\",\"artifact_sha256\":\"${"2".repeat(64)}\",`,
      "\"created_at\":\"2026-08-04T17:56:06.000Z\"}\n",
    ].join(""), { mode: 0o600 });

    const scan = await scanLibrary(config);
    assert.deepEqual(scan.records.map((record) => record.relative_path), [
      "a.md", "b.txt", "d0/d1/d2/d3/d4/d5/d6/d7/included.txt", "large.md", "nested/variant.md",
      "variants/valid.md",
    ]);
    assert.equal(scan.records[0].label, "Synthetic Alpha");
    assert.equal(scan.records.find((record) => record.relative_path === "large.md").too_large_for_core_input, true);
    assert.equal(scan.records.find((record) => record.relative_path === "nested/variant.md").kind, "assisted_variant");
    assert.equal(scan.records.find((record) => record.relative_path === "variants/valid.md").kind, "assisted_variant");
    assert.equal(scan.records.some((record) => record.relative_path === "bad.txt"), false);
    assert.equal(scan.records.some((record) => record.relative_path === "variants/missing.md"), false);
    assert.equal(scan.records.some((record) => record.relative_path === "variants/edited.md"), false);
    assert.equal(scan.records.some((record) => record.relative_path === "variants/duplicate.md"), false);
    assert.ok(scan.warnings.some((warning) => warning.code === "invalid_utf8"));
    assert.ok(scan.warnings.some((warning) => warning.code === "raw_file_too_large"));
    assert.ok(scan.warnings.some((warning) => warning.code === "invalid_assisted_sidecar"));
    assert.deepEqual(eligibleOriginals(scan).map((record) => record.relative_path), [
      "a.md", "b.txt", "d0/d1/d2/d3/d4/d5/d6/d7/included.txt",
    ]);
    assert.ok(scan.records.every((record) => record.id.length === 64 && record.text_sha256.length === 64));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("managed variants remain quarantined through trailing separators and nested configured roots", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-scan-managed-alias-"));
  try {
    const parent = path.join(temp, "library");
    const variants = path.join(parent, "variants");
    await mkdir(variants, { recursive: true, mode: 0o700 });
    await chmod(variants, 0o700);
    let config = await addLibraryRoot(emptyConfig(), parent, "Parent");
    const parentRoot = config.library_roots[0];
    await writeFile(
      path.join(variants, ".pi-career-variants.json"),
      encodeManagedVariantsMarker(parentRoot.id, "2026-08-04T17:56:06.000Z"),
      { mode: 0o600 },
    );
    await writeFile(path.join(variants, "missing.md"), "# Must stay quarantined\n", { mode: 0o600 });
    config = await addLibraryRoot(config, variants, "Nested variants root");
    config = { ...config, generated_variants_root: `${variants}${path.sep}` };

    const scan = await scanLibrary(config);
    assert.equal(scan.records.some((record) => record.path === path.join(variants, "missing.md")), false);
    assert.equal(eligibleOriginals(scan).some((record) => record.path === path.join(variants, "missing.md")), false);
    assert.ok(scan.warnings.some((warning) => warning.code === "invalid_assisted_sidecar"));
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
