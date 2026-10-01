// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";
import { ApplicationWorkspaceWorkflow, selectedOriginalOptions } from "../../src/workflow/application-workspace.ts";
import { addLibraryRoot, emptyConfig, loadConfig, writeConfig } from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import {
  CAREER_UI_COMMAND_VIEWS,
  CAREER_UI_RPC_ACTIONS,
  applicationNextAction,
  currentApplicationResults,
  CAREER_UI_VIEW_LABELS,
  CareerOverlay,
  CareerUiSession,
  buildCareerLibraryPane,
  buildCareerUiModel,
  careerPreviewLoader,
} from "../../src/workflow/career-ui.ts";
import { eligibleOriginals, scanLibrary } from "../../src/workflow/scan.ts";
import { encodeAssistedVariantMetadataV2, encodeManagedVariantsMarker } from "../../src/workflow/variant-metadata.ts";
import { reconstructWorkflowState } from "../../src/workflow/session-state.ts";
import {
  makeContext, makeFakePi, matchResult, normalizationResult, prepareConfigDirectory, resumeResult, uuidSequence,
} from "./helpers.mjs";

async function register(temp) {
  const agentDir = path.join(temp, "agent");
  await prepareConfigDirectory(agentDir);
  const fake = makeFakePi();
  const calls = [];
  registerCareerCommands(fake.api, {
    agentDir,
    uuid: uuidSequence(),
    now: () => new Date("2026-08-12T00:00:00.000Z"),
    invoke: async (invocation) => {
      calls.push(invocation);
      throw new Error("overlay navigation must not invoke Career Core");
    },
  });
  return { fake, calls };
}

test("#58 contextual result guidance ignores historical cards with drifted application bindings", () => {
  const selected = { id: "original-1", text_sha256: "a".repeat(64) };
  const effective = { id: "variant-1", text_sha256: "b".repeat(64) };
  const attached = {
    application_id: "application-1",
    selected_original: selected,
    effective_resume: effective,
    vacancy: { vacancy_text_sha256: "c".repeat(64) },
  };
  const card = (workflow, resume, vacancy) => ({
    application_id: "application-1", workflow, resume_id: resume,
    input_digests: { resume_text_sha256: resume === selected.id ? selected.text_sha256 : effective.text_sha256, vacancy_text_sha256: vacancy },
  });
  const historical = [card("analyze", selected.id, "d".repeat(64)), card("match", effective.id, "d".repeat(64))];
  assert.deepEqual(currentApplicationResults(historical, attached), { analyzed: true, matched: false });
  assert.deepEqual(currentApplicationResults([card("match", effective.id, "c".repeat(64))], attached), { analyzed: false, matched: true });
  assert.deepEqual(currentApplicationResults([card("match", "other-resume", "c".repeat(64))], attached), { analyzed: false, matched: false });
});

test("#58 SBDD journey matrix derives a resumable next action at every persisted package boundary", () => {
  const base = { job_description: "Available", resume: "Available", cover_letter: "Available" };
  const cases = [
    ["created, not attached", { ...base, job_description: "Missing", resume: "Missing", cover_letter: "Missing" }, false, false, /job description/],
    ["vacancy added; Original not selected", { ...base, resume: "Missing", cover_letter: "Missing" }, false, false, /eligible Original/],
    ["Original selected; Analyze interrupted or not run", { ...base, cover_letter: "Missing" }, false, false, /analyze the selected Original/],
    ["Analyze resumed; Match interrupted or not run", { ...base, cover_letter: "Missing" }, true, false, /analyze match/],
    ["Match complete; optional letter not authored", { ...base, cover_letter: "Missing" }, true, true, /workspace/],
    ["complete package; review resumed", base, true, true, /Ready is derived/],
    ["vacancy source stale/drifted/unavailable", { ...base, job_description: "Drifted" }, true, true, /job description/],
    ["selected Original stale/drifted/unavailable or assisted", { ...base, resume: "Unavailable" }, true, true, /library.*workspace/],
    ["letter stale/drifted/unavailable", { ...base, cover_letter: "Stale" }, true, true, /user-authored cover letter/],
  ];
  for (const [stage, components, analyzed, matched, expected] of cases) {
    // Rebuilding this derived view after close/reopen or restart uses only the persisted
    // package classification and explicit session result evidence; no action is invoked.
    assert.match(applicationNextAction(components, analyzed, matched), expected, stage);
  }
  assert.match(applicationNextAction(base, false, false), /analyze the selected Original/,
    "a complete package does not require a persisted match result to remain Ready");
});

test("valid catalog browse/open/filter/clear has empty and repeated reads without attachment or model/provider effects", async () => {
  const pane = (intro, items = []) => ({ intro, items });
  const model = {
    setup: pane("setup"), library: pane("library"),
    applications: pane("applications", [
      { id: "uuid-a", label: "Acme · Engineer", detail: "Applied · Ready · persistent", applicationStatus: "applied" },
      { id: "uuid-b", label: "Acme · Engineer", detail: "Interviewing · Not ready · persistent", applicationStatus: "interviewing" },
    ]),
    vacancy: pane("vacancy"), match: pane("match"), analyze: pane("analyze"),
    workbench: pane("workbench"), workspace: pane("workspace"),
  };
  const effects = [];
  const session = new CareerUiSession("applications", model, {
    filterApplications: async () => "Acme",
    filterApplicationLifecycle: async () => "applied",
    attach: async () => { effects.push("attach"); return true; },
  });
  assert.equal(session.pane.items.length, 2);
  assert.equal(session.open(), true);
  assert.equal(session.back(), "list");
  assert.equal(await session.filterApplications(), true);
  assert.deepEqual(session.pane.items.map((item) => item.id), ["uuid-a", "uuid-b"]);
  assert.equal(session.open(), true);
  assert.equal(session.back(), "list");
  session.clearApplicationFilter();
  assert.deepEqual(session.pane.items.map((item) => item.id), ["uuid-a", "uuid-b"]);
  assert.equal(await session.filterApplications(), true);
  assert.equal(await session.filterApplicationLifecycle(), true);
  assert.deepEqual(session.pane.items.map((item) => item.id), ["uuid-a"]);
  assert.match(session.pane.intro, /Lifecycle: Applied/);
  session.clearApplicationFilter();
  // A query with no matches is safe and does not destroy the catalog snapshot.
  const empty = new CareerUiSession("applications", model, { filterApplications: async () => "absent" });
  assert.equal(await empty.filterApplications(), true);
  assert.equal(empty.pane.items.length, 0);
  empty.clearApplicationFilter();
  assert.deepEqual(empty.pane.items.map((item) => item.id), ["uuid-a", "uuid-b"]);
  empty.clearApplicationFilter();
  assert.deepEqual(empty.pane.items.map((item) => item.id), ["uuid-a", "uuid-b"]);
  const detailSession = new CareerUiSession("applications", model, { filterApplications: async () => "Interviewing" });
  assert.equal(detailSession.open(), true);
  assert.equal(detailSession.selected.id, "uuid-a");
  assert.equal(await detailSession.filterApplications(), true);
  assert.deepEqual(detailSession.pane.items.map((item) => item.id), ["uuid-b"]);
  assert.equal(detailSession.selected.id, "uuid-a", "filtering an open detail preserves its UUID identity");
  detailSession.clearApplicationFilter();
  assert.equal(detailSession.selected.id, "uuid-a", "clearing an open detail preserves its UUID identity");
  assert.deepEqual(effects, []);
});

test("attached application is the initial detail and lifecycle actions stay bound to it", async () => {
  const pane = (intro, items = []) => ({ intro, items });
  const model = {
    setup: pane("setup"), library: pane("library"),
    applications: pane("applications", [
      { id: "other", label: "Other", detail: "Preparing", applicationStatus: "preparing", pointer: { applicationId: "other" } },
      { id: "attached", label: "Attached", detail: "Applied", applicationStatus: "applied", attachedApplication: true, canUpdateApplication: true, pointer: { applicationId: "attached" } },
    ]),
    vacancy: pane("vacancy"), match: pane("match"), analyze: pane("analyze"),
    workbench: pane("workbench"), workspace: pane("workspace"),
  };
  const calls = [];
  const session = new CareerUiSession("applications", model, {
    attach: async (pointer) => { calls.push(["attach", pointer.applicationId]); return true; },
    updateStatus: async () => { calls.push(["status", session.selected.id]); return true; },
    detach: async () => { calls.push(["detach", session.selected.id]); return true; },
    workspace: async () => { calls.push(["workspace", session.selected.id]); return true; },
  });
  assert.equal(session.showingDetail, true);
  assert.equal(session.selected.id, "attached");
  assert.equal(session.canAttach, false);
  assert.equal(session.canUpdateStatus, true);
  assert.equal(session.canWorkspace, true);
  assert.ok(session.rpcActions().includes(CAREER_UI_RPC_ACTIONS.workspace));
  assert.equal(await session.updateStatus(), true);
  assert.equal(await session.workspace(), true);
  assert.equal(await session.detach(), true);
  session.back();
  session.highlight(0);
  assert.equal(session.canAttach, true);
  assert.equal(session.canUpdateStatus, false);
  assert.equal(session.canDetach, false);
  assert.deepEqual(calls, [["status", "attached"], ["workspace", "attached"], ["detach", "attached"]]);
});

async function openAndClose(fake, command, view) {
  const components = [];
  const before = fake.entries.length;
  const context = makeContext(fake, {
    mode: "tui", persisted: false, components,
    keybindings: { matches(_data, action) { return action === "tui.select.cancel"; } },
  });
  const pending = fake.commands.get(command).handler("", context.ctx);
  const deadline = Date.now() + 2_000;
  while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(components.length, 1);
  assert.equal(components[0].constructor.name, CareerOverlay.name);
  assert.equal(components[0].currentView, view);
  const lines = components[0].render(80);
  assert.ok(lines.every((line) => visibleWidth(line) <= 80));
  const rendered = lines.join("\n");
  assert.match(rendered, /◆  Career/);
  assert.doesNotMatch(rendered, /agent|applications[/\\]|resume\.md|Built reliable/);
  components[0].handleInput("esc");
  await pending;
  assert.equal(fake.entries.length, before);
  return { context, rendered };
}

