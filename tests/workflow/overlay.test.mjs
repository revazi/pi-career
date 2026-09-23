// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";
import { selectedOriginalOptions } from "../../src/workflow/application-workspace.ts";
import { loadConfig } from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import {
  CAREER_UI_COMMAND_VIEWS,
  CAREER_UI_RPC_ACTIONS,
  CAREER_UI_VIEW_LABELS,
  CareerOverlay,
} from "../../src/workflow/career-ui.ts";
import { scanLibrary } from "../../src/workflow/scan.ts";
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
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: applicationId,
    sequence: 1,
    parent_sha256: hash(manifest),
    status,
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
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

test("RPC hierarchical dialogs browse, switch views, and open detail without attaching", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-nav-");
  try {
    const before = value.fake.entries.length;
    const rpc = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [
        "Synthetic Company — Synthetic Engineer — preparing",
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

test("RPC attach uses the same confirmation-gated action as the overlay", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-attach-");
  try {
    const cancelled = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [
        "Synthetic Company — Synthetic Engineer — preparing",
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
        "Synthetic Company — Synthetic Engineer — preparing",
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
        "Synthetic Company — Synthetic Engineer — preparing",
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
      path.join(value.root, applicationName, ".pi-career-state-000003.json"),
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

test("RPC attached analyze refuses a changed original before Core stdin", async () => {
  const value = await catalogFixture("pi-career-ui-rpc-drift-");
  try {
    const attached = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Synthetic Company — Synthetic Engineer — preparing", CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
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

test("RPC overlay refuses unattached assistance and clears only the current vacancy", async () => {
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
      selects: [CAREER_UI_RPC_ACTIONS.askPi, CAREER_UI_RPC_ACTIONS.close],
    });
    await fake.commands.get("career-workbench").handler("", blocked.ctx);
    assert.equal(fake.entries.length, 0);
    assert.equal(calls.length, 0);
    assert.ok(blocked.notifications.some(({ message }) => message.includes("Attach an application")));
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
      selects: [CAREER_UI_RPC_ACTIONS.askPi, CAREER_UI_RPC_ACTIONS.close],
    });
    await fake.commands.get("career-workbench").handler("", asked.ctx);
    assert.equal(fake.entries.some((entry) => entry.customType === "career.application_assistance"), false);
    assert.ok(asked.notifications.some(({ message }) => message.includes("Attach an application")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
