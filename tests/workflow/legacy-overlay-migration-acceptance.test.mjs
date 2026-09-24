// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplicationWorkspaceWorkflow } from "../../src/workflow/application-workspace.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { createApplicationEntry } from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000110";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000111";
const APPLICATION_CREATED_AT = "2026-10-01T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-10-01T00:00:01.000Z";
const STATE_UPDATED_AT = "2026-10-01T00:00:02.000Z";
const COMPANY = "Synthetic Legacy Company";
const ROLE = "Synthetic Legacy Engineer";
const DIRECTORY_NAME = `synthetic-legacy-company--synthetic-legacy-engineer--${APPLICATION_ID}`;
const IDENTITY_NAME = ".pi-career-identity.json";
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixed = (value) => () => value;

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function privateJson(file, value) {
  await privateFile(file, canonical(value));
}

async function snapshot(directory) {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
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

async function fixture(prefix = "pi-career-legacy-overlay-") {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  const library = path.join(temp, "library");
  const sessions = path.join(temp, "sessions");
  await prepareConfigDirectory(agentDir);
  for (const directory of [root, library, sessions]) {
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o700);
  }
  const original = Buffer.from("# Synthetic original resume\n\nNo private or real data.\n");
  const originalPath = path.join(library, "synthetic-original.md");
  await privateFile(originalPath, original);
  await privateFile(path.join(sessions, "unrelated-session.jsonl"), Buffer.from("synthetic unrelated session bytes\n"));
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
    created_at: "2026-10-01T00:00:00.500Z",
  });
  const directory = path.join(root, DIRECTORY_NAME);
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
  const vacancy = Buffer.from("Synthetic vacancy bytes for deterministic migration.\n");
  const artifact = Buffer.from("# Synthetic assisted artifact\n");
  const selected = {
    document_id: hash(Buffer.from(await realpath(originalPath))),
    library_root_id: rootId(library),
    text_sha256: hash(original),
    format: "markdown",
  };
  const sidecar = canonical({
    schema_version: "pi.career.assisted_variant_meta.v2",
    kind: "assisted_variant",
    authority: "assisted_non_authoritative",
    base_document_id: selected.document_id,
    base_text_sha256: selected.text_sha256,
    artifact_sha256: hash(artifact),
    created_at: STATE_UPDATED_AT,
  });
  const state = canonical({
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: APPLICATION_ID,
    sequence: 1,
    parent_sha256: hash(manifest),
    status: "preparing",
    vacancy: {
      relative_path: "vacancy.md",
      content_sha256: hash(vacancy),
      utf8_bytes: vacancy.length,
      source_state_id: "00000000-0000-4000-8000-000000000112",
    },
    selected_original: selected,
    resume_artifact: {
      relative_path: "resume.md",
      artifact_sha256: hash(artifact),
      sidecar_relative_path: "resume.pi-career.json",
      sidecar_sha256: hash(sidecar),
    },
    updated_at: STATE_UPDATED_AT,
  });
  for (const [name, bytes] of [
    ["application.json", manifest], [".pi-career-state-000001.json", state],
    ["vacancy.md", vacancy], ["resume.md", artifact], ["resume.pi-career.json", sidecar],
  ]) await privateFile(path.join(directory, name), bytes);
  const identity = canonical({
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: APPLICATION_ID,
    company_label: COMPANY,
    role_label: ROLE,
    created_at: APPLICATION_CREATED_AT,
  });
  return { temp, agentDir, root, library, sessions, directory, vacancy, identity };
}

function register(value, ids = fixed("00000000-0000-4000-8000-000000000113")) {
  const fake = makeFakePi();
  const coreCalls = [];
  const sends = [];
  fake.api.sendMessage = (...args) => sends.push(args);
  registerCareerCommands(fake.api, {
    agentDir: value.agentDir,
    uuid: ids,
    now: fixed(new Date("2026-10-01T00:00:03.000Z")),
    invoke: async (invocation) => { coreCalls.push(invocation); throw new Error("migration must not call Core"); },
  });
  return { fake, coreCalls, sends };
}

async function runRegistered(value, options) {
  const boundaries = register(value, options.ids);
  const newSessions = [];
  const context = makeContext(boundaries.fake, {
    mode: "rpc",
    selects: ["Legacy application — preparing", "Finish migration", "Close"],
    inputs: options.inputs ?? [COMPANY, ROLE],
    editors: options.editors,
    confirms: options.confirms,
    newSessions,
  });
  await boundaries.fake.commands.get("career").handler("", context.ctx);
  assert.deepEqual(boundaries.coreCalls, []);
  assert.deepEqual(boundaries.sends, []);
  assert.deepEqual(boundaries.fake.entries, []);
  assert.deepEqual(newSessions, []);
  assert.equal(boundaries.fake.tools.size, 0);
  return { ...boundaries, context };
}

