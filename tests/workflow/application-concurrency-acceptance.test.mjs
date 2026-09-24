// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplicationWorkspaceWorkflow } from "../../src/workflow/application-workspace.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { createApplicationAttachmentEntry } from "../../src/workflow/session-attachment.ts";
import { createApplicationEntry } from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000090";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000091";
const APPLICATION_STATE_ID = "00000000-0000-4000-8000-000000000092";
const APPLICATION_CREATED_AT = "2026-09-01T00:00:00.000Z";
const ROOT_CREATED_AT = "2026-09-01T00:00:01.000Z";
const DIRECTORY_NAME = `synthetic-company--synthetic-engineer--${APPLICATION_ID}`;
const PRIVATE_SENTINEL = "SYNTHETIC-CONCURRENCY-PRIVATE-SENTINEL";
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

function sessionEntry(data) {
  return {
    type: "custom", customType: "career.workflow", data,
    id: "synthetic-application", parentId: null, timestamp: data.created_at,
  };
}

async function privateJson(file, value) {
  await writeFile(file, canonical(value), { mode: 0o600 });
  await chmod(file, 0o600);
}

async function snapshot(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const metadata = await lstat(target);
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

function fixed(value) {
  return () => value;
}

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-concurrency-")));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  const library = path.join(temp, "library");
  const sessions = path.join(temp, "sessions");
  await prepareConfigDirectory(agentDir);
  for (const directory of [root, library, sessions]) {
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o700);
  }
  await writeFile(path.join(library, "synthetic-resume.md"), `# Synthetic Resume\n\n${PRIVATE_SENTINEL}\n`, { mode: 0o600 });
  await chmod(path.join(library, "synthetic-resume.md"), 0o600);
  await writeFile(path.join(sessions, "synthetic-session.jsonl"), `${PRIVATE_SENTINEL}\n`, { mode: 0o600 });
  await chmod(path.join(sessions, "synthetic-session.jsonl"), 0o600);
  await privateJson(configPath(agentDir), {
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: rootId(library), path: library, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  });
  await privateJson(path.join(root, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: ROOT_CREATED_AT,
  });
  const identity = createApplicationEntry(
    "Synthetic Company", "Synthetic Engineer", "preparing",
    { uuid: fixed(APPLICATION_STATE_ID), now: fixed(new Date(APPLICATION_CREATED_AT)) }, APPLICATION_ID,
  );
  const fake = makeFakePi();
  fake.entries.push(sessionEntry(identity));
  return { temp, agentDir, root, library, sessions, identity, fake };
}

function concurrentWorkflow(value, { mutationId, createdAt, locked, releaseLock }) {
  return new ApplicationWorkspaceWorkflow({
    agentDir: value.agentDir,
    uuid: fixed(mutationId),
    now: fixed(new Date(createdAt)),
    withMutationQueues: async (_paths, operation) => operation(),
    afterWorkspaceLockAcquired: async () => {
      locked.release();
      await releaseLock.promise;
    },
  });
}

function approvingContext(fake, prepared, commit, previews) {
  return makeContext(fake, {
    mode: "rpc", persisted: false,
    editors: [(_title, preview) => {
      previews.push(JSON.parse(preview));
      return preview;
    }],
    confirms: [async () => {
      prepared.release();
      await commit.promise;
      return true;
    }],
  });
}

function assertBusy(error) {
  assert.equal(error?.name, "CareerWorkflowError");
  assert.equal(error?.code, "workspace_busy");
  assert.equal(error.message, JSON.stringify({
    schema_version: "pi.career.workflow_error.v1",
    code: "workspace_busy",
    message: "Another workspace mutation is active or a prior lock requires inspection.",
  }));
  assert.doesNotMatch(error.message, /SYNTHETIC|applications|resume|session/i);
  return true;
}

async function runContenders(startWinner, startLoser, controls) {
  const winnerPromise = startWinner();
  const loserPromise = startLoser();
  await Promise.all([controls.winnerPrepared.promise, controls.loserPrepared.promise]);
  controls.winnerCommit.release();
  await controls.winnerLocked.promise;
  controls.loserCommit.release();
  const loserError = await loserPromise.then(
    () => assert.fail("the lock contender must fail closed"),
    (error) => error,
  );
  assertBusy(loserError);
  controls.winnerRelease.release();
  await winnerPromise;
}

