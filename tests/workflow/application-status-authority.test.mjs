// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplicationWorkspaceWorkflow } from "../../src/workflow/application-workspace.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { createApplicationAttachmentEntry } from "../../src/workflow/session-attachment.ts";
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000077";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateJson(file, value) {
  await writeFile(file, canonical(value), { mode: 0o600 });
  await chmod(file, 0o600);
}

async function snapshot(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const metadata = await stat(target);
    result[entry.name] = entry.isDirectory()
      ? { type: "directory", mode: metadata.mode & 0o777, entries: await snapshot(target) }
      : { type: "file", mode: metadata.mode & 0o777, bytes: (await readFile(target)).toString("hex") };
  }
  return result;
}

function assertPrivateTree(tree) {
  for (const entry of Object.values(tree)) {
    assert.equal(entry.mode, entry.type === "directory" ? 0o700 : 0o600);
    if (entry.type === "directory") assertPrivateTree(entry.entries);
  }
}

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-status-authority-")));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  const library = path.join(temp, "library");
  await prepareConfigDirectory(agentDir);
  await mkdir(root, { mode: 0o700 });
  await chmod(root, 0o700);
  await mkdir(library, { mode: 0o700 });
  await chmod(library, 0o700);
  await writeFile(path.join(library, "synthetic-resume.md"), "# Synthetic Resume\n", { mode: 0o600 });
  await chmod(path.join(library, "synthetic-resume.md"), 0o600);
  await privateJson(path.join(agentDir, "career", "config.v1.json"), {
    schema_version: "pi.career.config.v2",
    library_roots: [],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  });
  await privateJson(path.join(root, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: ROOT_CREATED_AT,
  });
  const directory = path.join(root, `synthetic-company--synthetic-engineer--${APPLICATION_ID}`);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: APPLICATION_ID,
    root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT,
    workspace_created_at: WORKSPACE_CREATED_AT,
  });
  await writeFile(path.join(directory, "application.json"), manifest, { mode: 0o600 });
  await chmod(path.join(directory, "application.json"), 0o600);
  await privateJson(path.join(directory, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: APPLICATION_ID,
    company_label: "Synthetic Company",
    role_label: "Synthetic Engineer",
    created_at: APPLICATION_CREATED_AT,
  });
  const state1 = canonical({
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: APPLICATION_ID,
    sequence: 1,
    parent_sha256: hash(manifest),
    status: "preparing",
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    updated_at: WORKSPACE_CREATED_AT,
  });
  const state2 = canonical({
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: APPLICATION_ID,
    sequence: 2,
    parent_sha256: hash(state1),
    status: "interviewing",
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    updated_at: "2026-08-04T00:00:00.000Z",
  });
  await writeFile(path.join(directory, ".pi-career-state-000001.json"), state1, { mode: 0o600 });
  await chmod(path.join(directory, ".pi-career-state-000001.json"), 0o600);
  await writeFile(path.join(directory, ".pi-career-state-000002.json"), state2, { mode: 0o600 });
  await chmod(path.join(directory, ".pi-career-state-000002.json"), 0o600);
  const fake = makeFakePi();
  const attachment = createApplicationAttachmentEntry({
    applicationId: APPLICATION_ID,
    rootId: ROOT_ID,
    rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT,
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
  }, { uuid: uuidSequence() });
  fake.entries.push({
    type: "custom", customType: "career.application_attachment", data: attachment,
    id: "attach-1", parentId: null, timestamp: WORKSPACE_CREATED_AT,
  });
  let tick = 10;
  const now = () => new Date(`2026-08-12T00:00:${String(tick++).padStart(2, "0")}.000Z`);
  const ids = uuidSequence();
  let invocations = 0;
  const invoke = async () => {
    invocations += 1;
    throw new Error("application status must not invoke Career Core");
  };
  registerCareerCommands(fake.api, { agentDir, now, uuid: ids, invoke });
  const workspace = new ApplicationWorkspaceWorkflow({
    agentDir, now, uuid: ids,
    appendEntry: (customType, data) => fake.api.appendEntry(customType, data),
  });
  return {
    temp, root, directory, fake, workspace, manifest, state1, state2,
    get invocations() { return invocations; },
  };
}