function removeIdentity(tree) {
  const copy = structuredClone(tree);
  const application = copy.applications.entries[DIRECTORY_NAME].entries;
  const identity = application[IDENTITY_NAME];
  delete application[IDENTITY_NAME];
  return { copy, identity };
}

test("P3-11/P3-14 legacy Applications browse and open are read-only without session identity", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    const { fake, coreCalls, sends } = register(value);
    const newSessions = [];
    const context = makeContext(fake, {
      mode: "rpc",
      selects: ["Legacy application — preparing", "Back", "Close"],
      editors: [() => assert.fail("read-only open must not preview a mutation")],
      confirms: [() => assert.fail("read-only open must not confirm a mutation")],
      newSessions,
    });
    await fake.commands.get("career").handler("", context.ctx);
    assert.deepEqual(await snapshot(value.temp), before);
    assert.deepEqual(coreCalls, []);
    assert.deepEqual(sends, []);
    assert.deepEqual(fake.entries, []);
    assert.deepEqual(newSessions, []);
    assert.equal(fake.tools.size, 0);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-12 legacy Applications migration cancellation and post-preview byte race create nothing", async () => {
  for (const variant of ["cancel", "changed-preview", "byte-race", "wrong-label"]) {
    const value = await fixture(`pi-career-legacy-${variant}-`);
    try {
      const before = await snapshot(value.temp);
      const changedVacancy = Buffer.from("Synthetic post-preview raced vacancy bytes.\n");
      await runRegistered(value, {
        inputs: variant === "wrong-label" ? ["Different Synthetic Company", ROLE] : undefined,
        editors: variant === "wrong-label" ? [] : [variant === "cancel" ? undefined : (_title, preview) => variant === "changed-preview" ? `${preview} ` : preview],
        confirms: variant === "byte-race" ? [async () => { await privateFile(path.join(value.directory, "vacancy.md"), changedVacancy); return true; }] : [],
      });
      const after = await snapshot(value.temp);
      if (variant === "byte-race") {
        const expected = structuredClone(before);
        expected.applications.entries[DIRECTORY_NAME].entries["vacancy.md"].bytes = changedVacancy.toString("hex");
        assert.deepEqual(after, expected);
      } else {
        assert.deepEqual(after, before);
      }
      assert.equal(after.applications.entries[DIRECTORY_NAME].entries[IDENTITY_NAME], undefined);
    } finally {
      await rm(value.temp, { recursive: true, force: true });
    }
  }
});

test("P3-13/P3-14/P3-47 registered legacy migration writes only canonical identity and preserves v1 bytes", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    let preview;
    const { context } = await runRegistered(value, {
      editors: [(_title, text) => { preview = JSON.parse(text); return text; }],
      confirms: [true],
    });
    const after = await snapshot(value.temp);
    const stripped = removeIdentity(after);
    assert.deepEqual(stripped.copy, before);
    assert.deepEqual(stripped.identity, { type: "file", mode: 0o600, bytes: value.identity.toString("hex") });
    assertPrivateTree(after);
    assert.deepEqual(preview.creates, [{
      path: path.join(value.directory, IDENTITY_NAME), object_type: "file", mode: "0600",
      utf8_bytes: value.identity.length, sha256: hash(value.identity), text: value.identity.toString("utf8"),
    }]);
    assert.deepEqual(preview.replaces, []);
    assert.deepEqual(preview.deletes, []);
    assert.equal(preview.expected_state_sha256, hash(await readFile(path.join(value.directory, ".pi-career-state-000001.json"))));
    assert.ok(context.notifications.some(({ message }) => message.includes("Existing workspace bytes remain unchanged")));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }

  const matched = await fixture("pi-career-legacy-matched-session-");
  try {
    const before = await snapshot(matched.temp);
    const { fake, coreCalls, sends } = register(matched);
    const application = createApplicationEntry(
      COMPANY, ROLE, "preparing",
      { uuid: fixed("00000000-0000-4000-8000-000000000114"), now: fixed(new Date(APPLICATION_CREATED_AT)) },
      APPLICATION_ID,
    );
    fake.entries.push({
      type: "custom", customType: "career.workflow", data: application,
      id: "synthetic-matching-identity", parentId: null, timestamp: APPLICATION_CREATED_AT,
    });
    const context = makeContext(fake, {
      mode: "rpc",
      selects: ["Manage workspace", "Finish application migration", "Close"],
      editors: [(_title, text) => text],
      confirms: [true],
    });
    await fake.commands.get("career-workspace").handler("", context.ctx);
    const after = await snapshot(matched.temp);
    const stripped = removeIdentity(after);
    assert.deepEqual(stripped.copy, before);
    assert.deepEqual(stripped.identity.bytes, matched.identity.toString("hex"));
    assert.deepEqual(fake.entries.map(({ data }) => data), [application]);
    assert.deepEqual(coreCalls, []);
    assert.deepEqual(sends, []);
  } finally {
    await rm(matched.temp, { recursive: true, force: true });
  }
});

