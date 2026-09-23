// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { CAREER_UI_RPC_ACTIONS as A, CareerOverlay, CareerUiSession, buildCareerUiModel, careerPreviewLoader, runCareerUiRpc } from "../../src/workflow/career-ui.ts";
import { scanLibrary } from "../../src/workflow/scan.ts";
import { loadConfig } from "../../src/workflow/config.ts";
import { prepareConfigDirectory, makeContext, makeFakePi, syntheticTextPdf } from "./helpers.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const sentinel = "PRIVATE_BODY_SENTINEL_7K";

async function fixture(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-preview-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "library");
  await prepareConfigDirectory(agentDir);
  await mkdir(root);
  const file = path.join(root, "resume.md");
  const text = `# Synthetic Resume\n${sentinel}\nExact line two\n`;
  await writeFile(file, text);
  const config = { schema_version: "pi.career.config.v2", library_roots: [{ id: hash(root), path: root, label: "Synthetic root" }], generated_variants_root: null, application_workspace: null };
  await writeFile(path.join(agentDir, "career", "config.v1.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path.join(agentDir, "career", "config.v1.json"), 0o600);
  const fake = makeFakePi();
  const rpc = makeContext(fake, { mode: "rpc", persisted: false });
  await loadConfig(agentDir);
  const model = await buildCareerUiModel(agentDir, rpc.ctx);
  assert.ok(model.library.items.length, JSON.stringify(model.library));
  const session = () => new CareerUiSession("library", model, {}, undefined, careerPreviewLoader(agentDir, rpc.ctx));
  return { temp, root, file, text, fake, rpc, model, session };
}

test("P3-35 local RPC preview needs separate explicit action; back and cancel discard bytes without mutation", async (t) => {
  const f = await fixture(t);
  const before = await readFile(f.file);
  const dialogs = [];
  const choices = [f.model.library.items[0].label, A.preview, A.back, A.back, A.close];
  f.rpc.ctx.ui.select = async (title, options) => {
    dialogs.push({ title, options });
    return choices.shift();
  };
  f.rpc.ctx.sendMessage = () => assert.fail("no provider send");
  f.rpc.ctx.sendUserMessage = () => assert.fail("no provider send");
  await runCareerUiRpc(f.rpc.ctx, f.session());
  assert.equal(dialogs.length, 5);
  assert.ok(dialogs.slice(0, 2).every((dialog) => !JSON.stringify(dialog).includes(sentinel)));
  assert.ok(dialogs[1].options.includes(A.preview));
  assert.ok(dialogs[2].title.endsWith(f.text));
  assert.deepEqual(dialogs[2].options, [A.back, A.switchView, A.close]);
  assert.ok(dialogs.slice(3).every((dialog) => !JSON.stringify(dialog).includes(sentinel)));
  assert.deepEqual(await readFile(f.file), before);
  assert.equal(f.fake.entries.length, 0);
  assert.deepEqual(f.rpc.notifications, []);
  assert.equal(f.rpc.customCalls, 0);
});

test("TUI metadata and list stay body-free, explicit preview shows local text then clears on Escape", async (t) => {
  const f = await fixture(t);
  const session = f.session();
  const overlay = new CareerOverlay(session, { fg: (_type, text) => text, bold: (text) => text },
    { matches: (data, action) => action === "tui.select.cancel" && data === "esc" }, () => {}, () => {});
  assert.doesNotMatch(overlay.render(100).join("\n"), /PRIVATE_BODY_SENTINEL/);
  assert.equal(session.open(), true);
  assert.doesNotMatch(overlay.render(100).join("\n"), /PRIVATE_BODY_SENTINEL/);
  assert.equal(session.canPreview, true);
  assert.equal(await session.openPreview(), true);
  assert.equal(session.preview, f.text);
  assert.match(overlay.render(100).join("\n"), /PRIVATE_BODY_SENTINEL/);
  overlay.handleInput("esc");
  assert.equal(session.preview, undefined);
  assert.doesNotMatch(overlay.render(100).join("\n"), /PRIVATE_BODY_SENTINEL/);
  overlay.handleInput("esc");
  assert.equal(session.showingDetail, false);
});

test("TUI paginates exact local preview instead of silently clipping a bounded body", async (t) => {
  const f = await fixture(t);
  const session = new CareerUiSession("library", f.model, {}, undefined,
    async () => `${Array.from({ length: 15 }, (_, index) => `Page line ${index}`).join("\n")}\n`);
  const overlay = new CareerOverlay(session, { fg: (_type, text) => text, bold: (text) => text },
    { matches: (data, action) => action === "tui.select.down" && data === "down" ||
      action === "tui.select.cancel" && data === "esc" }, () => {}, () => {});
  session.open();
  assert.equal(await session.openPreview(), true);
  assert.match(overlay.render(80).join("\n"), /page 1\/3/);
  assert.doesNotMatch(overlay.render(80).join("\n"), /Page line 14/);
  overlay.handleInput("down");
  overlay.handleInput("down");
  assert.match(overlay.render(80).join("\n"), /Page line 14/);
  overlay.handleInput("esc");
  assert.equal(session.preview, undefined);
});

test("TUI exact preview reconstructs source across soft wraps, hard lines, and pages", async (t) => {
  const f = await fixture(t);
  const samples = [
    { width: 1, text: "a  b\n\nxyz\n" },
    { width: 2, text: "界🙂e\u0301  Z\n\nQ\n" },
    { width: 7, text: `${"x".repeat(39)}\nalpha   beta  \n\n${"界🙂á ".repeat(15)}\nlast\n` },
    { width: 11, text: `${"word ".repeat(15)}  \n\n${"z".repeat(75)}\nend` },
  ];
  for (const { width, text } of samples) {
    const session = new CareerUiSession("library", f.model, {}, undefined, async () => text);
    const overlay = new CareerOverlay(session, { fg: (_type, value) => `\u001b[36m${value}\u001b[0m`, bold: (value) => `\u001b[1m${value}\u001b[0m` },
      { matches: (data, action) => action === "tui.select.down" && data === "down" ||
        action === "tui.select.up" && data === "up" || action === "tui.select.cancel" && data === "esc" },
      () => {}, () => {});
    session.open();
    assert.equal(await session.openPreview(), true);
    // Independent greedy grapheme oracle: no whitespace is discarded on either side
    // of a wrap. Keep source line boundaries, including a final empty line.
    const expected = text.split("\n").map((line) => {
      const rows = [];
      let row = "";
      for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line)) {
        if (row && visibleWidth(row + segment) > width) { rows.push(row); row = ""; }
        row += segment;
      }
      rows.push(row);
      return rows;
    });
    const allRows = expected.flat();
    const pages = Math.ceil(allRows.length / 6);
    const observed = [];
    for (let page = 0; page < pages; page++) {
      const styled = overlay.render(width);
      assert.ok(styled.every((line) => visibleWidth(line) <= width), `ANSI line exceeds ${width} columns`);
      const rendered = styled.map(stripTerminalSequences);
      const bodyStart = rendered.indexOf("");
      assert.ok(bodyStart >= 0);
      const rows = rendered.slice(bodyStart + 2, bodyStart + 2 + Math.min(6, allRows.length - page * 6));
      observed.push(...rows);
      if (page < pages - 1) overlay.handleInput("down");
    }
    assert.deepEqual(observed, allRows);
    let offset = 0;
    const reconstructed = expected.map((rows) => {
      const line = observed.slice(offset, offset + rows.length).join("");
      offset += rows.length;
      return line;
    }).join("\n");
    assert.equal(reconstructed, text);
    overlay.handleInput("down");
    overlay.handleInput("down");
    const clamped = overlay.render(width).map(stripTerminalSequences);
    const clampedStart = clamped.indexOf("");
    assert.deepEqual(clamped.slice(clampedStart + 2, clampedStart + 2 + Math.min(6, allRows.length - (pages - 1) * 6)),
      allRows.slice((pages - 1) * 6));
    overlay.handleInput("up");
    overlay.handleInput("down");
    assert.deepEqual(overlay.render(width).map(stripTerminalSequences).slice(clampedStart + 2, clampedStart + 2 + Math.min(6, allRows.length - (pages - 1) * 6)),
      allRows.slice((pages - 1) * 6));
    overlay.handleInput("esc");
    assert.equal(session.preview, undefined);
    assert.equal(f.fake.entries.length, 0);
    assert.deepEqual(f.rpc.notifications, []);
    assert.equal(f.rpc.customCalls, 0);
  }
});

