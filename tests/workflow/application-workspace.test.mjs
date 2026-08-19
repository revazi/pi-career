// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ApplicationWorkspaceWorkflow,
  selectedOriginalOptions,
} from "../../src/workflow/application-workspace.ts";
import {
  addLibraryRoot,
  configPath,
  emptyConfig,
  loadConfig,
  removeLibraryRoot,
  rootId,
  setGeneratedVariantsRoot,
  writeConfig,
} from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { eligibleOriginals, scanLibrary } from "../../src/workflow/scan.ts";
import {
  createApplicationEntry,
  createVacancyClearEntry,
  createVacancyEntry,
} from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

const INITIAL_TIME = "2026-08-12T00:00:00.000Z";
const now = () => new Date(INITIAL_TIME);

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sessionEntry(data, index) {
  return {
    type: "custom",
    customType: "career.workflow",
    data,
    id: `workspace-${index}`,
    parentId: index === 1 ? null : `workspace-${index - 1}`,
    timestamp: data.created_at,
  };
}

async function privateDirectory(parent, name) {
  const supplied = path.join(parent, name);
  await mkdir(supplied, { mode: 0o700 });
  await chmod(supplied, 0o700);
  return realpath(supplied);
}

async function workspaceFixture({ legacy = false, vacancy = true } = {}) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-workspace-")));
  const libraryInput = path.join(temp, "library");
  await mkdir(libraryInput);
  await writeFile(path.join(libraryInput, "resume.md"), "# Synthetic Original\n\nBuilt reliable APIs.\n");
  const library = await realpath(libraryInput);
  const root = await privateDirectory(temp, "applications");
  const agentDir = path.join(temp, "agent");
  const configFile = configPath(agentDir);
  await prepareConfigDirectory(agentDir);
  if (legacy) {
    const value = {
      schema_version: "pi.career.config.v1",
      library_roots: [{ id: rootId(library), path: library, label: "Synthetic resume library" }],
    };
    await writeFile(configFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await chmod(configFile, 0o600);
  } else {
    const config = await addLibraryRoot(emptyConfig(), library, "Synthetic resume library");
    await writeConfig(agentDir, config, uuidSequence(), { now });
  }

  const ids = uuidSequence();
  const identity = createApplicationEntry("Synthetic Company", "Platform Engineer", "preparing", {
    uuid: ids,
    now,
  });
  const entries = [sessionEntry(identity, 1)];
  let vacancyEntry;
  if (vacancy) {
    vacancyEntry = createVacancyEntry("Synthetic vacancy bytes", "paste", {
      uuid: ids,
      now: () => new Date("2026-08-12T00:00:01.000Z"),
      applicationId: identity.application_id,
    });
    entries.push(sessionEntry(vacancyEntry, 2));
  }
  const fake = makeFakePi();
  fake.entries.push(...entries);
  let invocations = 0;
  let workspaceTick = 10;
  const workspaceNow = () => new Date(`2026-08-12T00:00:${String(workspaceTick++).padStart(2, "0")}.000Z`);
  registerCareerCommands(fake.api, {
    agentDir,
    now: workspaceNow,
    uuid: ids,
    invoke: async () => {
      invocations += 1;
      throw new Error("workspace actions must not invoke Career Core");
    },
  });
  return { temp, library, root, agentDir, configFile, fake, ids, identity, vacancyEntry, get invocations() { return invocations; } };
}

async function runWorkspace(fake, options) {
  const context = makeContext(fake, { mode: "rpc", persisted: false, ...options });
  await fake.commands.get("career-workspace").handler(options?.args ?? "", context.ctx);
  return context;
}

test("workspace command is user-only, no-argument, and fails before filesystem access outside TUI/RPC", async () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, { agentDir: "/synthetic/missing", uuid: uuidSequence(), now });
  const print = makeContext(fake, { mode: "print", hasUI: false, persisted: false });
  await assert.rejects(fake.commands.get("career-workspace").handler("", print.ctx), /interactive_mode_required/);
  await assert.rejects(fake.commands.get("career-workspace").handler(" unexpected ", print.ctx), /invalid_command_arguments/);
  assert.equal(fake.tools.has("career-workspace"), false);
  assert.equal(fake.activeTools.includes("career-workspace"), false);
});