test("library original exposes direct analyze and root removal; variants and unavailable records do not", async () => {
  const pane = { intro: "library", items: [
    { id: "original", label: "Original", detail: "Original", libraryRootId: "root-a", preview: { source: "library", id: "original", rootId: "root-a", digest: "abc", format: "text" } },
    { id: "variant", label: "Variant", detail: "Assisted variant (non-authoritative)" },
  ] };
  const model = Object.fromEntries(Object.values(CAREER_UI_COMMAND_VIEWS).map((name) => [name, { intro: name, items: [] }]));
  model.library = pane;
  const calls = [];
  const session = new CareerUiSession("library", model, {
    analyze: async (reference) => { calls.push(["analyze", reference?.id]); return true; },
    removeRoot: async (id) => { calls.push(id); return true; },
  });
  assert.equal(session.canAnalyze, true);
  assert.equal(session.canRemoveRoot, true);
  assert.ok(session.rpcActions().includes(CAREER_UI_RPC_ACTIONS.removeRoot));
  assert.ok(session.rpcActions().includes(CAREER_UI_RPC_ACTIONS.analyze));
  await session.analyze();
  await session.removeRoot();
  assert.deepEqual(calls, [["analyze", "original"], "root-a"]);
  session.move(1);
  assert.equal(session.canAnalyze, false);
  assert.equal(session.canRemoveRoot, false);
});

