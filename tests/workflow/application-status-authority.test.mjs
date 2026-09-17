// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

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
    result[entry.name] = entry.isDirectory() ? await snapshot(target) : (await readFile(target)).toString("hex");
  }
  return result;
}

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-status-authority-")));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  await prepareConfigDirectory(agentDir);
  await mkdir(root, { mode: 0o700 });
  await chmod(root, 0o700);
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
  await privateJson(path.join(directory, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v2",
    kind: "application_state_revision",
    application_id: APPLICATION_ID,
    sequence: 1,
    parent_sha256: hash(manifest),
    status: "preparing",
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    cover_letter_artifact: null,
    updated_at: WORKSPACE_CREATED_AT,
  });
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
  registerCareerCommands(fake.api, {
    agentDir,
    now: () => new Date(`2026-08-12T00:00:${String(tick++).padStart(2, "0")}.000Z`),
    uuid: uuidSequence(),
    invoke: async () => { throw new Error("application status must not invoke Career Core"); },
  });
  return { temp, root, directory, fake };
}

test("P3-45 attached application status is workspace-only and cancelled updates change neither authority", async () => {
  const value = await fixture();
  try {
    const beforeRoot = await snapshot(value.root);
    const beforeEntries = structuredClone(value.fake.entries);
    const status = makeContext(value.fake, { mode: "rpc", persisted: false });
    await value.fake.commands.get("career-application").handler("status", status.ctx);
    assert.ok(status.notifications.some(({ message }) => message.includes("preparing")));
    assert.doesNotMatch(JSON.stringify(status.notifications), /applications|resume\.md/);
    assert.deepEqual(value.fake.entries, beforeEntries);

    const cancelledPreview = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Update status", "Applied"],
      editors: [undefined],
    });
    await value.fake.commands.get("career-application").handler("", cancelledPreview.ctx);
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.deepEqual(await snapshot(value.root), beforeRoot);

    const cancelledConfirm = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Update status", "Applied"],
      editors: [(_title, preview) => preview],
      confirms: [false],
    });
    await value.fake.commands.get("career-application").handler("", cancelledConfirm.ctx);
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
    assert.ok(cancelledConfirm.notifications.some(({ message }) => message.includes("cancelled")));

    const saved = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Update status", "Applied"],
      editors: [(_title, preview) => preview],
      confirms: [true],
    });
    await value.fake.commands.get("career-application").handler("", saved.ctx);
    assert.equal(value.fake.entries.some((entry) => entry.data?.kind === "application"), false);
    assert.deepEqual(
      value.fake.entries.map((entry) => entry.customType),
      beforeEntries.map((entry) => entry.customType),
    );
    const after = await snapshot(value.directory);
    assert.notEqual(after[".pi-career-state-000002.json"], undefined);
    assert.equal(after["application.json"], beforeRoot[path.basename(value.directory)]["application.json"]);
    assert.match(Buffer.from(after[".pi-career-state-000002.json"], "hex").toString("utf8"), /"status": "applied"/);
    assert.match(Buffer.from(after[".pi-career-state-000002.json"], "hex").toString("utf8"), /"schema_version": "pi.career.application_state.v2"/);
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