test("P3-15 independently prepared legacy migration plans have one no-clobber winner", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    const winnerPrepared = gate();
    const loserPrepared = gate();
    const winnerCommit = gate();
    const loserCommit = gate();
    const winnerLocked = gate();
    const winnerRelease = gate();
    let winnerBefore = 0;
    let loserBefore = 0;
    let loserAfter = 0;
    const winner = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      uuid: fixed("00000000-0000-4000-8000-000000000121"),
      now: fixed(new Date("2026-10-01T00:00:04.000Z")),
      withMutationQueues: async (_paths, operation) => operation(),
      beforeWorkspaceLockAcquire: async () => { winnerBefore += 1; },
      afterWorkspaceLockAcquired: async () => { winnerLocked.release(); await winnerRelease.promise; },
    });
    const loser = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      uuid: fixed("00000000-0000-4000-8000-000000000122"),
      now: fixed(new Date("2026-10-01T00:00:05.000Z")),
      withMutationQueues: async (_paths, operation) => operation(),
      beforeWorkspaceLockAcquire: async () => { loserBefore += 1; },
      afterWorkspaceLockAcquired: async () => { loserAfter += 1; },
    });
    const winnerPreviews = [];
    const loserPreviews = [];
    const winnerContext = makeContext(makeFakePi(), {
      mode: "rpc",
      editors: [(_title, preview) => { winnerPreviews.push(JSON.parse(preview)); return preview; }],
      confirms: [async () => { winnerPrepared.release(); await winnerCommit.promise; return true; }],
    });
    const loserContext = makeContext(makeFakePi(), {
      mode: "rpc",
      editors: [(_title, preview) => { loserPreviews.push(JSON.parse(preview)); return preview; }],
      confirms: [async () => { loserPrepared.release(); await loserCommit.promise; return true; }],
    });
    const winnerPromise = winner.migrateCatalogApplication(winnerContext.ctx, APPLICATION_ID, COMPANY, ROLE);
    const loserPromise = loser.migrateCatalogApplication(loserContext.ctx, APPLICATION_ID, COMPANY, ROLE);
    await Promise.all([winnerPrepared.promise, loserPrepared.promise]);
    assert.equal(winnerPreviews.length, 1);
    assert.equal(loserPreviews.length, 1);
    assert.notEqual(winnerPreviews[0].mutation_id, loserPreviews[0].mutation_id);
    assert.deepEqual(winnerPreviews[0].creates, loserPreviews[0].creates);
    winnerCommit.release();
    await winnerLocked.promise;
    loserCommit.release();
    const loserError = await loserPromise.then(
      () => assert.fail("the contender must not report a second migration winner"),
      (error) => error,
    );
    assert.equal(loserError?.code, "workspace_busy");
    assert.doesNotMatch(loserError.message, /Synthetic|applications|vacancy|resume|session/i);
    winnerRelease.release();
    assert.equal(await winnerPromise, "written");
    assert.equal(winnerBefore, 1);
    assert.equal(loserBefore, 1);
    assert.equal(loserAfter, 0);
    const after = await snapshot(value.temp);
    const stripped = removeIdentity(after);
    assert.deepEqual(stripped.copy, before);
    assert.deepEqual(stripped.identity, { type: "file", mode: 0o600, bytes: value.identity.toString("hex") });
    assert.deepEqual(Object.keys(after.applications.entries[DIRECTORY_NAME].entries).sort(), [
      IDENTITY_NAME, ".pi-career-state-000001.json", "application.json", "resume.md", "resume.pi-career.json", "vacancy.md",
    ].sort());
    assertPrivateTree(after);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