test("too-narrow TUI fails closed for a wide grapheme without a partial preview", async (t) => {
  const f = await fixture(t);
  const text = `${"a".repeat(50)}\n界🙂\n`;
  const session = new CareerUiSession("library", f.model, {}, undefined, async () => text);
  const overlay = new CareerOverlay(session, { fg: (_type, value) => `\u001b[36m${value}\u001b[0m`, bold: (value) => `\u001b[1m${value}\u001b[0m` },
    { matches: (data, action) => action === "tui.select.down" && data === "down" ||
      action === "tui.select.cancel" && data === "esc" }, () => {}, () => {});
  session.open();
  assert.equal(await session.openPreview(), true);
  for (let page = 0; page < 60; page++) {
    const rendered = overlay.render(1);
    assert.ok(rendered.every((line) => visibleWidth(line) <= 1));
    const stripped = rendered.map(stripTerminalSequences);
    const bodyStart = stripped.indexOf("");
    assert.ok(bodyStart >= 0);
    assert.doesNotMatch(stripped[bodyStart + 1], /a|界|🙂|exact text/i);
    assert.equal(stripped[bodyStart + 2], "");
    assert.equal(session.preview, text);
    overlay.handleInput("down");
  }
  // A larger terminal can display the same in-memory source without reload.
  assert.ok(overlay.render(2).map(stripTerminalSequences).join("\n").includes("aa"));
  overlay.handleInput("esc");
  assert.equal(session.preview, undefined);
  assert.equal(f.fake.entries.length, 0);
  assert.deepEqual(f.rpc.notifications, []);
  assert.equal(f.rpc.customCalls, 0);
});