function controls() {
  return {
    winnerPrepared: gate(), loserPrepared: gate(), winnerCommit: gate(), loserCommit: gate(),
    winnerLocked: gate(), winnerRelease: gate(), loserLocked: gate(), loserRelease: gate(),
  };
}

test("P3-38 two same-UUID creators commit concurrently with one exact no-retry winner", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    const c = controls();
    const winnerTime = "2026-09-01T00:00:10.000Z";
    const winner = concurrentWorkflow(value, {
      mutationId: "00000000-0000-4000-8000-0000000000a1", createdAt: winnerTime,
      locked: c.winnerLocked, releaseLock: c.winnerRelease,
    });
    const loser = concurrentWorkflow(value, {
      mutationId: "00000000-0000-4000-8000-0000000000a2", createdAt: "2026-09-01T00:00:11.000Z",
      locked: c.loserLocked, releaseLock: c.loserRelease,
    });
    const winnerPreviews = [];
    const loserPreviews = [];
    const winnerContext = approvingContext(value.fake, c.winnerPrepared, c.winnerCommit, winnerPreviews);
    const loserContext = approvingContext(value.fake, c.loserPrepared, c.loserCommit, loserPreviews);
    await runContenders(
      () => winner.initializeCurrentApplication(winnerContext.ctx),
      () => loser.initializeCurrentApplication(loserContext.ctx), c,
    );

    const directory = path.join(value.root, DIRECTORY_NAME);
    assert.equal(winnerPreviews.length, 1);
    assert.equal(loserPreviews.length, 1);
    assert.deepEqual(
      winnerPreviews[0].creates.map(({ path: target }) => target),
      loserPreviews[0].creates.map(({ path: target }) => target),
    );
    assert.equal(winnerPreviews[0].creates[0].path, directory);
    const manifest = canonical({
      schema_version: "pi.career.application_manifest.v1", kind: "career_application",
      application_id: APPLICATION_ID, root_id: ROOT_ID,
      application_created_at: APPLICATION_CREATED_AT, workspace_created_at: winnerTime,
    });
    const identity = canonical({
      schema_version: "pi.career.application_identity.v1", kind: "application_identity",
      application_id: APPLICATION_ID, company_label: "Synthetic Company",
      role_label: "Synthetic Engineer", created_at: APPLICATION_CREATED_AT,
    });
    const state = canonical({
      schema_version: "pi.career.application_state.v1", kind: "application_state_revision",
      application_id: APPLICATION_ID, sequence: 1, parent_sha256: hash(manifest), status: "preparing",
      vacancy: null, selected_original: null, resume_artifact: null, updated_at: winnerTime,
    });
    assert.deepEqual(await readdir(value.root), [".pi-career-applications.json", DIRECTORY_NAME]);
    assert.deepEqual((await readdir(directory)).sort(), [
      ".pi-career-identity.json", ".pi-career-state-000001.json", "application.json",
    ]);
    assert.deepEqual(await readFile(path.join(directory, "application.json")), manifest);
    assert.deepEqual(await readFile(path.join(directory, ".pi-career-identity.json")), identity);
    assert.deepEqual(await readFile(path.join(directory, ".pi-career-state-000001.json")), state);
    const after = await snapshot(value.temp);
    assertPrivateTree(after);
    assert.deepEqual(after.agent, before.agent);
    assert.deepEqual(after.library, before.library);
    assert.deepEqual(after.sessions, before.sessions);
    assert.equal(value.fake.entries.length, 1);
    assert.ok(winnerContext.notifications.every(({ message }) => !message.includes(PRIVATE_SENTINEL)));
    assert.ok(loserContext.notifications.every(({ message }) => !message.includes(PRIVATE_SENTINEL)));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-41 exact durably published state settles success and equivalent retry is idempotent", async () => {
  const value = await fixture();
  try {
    const initializedAt = "2026-09-01T00:00:30.000Z";
    const setup = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      uuid: fixed("00000000-0000-4000-8000-0000000000c0"),
      now: fixed(new Date(initializedAt)),
    });
    const setupContext = makeContext(value.fake, {
      mode: "rpc", persisted: false, editors: [(_title, preview) => preview], confirms: [true],
    });
    await setup.initializeCurrentApplication(setupContext.ctx);
    const attachment = createApplicationAttachmentEntry({
      applicationId: APPLICATION_ID, rootId: ROOT_ID, rootCreatedAt: ROOT_CREATED_AT,
      applicationCreatedAt: APPLICATION_CREATED_AT, workspaceCreatedAt: initializedAt,
    }, { uuid: fixed("00000000-0000-4000-8000-0000000000c1") });
    value.fake.entries.splice(0, value.fake.entries.length, {
      type: "custom", customType: "career.application_attachment", data: attachment,
      id: "synthetic-attachment", parentId: null, timestamp: APPLICATION_CREATED_AT,
    });

    const directory = path.join(value.root, DIRECTORY_NAME);
    const beforeMutation = await snapshot(value.temp);
    const entriesBeforeMutation = structuredClone(value.fake.entries);
    const committedAt = "2026-09-01T00:00:31.000Z";
    const mutationId = "00000000-0000-4000-8000-0000000000c2";
    let faultCalls = 0;
    let publishedBytes;
    const workflow = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      uuid: fixed(mutationId),
      now: fixed(new Date(committedAt)),
      afterRevisionPublished: async (observedMutationId) => {
        faultCalls += 1;
        assert.equal(observedMutationId, mutationId);
        publishedBytes = await readFile(path.join(directory, ".pi-career-state-000003.json"));
        throw new Error(PRIVATE_SENTINEL);
      },
    });
    const previews = [];
    const context = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, preview) => { previews.push(JSON.parse(preview)); return preview; }],
      confirms: [true],
    });
    assert.equal(await workflow.writeAttachedStatus(context.ctx, "applied"), "written");
    assert.equal(faultCalls, 1);

    const state1 = await readFile(path.join(directory, ".pi-career-state-000001.json"));
    const state2 = canonical({
      schema_version: "pi.career.application_state.v2", kind: "application_state_revision",
      application_id: APPLICATION_ID, sequence: 2, parent_sha256: hash(state1), status: "preparing",
      vacancy: null, selected_original: null, resume_artifact: null, cover_letter_artifact: null,
      updated_at: "2026-09-01T00:00:30.001Z",
    });
    const state3 = canonical({
      schema_version: "pi.career.application_state.v2", kind: "application_state_revision",
      application_id: APPLICATION_ID, sequence: 3, parent_sha256: hash(state2), status: "applied",
      vacancy: null, selected_original: null, resume_artifact: null, cover_letter_artifact: null,
      updated_at: committedAt,
    });
    assert.deepEqual(await readFile(path.join(directory, ".pi-career-state-000002.json")), state2);
    assert.deepEqual(await readFile(path.join(directory, ".pi-career-state-000003.json")), state3);
    assert.deepEqual(publishedBytes, state3);
    const afterMutation = await snapshot(value.temp);
    assert.deepEqual(afterMutation.agent, beforeMutation.agent);
    assert.deepEqual(afterMutation.library, beforeMutation.library);
    assert.deepEqual(afterMutation.sessions, beforeMutation.sessions);
    assert.deepEqual(
      afterMutation.applications.entries[".pi-career-applications.json"],
      beforeMutation.applications.entries[".pi-career-applications.json"],
    );
    for (const name of ["application.json", ".pi-career-identity.json", ".pi-career-state-000001.json"]) {
      assert.deepEqual(
        afterMutation.applications.entries[DIRECTORY_NAME].entries[name],
        beforeMutation.applications.entries[DIRECTORY_NAME].entries[name],
      );
    }
    assert.deepEqual(value.fake.entries, entriesBeforeMutation);
    assert.equal(previews[0].expected_state_sha256, hash(state1));
    assert.deepEqual(previews[0].creates.map(({ path: target }) => path.basename(target)), [
      ".pi-career-state-000002.json", ".pi-career-state-000003.json",
    ]);

    const settled = await snapshot(value.temp);
    const entriesBeforeRetry = structuredClone(value.fake.entries);
    const retryContext = makeContext(value.fake, { mode: "rpc", persisted: false });
    assert.equal(await workflow.writeAttachedStatus(retryContext.ctx, "applied"), "unchanged");
    assert.deepEqual(await snapshot(value.temp), settled);
    assert.deepEqual(value.fake.entries, entriesBeforeRetry);
    assert.deepEqual((await readdir(directory)).sort(), [
      ".pi-career-identity.json", ".pi-career-state-000001.json",
      ".pi-career-state-000002.json", ".pi-career-state-000003.json", "application.json",
    ]);
    assert.equal((await readdir(value.root)).includes(".pi-career-workspace.lock"), false);
    assert.ok([...context.notifications, ...retryContext.notifications]
      .every(({ message }) => !message.includes(PRIVATE_SENTINEL)));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-42 crash-left canonical lock blocks one public mutation attempt without replacement", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    const entriesBefore = structuredClone(value.fake.entries);
    const mutationId = "00000000-0000-4000-8000-0000000000d0";
    const createdAt = "2026-09-01T00:00:40.000Z";
    const crashMutationId = "00000000-0000-4000-8000-0000000000df";
    const crashCreatedAt = "2026-09-01T00:00:39.000Z";
    const lockPath = path.join(value.root, ".pi-career-workspace.lock");
    const lockBytes = canonical({
      schema_version: "pi.career.workspace_lock.v1", kind: "workspace_mutation_lock",
      mutation_id: crashMutationId, created_at: crashCreatedAt,
    });
    let acquireCalls = 0;
    let authored;
    const workflow = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      uuid: fixed(mutationId),
      now: fixed(new Date(createdAt)),
      beforeWorkspaceLockAcquire: async (operation, observedMutationId) => {
        acquireCalls += 1;
        assert.equal(operation, "initialize_application");
        assert.equal(observedMutationId, mutationId);
      },
    });
    const previews = [];
    const context = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, preview) => { previews.push(JSON.parse(preview)); return preview; }],
      confirms: [async () => {
        await writeFile(lockPath, lockBytes, { mode: 0o600, flag: "wx" });
        await chmod(lockPath, 0o600);
        authored = await lstat(lockPath);
        return true;
      }],
    });

    await assert.rejects(workflow.initializeCurrentApplication(context.ctx), assertBusy);
    assert.equal(acquireCalls, 1, "the public mutation makes exactly one lock-acquisition attempt");
    const retained = await lstat(lockPath);
    assert.equal(retained.dev, authored.dev);
    assert.equal(retained.ino, authored.ino);
    assert.equal(retained.mode & 0o777, 0o600);
    assert.deepEqual(await readFile(lockPath), lockBytes);
    assert.equal(previews.length, 1);
    assert.deepEqual(value.fake.entries, entriesBefore);
    assert.deepEqual(await snapshot(value.agentDir), before.agent.entries);
    assert.deepEqual(await snapshot(value.library), before.library.entries);
    assert.deepEqual(await snapshot(value.sessions), before.sessions.entries);
    assert.deepEqual((await readdir(value.root)).sort(), [
      ".pi-career-applications.json", ".pi-career-workspace.lock",
    ]);
    assert.ok(context.notifications.every(({ message }) => !message.includes(PRIVATE_SENTINEL)));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-39 two independently prepared same-next-revision plans commit concurrently without fork", async () => {
  const value = await fixture();
  try {
    const setup = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      uuid: fixed("00000000-0000-4000-8000-0000000000b0"),
      now: fixed(new Date("2026-09-01T00:00:20.000Z")),
    });
    const setupContext = makeContext(value.fake, {
      mode: "rpc", persisted: false, editors: [(_title, preview) => preview], confirms: [true],
    });
    await setup.initializeCurrentApplication(setupContext.ctx);
    const attachment = createApplicationAttachmentEntry({
      applicationId: APPLICATION_ID, rootId: ROOT_ID, rootCreatedAt: ROOT_CREATED_AT,
      applicationCreatedAt: APPLICATION_CREATED_AT, workspaceCreatedAt: "2026-09-01T00:00:20.000Z",
    }, { uuid: fixed("00000000-0000-4000-8000-0000000000b1") });
    value.fake.entries.splice(0, value.fake.entries.length, {
      type: "custom", customType: "career.application_attachment", data: attachment,
      id: "synthetic-attachment", parentId: null, timestamp: APPLICATION_CREATED_AT,
    });
    const transition = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      uuid: fixed("00000000-0000-4000-8000-0000000000b2"),
      now: fixed(new Date("2026-09-01T00:00:21.000Z")),
    });
    const transitionContext = makeContext(value.fake, {
      mode: "rpc", persisted: false, editors: [(_title, preview) => preview], confirms: [true],
    });
    assert.equal(await transition.writeAttachedStatus(transitionContext.ctx, "interviewing"), "written");

    const before = await snapshot(value.temp);
    const beforeEntries = structuredClone(value.fake.entries);
    const c = controls();
    const winnerTime = "2026-09-01T00:00:22.000Z";
    const winner = concurrentWorkflow(value, {
      mutationId: "00000000-0000-4000-8000-0000000000b3", createdAt: winnerTime,
      locked: c.winnerLocked, releaseLock: c.winnerRelease,
    });
    const loser = concurrentWorkflow(value, {
      mutationId: "00000000-0000-4000-8000-0000000000b4", createdAt: "2026-09-01T00:00:23.000Z",
      locked: c.loserLocked, releaseLock: c.loserRelease,
    });
    const winnerPreviews = [];
    const loserPreviews = [];
    const winnerContext = approvingContext(value.fake, c.winnerPrepared, c.winnerCommit, winnerPreviews);
    const loserContext = approvingContext(value.fake, c.loserPrepared, c.loserCommit, loserPreviews);
    await runContenders(
      async () => assert.equal(await winner.writeAttachedStatus(winnerContext.ctx, "applied"), "written"),
      () => loser.writeAttachedStatus(loserContext.ctx, "applied"), c,
    );

    const directory = path.join(value.root, DIRECTORY_NAME);
    assert.equal(winnerPreviews.length, 1);
    assert.equal(loserPreviews.length, 1);
    assert.equal(winnerPreviews[0].expected_state_sha256, loserPreviews[0].expected_state_sha256);
    assert.equal(winnerPreviews[0].expected_state_sha256,
      hash(await readFile(path.join(directory, ".pi-career-state-000003.json"))));
    assert.deepEqual(
      winnerPreviews[0].creates.map(({ path: target }) => target),
      loserPreviews[0].creates.map(({ path: target }) => target),
    );
    assert.deepEqual(winnerPreviews[0].creates.map(({ path: target }) => path.basename(target)),
      [".pi-career-state-000004.json"]);
    const stateFiles = (await readdir(directory)).filter((name) => name.startsWith(".pi-career-state-")).sort();
    assert.deepEqual(stateFiles, [
      ".pi-career-state-000001.json", ".pi-career-state-000002.json",
      ".pi-career-state-000003.json", ".pi-career-state-000004.json",
    ]);
    const state3Bytes = await readFile(path.join(directory, ".pi-career-state-000003.json"));
    const expected = canonical({
      schema_version: "pi.career.application_state.v2", kind: "application_state_revision",
      application_id: APPLICATION_ID, sequence: 4, parent_sha256: hash(state3Bytes), status: "applied",
      vacancy: null, selected_original: null, resume_artifact: null, cover_letter_artifact: null,
      updated_at: winnerTime,
    });
    assert.deepEqual(await readFile(path.join(directory, ".pi-career-state-000004.json")), expected);
    const after = await snapshot(value.temp);
    assertPrivateTree(after);
    assert.deepEqual(after.agent, before.agent);
    assert.deepEqual(after.library, before.library);
    assert.deepEqual(after.sessions, before.sessions);
    assert.deepEqual(after.applications.entries[".pi-career-applications.json"], before.applications.entries[".pi-career-applications.json"]);
    assert.equal(after.applications.entries[".pi-career-workspace.lock"], undefined);
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.equal(Object.keys(after.applications.entries).length, 2);
    assert.equal(Object.keys(after.applications.entries[DIRECTORY_NAME].entries).length, 6);
    for (const [name, entry] of Object.entries(before.applications.entries[DIRECTORY_NAME].entries)) {
      assert.deepEqual(after.applications.entries[DIRECTORY_NAME].entries[name], entry);
    }
    assert.ok(winnerContext.notifications.every(({ message }) => !message.includes(PRIVATE_SENTINEL)));
    assert.ok(loserContext.notifications.every(({ message }) => !message.includes(PRIVATE_SENTINEL)));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