test("P3-08/P3-09/P3-45 public attached status reads a complete v1 chain and approved mutation appends the exact v2 transition", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    assertPrivateTree(before);
    const legacyKeys = [
      "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
      "vacancy", "selected_original", "resume_artifact", "updated_at",
    ];
    const legacy1 = JSON.parse(value.state1);
    const legacy2 = JSON.parse(value.state2);
    assert.deepEqual(Object.keys(legacy1), legacyKeys);
    assert.deepEqual(Object.keys(legacy2), legacyKeys);
    assert.equal(legacy1.parent_sha256, hash(value.manifest));
    assert.equal(legacy2.parent_sha256, hash(value.state1));
    const beforeEntries = structuredClone(value.fake.entries);
    const status = makeContext(value.fake, { mode: "rpc", persisted: false });
    await value.fake.commands.get("career-application").handler("status", status.ctx);
    assert.ok(status.notifications.some(({ message }) => message === "Synthetic Company — Synthetic Engineer — interviewing"));
    assert.doesNotMatch(JSON.stringify(status.notifications), /applications|synthetic-resume\.md/);
    assert.deepEqual(await snapshot(value.temp), before);
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.equal(value.invocations, 0);

    const cancelledPreview = makeContext(value.fake, {
      mode: "rpc", persisted: false, editors: [undefined],
    });
    assert.equal(await value.workspace.writeAttachedStatus(cancelledPreview.ctx, "applied"), "cancelled");
    assert.deepEqual(await snapshot(value.temp), before);

    const cancelledConfirm = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, preview) => preview],
      confirms: [false],
    });
    assert.equal(await value.workspace.writeAttachedStatus(cancelledConfirm.ctx, "applied"), "cancelled");
    assert.deepEqual(await snapshot(value.temp), before);

    const saved = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: [CAREER_UI_RPC_ACTIONS.updateStatus, "Applied", CAREER_UI_RPC_ACTIONS.close],
      editors: [(_title, preview) => preview],
      confirms: [true],
    });
    await value.fake.commands.get("career").handler("", saved.ctx);

    const transition = canonical({
      schema_version: "pi.career.application_state.v2",
      kind: "application_state_revision",
      application_id: APPLICATION_ID,
      sequence: 3,
      parent_sha256: hash(value.state2),
      status: "interviewing",
      vacancy: null,
      selected_original: null,
      resume_artifact: null,
      cover_letter_artifact: null,
      updated_at: "2026-08-04T00:00:00.001Z",
    });
    const mutation = canonical({
      schema_version: "pi.career.application_state.v2",
      kind: "application_state_revision",
      application_id: APPLICATION_ID,
      sequence: 4,
      parent_sha256: hash(transition),
      status: "applied",
      vacancy: null,
      selected_original: null,
      resume_artifact: null,
      cover_letter_artifact: null,
      updated_at: "2026-08-12T00:00:12.000Z",
    });
    assert.deepEqual(await readFile(path.join(value.directory, ".pi-career-state-000003.json")), transition);
    assert.deepEqual(await readFile(path.join(value.directory, ".pi-career-state-000004.json")), mutation);
    assert.deepEqual(Object.keys(JSON.parse(transition)), [
      "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
      "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
    ]);

    const after = await snapshot(value.temp);
    assertPrivateTree(after);
    const applicationName = path.basename(value.directory);
    const expected = structuredClone(before);
    expected.applications.entries[applicationName].entries[".pi-career-state-000003.json"] = {
      type: "file", mode: 0o600, bytes: transition.toString("hex"),
    };
    expected.applications.entries[applicationName].entries[".pi-career-state-000004.json"] = {
      type: "file", mode: 0o600, bytes: mutation.toString("hex"),
    };
    assert.deepEqual(after, expected);
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.equal(value.invocations, 0);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-45 attached application clear detaches without session-only status or file mutation", async () => {
  const value = await fixture();
  try {
    const beforeRoot = await snapshot(value.root);
    const cancelled = makeContext(value.fake, { mode: "rpc", persisted: false, confirms: [false] });
    await value.fake.commands.get("career-application").handler("clear", cancelled.ctx);
    assert.equal(value.fake.entries.at(-1).data.kind, "application_attachment");
    assert.deepEqual(await snapshot(value.root), beforeRoot);

    const detached = makeContext(value.fake, { mode: "rpc", persisted: false, confirms: [true] });
    await value.fake.commands.get("career-application").handler("clear", detached.ctx);
    const last = value.fake.entries.at(-1);
    assert.equal(last.customType, "career.application_attachment");
    assert.equal(last.data.kind, "application_detachment");
    assert.equal(value.fake.entries.some((entry) => entry.data?.kind === "application_clear"), false);
    assert.equal(value.fake.entries.some((entry) => entry.data?.kind === "vacancy_clear"), false);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