test("Resume library pane covers empty, capped, stale, unreadable, oversized, PDF, text, and assisted states", () => {
  const record = (id, rootId, format, kind = "original", extra = {}) => ({
    id, root_id: rootId, path: `/synthetic/${id}`, relative_path: `${id}.${format === "markdown" ? "md" : format === "text" ? "txt" : "pdf"}`,
    label: `Synthetic ${id}`, kind, format, modified_at: "2026-08-12T00:00:00.000Z",
    size_bytes: 10, text: `Synthetic ${id}`, text_sha256: `${id.at(-1) ?? "a"}`.repeat(64).slice(0, 64), ...extra,
  });
  const scan = {
    records: [
      record("text-a", "root-a", "text"),
      record("pdf-b", "root-b", "pdf"),
      record("assisted-c", "root-a", "markdown", "assisted_variant"),
      record("oversized-d", "root-a", "markdown", "original", { too_large_for_core_input: true }),
      record("stale-e", "root-stale", "text"),
      record("capped-f", "root-capped", "text"),
    ],
    warnings: [
      { code: "root_stale", root_id: "root-stale" },
      { code: "root_file_cap_reached", root_id: "root-capped" },
      { code: "total_file_cap_reached", root_id: "root-a" },
      { code: "raw_file_too_large", root_id: "root-a" },
      { code: "pdf_text_unavailable", root_id: "root-b" },
      { code: "invalid_utf8", root_id: "root-a" },
      { code: "invalid_assisted_sidecar", root_id: "root-a" },
      { code: "scan_entry_unavailable", root_id: "root-a" },
    ],
    roots: [
      { root_id: "root-a", original_count: 2, assisted_variant_count: 1, too_large_count: 1, stale: false, capped: false },
      { root_id: "root-b", original_count: 1, assisted_variant_count: 0, too_large_count: 0, stale: false, capped: false },
      { root_id: "root-stale", original_count: 1, assisted_variant_count: 0, too_large_count: 0, stale: true, capped: false },
      { root_id: "root-capped", original_count: 1, assisted_variant_count: 0, too_large_count: 0, stale: false, capped: true },
    ],
    total_capped: false,
  };
  const pane = buildCareerLibraryPane(scan);
  assert.match(pane.items.find((entry) => entry.id === "text-a").label, /Original.*text/);
  assert.match(pane.items.find((entry) => entry.id === "pdf-b").detail, /Format: pdf/);
  assert.match(pane.items.find((entry) => entry.id === "assisted-c").detail, /Assisted variant \(non-authoritative/);
  assert.match(pane.items.find((entry) => entry.id === "oversized-d").detail, /too large for deterministic analysis/);
  assert.match(pane.items.find((entry) => entry.id === "stale-e").detail, /root changed or missing/);
  assert.match(pane.items.find((entry) => entry.id === "capped-f").detail, /root scan capped/);
  const analyzedPane = buildCareerLibraryPane(scan, [{
    kind: "result_card", workflow: "analyze", resume_id: "text-a", resume_label: "Synthetic text-a",
    input_digests: { resume_text_sha256: scan.records[0].text_sha256, vacancy_text_sha256: "" },
    projection: { summary: { overall_score: 81 }, ui_flags: { adjusted: false, provisional: false, close_cluster: false, stale: false } },
  }]);
  assert.match(analyzedPane.items.find((entry) => entry.id === "text-a").detail, /Career analyze: Synthetic text-a\nscore 81/);
  assert.ok(pane.items.filter((entry) => entry.id.startsWith("notice:")).some((entry) => /text encoding unreadable/.test(entry.detail)));
  assert.ok(pane.items.filter((entry) => entry.id.startsWith("notice:")).some((entry) => /assisted metadata quarantined/.test(entry.detail)));
  assert.equal(buildCareerLibraryPane({ records: [], warnings: [], roots: [], total_capped: false }).items.length, 0);
  assert.match(buildCareerLibraryPane({ records: [], warnings: [{ code: "root_stale", root_id: "root" }], roots: [], total_capped: true }).intro, /scan capped.*notice/s);

  const model = Object.fromEntries(Object.values(CAREER_UI_COMMAND_VIEWS).map((name) => [name, { intro: name, items: [] }]));
  model.library = pane;
  const session = new CareerUiSession("library", model);
  assert.equal(session.open(), true);
  const style = (_name, text) => text;
  const overlay = new CareerOverlay(session, { fg: style, bold: (text) => text }, { matches: () => false }, () => {}, () => {});
  for (const width of [32, 48, 80]) assert.ok(overlay.render(width).every((line) => visibleWidth(line) <= width));
});

test("explicit Resume library rescan shows local progress and discards a cancelled refresh", async () => {
  const model = Object.fromEntries(Object.values(CAREER_UI_COMMAND_VIEWS).map((name) => [name, { intro: name, items: [] }]));
  model.library = { intro: "previous complete library", items: [] };
  let finishReload;
  const reload = new Promise((resolve) => { finishReload = resolve; });
  const cancellations = [];
  const session = new CareerUiSession("library", model, {
    rescan: async () => true,
    cancelOperation: () => cancellations.push("cancel"),
  }, () => reload);
  const pending = session.rescan();
  assert.equal(session.operationActive, true);
  assert.match(session.operationLabel, /Rescanning Resume library locally/);
  session.cancelOperation();
  assert.deepEqual(cancellations, ["cancel"]);
  assert.match(session.operationLabel, /Cancelling Resume library rescan/);
  finishReload({ ...model, library: { intro: "partial replacement", items: [] } });
  assert.equal(await pending, false);
  assert.equal(session.pane.intro, "previous complete library");
  assert.equal(session.operationActive, false);
});

test("Analyze and Match keep the mounted overlay busy/cancellable and restore its idle view", async () => {
  for (const view of ["analyze", "match"]) {
    for (const outcome of ["success", "error", "cancel"]) {
      const calls = [];
      const ownedController = new AbortController();
      let finish;
      const pending = new Promise((resolve, reject) => { finish = outcome === "error" ? reject : resolve; });
      const model = Object.fromEntries(Object.values(CAREER_UI_COMMAND_VIEWS).map((name) => [name, { intro: `${name} synthetic`, items: [] }]));
      const session = new CareerUiSession(view, model, {
        cancelOperation: () => { calls.push("cancel"); ownedController.abort(); },
        [view]: () => pending.then(() => true),
      });
      const style = (_name, text) => text;
      const overlay = new CareerOverlay(session, { fg: style, bold: (text) => text }, { matches: (data, action) => data === "esc" && action === "tui.select.cancel" }, () => {});
      const selected = session.selected;
      const running = view === "analyze" ? session.analyze() : session.match();
      assert.equal(session.busy, true);
      assert.match(overlay.render(80).join("\n"), /Running deterministic Career Core action/);
      assert.match(overlay.render(80).join("\n"), /esc cancel/);
      overlay.handleInput("esc");
      assert.deepEqual(calls, ["cancel"]);
      assert.equal(ownedController.signal.aborted, true);
      assert.match(overlay.render(80).join("\n"), /Cancelling deterministic Career Core action/);
      overlay.handleInput("esc");
      assert.deepEqual(calls, ["cancel"]);
      assert.equal(session.view, view);
      assert.equal(session.selected, selected);
      if (outcome === "cancel") finish(false);
      else if (outcome === "error") finish(new Error("synthetic failure"));
      else finish(true);
      await running;
      assert.equal(session.busy, false);
      assert.equal(session.view, view);
      assert.equal(session.selected, selected);
      assert.doesNotMatch(overlay.render(80).join("\n"), /Running deterministic Career Core action/);
    }
  }
});

test("empty overlay panes direct setup/library to add-root and Applications to workspace configuration or create", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-empty-")));
  try {
    const agentDir = path.join(temp, "agent");
    await prepareConfigDirectory(agentDir);
    const fake = makeFakePi();
    const context = makeContext(fake, { mode: "tui", persisted: false });
    const unbound = await buildCareerUiModel(agentDir, context.ctx);
    assert.match(unbound.setup.intro, /n to add a resume root/);
    assert.match(unbound.library.intro, /n to add a root/);
    assert.match(unbound.applications.intro, /Workspace \(8\).*m to configure/);
    assert.doesNotMatch(unbound.applications.intro, /press c to create/i);

    const library = path.join(temp, "library");
    const applications = path.join(temp, "applications");
    await mkdir(library);
    await mkdir(applications, { mode: 0o700 });
    await chmod(applications, 0o700);
    const rootId = "00000000-0000-4000-8000-000000000099";
    await privateJson(path.join(agentDir, "career", "config.v1.json"), {
      schema_version: "pi.career.config.v2",
      library_roots: [{ id: createHash("sha256").update(await realpath(library)).digest("hex"), path: await realpath(library), label: "Synthetic library" }],
      generated_variants_root: null,
      application_workspace: { root_id: rootId, root_path: applications },
    });
    await privateJson(path.join(applications, ".pi-career-applications.json"), {
      schema_version: "pi.career.application_root.v1", kind: "application_workspace_root", root_id: rootId,
      created_at: "2026-08-01T00:00:00.000Z",
    });
    const configured = await buildCareerUiModel(agentDir, context.ctx);
    assert.match(configured.applications.intro, /Press c to create/);
    assert.match(configured.applications.intro, /does not attach/);
    assert.equal(configured.applications.items.length, 0);
    assert.equal(fake.entries.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("TUI career commands open overlay views without Core, provider, or session append", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-")));
  try {
    const { fake, calls } = await register(temp);
    for (const [command, view] of Object.entries(CAREER_UI_COMMAND_VIEWS)) {
      await openAndClose(fake, command, view);
    }
    assert.equal(calls.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("RPC career commands render the same view model through select dialogs", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-rpc-")));
  try {
    const { fake, calls } = await register(temp);
    for (const command of Object.keys(CAREER_UI_COMMAND_VIEWS)) {
      const rpc = makeContext(fake, {
        mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close],
      });
      const before = fake.entries.length;
      await fake.commands.get(command).handler("", rpc.ctx);
      assert.equal(rpc.customCalls, 0);
      assert.equal(fake.entries.length, before);
    }
    assert.equal(calls.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Resume library Analyze pins the highlighted Original and rejects post-confirm drift without a chooser", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-library-selected-analyze-")));
  try {
    const agentDir = path.join(temp, "agent");
    const library = path.join(temp, "library");
    await prepareConfigDirectory(agentDir);
    await mkdir(library, { mode: 0o700 });
    await writeFile(path.join(library, "alpha.md"), "# Alpha\n\nAlpha body\n", { mode: 0o600 });
    await writeFile(path.join(library, "beta.md"), "# Beta\n\nBeta selected body\n", { mode: 0o600 });
    await writeConfig(agentDir, await addLibraryRoot(emptyConfig(), library, "Synthetic library"), uuidSequence());
    const fake = makeFakePi();
    const calls = [];
    registerCareerCommands(fake.api, {
      agentDir,
      uuid: uuidSequence(),
      now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        calls.push(invocation);
        return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
      },
    });
    const beta = (await scanLibrary(await loadConfig(agentDir))).records.find((record) => record.label === "Beta");
    assert.ok(beta);
    const betaOption = buildCareerLibraryPane(await scanLibrary(await loadConfig(agentDir))).items.find((entry) => entry.id === beta.id).label;
    const titles = [];
    const selected = makeContext(fake, { mode: "rpc", persisted: false, confirms: [true] });
    let opened = false;
    let analyzed = false;
    selected.ctx.ui.select = async (title, options) => {
      titles.push(title);
      assert.notEqual(title, "Choose an original resume");
      if (!opened) { opened = true; assert.ok(options.includes(betaOption)); return betaOption; }
      if (!analyzed && options.includes(CAREER_UI_RPC_ACTIONS.analyze)) {
        analyzed = true;
        return CAREER_UI_RPC_ACTIONS.analyze;
      }
      return CAREER_UI_RPC_ACTIONS.close;
    };
    await fake.commands.get("career-library").handler("", selected.ctx);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0].inputJson).text, beta.text);
    assert.equal(titles.includes("Choose an original resume"), false);

    const drifted = makeContext(fake, { mode: "rpc", persisted: false });
    let driftOpened = false;
    let driftAttempted = false;
    drifted.ctx.ui.select = async (title, options) => {
      assert.notEqual(title, "Choose an original resume");
      if (!driftOpened) { driftOpened = true; return options.find((option) => option.includes("Beta")); }
      if (!driftAttempted && options.includes(CAREER_UI_RPC_ACTIONS.analyze)) {
        driftAttempted = true;
        return CAREER_UI_RPC_ACTIONS.analyze;
      }
      return CAREER_UI_RPC_ACTIONS.close;
    };
    drifted.ctx.ui.confirm = async () => {
      await writeFile(path.join(library, "beta.md"), "# Beta\n\nChanged after confirmation\n", { mode: 0o600 });
      return true;
    };
    await fake.commands.get("career-library").handler("", drifted.ctx);
    assert.equal(calls.length, 1);
    assert.ok(drifted.notifications.some(({ type }) => type === "error"));
    assert.doesNotMatch(JSON.stringify(drifted.notifications), /Changed after confirmation|beta\.md/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateJson(file, value) {
  await writeFile(file, canonical(value), { mode: 0o600 });
  await chmod(file, 0o600);
}

async function writeApplication(root, {
  applicationId, company, role, status, createdAt, workspaceCreatedAt, rootId, rootCreatedAt,
}) {
  const directory = path.join(root, `${company.toLowerCase().replaceAll(" ", "-")}--${role.toLowerCase().replaceAll(" ", "-")}--${applicationId}`);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: applicationId,
    root_id: rootId,
    application_created_at: createdAt,
    workspace_created_at: workspaceCreatedAt,
  });
  await writeFile(path.join(directory, "application.json"), manifest, { mode: 0o600 });
  await chmod(path.join(directory, "application.json"), 0o600);
  await privateJson(path.join(directory, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: applicationId,
    company_label: company,
    role_label: role,
    created_at: createdAt,
  });
  await privateJson(path.join(directory, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state",
    kind: "application_state_revision",
    application_id: applicationId,
    sequence: 1,
    parent_sha256: hash(manifest),
    status,
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    cover_letter_artifact: null,
    updated_at: workspaceCreatedAt,
  });
}

test("overlay lists let users move through applications and resumes without attaching", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-nav-")));
  try {
    const agentDir = path.join(temp, "agent");
    const library = path.join(temp, "library");
    const root = path.join(temp, "applications");
    await prepareConfigDirectory(agentDir);
    await mkdir(library);
    await writeFile(path.join(library, "alpha.md"), "# Synthetic Alpha\n");
    await writeFile(path.join(library, "beta.md"), "# Synthetic Beta\n");
    const libraryPath = await realpath(library);
    const libraryRootId = createHash("sha256").update(libraryPath).digest("hex");
    await mkdir(root, { mode: 0o700 });
    await chmod(root, 0o700);
    const rootId = "00000000-0000-4000-8000-000000000099";
    await privateJson(path.join(agentDir, "career", "config.v1.json"), {
      schema_version: "pi.career.config.v2",
      library_roots: [{ id: libraryRootId, path: libraryPath, label: "Synthetic library" }],
      generated_variants_root: null,
      application_workspace: { root_id: rootId, root_path: root },
    });
    await privateJson(path.join(root, ".pi-career-applications.json"), {
      schema_version: "pi.career.application_root.v1",
      kind: "application_workspace_root",
      root_id: rootId,
      created_at: "2026-08-01T00:00:00.000Z",
    });
    await writeApplication(root, {
      applicationId: "00000000-0000-4000-8000-000000000077",
      company: "Synthetic Company",
      role: "Synthetic Engineer",
      status: "preparing",
      createdAt: "2026-08-02T00:00:00.000Z",
      workspaceCreatedAt: "2026-08-03T00:00:00.000Z",
      rootId,
    });
    await writeApplication(root, {
      applicationId: "00000000-0000-4000-8000-000000000066",
      company: "Other Company",
      role: "Other Role",
      status: "applied",
      createdAt: "2026-08-04T00:00:00.000Z",
      workspaceCreatedAt: "2026-08-05T00:00:00.000Z",
      rootId,
    });
    const fake = makeFakePi();
    const calls = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        calls.push(invocation);
        throw new Error("overlay navigation must not invoke Career Core");
      },
    });
    const components = [];
    const before = fake.entries.length;
    const context = makeContext(fake, {
      mode: "tui", persisted: false, components,
      keybindings: {
        matches(data, action) {
          return action === "tui.select.cancel" && data === "esc" ||
            action === "tui.select.down" && data === "down" ||
            action === "tui.select.confirm" && data === "enter";
        },
      },
    });
    const pending = fake.commands.get("career").handler("", context.ctx);
    const deadline = Date.now() + 2_000;
    while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    const overlay = components[0];
    assert.equal(overlay.currentView, "applications");
    assert.equal(overlay.showingDetail, false);
    overlay.handleInput("down");
    assert.match(overlay.currentItem.label, /Other Company|Synthetic Company/);
    overlay.handleInput("enter");
    assert.equal(overlay.showingDetail, true);
    assert.match(overlay.render(80).join("\n"), /does not attach/);
    overlay.handleInput("esc");
    assert.equal(overlay.showingDetail, false);
    overlay.handleInput("2");
    assert.equal(overlay.currentView, "library");
    overlay.handleInput("down");
    overlay.handleInput("enter");
    assert.equal(overlay.showingDetail, true);
    assert.match(overlay.currentItem.label, /Synthetic Alpha|Synthetic Beta/);
    const resumeDetail = overlay.render(80).join("\n");
    assert.match(resumeDetail, /Authority: Original/);
    assert.match(resumeDetail, /Format: markdown/);
    assert.match(resumeDetail, /Availability: Available — indexed locally/);
    overlay.handleInput("esc");
    overlay.handleInput("esc");
    await pending;
    assert.equal(calls.length, 0);
    assert.equal(fake.entries.length, before);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("overlay a attaches a selected application only after confirmation", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-attach-")));
  try {
    const agentDir = path.join(temp, "agent");
    const root = path.join(temp, "applications");
    await prepareConfigDirectory(agentDir);
    await mkdir(root, { mode: 0o700 });
    await chmod(root, 0o700);
    const rootId = "00000000-0000-4000-8000-000000000099";
    await privateJson(path.join(agentDir, "career", "config.v1.json"), {
      schema_version: "pi.career.config.v2",
      library_roots: [],
      generated_variants_root: null,
      application_workspace: { root_id: rootId, root_path: root },
    });
    await privateJson(path.join(root, ".pi-career-applications.json"), {
      schema_version: "pi.career.application_root.v1",
      kind: "application_workspace_root",
      root_id: rootId,
      created_at: "2026-08-01T00:00:00.000Z",
    });
    await writeApplication(root, {
      applicationId: "00000000-0000-4000-8000-000000000077",
      company: "Synthetic Company",
      role: "Synthetic Engineer",
      status: "preparing",
      createdAt: "2026-08-02T00:00:00.000Z",
      workspaceCreatedAt: "2026-08-03T00:00:00.000Z",
      rootId,
    });
    const fake = makeFakePi();
    const calls = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        calls.push(invocation);
        throw new Error("overlay attach must not invoke Career Core");
      },
    });
    const components = [];
    const cancelled = makeContext(fake, {
      mode: "tui", persisted: false, components, confirms: [false],
      keybindings: { matches(data, action) { return action === "tui.select.cancel" && data === "esc"; } },
    });
    const pendingCancel = fake.commands.get("career").handler("", cancelled.ctx);
    const deadline = Date.now() + 2_000;
    while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    components[0].handleInput("a");
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.entries.length, 0);
    components[0].handleInput("esc");
    await pendingCancel;

    const attachedComponents = [];
    const attached = makeContext(fake, {
      mode: "tui", persisted: false, components: attachedComponents, confirms: [true],
      keybindings: { matches(data, action) { return action === "tui.select.cancel" && data === "esc"; } },
    });
    const pendingAttach = fake.commands.get("career").handler("", attached.ctx);
    const attachDeadline = Date.now() + 2_000;
    while (attachedComponents.length === 0 && Date.now() < attachDeadline) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    attachedComponents[0].handleInput("a");
    const settle = Date.now() + 2_000;
    while (fake.entries.length === 0 && Date.now() < settle) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.entries.length, 1);
    assert.equal(fake.entries[0].customType, "career.application_attachment");
    assert.equal(fake.entries[0].data.kind, "application_attachment");
    assert.doesNotMatch(JSON.stringify(fake.entries[0].data), /Synthetic|applications/);
    attachedComponents[0].handleInput("esc");
    await pendingAttach;
    assert.equal(calls.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

async function catalogFixture(prefix) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  const agentDir = path.join(temp, "agent");
  const library = path.join(temp, "library");
  const root = path.join(temp, "applications");
  await prepareConfigDirectory(agentDir);
  await mkdir(library);
  await writeFile(path.join(library, "alpha.md"), "# Synthetic Alpha\n");
  const libraryPath = await realpath(library);
  const libraryRootId = createHash("sha256").update(libraryPath).digest("hex");
  await mkdir(root, { mode: 0o700 });
  await chmod(root, 0o700);
  const rootId = "00000000-0000-4000-8000-000000000099";
  await privateJson(path.join(agentDir, "career", "config.v1.json"), {
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: libraryRootId, path: libraryPath, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: rootId, root_path: root },
  });
  await privateJson(path.join(root, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: rootId,
    created_at: "2026-08-01T00:00:00.000Z",
  });
  await writeApplication(root, {
    applicationId: "00000000-0000-4000-8000-000000000077",
    company: "Synthetic Company",
    role: "Synthetic Engineer",
    status: "preparing",
    createdAt: "2026-08-02T00:00:00.000Z",
    workspaceCreatedAt: "2026-08-03T00:00:00.000Z",
    rootId,
  });
  const fake = makeFakePi();
  const calls = [];
  registerCareerCommands(fake.api, {
    agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
    invoke: async (invocation) => {
      calls.push(invocation);
      throw new Error("Career UI must not invoke Career Core");
    },
  });
  return { temp, agentDir, library, root, fake, calls };
}

