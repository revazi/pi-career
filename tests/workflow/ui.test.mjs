// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BorderedLoader, initTheme } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, setKeybindings, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";

import { adapterError } from "../../src/errors.ts";
import { addLibraryRoot, emptyConfig, writeConfig } from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import {
  analyzeDetailSections,
  DetailViewer,
  detailText,
  matchDetailSections,
} from "../../src/workflow/renderers.ts";
import { createResultCard, projectJobMatch } from "../../src/workflow/result-projection.ts";
import { sha256 } from "../../src/workflow/scan.ts";
import { makeContext, makeFakePi, matchResult, resumeResult, uuidSequence } from "./helpers.mjs";

const now = () => new Date("2026-08-04T17:56:06.000Z");
const keybindings = new KeybindingsManager(TUI_KEYBINDINGS);
setKeybindings(keybindings);
initTheme("dark", false);

async function fixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-ui-"));
  const root = path.join(temp, "library");
  const agentDir = path.join(temp, "agent");
  await mkdir(root);
  const resumePath = path.join(root, "resume.md");
  await writeFile(resumePath, "# Synthetic Resume\nDeterministic content\n");
  await writeConfig(agentDir, await addLibraryRoot(emptyConfig(), root), uuidSequence());
  const option = `Synthetic Resume — ${sha256(await realpath(resumePath)).slice(0, 12)}`;
  return { temp, agentDir, option };
}