test("explicit unchanged preview migrates strict v1 and bootstraps an empty private root", async () => {
  const value = await workspaceFixture({ legacy: true });
  try {
    const oldBytes = await readFile(value.configFile);
    let cancelledPreview;
    const cancelled = await runWorkspace(value.fake, {
      selects: ["Configure application root"],
      inputs: [value.root],
      editors: [(_title, preview) => {
        cancelledPreview = JSON.parse(preview);
        return preview;
      }],
      confirms: [false],
    });
    assert.deepEqual(await readFile(value.configFile), oldBytes);
    assert.deepEqual(await readdir(value.root), []);
    assert.ok(cancelled.notifications.length === 0 || cancelled.notifications.every(({ message }) => !message.includes("Synthetic vacancy bytes")));
    assert.equal(cancelledPreview.operation, "configure_root");
    assert.equal(cancelledPreview.replaces[0].expected.text, oldBytes.toString("utf8"));
    assert.equal(cancelledPreview.creates[0].path, path.join(value.root, ".pi-career-applications.json"));

    let approvedPreview;
    await runWorkspace(value.fake, {
      selects: ["Configure application root"],
      inputs: [value.root],
      editors: [(_title, preview) => {
        approvedPreview = JSON.parse(preview);
        return preview;
      }],
      confirms: [true],
    });
    const config = await loadConfig(value.agentDir);
    assert.equal(config.schema_version, "pi.career.config.v2");
    assert.equal(config.generated_variants_root, null);
    assert.equal(config.application_workspace.root_path, value.root);
    assert.deepEqual(config.library_roots.map(({ path: rootPath }) => rootPath), [value.library]);
    const markerFile = path.join(value.root, ".pi-career-applications.json");
    const marker = JSON.parse(await readFile(markerFile, "utf8"));
    assert.equal(marker.root_id, config.application_workspace.root_id);
    assert.equal((await lstat(markerFile)).mode & 0o7777, 0o600);
    assert.equal((await lstat(markerFile)).nlink, 1);
    assert.ok(approvedPreview.temporary_paths.some((item) => item.endsWith(".pi-career-config.lock")));
    assert.ok(approvedPreview.temporary_paths.some((item) => item.includes("root-marker.tmp")));
    assert.equal(value.invocations, 0);
    assert.equal(value.fake.entries.length, 2, "workspace actions append no session entry");
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("initialization, selected-original binding, status/vacancy revision, status, and detach are immutable and local", async () => {
  const value = await workspaceFixture();
  try {
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    let initializePreview;
    await runWorkspace(value.fake, {
      selects: ["Initialize current application"],
      editors: [(_title, preview) => { initializePreview = JSON.parse(preview); return preview; }],
      confirms: [true],
    });
    const rootEntries = await readdir(value.root);
    const directoryName = rootEntries.find((entry) => !entry.startsWith("."));
    assert.equal(directoryName, `synthetic-company--platform-engineer--${value.identity.application_id}`);
    const applicationDirectory = path.join(value.root, directoryName);
    assert.equal((await lstat(applicationDirectory)).mode & 0o7777, 0o700);
    const manifestBytes = await readFile(path.join(applicationDirectory, "application.json"));
    const manifestText = manifestBytes.toString("utf8");
    assert.doesNotMatch(manifestText, /Synthetic Company|Platform Engineer|preparing|vacancy|resume\.md/);
    assert.equal(await readFile(path.join(applicationDirectory, "vacancy.md"), "utf8"), "Synthetic vacancy bytes");
    const state1Bytes = await readFile(path.join(applicationDirectory, ".pi-career-state-000001.json"));
    const state1 = JSON.parse(state1Bytes);
    assert.equal(state1.parent_sha256.length, 64);
    assert.equal(state1.vacancy.source_state_id, value.vacancyEntry.state_id);
    assert.equal(state1.selected_original, null);
    assert.equal(state1.resume_artifact, null);
    assert.deepEqual(initializePreview.creates.map((item) => item.object_type), ["directory", "file", "file", "file"]);

    const original = eligibleOriginals(await scanLibrary(await loadConfig(value.agentDir)))[0];
    await runWorkspace(value.fake, {
      selects: ["Select original resume", selectedOriginalOptions([original])[0].option],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const state2Bytes = await readFile(path.join(applicationDirectory, ".pi-career-state-000002.json"));
    const state2 = JSON.parse(state2Bytes);
    assert.equal(state2.selected_original.library_root_id, rootId(value.library));
    assert.equal(state2.selected_original.format, "markdown");
    assert.equal(state2.vacancy.relative_path, "vacancy.md");

    const updatedApplication = createApplicationEntry(
      value.identity.company_label,
      value.identity.role_label,
      "applied",
      { uuid: value.ids, now: () => new Date("2026-08-12T00:02:00.000Z") },
      value.identity.application_id,
    );
    const updatedVacancy = createVacancyEntry("Replacement synthetic vacancy", "replace", {
      uuid: value.ids,
      now: () => new Date("2026-08-12T00:03:00.000Z"),
      applicationId: value.identity.application_id,
    });
    value.fake.entries.push(sessionEntry(updatedApplication, 3), sessionEntry(updatedVacancy, 4));
    await runWorkspace(value.fake, {
      selects: ["Record current status and vacancy"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const state3 = JSON.parse(await readFile(path.join(applicationDirectory, ".pi-career-state-000003.json"), "utf8"));
    assert.equal(state3.status, "applied");
    assert.equal(state3.vacancy.relative_path, "vacancy-000003.md");
    assert.equal(state3.selected_original.document_id, state2.selected_original.document_id);
    assert.equal(await readFile(path.join(applicationDirectory, "vacancy-000003.md"), "utf8"), "Replacement synthetic vacancy");
    assert.equal(await readFile(path.join(applicationDirectory, "vacancy.md"), "utf8"), "Synthetic vacancy bytes");

    value.fake.entries.push(sessionEntry(createVacancyClearEntry(updatedVacancy, {
      uuid: value.ids,
      now: () => new Date("2026-08-12T00:04:00.000Z"),
    }), 5));
    await runWorkspace(value.fake, {
      selects: ["Record current status and vacancy"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const state4 = JSON.parse(await readFile(path.join(applicationDirectory, ".pi-career-state-000004.json"), "utf8"));
    assert.equal(state4.vacancy, null);
    assert.equal(await readFile(path.join(applicationDirectory, "vacancy-000003.md"), "utf8"), "Replacement synthetic vacancy");

    const beforeStatus = (await readdir(applicationDirectory)).sort();
    const status = await runWorkspace(value.fake, { selects: ["Status and reconcile"] });
    assert.deepEqual((await readdir(applicationDirectory)).sort(), beforeStatus);
    assert.ok(status.notifications.some(({ message }) => message.includes("reconciled")));

    const rootBeforeDetach = (await readdir(value.root)).sort();
    let detachPreview;
    await runWorkspace(value.fake, {
      selects: ["Detach application root from config"],
      editors: [(_title, preview) => { detachPreview = JSON.parse(preview); return preview; }],
      confirms: [true],
    });
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);
    assert.deepEqual((await readdir(value.root)).sort(), rootBeforeDetach);
    assert.equal(detachPreview.operation, "detach_root");
    assert.deepEqual(detachPreview.deletes, []);

    const markerPath = path.join(value.root, ".pi-career-applications.json");
    const markerBeforeReattach = await readFile(markerPath);
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    assert.equal((await loadConfig(value.agentDir)).application_workspace.root_path, value.root);
    assert.deepEqual(await readFile(markerPath), markerBeforeReattach);
    assert.deepEqual((await readdir(value.root)).sort(), rootBeforeDetach);
    assert.equal(value.invocations, 0);
    assert.equal(value.fake.entries.length, 5);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("absent-config plans use no-clobber publication and reject a file appearing after confirmation", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-workspace-absent-")));
  try {
    const agentDir = path.join(temp, "agent");
    const file = configPath(agentDir);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await chmod(path.dirname(file), 0o700);
    const root = await privateDirectory(temp, "applications");
    const fake = makeFakePi();
    const ids = uuidSequence();
    const identity = createApplicationEntry("Synthetic Company", "Platform Engineer", "preparing", { uuid: ids, now });
    fake.entries.push(sessionEntry(identity, 1));
    const workflow = new ApplicationWorkspaceWorkflow({ agentDir, now, uuid: ids });
    const context = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [root],
      editors: [(_title, preview) => {
        const parsed = JSON.parse(preview);
        assert.equal(parsed.expected_config_sha256, null);
        assert.ok(parsed.creates.some((item) => item.path === file));
        return preview;
      }],
      confirms: [async () => {
        await writeFile(file, '{"synthetic":"race"}\n', { mode: 0o600 });
        await chmod(file, 0o600);
        return true;
      }],
    });
    await assert.rejects(workflow.run("", context.ctx), /workspace_drift/);
    assert.equal(await readFile(file, "utf8"), '{"synthetic":"race"}\n');
    assert.deepEqual(await readdir(root), []);

    await rm(file);
    const unsafeDirectory = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [root],
      editors: [(_title, preview) => preview],
      confirms: [async () => {
        await chmod(path.dirname(file), 0o755);
        return true;
      }],
    });
    await assert.rejects(workflow.run("", unsafeDirectory.ctx), /workspace_drift/);
    assert.deepEqual(await readdir(root), []);
    await assert.rejects(lstat(file), (error) => error?.code === "ENOENT");
    await chmod(path.dirname(file), 0o700);

    const approved = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    await workflow.run("", approved.ctx);
    assert.equal(JSON.parse(await readFile(file, "utf8")).schema_version, "pi.career.config.v2");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("read-only reconciliation classifies interrupted and orphan application states without repair", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const applicationDirectory = path.join(
      value.root,
      `synthetic-company--platform-engineer--${value.identity.application_id}`,
    );
    await mkdir(applicationDirectory, { mode: 0o700 });
    await chmod(applicationDirectory, 0o700);
    const interrupted = await runWorkspace(value.fake, { selects: ["Status and reconcile"] });
    assert.ok(interrupted.notifications.some(({ message }) => message.includes("Interrupted initialization")));
    assert.deepEqual(await readdir(applicationDirectory), []);

    await writeFile(path.join(applicationDirectory, "vacancy.md"), "Synthetic orphan", { mode: 0o600 });
    await chmod(path.join(applicationDirectory, "vacancy.md"), 0o600);
    const orphan = await runWorkspace(value.fake, { selects: ["Status and reconcile"] });
    assert.ok(orphan.notifications.some(({ message }) => message.includes("Orphan vacancy")));
    assert.equal(await readFile(path.join(applicationDirectory, "vacancy.md"), "utf8"), "Synthetic orphan");
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("application entry limits block append-only mutation without deleting unknown user files", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    await runWorkspace(value.fake, {
      selects: ["Initialize current application"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const applicationName = (await readdir(value.root)).find((entry) => !entry.startsWith("."));
    const applicationDirectory = path.join(value.root, applicationName);
    for (let index = 0; index < 158; index += 1) {
      await writeFile(path.join(applicationDirectory, `user-${String(index).padStart(3, "0")}.txt`), "synthetic user file\n");
    }
    assert.equal((await readdir(applicationDirectory)).length, 160);
    const updated = createApplicationEntry(
      value.identity.company_label,
      value.identity.role_label,
      "applied",
      { uuid: value.ids, now: () => new Date("2026-08-12T00:05:00.000Z") },
      value.identity.application_id,
    );
    value.fake.entries.push(sessionEntry(updated, 2));
    const workflow = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      now: () => new Date("2026-08-12T00:06:00.000Z"),
      uuid: value.ids,
    });
    const context = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Record current status and vacancy"],
    });
    await assert.rejects(workflow.run("", context.ctx), /workspace_limit_reached/);
    assert.equal((await readdir(applicationDirectory)).length, 160);
    assert.equal((await readdir(applicationDirectory)).filter((entry) => entry.startsWith(".pi-career-state-")).length, 1);

    await writeFile(path.join(applicationDirectory, "user-overflow.txt"), "synthetic overflow\n");
    const overflowContext = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Record current status and vacancy"],
    });
    await assert.rejects(workflow.run("", overflowContext.ctx), /workspace_limit_reached/);
    assert.equal((await readdir(applicationDirectory)).length, 161);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("root audits stop at the overflow sentinel and reject 1,025 persistent entries", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    for (let index = 0; index < 1_025; index += 1) {
      await writeFile(path.join(value.root, `entry-${String(index).padStart(4, "0")}`), "synthetic\n");
    }
    const workflow = new ApplicationWorkspaceWorkflow({ agentDir: value.agentDir, now, uuid: value.ids });
    const context = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
    });
    await assert.rejects(workflow.run("", context.ctx), /workspace_limit_reached/);
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);
    assert.equal((await readdir(value.root)).length, 1_025);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("root configuration rejects overlap, noncanonical paths, symlink components, and wrong modes without repair", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    const nestedRoot = await privateDirectory(value.library, "application-root");
    const workflow = new ApplicationWorkspaceWorkflow({ agentDir: value.agentDir, now, uuid: value.ids });
    const nested = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [nestedRoot],
    });
    await assert.rejects(workflow.run("", nested.ctx), /workspace_root_overlap/);
    assert.deepEqual(await readdir(nestedRoot), []);
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);

    await chmod(value.library, 0o700);
    const equal = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.library],
    });
    await assert.rejects(workflow.run("", equal.ctx), /workspace_root_overlap/);

    const pathComponent = await privateDirectory(value.temp, "path-component");
    const noncanonical = `${pathComponent}${path.sep}..${path.sep}${path.basename(value.root)}`;
    const ambiguous = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [noncanonical],
    });
    await assert.rejects(workflow.run("", ambiguous.ctx), /workspace_root_invalid/);

    const realSymlinkTarget = await privateDirectory(value.temp, "real-symlink-target");
    const symlinkComponent = path.join(value.temp, "symlink-component");
    await symlink(realSymlinkTarget, symlinkComponent);
    const linked = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [symlinkComponent],
    });
    await assert.rejects(workflow.run("", linked.ctx), /workspace_root_invalid/);

    const wrongMode = await privateDirectory(value.temp, "wrong-mode-root");
    await chmod(wrongMode, 0o750);
    const unsafeMode = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [wrongMode],
    });
    await assert.rejects(workflow.run("", unsafeMode.ctx), /workspace_root_invalid/);
    assert.equal((await lstat(wrongMode)).mode & 0o7777, 0o750);
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("all later config writers preserve v2 and reject application-root overlap without changing bytes", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const safeLibrary = path.join(value.temp, "second-library");
    await mkdir(safeLibrary);
    const withSafeLibrary = await addLibraryRoot(await loadConfig(value.agentDir), safeLibrary, "Second synthetic root");
    await writeConfig(value.agentDir, withSafeLibrary, value.ids, { now });
    let persisted = JSON.parse(await readFile(value.configFile, "utf8"));
    assert.equal(persisted.schema_version, "pi.career.config.v2");
    assert.equal(persisted.application_workspace.root_path, value.root);

    const withoutSafeLibrary = removeLibraryRoot(await loadConfig(value.agentDir), rootId(await realpath(safeLibrary)));
    await writeConfig(value.agentDir, withoutSafeLibrary, value.ids, { now });
    const withGuidance = setGeneratedVariantsRoot(await loadConfig(value.agentDir), path.join(value.temp, "generated"));
    await writeConfig(value.agentDir, withGuidance, value.ids, { now });
    persisted = JSON.parse(await readFile(value.configFile, "utf8"));
    assert.equal(persisted.schema_version, "pi.career.config.v2");
    assert.equal(persisted.application_workspace.root_path, value.root);
    assert.equal(persisted.generated_variants_root, path.join(value.temp, "generated"));

    const original = await readFile(value.configFile);
    const nested = path.join(value.root, "nested-library");
    await mkdir(nested);
    const withNested = await addLibraryRoot(await loadConfig(value.agentDir), nested, "Unsafe nested root");
    await assert.rejects(writeConfig(value.agentDir, withNested, value.ids, { now }), /workspace_root_overlap/);
    assert.deepEqual(await readFile(value.configFile), original);

    const ancestorGuidance = setGeneratedVariantsRoot(await loadConfig(value.agentDir), path.dirname(value.root));
    await assert.rejects(writeConfig(value.agentDir, ancestorGuidance, value.ids, { now }), /workspace_root_overlap/);
    assert.deepEqual(await readFile(value.configFile), original);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("config byte/inode races, crash-left locks, and branch identity drift fail closed", async () => {
  const value = await workspaceFixture({ legacy: true, vacancy: false });
  try {
    const original = await readFile(value.configFile);
    const workflow = new ApplicationWorkspaceWorkflow({ agentDir: value.agentDir, now, uuid: value.ids });
    const raced = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview],
      confirms: [async () => {
        const replacement = `${value.configFile}.replacement`;
        await writeFile(replacement, original, { mode: 0o600 });
        await chmod(replacement, 0o600);
        await rename(replacement, value.configFile);
        return true;
      }],
    });
    await assert.rejects(workflow.run("", raced.ctx), /workspace_drift/);
    assert.deepEqual(await readdir(value.root), []);
    assert.deepEqual(await readFile(value.configFile), original);

    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const workspaceLock = path.join(value.root, ".pi-career-workspace.lock");
    await writeFile(workspaceLock, "synthetic crash lock\n", { mode: 0o600 });
    await chmod(workspaceLock, 0o600);
    const status = makeContext(value.fake, { mode: "rpc", persisted: false, selects: ["Status and reconcile"] });
    await workflow.run("", status.ctx);
    assert.ok(status.notifications.some(({ message }) => message.includes("Crash-left workspace lock")));
    assert.ok((await readdir(value.root)).includes(".pi-career-workspace.lock"));
    await rm(workspaceLock);

    const conflicting = createApplicationEntry(
      "Changed Synthetic Company",
      value.identity.role_label,
      "applied",
      { uuid: value.ids, now: () => new Date("2026-08-12T00:05:00.000Z") },
      value.identity.application_id,
    );
    value.fake.entries.push(sessionEntry(conflicting, 2));
    const identityContext = makeContext(value.fake, { mode: "rpc", persisted: false });
    await assert.rejects(workflow.run("", identityContext.ctx), /workspace_identity_conflict/);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("unmarked nonempty roots and changed previews fail with zero mutation", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    await writeFile(path.join(value.root, ".incidental"), "synthetic\n");
    const workflow = new ApplicationWorkspaceWorkflow({ agentDir: value.agentDir, now, uuid: value.ids });
    const nonempty = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
    });
    await assert.rejects(workflow.run("", nonempty.ctx), /workspace_drift/);
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);

    await rm(path.join(value.root, ".incidental"));
    const changed = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => `${preview} `], confirms: [true],
    });
    await assert.rejects(workflow.run("", changed.ctx), /workspace_preview_changed/);
    assert.deepEqual(await readdir(value.root), []);
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);

    const movedRoot = path.join(value.temp, "applications-moved");
    const replaced = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview],
      confirms: [async () => {
        await rename(value.root, movedRoot);
        await mkdir(value.root, { mode: 0o700 });
        await chmod(value.root, 0o700);
        return true;
      }],
    });
    await assert.rejects(workflow.run("", replaced.ctx), /workspace_drift/);
    assert.deepEqual(await readdir(value.root), []);
    assert.deepEqual(await readdir(movedRoot), []);
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("marked-root audits reject malformed children and duplicate application UUIDs", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const workflow = new ApplicationWorkspaceWorkflow({ agentDir: value.agentDir, now, uuid: value.ids });
    const replacementRoot = await privateDirectory(value.temp, "replacement-applications");
    const replacement = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [replacementRoot],
    });
    await assert.rejects(workflow.run("", replacement.ctx), /workspace_unavailable/);
    assert.deepEqual(await readdir(replacementRoot), []);
    assert.equal((await loadConfig(value.agentDir)).application_workspace.root_path, value.root);

    const validConfigBytes = await readFile(value.configFile);
    const mismatchedConfig = JSON.parse(validConfigBytes);
    mismatchedConfig.application_workspace.root_id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const mismatchedBytes = `${JSON.stringify(mismatchedConfig, null, 2)}\n`;
    await writeFile(value.configFile, mismatchedBytes, { mode: 0o600 });
    await chmod(value.configFile, 0o600);
    const mismatchedMarkerBinding = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
    });
    await assert.rejects(workflow.run("", mismatchedMarkerBinding.ctx), /workspace_identity_conflict/);
    assert.equal(await readFile(value.configFile, "utf8"), mismatchedBytes);
    await writeFile(value.configFile, validConfigBytes, { mode: 0o600 });
    await chmod(value.configFile, 0o600);

    const markerFile = path.join(value.root, ".pi-career-applications.json");
    const markerBytes = await readFile(markerFile);
    await rm(markerFile);
    const missingMarker = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
    });
    await assert.rejects(workflow.run("", missingMarker.ctx), /workspace_drift/);
    assert.deepEqual(await readdir(value.root), []);
    await writeFile(markerFile, markerBytes, { mode: 0o600 });
    await chmod(markerFile, 0o600);

    const malformedChild = path.join(value.root, "unexpected-root-file");
    await writeFile(malformedChild, "synthetic\n");
    const malformed = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Detach application root from config"],
    });
    await assert.rejects(workflow.run("", malformed.ctx), /workspace_drift/);
    assert.notEqual((await loadConfig(value.agentDir)).application_workspace, null);
    await rm(malformedChild);

    await runWorkspace(value.fake, {
      selects: ["Initialize current application"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const originalDirectory = path.join(
      value.root,
      `synthetic-company--platform-engineer--${value.identity.application_id}`,
    );
    const duplicateDirectory = path.join(value.root, `duplicate--role--${value.identity.application_id}`);
    await mkdir(duplicateDirectory, { mode: 0o700 });
    await chmod(duplicateDirectory, 0o700);
    await writeFile(
      path.join(duplicateDirectory, "application.json"),
      await readFile(path.join(originalDirectory, "application.json")),
      { mode: 0o600 },
    );
    await chmod(path.join(duplicateDirectory, "application.json"), 0o600);
    const duplicate = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Detach application root from config"],
    });
    await assert.rejects(workflow.run("", duplicate.ctx), /workspace_identity_conflict/);
    assert.notEqual((await loadConfig(value.agentDir)).application_workspace, null);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("workspace configuration never bootstraps a missing config directory", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-workspace-config-dir-")));
  try {
    const agentDir = path.join(temp, "agent");
    await mkdir(agentDir);
    const root = await privateDirectory(temp, "applications");
    const fake = makeFakePi();
    const ids = uuidSequence();
    fake.entries.push(sessionEntry(createApplicationEntry("Synthetic Company", "Platform Engineer", "preparing", {
      uuid: ids,
      now,
    }), 1));
    const workflow = new ApplicationWorkspaceWorkflow({ agentDir, now, uuid: ids });
    const context = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [root],
    });
    await assert.rejects(workflow.run("", context.ctx), /workspace_config_invalid/);
    await assert.rejects(lstat(path.dirname(configPath(agentDir))), (error) => error?.code === "ENOENT");
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("workspace metadata requires exact field order and every carried vacancy binding remains exact", async () => {
  const value = await workspaceFixture();
  try {
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    await runWorkspace(value.fake, {
      selects: ["Initialize current application"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const applicationDirectory = path.join(
      value.root,
      `synthetic-company--platform-engineer--${value.identity.application_id}`,
    );
    const state1File = path.join(applicationDirectory, ".pi-career-state-000001.json");
    const state1Bytes = await readFile(state1File);
    const state1 = JSON.parse(state1Bytes);
    const invalidState2 = {
      ...state1,
      sequence: 2,
      parent_sha256: sha256Bytes(state1Bytes),
      vacancy: { ...state1.vacancy, content_sha256: "f".repeat(64) },
      updated_at: "2026-08-12T00:01:00.000Z",
    };
    const state2File = path.join(applicationDirectory, ".pi-career-state-000002.json");
    await writeFile(state2File, `${JSON.stringify(invalidState2, null, 2)}\n`, { mode: 0o600 });
    await chmod(state2File, 0o600);

    const workflow = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      now: () => new Date("2026-08-12T00:02:00.000Z"),
      uuid: value.ids,
    });
    const invalidBinding = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Record current status and vacancy"],
    });
    await assert.rejects(workflow.run("", invalidBinding.ctx), /workspace_drift/);

    await rm(state2File);
    await runWorkspace(value.fake, {
      selects: ["Detach application root from config"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const markerFile = path.join(value.root, ".pi-career-applications.json");
    const marker = JSON.parse(await readFile(markerFile, "utf8"));
    await writeFile(markerFile, `${JSON.stringify({
      created_at: marker.created_at,
      root_id: marker.root_id,
      kind: marker.kind,
      schema_version: marker.schema_version,
    }, null, 2)}\n`, { mode: 0o600 });
    await chmod(markerFile, 0o600);
    const reorderedMarker = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Configure application root"], inputs: [value.root],
    });
    await assert.rejects(workflow.run("", reorderedMarker.ctx), /workspace_drift/);
    assert.equal((await loadConfig(value.agentDir)).application_workspace, null);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("selected-original options retain scanner path order and full collision-free identity", () => {
  const common = {
    root_id: "b".repeat(64),
    path: "/synthetic/root/resume.md",
    label: "Synthetic Resume",
    kind: "original",
    format: "markdown",
    modified_at: INITIAL_TIME,
    size_bytes: 10,
    text: "Synthetic",
    text_sha256: "c".repeat(64),
  };
  const records = [
    { ...common, id: `${"a".repeat(12)}${"2".repeat(52)}`, relative_path: "z/resume.md" },
    { ...common, id: `${"a".repeat(12)}${"1".repeat(52)}`, relative_path: "a/resume.md" },
  ];
  const options = selectedOriginalOptions(records);
  assert.deepEqual(options.map(({ record }) => record.relative_path), ["a/resume.md", "z/resume.md"]);
  assert.equal(new Set(options.map(({ option }) => option)).size, 2);
  assert.ok(options.every(({ option, record }) => option.includes(record.id) && option.includes(record.root_id)));
});

test("unrelated application state drift does not deny current status, mutation, detach, or marked-root reattachment", async () => {
  const value = await workspaceFixture({ vacancy: false });
  try {
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    await runWorkspace(value.fake, {
      selects: ["Initialize current application"],
      editors: [(_title, preview) => preview], confirms: [true],
    });

    const otherIdentity = createApplicationEntry("Other Synthetic Company", "Other Engineer", "preparing", {
      uuid: value.ids,
      now: () => new Date("2026-08-12T00:10:00.000Z"),
    });
    const otherFake = makeFakePi();
    otherFake.entries.push(sessionEntry(otherIdentity, 1));
    registerCareerCommands(otherFake.api, {
      agentDir: value.agentDir,
      uuid: value.ids,
      now: () => new Date("2026-08-12T00:11:00.000Z"),
    });
    await runWorkspace(otherFake, {
      selects: ["Initialize current application"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const otherDirectory = path.join(
      value.root,
      `other-synthetic-company--other-engineer--${otherIdentity.application_id}`,
    );
    const driftedState = path.join(otherDirectory, ".pi-career-state-000001.json");
    const driftedBytes = Buffer.concat([await readFile(driftedState), Buffer.from(" ")]);
    await writeFile(driftedState, driftedBytes);

    const status = await runWorkspace(value.fake, { selects: ["Status and reconcile"] });
    assert.ok(status.notifications.some(({ message }) => message.includes("reconciled")));

    await runWorkspace(value.fake, {
      selects: ["Detach application root from config"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    await runWorkspace(value.fake, {
      selects: ["Configure application root"], inputs: [value.root],
      editors: [(_title, preview) => preview], confirms: [true],
    });

    const updated = createApplicationEntry(
      value.identity.company_label,
      value.identity.role_label,
      "applied",
      { uuid: value.ids, now: () => new Date("2026-08-12T00:20:00.000Z") },
      value.identity.application_id,
    );
    value.fake.entries.push(sessionEntry(updated, 2));
    await runWorkspace(value.fake, {
      selects: ["Record current status and vacancy"],
      editors: [(_title, preview) => preview], confirms: [true],
    });
    const currentDirectory = path.join(
      value.root,
      `synthetic-company--platform-engineer--${value.identity.application_id}`,
    );
    const state2 = JSON.parse(await readFile(path.join(currentDirectory, ".pi-career-state-000002.json"), "utf8"));
    assert.equal(state2.status, "applied");
    assert.deepEqual(await readFile(driftedState), driftedBytes);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