// Snapshot the disposable private tree, including file contents and names, so
// read-only navigation cannot pass merely by leaving the session untouched.
async function treeBytes(directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const location = path.join(directory, entry.name);
    result.push([entry.name, entry.isDirectory() ? await treeBytes(location) : (await readFile(location)).toString("base64")]);
  }
  return result;
}

test("P3-26/P3-27/P3-34 unattached browse and open retain authority and hide private list bytes", async () => {
  const value = await catalogFixture("pi-career-ui-private-browse-");
  try {
    const privateBody = "SYNTHETIC_PRIVATE_DOCUMENT_BODY_26_27_34";
    await writeFile(path.join(value.library, "alpha.md"), `# Synthetic Alpha\n${privateBody}\n`);
    const before = await treeBytes(value.temp);
    const authority = reconstructWorkflowState(value.fake.entries);
    const sent = [];
    let appends = 0;
    const appendEntry = value.fake.api.appendEntry;
    value.fake.api.appendEntry = (...args) => { appends += 1; return appendEntry(...args); };
    value.fake.api.sendMessage = (...args) => sent.push(args);
    value.fake.api.sendUserMessage = (...args) => sent.push(args);
    const rpc = makeContext(value.fake, {
      mode: "rpc", persisted: false,
    });
    const lists = [];
    // Record the actual dialog titles as well as selectable list rows.
    const choices = ["Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3", CAREER_UI_RPC_ACTIONS.back,
      CAREER_UI_RPC_ACTIONS.switchView, CAREER_UI_VIEW_LABELS.library, CAREER_UI_RPC_ACTIONS.close];
    rpc.ctx.ui.select = async (title, options) => { lists.push([title, ...options]); return choices.shift(); };
    await value.fake.commands.get("career").handler("", rpc.ctx);
    assert.ok(lists.some((options) => options.some((option) => option.includes("Synthetic Company"))));
    assert.ok(lists.some((options) => options[0].includes("Opening does not attach")));
    assert.ok(lists.some((options) => options.some((option) => option.includes("Synthetic Alpha"))));
    for (const projection of [lists, rpc.notifications]) {
      const text = JSON.stringify(projection);
      assert.ok(!text.includes(value.temp));
      assert.ok(!text.includes(privateBody));
    }
    assert.equal(appends, 0);
    assert.deepEqual(value.fake.entries, []);
    assert.deepEqual(reconstructWorkflowState(value.fake.entries), authority);
    assert.deepEqual(await treeBytes(value.temp), before);
    assert.deepEqual(sent, []);
    assert.deepEqual(value.calls, []);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-46 one Applications view distinguishes a session-only application from persistent records without changing authority", async () => {
  const value = await catalogFixture("pi-career-ui-combined-46-");
  const session = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-ui-session-46-")));
  try {
    const source = await register(session);
    const created = makeContext(source.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: ["Session Company", "Session Engineer"], confirms: [true],
    });
    await source.fake.commands.get("career").handler("", created.ctx);
    value.fake.entries.push(...structuredClone(source.fake.entries));
    const before = await treeBytes(value.temp);
    const sends = [];
    value.fake.api.sendUserMessage = (...args) => sends.push(args);
    const entries = structuredClone(value.fake.entries);
    const authority = reconstructWorkflowState(value.fake.entries).application;
    const sessionLabel = "Current session · Not persisted — Session Company — Session Engineer — preparing";
    const persistentLabel = "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3";
    const dialogs = [];
    const rpc = makeContext(value.fake, { mode: "rpc", persisted: false });
    rpc.ctx.sendUserMessage = (...args) => sends.push(args);
    rpc.ctx.sendMessage = (...args) => sends.push(args);
    rpc.ctx.ui.select = async (title, options) => {
      dialogs.push([title, ...options]);
      return [sessionLabel, CAREER_UI_RPC_ACTIONS.back, persistentLabel,
        CAREER_UI_RPC_ACTIONS.back, CAREER_UI_RPC_ACTIONS.switchView,
        CAREER_UI_VIEW_LABELS.library, CAREER_UI_RPC_ACTIONS.rescan,
        CAREER_UI_RPC_ACTIONS.switchView, CAREER_UI_VIEW_LABELS.applications,
        sessionLabel, CAREER_UI_RPC_ACTIONS.close][dialogs.length - 1];
    };
    await value.fake.commands.get("career").handler("", rpc.ctx);
    const rendered = JSON.stringify(dialogs);
    assert.match(rendered, /Current session · Not persisted.*Session Company/);
    assert.match(rendered, /Synthetic Company.*Synthetic Engineer.*Classification:/);
    assert.match(rendered, /Session Company.*Session Engineer.*Opening does not attach/);
    const applicationDialogs = dialogs.filter(([title]) => title.startsWith("Career • Applications"));
    assert.ok(applicationDialogs.length >= 2);
    assert.deepEqual(applicationDialogs[0].slice(1, 3), applicationDialogs.at(-1).slice(1, 3));
    assert.doesNotMatch(rendered, /applications[/\\]|alpha\.md|# Synthetic Alpha|\/synthetic\/session/);

    const components = [];
    const tui = makeContext(value.fake, {
      mode: "tui", persisted: false, components,
      keybindings: { matches(data, action) {
        return (data === "esc" && action === "tui.select.cancel") ||
          (data === "enter" && action === "tui.select.confirm") ||
          (data === "down" && action === "tui.select.down");
      } },
    });
    tui.ctx.sendUserMessage = (...args) => sends.push(args);
    tui.ctx.sendMessage = (...args) => sends.push(args);
    const pending = value.fake.commands.get("career").handler("", tui.ctx);
    const deadline = Date.now() + 2_000;
    while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(components.length, 1);
    const overlay = components[0];
    assert.equal(overlay.currentItem.label, sessionLabel);
    assert.match(overlay.render(100).join("\n"), /Not persisted/);
    assert.doesNotMatch(overlay.render(100).join("\n"), /applications[/\\]|alpha\.md|# Synthetic Alpha|\/synthetic\/session/);
    overlay.handleInput("enter");
    assert.match(overlay.render(100).join("\n"), /Opening does not attach/);
    overlay.handleInput("esc");
    overlay.handleInput("down");
    assert.equal(overlay.currentItem.label, persistentLabel);
    overlay.handleInput("esc");
    await pending;
    assert.deepEqual(reconstructWorkflowState(value.fake.entries).application, authority);
    assert.deepEqual(value.fake.entries, entries);
    assert.deepEqual(await treeBytes(value.temp), before);
    assert.deepEqual(value.calls, []);
    assert.deepEqual(sends, []);
    assert.deepEqual(source.calls, []);
    assert.equal(rpc.customCalls, 0);
    assert.deepEqual(rpc.notifications, []);
    assert.deepEqual(tui.notifications, []);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
    await rm(session, { recursive: true, force: true });
  }
});

test("session overlay deduplicates persistent UUID and rejects conflicted or attached session identity", async () => {
  const value = await catalogFixture("pi-career-ui-identity-46-");
  const session = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-ui-identity-source-")));
  try {
    const source = await register(session);
    const created = makeContext(source.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: ["Session Company", "Session Engineer"], confirms: [true],
    });
    await source.fake.commands.get("career").handler("", created.ctx);
    const original = structuredClone(source.fake.entries);
    const ctx = makeContext(value.fake, { mode: "rpc", persisted: false }).ctx;
    const before = await treeBytes(value.temp);
    value.fake.entries.push(...structuredClone(original));
    let model = await buildCareerUiModel(value.agentDir, ctx);
    assert.equal(model.applications.items.length, 2);
    assert.equal(model.applications.items[0].pointer, undefined);
    assert.ok(model.applications.items[1].pointer);
    value.fake.entries[0].data.application_id = "00000000-0000-4000-8000-000000000077";
    model = await buildCareerUiModel(value.agentDir, ctx);
    assert.equal(model.applications.items.length, 1);
    assert.doesNotMatch(model.applications.items[0].label, /Not persisted/);
    value.fake.entries.splice(0, value.fake.entries.length, ...structuredClone(original));
    value.fake.entries[0].data.created_at = "invalid";
    model = await buildCareerUiModel(value.agentDir, ctx);
    assert.equal(model.applications.items.length, 1);
    value.fake.entries.splice(0, value.fake.entries.length, ...structuredClone(original));
    value.fake.entries[0].data.application_id = "00000000-0000-4000-8000-00000000000A";
    model = await buildCareerUiModel(value.agentDir, ctx);
    assert.equal(model.applications.items.length, 1);
    value.fake.entries.splice(0, value.fake.entries.length, ...structuredClone(original));
    value.fake.entries[0].data.application_id = "00000000-0000-4000-8000-000000000077";
    const attached = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3", CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", attached.ctx);
    assert.equal(value.fake.entries.at(-1)?.customType, "career.application_attachment");
    model = await buildCareerUiModel(value.agentDir, ctx);
    assert.equal(model.applications.items.length, 1);
    assert.doesNotMatch(model.applications.items[0].label, /Not persisted/);
    assert.deepEqual(await treeBytes(value.temp), before);
    assert.deepEqual(value.calls, []);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
    await rm(session, { recursive: true, force: true });
  }
});

