// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_OVERLAY_COMMAND_VIEWS, CareerOverlay } from "../../src/workflow/overlay.ts";
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

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
  const rendered = components[0].render(80).join("\n");
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
    for (const [command, view] of Object.entries(CAREER_OVERLAY_COMMAND_VIEWS)) {
      await openAndClose(fake, command, view);
    }
    assert.equal(calls.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("RPC career commands keep dialog fallbacks instead of the overlay", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-rpc-")));
  try {
    const { fake } = await register(temp);
    const rpc = makeContext(fake, { mode: "rpc", persisted: false, selects: ["Close"] });
    await fake.commands.get("career-setup").handler("", rpc.ctx);
    assert.equal(rpc.customCalls, 0);
    assert.ok(rpc.notifications.some(({ message }) => message.includes("pi-career")));
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
