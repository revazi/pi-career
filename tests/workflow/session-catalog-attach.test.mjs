// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplicationWorkspaceWorkflow } from "../../src/workflow/application-workspace.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_ASSISTANCE_HANDOFF } from "../../src/workflow/session-attachment.ts";
import { createApplicationEntry } from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000077";
const OTHER_APP_ID = "00000000-0000-4000-8000-000000000066";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const OPTION = "Synthetic Company — Synthetic Engineer — preparing";
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
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-catalog-attach-")));
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
  const fake = makeFakePi();
  let tick = 10;
  const workspaceNow = () => new Date(`2026-08-12T00:00:${String(tick++).padStart(2, "0")}.000Z`);
  const ids = uuidSequence();
  registerCareerCommands(fake.api, {
    agentDir,
    now: workspaceNow,
    uuid: ids,
    invoke: async () => { throw new Error("catalog attach must not invoke Career Core"); },
  });
  const workspace = new ApplicationWorkspaceWorkflow({
    agentDir, now: workspaceNow, uuid: ids,
    appendEntry: (customType, data) => fake.api.appendEntry(customType, data),
  });
  return { temp, root, agentDir, fake, workspace };
}

async function runWorkspace(value, options = {}) {
  const context = makeContext(value.fake, { mode: "rpc", persisted: false, ...options });
  await value.workspace.run("", context.ctx);
  return context;
}

test("P3-16/P3-28 a clean Pi session can attach a validated catalog application", async () => {
  const value = await fixture();
  try {
    const beforeRoot = await snapshot(value.root);
    const cancelled = await runWorkspace(value, {
      selects: ["Attach application", OPTION], confirms: [false],
    });
    assert.equal(value.fake.entries.length, 0);
    assert.ok(cancelled.notifications.every(({ message }) => !message.includes("attached")));
    const editorText = [];
    await runWorkspace(value, {
      selects: ["Attach application", OPTION], confirms: [true], editorText,
    });
    assert.equal(value.fake.entries.length, 1);
    const entry = value.fake.entries[0];
    assert.equal(entry.customType, "career.application_attachment");
    assert.equal(entry.data.application_id, APPLICATION_ID);
    assert.doesNotMatch(JSON.stringify(entry.data), /Synthetic|applications|resume/);
    assert.deepEqual(editorText, []);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
    await runWorkspace(value, {
      selects: ["Activate Career assistance"], confirms: [true], editorText,
      reload: async () => {},
    });
    assert.deepEqual(editorText, [CAREER_ASSISTANCE_HANDOFF]);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-29/P3-55 a used session opens another application only in a replacement session", async () => {
  const value = await fixture();
  try {
    const other = createApplicationEntry("Other Company", "Other Role", "preparing", {
      uuid: uuidSequence(),
      now: () => new Date(APPLICATION_CREATED_AT),
    }, OTHER_APP_ID);
    value.fake.entries.push({
      type: "custom", customType: "career.workflow", data: other,
      id: "other-1", parentId: null, timestamp: APPLICATION_CREATED_AT,
    });
    const beforeEntries = structuredClone(value.fake.entries);
    const replacementEntries = [];
    const newSessions = [];
    await runWorkspace(value, {
      selects: ["Open application in new Pi session", OPTION],
      confirms: [true],
      replacementEntries,
      newSessions,
    });
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.equal(replacementEntries.length, 1);
    assert.equal(replacementEntries[0].customType, "career.application_attachment");
    assert.equal(replacementEntries[0].data.application_id, APPLICATION_ID);
    assert.equal(newSessions.length, 1);
    assert.doesNotMatch(JSON.stringify(replacementEntries), /applications|resume\.md/);
    const cancelledEntries = [];
    await runWorkspace(value, {
      selects: ["Open application in new Pi session", OPTION],
      confirms: [true],
      replacementEntries: cancelledEntries,
      newSessionCancelled: true,
    });
    assert.deepEqual(cancelledEntries, []);
    assert.deepEqual(value.fake.entries, beforeEntries);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
