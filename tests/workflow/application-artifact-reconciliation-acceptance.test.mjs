// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadAttachedApplicationSources,
  readApplicationCatalog,
} from "../../src/workflow/application-workspace.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { createApplicationAttachmentEntry } from "../../src/workflow/session-attachment.ts";
import { createApplicationEntry } from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, normalizationResult, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000140";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000141";
const APPLICATION_CREATED_AT = "2026-10-01T00:00:00.000Z";
const ROOT_CREATED_AT = "2026-10-01T00:00:01.000Z";
const MUTATION_AT = "2026-10-01T00:00:03.000Z";
const DIRECTORY_NAME = `synthetic-publisher--synthetic-reviewer--${APPLICATION_ID}`;
const HISTORICAL_VACANCY = Buffer.from("Synthetic historical vacancy bytes.\n");
const ORPHAN_VACANCY = Buffer.from("Synthetic crash-left orphan vacancy bytes.\n");
const PRIVATE_SENTINEL = "SYNTHETIC-ORPHAN-PRIVATE-SENTINEL";
const MUTATION_ID = "00000000-0000-4000-8000-0000000001a3";
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function privateJson(file, value) {
  await privateFile(file, canonical(value));
}

async function snapshot(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const metadata = await lstat(target);
    if (entry.isDirectory()) {
      result[entry.name] = { type: "directory", mode: metadata.mode & 0o777, entries: await snapshot(target) };
    } else {
      const bytes = await readFile(target);
      result[entry.name] = {
        type: "file", mode: metadata.mode & 0o777, bytes: bytes.toString("hex"), sha256: hash(bytes),
      };
    }
  }
  return result;
}

function assertPrivateTree(tree) {
  for (const entry of Object.values(tree)) {
    assert.equal(entry.mode, entry.type === "directory" ? 0o700 : 0o600);
    if (entry.type === "directory") assertPrivateTree(entry.entries);
  }
}

function ids() {
  const values = [
    "00000000-0000-4000-8000-0000000001a1",
    "00000000-0000-4000-8000-0000000001a2",
    MUTATION_ID,
    "00000000-0000-4000-8000-0000000001a4",
  ];
  let index = 0;
  return () => values[index++] ?? `00000000-0000-4000-8000-${String(0x1a5 + index).padStart(12, "0")}`;
}

function customEntry(customType, data, id, parentId) {
  return { type: "custom", customType, data, id, parentId, timestamp: APPLICATION_CREATED_AT };
}

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-artifact-reconcile-")));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  const directory = path.join(root, DIRECTORY_NAME);
  const library = path.join(temp, "library");
  const sessions = path.join(temp, "sessions");
  await prepareConfigDirectory(agentDir);
  for (const item of [root, directory, library, sessions]) {
    await mkdir(item, { recursive: true, mode: 0o700 });
    await chmod(item, 0o700);
  }
  await privateFile(path.join(library, "synthetic-alternate.md"), Buffer.from(`# Synthetic alternate\n\n${PRIVATE_SENTINEL}\n`));
  await privateFile(path.join(sessions, "synthetic-session.jsonl"), Buffer.from(`${PRIVATE_SENTINEL}\n`));
  await privateJson(configPath(agentDir), {
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: rootId(library), path: library, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  });
  await privateJson(path.join(root, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1", kind: "application_workspace_root",
    root_id: ROOT_ID, created_at: ROOT_CREATED_AT,
  });
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: APPLICATION_ID, root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT, workspace_created_at: APPLICATION_CREATED_AT,
  });
  const identity = canonical({
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: APPLICATION_ID, company_label: "Synthetic Publisher",
    role_label: "Synthetic Reviewer", created_at: APPLICATION_CREATED_AT,
  });
  const state = canonical({
    schema_version: "pi.career.application_state.v2", kind: "application_state_revision",
    application_id: APPLICATION_ID, sequence: 1, parent_sha256: hash(manifest), status: "preparing",
    vacancy: {
      relative_path: "vacancy.md", content_sha256: hash(HISTORICAL_VACANCY),
      utf8_bytes: HISTORICAL_VACANCY.length, source_state_id: "00000000-0000-4000-8000-000000000142",
    },
    selected_original: null, resume_artifact: null, cover_letter_artifact: null,
    updated_at: "2026-10-01T00:00:02.000Z",
  });
  for (const [name, bytes] of [
    ["application.json", manifest], [".pi-career-identity.json", identity],
    [".pi-career-state-000001.json", state], ["vacancy.md", HISTORICAL_VACANCY],
  ]) await privateFile(path.join(directory, name), bytes);
  const application = createApplicationEntry(
    "Synthetic Publisher", "Synthetic Reviewer", "preparing",
    {
      uuid: () => "00000000-0000-4000-8000-000000000144",
      now: () => new Date(APPLICATION_CREATED_AT),
    },
    APPLICATION_ID,
  );
  const attachment = createApplicationAttachmentEntry({
    applicationId: APPLICATION_ID, rootId: ROOT_ID, rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT, workspaceCreatedAt: APPLICATION_CREATED_AT,
  }, { uuid: () => "00000000-0000-4000-8000-000000000143" });
  return { temp, agentDir, root, directory, library, sessions, application, attachment, manifest, identity, state };
}