test("cancel while revalidation is pending cannot install a late preview", async (t) => {
  const f = await fixture(t);
  let resolve;
  const wait = new Promise((done) => { resolve = done; });
  const session = new CareerUiSession("library", f.model, {}, undefined, async () => wait);
  session.open();
  const pending = session.openPreview();
  session.cancelPreview();
  resolve(f.text);
  assert.equal(await pending, false);
  assert.equal(session.preview, undefined);
  assert.equal(session.previewError, undefined);
});

test("fresh validation rejects changed, removed, binary, control, and over-limit documents; no stale preview", async (t) => {
  const f = await fixture(t);
  const original = f.model.library.items[0];
  for (const replacement of ["# Synthetic Resume\nCHANGED_CONTENT\n", Buffer.from([0xff, 0x00]),
    `# Synthetic Resume\n${sentinel}\u001b[31m`, `# Synthetic Resume\n${sentinel}${"z".repeat(12_001)}`]) {
    await writeFile(f.file, replacement);
    const session = f.session();
    assert.equal(session.openItem(original), true);
    assert.equal(await session.openPreview(), false);
    assert.equal(session.preview, undefined);
    assert.match(session.previewError, /unavailable or changed/);
    assert.doesNotMatch(session.previewError, /PRIVATE_BODY_SENTINEL|CHANGED_CONTENT/);
  }
  await rm(f.file);
  const session = f.session();
  session.openItem(original);
  assert.equal(await session.openPreview(), false);
  assert.equal(f.fake.entries.length, 0);
  assert.deepEqual(f.rpc.notifications, []);
});

test("fresh PDF extracted text is previewed exactly, not raw binary or OCR", async (t) => {
  const f = await fixture(t);
  const pdf = path.join(f.root, "searchable.pdf");
  await writeFile(pdf, syntheticTextPdf(["Synthetic searchable", "Private PDF sentence"]));
  const agentDir = path.join(f.temp, "agent");
  const record = (await scanLibrary(await loadConfig(agentDir))).records.find((row) => row.format === "pdf");
  assert.ok(record);
  const session = new CareerUiSession("library", await buildCareerUiModel(agentDir, f.rpc.ctx), {}, undefined,
    careerPreviewLoader(agentDir, f.rpc.ctx));
  assert.ok(session.openItem(session.pane.items.find((row) => row.id === record.id)));
  assert.equal(await session.openPreview(), true);
  assert.equal(session.preview, record.text);
  session.back();
  assert.equal(session.preview, undefined);
  await writeFile(pdf, "%PDF-1.4\nnot searchable\n");
  assert.equal(await session.openPreview(), false);
});

test("fresh plain-text original preview shows exact bytes only on local detail", async (t) => {
  const f = await fixture(t);
  const textFile = path.join(f.root, "another.txt");
  await writeFile(textFile, `Plain text\n${sentinel}\n`);
  const updated = await buildCareerUiModel(path.join(f.temp, "agent"), f.rpc.ctx);
  const session = new CareerUiSession("library", updated, {}, undefined, careerPreviewLoader(path.join(f.temp, "agent"), f.rpc.ctx));
  const item = updated.library.items.find((row) => row.label.startsWith("another"));
  assert.ok(item);
  session.openItem(item);
  assert.equal(await session.openPreview(), true);
  assert.equal(session.preview, `Plain text\n${sentinel}\n`);
  session.back();
  assert.equal(session.preview, undefined);
});