test("RPC hierarchical dialogs browse, switch views, and open detail without attaching", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-nav-");
  try {
    const before = value.fake.entries.length;
    const rpc = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [
        "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3",
        CAREER_UI_RPC_ACTIONS.back,
        CAREER_UI_RPC_ACTIONS.switchView,
        CAREER_UI_VIEW_LABELS.library,
        CAREER_UI_RPC_ACTIONS.close,
      ],
    });
    await value.fake.commands.get("career").handler("", rpc.ctx);
    assert.equal(rpc.customCalls, 0);
    assert.equal(value.calls.length, 0);
    assert.equal(value.fake.entries.length, before);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("#58 attached package review reconstructs its next action after close/reopen without implicit progress", async () => {
  const value = await catalogFixture("pi-career-ui-journey-resume-");
  try {
    const appLabel = "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3";
    const beforeFiles = await treeBytes(value.temp);
    const cancelled = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [appLabel, CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [false],
    });
    await value.fake.commands.get("career").handler("", cancelled.ctx);
    assert.deepEqual(value.fake.entries, [], "cancelling attach leaves application authority untouched");
    assert.deepEqual(await treeBytes(value.temp), beforeFiles);

    const attached = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [appLabel, CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", attached.ctx);
    assert.equal(value.fake.entries.length, 1);
    assert.equal(value.fake.entries[0].customType, "career.application_attachment");

    // A fresh command context models closing/reopening the overlay; the package
    // recommendation must be rebuilt from persisted workspace/catalog + session authority.
    const reopened = await buildCareerUiModel(value.agentDir, makeContext(value.fake, { mode: "rpc", persisted: false }).ctx);
    assert.match(reopened.applications.intro, /Next action: open package review/);
    assert.match(reopened.workspace.intro, /Next action: add or refresh the job description/);
    const restarted = await buildCareerUiModel(value.agentDir, makeContext(value.fake, { mode: "rpc", persisted: false }).ctx);
    assert.equal(restarted.workspace.intro, reopened.workspace.intro);
    assert.equal(value.fake.entries.length, 1, "deriving the recommendation does not append session progress");
    assert.deepEqual(value.calls, [], "browsing and reopening do not call Career Core");
    assert.doesNotMatch(JSON.stringify([reopened, restarted]), /applications[/\\]|alpha\\.md|# Synthetic Alpha/);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("#58 black-box preparation journey cancels and resumes every explicit step across registered restarts", async () => {
  const value = await catalogFixture("pi-career-ui-integrated-journey-");
  try {
    let fake = value.fake;
    const ids = uuidSequence();
    let clock = Date.parse("2026-08-12T00:00:10.000Z");
    const nextNow = () => new Date(clock += 1_000);
    const coreCalls = [];
    const invoke = async (invocation) => {
      coreCalls.push(invocation.operation);
      if (invocation.operation === "analyze") {
        return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
      }
      if (invocation.operation === "normalize") {
        return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
      }
      return { operation: "job.match", json: JSON.stringify(matchResult()) };
    };
    const registerJourney = (target) => {
      registerCareerCommands(target.api, { agentDir: value.agentDir, uuid: ids, now: nextNow, invoke });
      target.api.sendMessage = () => assert.fail("journey actions must not submit a provider message");
      target.api.sendUserMessage = () => assert.fail("journey actions must not submit a provider message");
    };
    registerJourney(fake);
    const model = () => buildCareerUiModel(
      value.agentDir,
      makeContext(fake, { mode: "rpc", persisted: true }).ctx,
    );
    const restart = async (expected) => {
      const entries = structuredClone(fake.entries);
      const restarted = makeFakePi();
      restarted.entries.push(...entries);
      registerJourney(restarted);
      fake = restarted;
      const rebuilt = await model();
      assert.match(rebuilt.workspace.intro, expected);
      assert.deepEqual(fake.entries, entries, "restart-like reconstruction does not append progress");
      return rebuilt;
    };
    const unchangedAfter = async (run) => {
      const beforeTree = await treeBytes(value.temp);
      const beforeEntries = structuredClone(fake.entries);
      await run();
      assert.deepEqual(await treeBytes(value.temp), beforeTree);
      assert.deepEqual(fake.entries, beforeEntries);
    };

    const applicationRow = "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3";
    await unchangedAfter(() => fake.commands.get("career").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [applicationRow, CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [false],
    }).ctx));
    await fake.commands.get("career").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [applicationRow, CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    }).ctx);
    await restart(/add or refresh the job description/);

    const vacancy = "Synthetic platform role\nEvidence-based requirements";
    await unchangedAfter(() => fake.commands.get("career-vacancy").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
      editors: [vacancy, (_title, preview) => preview], confirms: [false],
    }).ctx));
    await fake.commands.get("career-vacancy").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
      editors: [vacancy, (_title, preview) => preview], confirms: [true],
    }).ctx);
    await restart(/select an eligible Original/);

    const original = (await scanLibrary(await loadConfig(value.agentDir))).records[0];
    const originalOption = selectedOriginalOptions([original])[0].option;
    await unchangedAfter(() => fake.commands.get("career-analyze").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.selectOriginal, originalOption, CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview], confirms: [false],
    }).ctx));
    await fake.commands.get("career-analyze").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.selectOriginal, originalOption, CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview], confirms: [true],
    }).ctx);
    await restart(/analyze the selected Original/);

    await unchangedAfter(() => fake.commands.get("career-analyze").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, CAREER_UI_RPC_ACTIONS.close], confirms: [false],
    }).ctx));
    const analyzeSelects = [];
    const analyzeContext = makeContext(fake, {
      mode: "rpc", persisted: true, selectCalls: analyzeSelects,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, "Continue in this session", CAREER_UI_RPC_ACTIONS.close], confirms: [true],
    });
    await fake.commands.get("career-analyze").handler("", analyzeContext.ctx);
    const analysisCards = fake.entries.filter((entry) => entry.data?.kind === "result_card" && entry.data.workflow === "analyze");
    assert.equal(analysisCards.length, 1, JSON.stringify({ notifications: analyzeContext.notifications, selects: analyzeSelects }));
    assert.equal(analysisCards[0].data.application_id, "00000000-0000-4000-8000-000000000077");
    assert.equal(analysisCards[0].data.resume_id, original.id);
    assert.equal(analysisCards[0].data.input_digests.resume_text_sha256, original.text_sha256);
    const analyzedModel = await model();
    assert.match(analyzedModel.workspace.intro, /analyze match/, JSON.stringify(analysisCards[0].data));
    await restart(/analyze match/);

    await unchangedAfter(() => fake.commands.get("career-match").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.match, CAREER_UI_RPC_ACTIONS.close], confirms: [false],
    }).ctx));
    await fake.commands.get("career-match").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.match, CAREER_UI_RPC_ACTIONS.close], confirms: [true],
    }).ctx);
    await restart(/user-authored cover letter/);

    const coverText = "# Synthetic cover letter\n\nUser-authored evidence only.\n";
    const coverWorkflow = () => new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir, uuid: ids, now: nextNow,
    });
    await unchangedAfter(() => coverWorkflow().run("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: ["Write or revise user-authored cover letter", "Markdown (.md)"],
      editors: [coverText, (_title, preview) => preview], confirms: [false],
    }).ctx));
    await coverWorkflow().run("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: ["Write or revise user-authored cover letter", "Markdown (.md)"],
      editors: [coverText, (_title, preview) => preview, (_title, preview) => preview],
      confirms: [true, true],
    }).ctx);
    let rebuilt = await restart(/review the complete package.*Ready is derived/);
    assert.ok(rebuilt.applications.items.some(({ detail }) => /Ready 3\/3/.test(detail)));

    const applicationName = (await readdir(value.root)).find((entry) => !entry.startsWith("."));
    assert.ok(applicationName);
    const directory = path.join(value.root, applicationName);
    const stateName = (await readdir(directory)).filter((name) => name.startsWith(".pi-career-state-")).sort().at(-1);
    const head = JSON.parse(await readFile(path.join(directory, stateName), "utf8"));
    const coverPath = path.join(directory, head.cover_letter_artifact.relative_path);
    const coverBytes = await readFile(coverPath);
    await writeFile(coverPath, `${coverText}drifted\n`, { mode: 0o600 });
    rebuilt = await model();
    assert.equal(rebuilt.applications.items.some(({ detail }) => /Ready 3\/3/.test(detail)), false);
    assert.doesNotMatch(rebuilt.workspace.intro, /review the complete package/);
    await writeFile(coverPath, coverBytes, { mode: 0o600 });
    await restart(/review the complete package.*Ready is derived/);

    await unchangedAfter(() => fake.commands.get("career").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.updateStatus, undefined, CAREER_UI_RPC_ACTIONS.close],
    }).ctx));
    await fake.commands.get("career").handler("", makeContext(fake, {
      mode: "rpc", persisted: true,
      selects: [CAREER_UI_RPC_ACTIONS.updateStatus, "Applied", CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview], confirms: [true],
    }).ctx);
    rebuilt = await restart(/review the complete package.*Ready is derived/);
    assert.ok(rebuilt.applications.items.some(({ label, detail }) => /Applied/.test(label + detail) && /Ready 3\/3/.test(detail)));
    assert.ok(coreCalls.includes("analyze"));
    assert.equal(coreCalls.filter((operation) => operation === "match").length, 1, JSON.stringify(coreCalls));
    assert.equal(fake.entries.filter((entry) => entry.data?.kind === "result_card" && entry.data.workflow === "analyze").length, 1);
    assert.equal(fake.entries.filter((entry) => entry.data?.kind === "result_card" && entry.data.workflow === "match").length, 1);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("RPC attach uses the same confirmation-gated action as the overlay", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-attach-");
  try {
    const cancelled = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [
        "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3",
        CAREER_UI_RPC_ACTIONS.attach,
        CAREER_UI_RPC_ACTIONS.close,
      ],
      confirms: [false],
    });
    await value.fake.commands.get("career-application").handler("", cancelled.ctx);
    assert.equal(value.fake.entries.length, 0);
    assert.equal(cancelled.customCalls, 0);

    const attached = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [
        "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3",
        CAREER_UI_RPC_ACTIONS.attach,
        CAREER_UI_RPC_ACTIONS.close,
      ],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", attached.ctx);
    assert.equal(value.fake.entries.length, 1);
    assert.equal(value.fake.entries[0].customType, "career.application_attachment");
    assert.equal(value.fake.entries[0].data.kind, "application_attachment");
    assert.doesNotMatch(JSON.stringify(value.fake.entries[0].data), /Synthetic|applications/);
    assert.equal(value.calls.length, 0);
    assert.equal(attached.customCalls, 0);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("overlay n adds a library root only after confirmation", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-add-root-")));
  try {
    const rootDir = path.join(temp, "resumes");
    await mkdir(rootDir);
    await writeFile(path.join(rootDir, "alpha.md"), "# Synthetic Alpha\n");
    const { fake, calls } = await register(temp);
    const agentDir = path.join(temp, "agent");
    const cancelled = [];
    const cancelCtx = makeContext(fake, {
      mode: "tui", persisted: false, components: cancelled, inputs: [rootDir], confirms: [false],
      keybindings: { matches(data, action) { return action === "tui.select.cancel" && data === "esc"; } },
    });
    const pendingCancel = fake.commands.get("career-setup").handler("", cancelCtx.ctx);
    const deadline = Date.now() + 2_000;
    while (cancelled.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    cancelled[0].handleInput("n");
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await loadConfig(agentDir)).library_roots.length, 0);
    cancelled[0].handleInput("esc");
    await pendingCancel;

    const added = [];
    const addCtx = makeContext(fake, {
      mode: "tui", persisted: false, components: added, inputs: [rootDir], confirms: [true],
      keybindings: { matches(data, action) { return action === "tui.select.cancel" && data === "esc"; } },
    });
    const pendingAdd = fake.commands.get("career-setup").handler("", addCtx.ctx);
    const addDeadline = Date.now() + 2_000;
    while (added.length === 0 && Date.now() < addDeadline) await new Promise((resolve) => setImmediate(resolve));
    added[0].handleInput("n");
    const settle = Date.now() + 2_000;
    let rendered = "";
    while (Date.now() < settle) {
      rendered = added[0].render(80).join("\n");
      if (/\b1 root/.test(rendered)) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.match(rendered, /\b1 root/);
    assert.equal((await loadConfig(agentDir)).library_roots.length, 1);
    assert.doesNotMatch(JSON.stringify(addCtx.notifications), /alpha\.md/);
    added[0].handleInput("esc");
    await pendingAdd;
    assert.equal(calls.length, 0);
    assert.equal(fake.entries.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("RPC add root uses the same confirmation-gated action as the overlay", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-rpc-add-root-")));
  try {
    const rootDir = path.join(temp, "resumes");
    await mkdir(rootDir);
    await writeFile(path.join(rootDir, "alpha.md"), "# Synthetic Alpha\n");
    const { fake, calls } = await register(temp);
    const agentDir = path.join(temp, "agent");
    const cancelled = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
      inputs: [rootDir], confirms: [false],
    });
    await fake.commands.get("career-library").handler("", cancelled.ctx);
    assert.equal((await loadConfig(agentDir)).library_roots.length, 0);
    assert.equal(cancelled.customCalls, 0);

    const added = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
      inputs: [rootDir], confirms: [true],
    });
    await fake.commands.get("career-setup").handler("", added.ctx);
    assert.equal((await loadConfig(agentDir)).library_roots.length, 1);
    assert.ok(added.notifications.some(({ message }) => message.includes("Resume root added")));
    assert.doesNotMatch(JSON.stringify(added.notifications), /alpha\.md/);
    assert.equal(added.customCalls, 0);
    assert.equal(calls.length, 0);
    assert.equal(fake.entries.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("TUI overlay stays within width and keeps selected/attachable marks without private paths", async () => {
  const value = await catalogFixture("pi-career-overlay-visual-");
  try {
    const components = [];
    const context = makeContext(value.fake, {
      mode: "tui", persisted: false, components,
      keybindings: { matches(data, action) { return action === "tui.select.cancel" && data === "esc"; } },
    });
    const pending = value.fake.commands.get("career").handler("", context.ctx);
    const deadline = Date.now() + 2_000;
    while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    const overlay = components[0];
    for (const width of [32, 48, 80]) {
      const lines = overlay.render(width);
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      const rendered = lines.join("\n");
      assert.match(rendered, /◆  Career/);
      assert.match(rendered, /▸ ◎/);
      assert.doesNotMatch(rendered, /agent|applications[/\\]|resume\.md/);
    }
    overlay.handleInput("esc");
    await pending;
    assert.equal(value.calls.length, 0);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("RPC overlay binds an attached selected original without calling Core", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-original-");
  try {
    const attached = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [
        "Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3",
        CAREER_UI_RPC_ACTIONS.attach,
        CAREER_UI_RPC_ACTIONS.close,
      ],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", attached.ctx);

    for (const command of ["career-library", "career-analyze", "career-match"]) {
      let firstOptions;
      const opened = makeContext(value.fake, { mode: "rpc", persisted: false });
      opened.ctx.ui.select = async (_title, options) => {
        firstOptions ??= options;
        return CAREER_UI_RPC_ACTIONS.close;
      };
      await value.fake.commands.get(command).handler("", opened.ctx);
      assert.ok(firstOptions.includes(CAREER_UI_RPC_ACTIONS.selectOriginal));
    }

    for (const [command, action] of [
      ["career-analyze", CAREER_UI_RPC_ACTIONS.analyze],
      ["career-match", CAREER_UI_RPC_ACTIONS.match],
    ]) {
      const blocked = makeContext(value.fake, {
        mode: "rpc", persisted: false,
        selects: [action, CAREER_UI_RPC_ACTIONS.close],
      });
      await value.fake.commands.get(command).handler("", blocked.ctx);
      assert.ok(blocked.notifications.some(({ message }) => message.includes("Select an original resume with o")));
    }
    assert.equal(value.calls.length, 0);

    const config = await loadConfig(value.agentDir);
    const original = (await scanLibrary(config)).records[0];
    assert.ok(original);
    const option = selectedOriginalOptions([original])[0].option;
    const bound = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.selectOriginal, option, CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview],
      confirms: [true],
    });
    await value.fake.commands.get("career-analyze").handler("", bound.ctx);

    const applicationName = (await readdir(value.root)).find((entry) => !entry.startsWith("."));
    assert.ok(applicationName);
    const selectedState = JSON.parse(await readFile(
      path.join(value.root, applicationName, ".pi-career-state-000002.json"),
      "utf8",
    ));
    assert.equal(selectedState.selected_original.document_id, original.id);
    assert.equal(selectedState.selected_original.library_root_id, original.root_id);
    assert.equal(selectedState.selected_original.text_sha256, original.text_sha256);
    assert.equal(selectedState.selected_original.format, "markdown");
    assert.equal(value.calls.length, 0);
    assert.ok(bound.notifications.some(({ message }) => message.includes("no original bytes were copied or changed")));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("attached original and effective original need explicit RPC preview after authority validation", async () => {
  const value = await catalogFixture("pi-career-attached-preview-");
  try {
    registerCareerCommands(value.fake.api, {
      agentDir: value.agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        value.calls.push(invocation);
        if (invocation.operation === "normalize") return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        throw new Error("preview must not call Core");
      },
    });
    await value.fake.commands.get("career").handler("", makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3", CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    }).ctx);
    const original = (await scanLibrary(await loadConfig(value.agentDir))).records[0];
    await value.fake.commands.get("career-analyze").handler("", makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.selectOriginal, selectedOriginalOptions([original])[0].option, CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview], confirms: [true],
    }).ctx);
    const entries = JSON.stringify(value.fake.entries);
    const calls = value.calls.length;
    for (const [command, body, label] of [
      ["career-analyze", original.text, "Selected original"],
      ["career-match", original.text, "Effective Resume (original)"],
    ]) {
      const dialogs = [];
      const rpc = makeContext(value.fake, { mode: "rpc", persisted: false });
      rpc.ctx.sendMessage = () => assert.fail("preview cannot send");
      rpc.ctx.sendUserMessage = () => assert.fail("preview cannot send");
      const choices = [null, CAREER_UI_RPC_ACTIONS.preview, CAREER_UI_RPC_ACTIONS.back, CAREER_UI_RPC_ACTIONS.close];
      rpc.ctx.ui.select = async (title, options) => {
        dialogs.push([title, options]);
        const next = choices.shift();
        return next === null ? options.find((option) => option.includes(original.label)) : next;
      };
      await value.fake.commands.get(command).handler("", rpc.ctx);
      assert.equal(dialogs.length, 4);
      assert.ok(dialogs[1][0].includes(label));
      assert.ok(dialogs[1][1].includes(CAREER_UI_RPC_ACTIONS.preview));
      assert.equal(dialogs[2][0].split("\n").slice(1).join("\n"), body);
      assert.ok(dialogs.filter((_, index) => index !== 2).every((dialog) => !JSON.stringify(dialog).includes("Built reliable")));
      assert.equal(rpc.customCalls, 0);
      assert.deepEqual(rpc.notifications, []);
    }
    assert.equal(value.calls.length, calls);
    assert.equal(JSON.stringify(value.fake.entries), entries);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("attached vacancy preview reads only the exact revalidated workspace text", async () => {
  const value = await catalogFixture("pi-career-preview-vacancy-");
  try {
    await value.fake.commands.get("career").handler("", makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3", CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    }).ctx);
    const vacancyText = "Synthetic vacancy PRIVATE_VACANCY_BODY";
    const workspace = new ApplicationWorkspaceWorkflow({ agentDir: value.agentDir,
      uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z") });
    const write = makeContext(value.fake, { mode: "rpc", persisted: false,
      editors: [(_title, preview) => preview], confirms: [true] });
    assert.equal(await workspace.writeAttachedVacancy(write.ctx, vacancyText), "written");
    const beforeEntries = JSON.stringify(value.fake.entries);
    const calls = value.calls.length;
    const dialogs = [];
    const rpc = makeContext(value.fake, { mode: "rpc", persisted: false });
    rpc.ctx.sendMessage = () => assert.fail("preview cannot send");
    rpc.ctx.sendUserMessage = () => assert.fail("preview cannot send");
    const choices = [null, CAREER_UI_RPC_ACTIONS.preview, CAREER_UI_RPC_ACTIONS.back, CAREER_UI_RPC_ACTIONS.close];
    rpc.ctx.ui.select = async (title, options) => {
      dialogs.push([title, options]);
      const next = choices.shift();
      return next === null ? options.find((option) => option === "Current job description") : next;
    };
    await value.fake.commands.get("career-vacancy").handler("", rpc.ctx);
    assert.equal(dialogs.length, 4);
    assert.ok(dialogs[1][1].includes(CAREER_UI_RPC_ACTIONS.preview));
    assert.ok(dialogs.filter((_, index) => index !== 2).every((dialog) => !JSON.stringify(dialog).includes("PRIVATE_VACANCY_BODY")));
    assert.equal(dialogs[2][0].split("\n").slice(1).join("\n"), vacancyText);
    assert.equal(value.calls.length, calls);
    assert.equal(JSON.stringify(value.fake.entries), beforeEntries);
    assert.deepEqual(rpc.notifications, []);
    const model = await buildCareerUiModel(value.agentDir, rpc.ctx);
    const session = new CareerUiSession("vacancy", model, {}, undefined, careerPreviewLoader(value.agentDir, rpc.ctx));
    assert.equal(session.open(), true);
    const applicationName = (await readdir(value.root)).find((entry) => !entry.startsWith("."));
    assert.ok(applicationName);
    const vacancyFile = path.join(value.root, applicationName, "vacancy-000002.md");
    await writeFile(vacancyFile, `${vacancyText} changed`);
    assert.equal(await session.openPreview(), false);
    assert.equal(session.preview, undefined);
    assert.match(session.previewError, /unavailable or changed/);
    assert.doesNotMatch(session.previewError, /PRIVATE_VACANCY_BODY/);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("RPC attached analyze refuses a changed original before Core stdin", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-drift-");
  try {
    const attached = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3", CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", attached.ctx);
    const config = await loadConfig(value.agentDir);
    const original = (await scanLibrary(config)).records[0];
    const bound = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.selectOriginal, selectedOriginalOptions([original])[0].option, CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    await value.fake.commands.get("career-analyze").handler("", bound.ctx);
    const request = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, CAREER_UI_RPC_ACTIONS.close],
    });
    let confirmed = false;
    request.ctx.ui.confirm = async () => {
      confirmed = true;
      await writeFile(path.join(value.library, "alpha.md"), "# Synthetic changed Alpha\n");
      return true;
    };
    await value.fake.commands.get("career-analyze").handler("", request.ctx);
    assert.equal(confirmed, true);
    assert.equal(value.calls.length, 0);
    assert.equal(value.fake.entries.some((entry) => entry.data?.kind === "result_card"), false);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("RPC attached match refuses post-confirm selected-original drift before Core stdin", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-match-drift-");
  try {
    registerCareerCommands(value.fake.api, {
      agentDir: value.agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        value.calls.push(invocation);
        if (invocation.operation === "normalize") return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        throw new Error("changed original must not reach Core");
      },
    });
    await value.fake.commands.get("career").handler("", makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3", CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    }).ctx);
    const original = (await scanLibrary(await loadConfig(value.agentDir))).records[0];
    await value.fake.commands.get("career-analyze").handler("", makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.selectOriginal, selectedOriginalOptions([original])[0].option, CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview], confirms: [true],
    }).ctx);
    await value.fake.commands.get("career-vacancy").handler("", makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
      editors: ["Synthetic vacancy for match", (_title, preview) => preview], confirms: [true],
    }).ctx);
    const request = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.match, CAREER_UI_RPC_ACTIONS.close],
    });
    let confirmed = false;
    request.ctx.ui.confirm = async () => {
      confirmed = true;
      await writeFile(path.join(value.library, "alpha.md"), "# Synthetic changed Alpha\n");
      return true;
    };
    const before = value.fake.entries.length;
    const calls = value.calls.length;
    await value.fake.commands.get("career-match").handler("", request.ctx);
    assert.equal(confirmed, true);
    assert.equal(value.calls.length, calls);
    assert.equal(value.fake.entries.length, before);
    assert.doesNotMatch(JSON.stringify(request.notifications), /Synthetic changed Alpha|Synthetic vacancy for match/);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("RPC overlay can create an application, rescan, and remove a root without Core", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-actions-")));
  try {
    const rootDir = path.join(temp, "resumes");
    await mkdir(rootDir);
    await writeFile(path.join(rootDir, "alpha.md"), "# Synthetic Alpha\n");
    const { fake, calls } = await register(temp);
    const agentDir = path.join(temp, "agent");
    const created = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: ["Synthetic Company", "Synthetic Engineer"], confirms: [true],
    });
    await fake.commands.get("career").handler("", created.ctx);
    const application = reconstructWorkflowState(fake.entries).application;
    assert.equal(application?.company_label, "Synthetic Company");
    assert.equal(application?.role_label, "Synthetic Engineer");
    assert.equal(fake.entries.some((entry) => entry.customType === "career.application_attachment"), false);

    const added = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
      inputs: [rootDir], confirms: [true],
    });
    await fake.commands.get("career-setup").handler("", added.ctx);
    assert.equal((await loadConfig(agentDir)).library_roots.length, 1);

    const rescanned = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.rescan, CAREER_UI_RPC_ACTIONS.close],
    });
    await fake.commands.get("career-library").handler("", rescanned.ctx);

    const removed = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.removeRoot, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    });
    await fake.commands.get("career-setup").handler("", removed.ctx);
    assert.equal((await loadConfig(agentDir)).library_roots.length, 0);
    assert.equal(calls.length, 0);
    assert.equal(created.customCalls, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("assisted sidecar is excluded from unattached Analyze and Match selectors and Core input (P3-48 partial)", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-ui-assisted-48-")));
  try {
    const library = path.join(temp, "library");
    await mkdir(library);
    const originalText = "# Synthetic Original 48\nExact original body\n";
    const assistedText = "# SYNTHETIC_ASSISTED_48\nNever an original\n";
    await writeFile(path.join(library, "original.md"), originalText);
    await writeFile(path.join(library, "other.md"), "# Synthetic Other 48\nOther original body\n");
    const { fake } = await register(temp);
    const agentDir = path.join(temp, "agent");
    await fake.commands.get("career-setup").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
      inputs: [library], confirms: [true],
    }).ctx);
    const config = await loadConfig(agentDir);
    const original = eligibleOriginals(await scanLibrary(config))[0];
    assert.ok(original);
    const variants = path.join(library, "variants");
    await mkdir(variants, { mode: 0o700 });
    await writeFile(path.join(variants, ".pi-career-variants.json"),
      encodeManagedVariantsMarker(original.root_id, "2026-08-12T00:00:00.000Z"), { mode: 0o600 });
    await writeFile(path.join(variants, "assisted.md"), assistedText, { mode: 0o600 });
    await writeFile(path.join(variants, "assisted.pi-career.json"), encodeAssistedVariantMetadataV2({
      base_document_id: original.id,
      base_text_sha256: original.text_sha256,
      artifact_sha256: hash(Buffer.from(assistedText)),
      created_at: "2026-08-12T00:00:00.000Z",
    }), { mode: 0o600 });
    const scan = await scanLibrary(config);
    assert.equal(scan.records.filter((record) => record.kind === "assisted_variant").length, 1);
    assert.equal(eligibleOriginals(scan).length, 2);
    assert.ok(eligibleOriginals(scan).some((record) => record.id === original.id));
    const before = await treeBytes(library);
    const calls = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        calls.push(invocation);
        if (invocation.operation === "analyze") return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
        if (invocation.operation === "normalize") return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        return { operation: "job.match", json: JSON.stringify(matchResult()) };
      },
    });
    await fake.commands.get("career-vacancy").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
      editors: ["Synthetic vacancy 48"],
    }).ctx);
    for (const [command, action] of [
      ["career-analyze", CAREER_UI_RPC_ACTIONS.analyze],
      ["career-match", CAREER_UI_RPC_ACTIONS.match],
    ]) {
      const context = makeContext(fake, { mode: "rpc", persisted: false, confirms: [true] });
      const dialogs = [];
      context.ctx.ui.select = async (title, options) => {
        dialogs.push([title, ...options]);
        if (title === "Choose an original resume") {
          return options.find((option) => option.includes("original.md"));
        }
        return dialogs.length === 1 ? action : CAREER_UI_RPC_ACTIONS.close;
      };
      await fake.commands.get(command).handler("", context.ctx);
      assert.ok(dialogs.some(([title, ...options]) =>
        title === "Choose an original resume" && options.some((option) => option.includes("original.md"))));
      assert.doesNotMatch(JSON.stringify(dialogs), /assisted\.md|SYNTHETIC_ASSISTED_48/);
      assert.deepEqual(context.notifications.filter(({ type }) => type === "error"), []);
    }
    assert.ok(calls.some((call) => call.operation === "analyze"));
    assert.ok(calls.some((call) => call.operation === "match"));
    assert.ok(calls.every((call) => !JSON.stringify(call).includes("SYNTHETIC_ASSISTED_48")));
    assert.ok(calls.every((call) => !JSON.stringify(call).includes("Other original body")));
    assert.ok(calls.some((call) => JSON.stringify(call).includes("Exact original body")));
    assert.deepEqual(await treeBytes(library), before);
    assert.equal(fake.entries.filter((entry) => entry.data?.kind === "result_card").length, 2);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("RPC overlay analyze and match stay confirmation-gated and local", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-core-")));
  try {
    const rootDir = path.join(temp, "resumes");
    await mkdir(rootDir);
    await writeFile(path.join(rootDir, "alpha.md"), "# Synthetic Alpha\nDeterministic content\n");
    const { fake } = await register(temp);
    const agentDir = path.join(temp, "agent");
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        if (invocation.operation === "analyze") {
          return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
        }
        if (invocation.operation === "normalize") {
          return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        }
        return { operation: "job.match", json: JSON.stringify(matchResult()) };
      },
    });
    await fake.commands.get("career-setup").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
      inputs: [rootDir], confirms: [true],
    }).ctx);
    const cancelled = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, CAREER_UI_RPC_ACTIONS.close], confirms: [false],
    });
    await fake.commands.get("career-analyze").handler("", cancelled.ctx);
    assert.equal(fake.entries.some((entry) => entry.data?.kind === "result_card"), false);

    const analyzed = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, CAREER_UI_RPC_ACTIONS.close], confirms: [true],
    });
    await fake.commands.get("career-analyze").handler("", analyzed.ctx);
    assert.equal(fake.entries.filter((entry) => entry.data?.kind === "result_card").length, 1);

    await fake.commands.get("career-vacancy").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
      editors: ["Synthetic Backend Engineer\nRequirements"],
    }).ctx);
    assert.equal(reconstructWorkflowState(fake.entries).vacancy === undefined, false);

    const matched = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.match, CAREER_UI_RPC_ACTIONS.close], confirms: [true],
    });
    await fake.commands.get("career-match").handler("", matched.ctx);
    assert.ok(fake.entries.some((entry) => entry.data?.kind === "result_card" && entry.data.workflow === "match"));
    assert.doesNotMatch(JSON.stringify(analyzed.notifications), /Deterministic content/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("#108 unattached Ask Pi selects one original and prepares a visible prompt without submission", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-ask-unattached-")));
  try {
    const root = path.join(temp, "resumes");
    await mkdir(root);
    const alpha = path.join(root, "alpha.md");
    await writeFile(alpha, "# Synthetic Alpha\nALPHA_PRIVATE_BODY\n");
    await writeFile(path.join(root, "beta.md"), "# Synthetic Beta\nBETA_PRIVATE_BODY\n");
    const { fake, calls } = await register(temp);
    await fake.commands.get("career-setup").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
      inputs: [root], confirms: [true],
    }).ctx);
    const before = structuredClone(fake.entries);
    const editorText = [];
    const sends = [];
    let listStep = 0;
    const context = makeContext(fake, { mode: "rpc", persisted: false, editorText, editors: [(_title, prefill) => prefill], confirms: [true] });
    context.ctx.sendMessage = (...args) => sends.push(args);
    context.ctx.sendUserMessage = (...args) => sends.push(args);
    context.ctx.ui.select = async (title, options) => {
      if (title.startsWith("Career • Workbench")) return listStep++ === 0 ? CAREER_UI_RPC_ACTIONS.askPi : CAREER_UI_RPC_ACTIONS.close;
      if (title === "Choose an original resume") return options.find((option) => option.includes("alpha.md"));
      if (title === "Career workbench") return "Explain my score — resume only";
      return undefined;
    };
    await fake.commands.get("career-workbench").handler("", context.ctx);
    assert.equal(editorText.length, 1);
    assert.match(editorText[0], /ALPHA_PRIVATE_BODY/);
    assert.doesNotMatch(editorText[0], /BETA_PRIVATE_BODY|pi-career-ask-unattached-/);
    assert.equal(editorText[0].match(/ALPHA_PRIVATE_BODY/g)?.length, 1);
    assert.deepEqual(fake.entries, before);
    assert.deepEqual(sends, []);
    assert.deepEqual(calls, []);
    assert.equal(fake.activeTools.length, 0);

    const tuiEditorText = [];
    const components = [];
    const tui = makeContext(fake, {
      mode: "tui", persisted: false, editorText: tuiEditorText, components,
      editors: [(_title, prefill) => prefill], confirms: [true],
      keybindings: { matches(data, action) { return data === "esc" && action === "tui.select.cancel"; } },
    });
    tui.ctx.sendMessage = () => assert.fail("Ask Pi must not submit");
    tui.ctx.sendUserMessage = () => assert.fail("Ask Pi must not submit");
    tui.ctx.ui.select = async (title, options) => title === "Choose an original resume"
      ? options.find((option) => option.includes("alpha.md"))
      : "Explain my score — resume only";
    const pendingTui = fake.commands.get("career-workbench").handler("", tui.ctx);
    const deadline = Date.now() + 2_000;
    while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(components.length, 1);
    components[0].handleInput("p");
    while (tuiEditorText.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(tuiEditorText.length, 1);
    assert.match(tuiEditorText[0], /ALPHA_PRIVATE_BODY/);
    assert.doesNotMatch(tuiEditorText[0], /BETA_PRIVATE_BODY/);
    components[0].handleInput("esc");
    await pendingTui;
    assert.deepEqual(fake.entries, before);

    for (const stage of ["picker", "mode", "editor", "confirm", "drift"]) {
      const prepared = [];
      let viewStep = 0;
      const attempt = makeContext(fake, {
        mode: "rpc", persisted: false, editorText: prepared,
        editors: stage === "editor" ? [undefined] : [(_title, prefill) => prefill],
        confirms: [stage === "confirm" ? false : async () => {
          if (stage === "drift") await writeFile(alpha, "# Synthetic Alpha\nCHANGED_AFTER_CONFIRM\n");
          return true;
        }],
      });
      attempt.ctx.sendMessage = () => assert.fail("Ask Pi must not submit");
      attempt.ctx.sendUserMessage = () => assert.fail("Ask Pi must not submit");
      attempt.ctx.ui.select = async (title, options) => {
        if (title.startsWith("Career • Workbench")) return viewStep++ === 0 ? CAREER_UI_RPC_ACTIONS.askPi : CAREER_UI_RPC_ACTIONS.close;
        if (title === "Choose an original resume") return stage === "picker" ? undefined : options.find((option) => option.includes("alpha.md"));
        if (title === "Career workbench") return stage === "mode" ? "Cancel" : "Explain my score — resume only";
        return undefined;
      };
      await fake.commands.get("career-workbench").handler("", attempt.ctx);
      assert.deepEqual(prepared, []);
      assert.deepEqual(fake.entries, before);
      if (stage === "drift") await writeFile(alpha, "# Synthetic Alpha\nALPHA_PRIVATE_BODY\n");
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("#108 attached Ask Pi uses one activation confirmation and document-free handoff", async () => {
  const value = await catalogFixture("pi-career-ask-attached-");
  try {
    await value.fake.commands.get("career").handler("", makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Synthetic Company — Synthetic Engineer — Preparing — Incomplete 0/3", CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    }).ctx);
    const editorText = [];
    const confirmations = [];
    const sends = [];
    const asked = makeContext(value.fake, {
      mode: "rpc", persisted: false, editorText,
      selects: [CAREER_UI_RPC_ACTIONS.askPi, CAREER_UI_RPC_ACTIONS.close],
      confirms: [(title) => { confirmations.push(title); return true; }],
    });
    asked.ctx.sendMessage = (...args) => sends.push(args);
    asked.ctx.sendUserMessage = (...args) => sends.push(args);
    await value.fake.commands.get("career-workbench").handler("", asked.ctx);
    assert.deepEqual(confirmations, ["Activate Career assistance"]);
    assert.equal(editorText.length, 1);
    assert.doesNotMatch(editorText[0], /Synthetic Alpha|applications[/\\]|resume\.md/);
    assert.equal(value.fake.entries.filter((entry) => entry.customType === "career.application_assistance").length, 1);
    assert.deepEqual(sends, []);
    assert.deepEqual(value.calls, []);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("RPC overlay leaves unavailable unattached assistance inert and clears only the current vacancy", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-vacancy-clear-")));
  try {
    const { fake } = await register(temp);
    const agentDir = path.join(temp, "agent");
    const calls = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        calls.push(invocation.operation);
        return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
      },
    });
    const blocked = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.askPi, CAREER_UI_RPC_ACTIONS.close], confirms: [true],
    });
    await fake.commands.get("career-workbench").handler("", blocked.ctx);
    assert.equal(fake.entries.length, 0);
    assert.equal(calls.length, 0);
    assert.equal(blocked.customCalls, 0);
    assert.equal(blocked.notifications.some(({ message }) => message.includes("Attach an application")), false);
    assert.equal(fake.activeTools.length, 0);

    const vacancyText = "Synthetic vacancy: Backend Engineer.\nSynthetic requirements only.";
    await fake.commands.get("career-vacancy").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
      editors: [vacancyText],
    }).ctx);
    assert.deepEqual(calls, ["normalize"]);
    assert.equal(reconstructWorkflowState(fake.entries).vacancy?.vacancy_text, vacancyText);
    const beforeClear = fake.entries.length;
    const clear = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.clearVacancy, CAREER_UI_RPC_ACTIONS.close],
    });
    await fake.commands.get("career-vacancy").handler("", clear.ctx);
    assert.equal(fake.entries.length, beforeClear + 1);
    assert.equal(reconstructWorkflowState(fake.entries).vacancy, undefined);
    assert.deepEqual(calls, ["normalize"]);
    assert.equal(clear.customCalls, 0);
    assert.equal(fake.activeTools.length, 0);
    assert.doesNotMatch(JSON.stringify(clear.notifications), /Synthetic requirements only|pi-career-overlay-vacancy-clear-/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("RPC overlay can update status and open Gate 1 workspace management", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-status-")));
  try {
    const { fake, calls } = await register(temp);
    await fake.commands.get("career").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: ["Synthetic Company", "Synthetic Engineer"], confirms: [true],
    }).ctx);
    await fake.commands.get("career").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.updateStatus, "Applied", CAREER_UI_RPC_ACTIONS.close],
    }).ctx);
    assert.equal(reconstructWorkflowState(fake.entries).application?.status, "applied");
    await fake.commands.get("career-workspace").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.workspace, "Close"],
    }).ctx);
    assert.equal(calls.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("overlay keeps created applications and analyze results in the shared UI", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-loop-")));
  try {
    const rootDir = path.join(temp, "resumes");
    await mkdir(rootDir);
    await writeFile(path.join(rootDir, "alpha.md"), "# Synthetic Alpha\nDeterministic content\n");
    const { fake } = await register(temp);
    const agentDir = path.join(temp, "agent");
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
      invoke: async (invocation) => {
        if (invocation.operation === "analyze") {
          return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
        }
        if (invocation.operation === "normalize") {
          return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        }
        return { operation: "job.match", json: JSON.stringify(matchResult()) };
      },
    });
    await fake.commands.get("career").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: ["Synthetic Company", "Synthetic Engineer"], confirms: [true],
    }).ctx);
    let listed;
    const list = makeContext(fake, { mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close] });
    const select = list.ctx.ui.select;
    list.ctx.ui.select = async (title, options) => {
      listed = options;
      return select(title, options);
    };
    await fake.commands.get("career").handler("", list.ctx);
    assert.ok(listed.some((option) => option.includes("Synthetic Company")));

    await fake.commands.get("career-setup").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
      inputs: [rootDir], confirms: [true],
    }).ctx);
    await fake.commands.get("career-analyze").handler("", makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.analyze, CAREER_UI_RPC_ACTIONS.close], confirms: [true],
    }).ctx);
    let analyzeOptions;
    const analyze = makeContext(fake, { mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close] });
    const analyzeSelect = analyze.ctx.ui.select;
    analyze.ctx.ui.select = async (title, options) => {
      analyzeOptions = options;
      return analyzeSelect(title, options);
    };
    await fake.commands.get("career-analyze").handler("", analyze.ctx);
    assert.ok(analyzeOptions.some((option) => option.includes("Career analyze")));

    const asked = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.askPi, CAREER_UI_RPC_ACTIONS.close], confirms: [true],
    });
    await fake.commands.get("career-workbench").handler("", asked.ctx);
    assert.equal(fake.entries.some((entry) => entry.customType === "career.application_assistance"), false);
    assert.equal(asked.customCalls, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