test("TUI analyze uses BorderedLoader and stores a bounded transcript card", async () => {
  const { temp, agentDir, option } = await fixture();
  try {
    const fake = makeFakePi();
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async () => ({ operation: "resume.analyze", json: JSON.stringify(resumeResult()) }),
    });
    const components = [];
    const tui = makeContext(fake, {
      mode: "tui", persisted: false, selects: [option, "Close"], components,
    });
    await fake.commands.get("career-analyze").handler("", tui.ctx);
    assert.equal(tui.customCalls, 1);
    assert.equal(components[0]?.constructor?.name, BorderedLoader.name);
    components[0]?.dispose?.();
    const cards = fake.entries.filter((entry) => entry.data.kind === "result_card");
    assert.equal(cards.length, 1);
    assert.equal(JSON.stringify(cards[0]).includes("Synthetic deterministic explanation"), false);
    assert.ok(tui.notifications.some(({ message }) => message.includes("Career analyze")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("complete and oversized successful detail remains available through the bounded viewer", () => {
  const result = resumeResult();
  const sections = analyzeDetailSections(result);
  const complete = sections.find((section) => section.label === "All");
  assert.ok(complete);
  assert.deepEqual(JSON.parse(detailText(complete)), result);
  const match = matchResult();
  const fullMatch = matchDetailSections(match, "Synthetic vacancy")[0];
  assert.equal(fullMatch?.label, "All");
  assert.deepEqual(JSON.parse(detailText(fullMatch)), match);

  const oversized = detailText({
    label: "checks",
    value: [{ body: "x".repeat(9_000), tail: "final marker" }],
  });
  assert.ok(Buffer.byteLength(oversized, "utf8") > 8_000);
  assert.match(oversized, /final marker/);
  assert.doesNotMatch(oversized, /detail is too large/);

  let renderRequests = 0;
  let closed = false;
  const theme = {
    fg(_color, text) { return text; }, bold(text) { return text; },
  };
  const viewer = new DetailViewer(
    "checks",
    oversized,
    theme,
    keybindings,
    6,
    () => { renderRequests += 1; },
    () => { closed = true; },
  );
  const firstPage = viewer.render(48);
  assert.ok(firstPage.every((line) => visibleWidth(line) <= 48));
  assert.equal(firstPage.length, 9);
  assert.doesNotMatch(firstPage.join("\n"), /final marker/);

  viewer.handleInput("\x1b[F");
  const lastPage = viewer.render(48);
  assert.match(lastPage.join("\n"), /final marker/);
  assert.ok(renderRequests > 0);

  viewer.handleInput("\x1b[H");
  assert.doesNotMatch(viewer.render(48).join("\n"), /final marker/);
  viewer.handleInput("\x1b");
  assert.equal(closed, true);
});

test("result cards remain understandable at narrow terminal widths", () => {
  const fake = makeFakePi();
  const uuid = uuidSequence();
  registerCareerCommands(fake.api, { agentDir: "/synthetic/agent", uuid, now });
  const resume = {
    id: "1".repeat(64), root_id: "2".repeat(64), path: "/synthetic/resume.md", relative_path: "resume.md",
    label: "Synthetic Resume", kind: "original", format: "markdown", modified_at: now().toISOString(),
    size_bytes: 9, text: "Synthetic", text_sha256: "3".repeat(64),
  };
  const projection = projectJobMatch(matchResult(81, "apply_now", true));
  projection.ui_flags.close_cluster = true;
  projection.ui_flags.stale = true;
  const card = createResultCard({ workflow: "match", runId: uuid(), resume, projection, uuid, now });
  const theme = {
    fg(_color, text) { return text; }, bold(text) { return text; },
  };
  const component = fake.renderers.get("career.workflow")({ data: card }, { expanded: false }, theme);
  const lines = component.render(60);
  assert.ok(lines.every((line) => line.length <= 60));
  assert.match(lines.join("\n"), /provisional/);
  assert.match(lines.join("\n"), /close cluster/);
  assert.match(lines.join("\n"), /stale/);
  assert.match(lines.join("\n"), /strengths/);
  assert.match(lines.join("\n"), /gaps/);
});

test("tie status is re-derived for durable match cards after session reload", async () => {
  const { temp, agentDir } = await fixture();
  try {
    const fake = makeFakePi();
    const uuid = uuidSequence();
    const runId = uuid();
    const resumes = ["Alpha", "Beta"].map((label, index) => ({
      id: String(index + 1).repeat(64), root_id: "f".repeat(64),
      path: `/synthetic/${label.toLowerCase()}.md`, relative_path: `${label.toLowerCase()}.md`,
      label: `Synthetic ${label}`, kind: "original", format: "markdown",
      modified_at: now().toISOString(), size_bytes: 9, text: "Synthetic",
      text_sha256: String(index + 3).repeat(64),
    }));
    const cards = resumes.map((resume) => createResultCard({
      workflow: "match", runId, resume,
      projection: projectJobMatch(matchResult(90, "apply_now")), uuid, now,
    }));
    for (const card of cards) fake.api.appendEntry("career.workflow", card);
    registerCareerCommands(fake.api, { agentDir, uuid, now });

    const rpc = makeContext(fake, { mode: "rpc" });
    await fake.events.get("session_start")[0]({}, rpc.ctx);
    const theme = { fg(_color, text) { return text; }, bold(text) { return text; } };
    for (const card of cards) {
      const rendered = fake.renderers.get("career.workflow")(
        { data: card }, { expanded: false }, theme,
      ).render(80).join("\n");
      assert.match(rendered, /tie/);
      assert.deepEqual(Object.keys(card.projection.ui_flags).sort(), [
        "adjusted", "close_cluster", "provisional", "stale",
      ]);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("a newer career command aborts ownership and prevents stale card publication", async () => {
  const { temp, agentDir, option } = await fixture();
  try {
    const fake = makeFakePi();
    let started;
    const startedPromise = new Promise((resolve) => { started = resolve; });
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async (_invocation, signal) => new Promise((_resolve, reject) => {
        started();
        signal.addEventListener("abort", () => reject(adapterError("cancelled")), { once: true });
      }),
    });
    const analyze = makeContext(fake, { mode: "rpc", persisted: false, selects: [option] });
    const pending = fake.commands.get("career-analyze").handler("", analyze.ctx);
    await startedPromise;
    const setup = makeContext(fake, { mode: "rpc", selects: [] });
    await fake.commands.get("career-setup").handler("status", setup.ctx);
    await pending;
    assert.equal(fake.entries.some((entry) => entry.data.kind === "result_card"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("oversized Core results produce fixed no-partial UI and no stored card", async () => {
  const { temp, agentDir, option } = await fixture();
  try {
    const fake = makeFakePi();
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async () => { throw adapterError("result_too_large"); },
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false, selects: [option] });
    await fake.commands.get("career-analyze").handler("", rpc.ctx);
    assert.equal(fake.entries.some((entry) => entry.data.kind === "result_card"), false);
    assert.ok(rpc.notifications.some(({ message }) =>
      message.includes("No partial output exists and the result was not stored.")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