function boundaries(fake) {
  const calls = { appends: 0, sends: 0, activations: 0, core: 0 };
  const appendEntry = fake.api.appendEntry;
  const setActiveTools = fake.api.setActiveTools;
  fake.api.appendEntry = (...args) => { calls.appends += 1; return appendEntry(...args); };
  fake.api.setActiveTools = (...args) => { calls.activations += 1; return setActiveTools(...args); };
  fake.api.sendMessage = () => { calls.sends += 1; };
  fake.api.sendUserMessage = () => { calls.sends += 1; };
  return calls;
}

function trapContext(fake, options = {}) {
  const newSessions = [];
  const context = makeContext(fake, { mode: "rpc", persisted: false, newSessions, ...options });
  context.ctx.sendMessage = () => assert.fail("local workspace flow must not send");
  context.ctx.sendUserMessage = () => assert.fail("local workspace flow must not send");
  return { ...context, newSessions };
}

function assertUnavailable(error) {
  assert.equal(error?.name, "CareerWorkflowError");
  assert.equal(error?.code, "attachment_unavailable");
  assert.doesNotMatch(error.message, /SYNTHETIC|vacancy|applications|session/i);
  return true;
}

test("P3-40 artifact-published state-absent fault leaves a non-authoritative orphan and registered reconciliation never adopts it", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    assertPrivateTree(before);
    const fake = makeFakePi();
    fake.entries.push(
      customEntry("career.workflow", value.application, "synthetic-application", null),
      customEntry("career.application_attachment", value.attachment, "synthetic-attachment", "synthetic-application"),
    );
    const entriesBefore = structuredClone(fake.entries);
    const calls = boundaries(fake);
    const previews = [];
    let checkpointCalls = 0;
    registerCareerCommands(fake.api, {
      agentDir: value.agentDir,
      now: () => new Date(MUTATION_AT),
      uuid: ids(),
      invoke: async (invocation) => {
        calls.core += 1;
        assert.equal(invocation.operation, "normalize");
        return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
      },
      afterArtifactPublishedBeforeState: async (mutationId) => {
        checkpointCalls += 1;
        assert.equal(mutationId, MUTATION_ID);
        const orphanPath = path.join(value.directory, "vacancy-000002.md");
        assert.deepEqual(await readFile(orphanPath), ORPHAN_VACANCY);
        assert.equal((await lstat(orphanPath)).mode & 0o777, 0o600);
        assert.equal((await readdir(value.directory)).some((name) => name.includes(".tmp")), false);
        await assert.rejects(readFile(path.join(value.directory, ".pi-career-state-000002.json")), { code: "ENOENT" });
        throw new Error(PRIVATE_SENTINEL);
      },
    });
    const mutation = trapContext(fake, {
      selects: [CAREER_UI_RPC_ACTIONS.editVacancy],
      editors: [ORPHAN_VACANCY.toString("utf8"), (_title, preview) => {
        previews.push(JSON.parse(preview));
        return preview;
      }],
      confirms: [true],
    });
    await fake.commands.get("career-vacancy").handler("", mutation.ctx);

    assert.equal(checkpointCalls, 1);
    assert.equal(calls.core, 1, "only explicit pre-publication normalization reached Core");
    assert.deepEqual(fake.entries, entriesBefore);
    assert.deepEqual(mutation.newSessions, []);
    assert.equal(calls.appends, 0);
    assert.equal(calls.sends, 0);
    assert.equal(calls.activations, 0);
    assert.equal(fake.tools.size, 0);
    assert.deepEqual(previews[0].creates.map(({ path: target }) => path.basename(target)), [
      "vacancy-000002.md", ".pi-career-state-000002.json",
    ]);
    assert.equal(previews[0].creates[0].sha256, hash(ORPHAN_VACANCY));
    const absentState = canonical({
      schema_version: "pi.career.application_state.v2", kind: "application_state_revision",
      application_id: APPLICATION_ID, sequence: 2, parent_sha256: hash(value.state), status: "preparing",
      vacancy: {
        relative_path: "vacancy-000002.md", content_sha256: hash(ORPHAN_VACANCY),
        utf8_bytes: ORPHAN_VACANCY.length, source_state_id: "00000000-0000-4000-8000-0000000001a4",
      },
      selected_original: null, resume_artifact: null, cover_letter_artifact: null, updated_at: MUTATION_AT,
    });
    assert.equal(previews[0].creates[1].sha256, hash(absentState));
    assert.equal(previews[0].creates[1].text, absentState.toString("utf8"));
    assert.doesNotMatch(JSON.stringify(mutation.notifications), new RegExp(PRIVATE_SENTINEL));

    const afterFault = await snapshot(value.temp);
    assertPrivateTree(afterFault);
    assert.deepEqual(afterFault.agent, before.agent);
    assert.deepEqual(afterFault.library, before.library);
    assert.deepEqual(afterFault.sessions, before.sessions);
    assert.deepEqual(
      afterFault.applications.entries[".pi-career-applications.json"],
      before.applications.entries[".pi-career-applications.json"],
    );
    for (const name of ["application.json", ".pi-career-identity.json", ".pi-career-state-000001.json", "vacancy.md"]) {
      assert.deepEqual(
        afterFault.applications.entries[DIRECTORY_NAME].entries[name],
        before.applications.entries[DIRECTORY_NAME].entries[name],
      );
    }
    assert.deepEqual((await readdir(value.directory)).sort(), [
      ".pi-career-identity.json", ".pi-career-state-000001.json",
      "application.json", "vacancy-000002.md", "vacancy.md",
    ]);
    assert.deepEqual(await readFile(path.join(value.directory, "vacancy-000002.md")), ORPHAN_VACANCY);
    assert.equal((await readdir(value.root)).includes(".pi-career-workspace.lock"), false);

    const restart = makeFakePi();
    restart.entries.push(...structuredClone(entriesBefore));
    const restartCalls = boundaries(restart);
    registerCareerCommands(restart.api, {
      agentDir: value.agentDir,
      now: () => new Date("2026-10-01T00:00:04.000Z"),
      uuid: () => "00000000-0000-4000-8000-0000000001b0",
      invoke: async () => {
        restartCalls.core += 1;
        throw new Error("reconciliation must not invoke Career Core");
      },
    });
    const beforeReconcile = await snapshot(value.temp);
    const restartEntries = structuredClone(restart.entries);
    const reconcile = trapContext(restart, {
      selects: [CAREER_UI_RPC_ACTIONS.workspace, "Status and reconcile"],
      editors: [() => assert.fail("reconciliation must not preview a write")],
      confirms: [() => assert.fail("reconciliation must not confirm a write")],
    });
    await restart.commands.get("career-workspace").handler("", reconcile.ctx);

    assert.ok(reconcile.notifications.some(({ message, type }) => type === "warning" &&
      message.includes("Orphan managed artifact detected. It is not current, attached, selected, effective, or implicitly adopted; reconciliation made no change.")),
    JSON.stringify(reconcile.notifications));
    assert.doesNotMatch(JSON.stringify(reconcile.notifications), /SYNTHETIC|vacancy-000002|synthetic-session|synthetic-alternate/i);
    assert.deepEqual(await snapshot(value.temp), beforeReconcile);
    assert.deepEqual(restart.entries, restartEntries);
    assert.deepEqual(reconcile.newSessions, []);
    assert.deepEqual(restartCalls, { appends: 0, sends: 0, activations: 0, core: 0 });
    assert.equal(restart.tools.size, 0);

    const catalog = await readApplicationCatalog(value.root, ROOT_ID);
    assert.deepEqual(catalog.applications, []);
    assert.deepEqual(catalog.reconciliation, {
      interrupted: 0, drifted: 1, duplicate_id: 0, unsupported: 0, over_limit: 0,
    });
    await assert.rejects(loadAttachedApplicationSources(value.agentDir, value.attachment), assertUnavailable);
    assert.deepEqual(await snapshot(value.temp), beforeReconcile);
    assert.deepEqual(restart.entries, restartEntries);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
