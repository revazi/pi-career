// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import careerCoreExtension from "../../src/index.ts";
import { careerSkillsDirectory } from "../../src/career-paths.ts";
import { rootId } from "../../src/workflow/config.ts";
import {
  APPLICATION_ASSISTANCE_CUSTOM_TYPE,
  APPLICATION_ATTACHMENT_CUSTOM_TYPE,
  createApplicationAssistanceActivationEntry,
  createApplicationAttachmentEntry,
} from "../../src/workflow/session-attachment.ts";
import { makeContext, makeFakePi, uuidSequence } from "./helpers.mjs";

const APPLICATION_ID = "00000000-0000-4000-8000-000000000077";
const OTHER_APPLICATION_ID = "00000000-0000-4000-8000-000000000078";
const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const PRIVATE_SENTINELS = [
  "SYNTHETIC_DOCUMENT_TEXT_52", "SYNTHETIC_RESULT_BYTES_52",
  "SYNTHETIC_PROVIDER_PAYLOAD_52", "SYNTHETIC_PRIVATE_PATH_52",
];
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateJson(file, value) {
  const bytes = canonical(value);
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
  return bytes;
}

function sessionEntry(customType, data, index) {
  return {
    type: "custom", customType, data, id: `persisted-entry-${index}`,
    parentId: index === 1 ? null : `persisted-entry-${index - 1}`,
    timestamp: WORKSPACE_CREATED_AT,
  };
}

async function treeSnapshot(root) {
  const walk = async (directory, relative = "") => {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = path.posix.join(relative, entry.name);
      const target = path.join(directory, entry.name);
      const metadata = await stat(target);
      result.push({ path: relativePath, kind: entry.isDirectory() ? "directory" : "file", mode: metadata.mode & 0o7777,
        ...(entry.isDirectory() ? {} : { bytes: (await readFile(target)).toString("hex") }) });
      if (entry.isDirectory()) result.push(...await walk(target, relativePath));
    }
    return result;
  };
  return walk(root);
}

async function fixture(t, options = {}) {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-lifecycle-")));
  await chmod(base, 0o700);
  t.after(() => rm(base, { recursive: true, force: true }));
  const agentDir = path.join(base, "agent");
  const workspaceRoot = path.join(base, "applications");
  const libraryRoot = path.join(base, "library");
  for (const directory of [agentDir, workspaceRoot, libraryRoot]) {
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o700);
  }
  const careerDir = path.join(agentDir, "career");
  await mkdir(careerDir, { mode: 0o700 });
  await chmod(careerDir, 0o700);
  await privateJson(path.join(careerDir, "config.v1.json"), {
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: rootId(libraryRoot), path: libraryRoot, label: "Synthetic private library" }],
    generated_variants_root: null,
    application_workspace: options.missingPointer ? null : { root_id: ROOT_ID, root_path: workspaceRoot },
  });
  const resumePath = path.join(libraryRoot, "private-resume.md");
  const resumeBytes = Buffer.from(`${PRIVATE_SENTINELS.join("\n")}\n`);
  await writeFile(resumePath, resumeBytes, { mode: 0o600 });
  await chmod(resumePath, 0o600);
  await privateJson(path.join(workspaceRoot, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1", kind: "application_workspace_root",
    root_id: ROOT_ID, created_at: ROOT_CREATED_AT,
  });
  const applicationDir = path.join(workspaceRoot, `synthetic-company--synthetic-engineer--${APPLICATION_ID}`);
  await mkdir(applicationDir, { mode: 0o700 });
  await chmod(applicationDir, 0o700);
  const manifest = await privateJson(path.join(applicationDir, "application.json"), {
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: APPLICATION_ID, root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT, workspace_created_at: WORKSPACE_CREATED_AT,
  });
  await privateJson(path.join(applicationDir, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: APPLICATION_ID, company_label: "Synthetic Company",
    role_label: "Synthetic Engineer", created_at: APPLICATION_CREATED_AT,
  });
  await privateJson(path.join(applicationDir, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v1", kind: "application_state_revision",
    application_id: APPLICATION_ID, sequence: 1, parent_sha256: hash(manifest), status: "preparing",
    vacancy: null,
    selected_original: options.sourceDrift ? {
      document_id: hash(Buffer.from(await realpath(resumePath))),
      library_root_id: rootId(libraryRoot), text_sha256: hash(resumeBytes), format: "markdown",
    } : null,
    resume_artifact: null, updated_at: WORKSPACE_CREATED_AT,
  });
  if (options.sourceDrift) await unlink(resumePath);
  const uuid = uuidSequence();
  const attachment = createApplicationAttachmentEntry({
    applicationId: APPLICATION_ID, rootId: ROOT_ID, rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT, workspaceCreatedAt: WORKSPACE_CREATED_AT,
  }, { uuid });
  const activation = createApplicationAssistanceActivationEntry(attachment, { uuid });
  const entries = [
    sessionEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1),
    sessionEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2),
  ];
  const sessionFile = path.join(base, "saved-session.jsonl");
  const sessionBytes = Buffer.from(entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  await writeFile(sessionFile, sessionBytes, { mode: 0o600 });
  await chmod(sessionFile, 0o600);
  const coreTrap = path.join(base, "core-trap");
  await writeFile(coreTrap, "#!/bin/sh\ntouch \"$(dirname \"$0\")/core-was-invoked\"\nexit 97\n", { mode: 0o700 });
  await chmod(coreTrap, 0o700);
  return { base, agentDir, attachment, activation, entries, sessionFile, sessionBytes, coreTrap };
}

async function withCoreTrap(item, action) {
  const previous = process.env.CAREER_CLI_PATH;
  process.env.CAREER_CLI_PATH = item.coreTrap;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.CAREER_CLI_PATH;
    else process.env.CAREER_CLI_PATH = previous;
  }
}

function registerInstalled(fake, agentDir) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    careerCoreExtension(fake.api);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
}

function boundarySpies(fake) {
  const calls = { appends: 0, sends: 0, reloads: 0, newSessions: 0 };
  const appendEntry = fake.api.appendEntry;
  fake.api.appendEntry = (...args) => {
    calls.appends += 1;
    return appendEntry(...args);
  };
  fake.api.sendMessage = () => { calls.sends += 1; };
  fake.api.sendUserMessage = () => { calls.sends += 1; };
  return calls;
}

async function persistedEntries(item) {
  const bytes = await readFile(item.sessionFile);
  assert.deepEqual(bytes, item.sessionBytes);
  assert.equal((await stat(item.sessionFile)).mode & 0o7777, 0o600);
  return bytes.toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
}

test("P3-52 fresh installed extension resumes exact persisted activation with compact managed surface", async (t) => {
  const item = await fixture(t);
  const before = await treeSnapshot(item.base);
  const first = makeFakePi();
  first.entries.push(...await persistedEntries(item));
  const firstSpies = boundarySpies(first);
  registerInstalled(first, item.agentDir);
  const firstContext = makeContext(first, {
    reload: () => { firstSpies.reloads += 1; },
    newSessions: [],
  });

  await withCoreTrap(item, async () => {
    for (const handler of first.events.get("session_start") ?? []) await handler({}, firstContext.ctx);
  });
  assert.deepEqual(first.activeTools, ["career_run"]);
  assert.deepEqual(await first.events.get("resources_discover")[0]({}), { skillPaths: [careerSkillsDirectory()] });
  assert.deepEqual([...first.tools.keys()].sort(), [
    "career_core_discover", "career_core_job", "career_core_resume", "career_run",
  ]);
  assert.deepEqual(first.activeTools.filter((name) => name.startsWith("career_core_")), []);

  // A separately registered extension instance proves restart rather than closure/state reuse.
  const resumed = makeFakePi();
  resumed.entries.push(...await persistedEntries(item));
  const resumedSpies = boundarySpies(resumed);
  registerInstalled(resumed, item.agentDir);
  const resumedContext = makeContext(resumed, {
    reload: () => { resumedSpies.reloads += 1; },
    newSessions: [],
  });
  await withCoreTrap(item, async () => {
    for (const handler of resumed.events.get("session_start") ?? []) await handler({}, resumedContext.ctx);
  });
  const discovered = await resumed.events.get("resources_discover")[0]({});
  assert.deepEqual(resumed.activeTools, ["career_run"]);
  assert.deepEqual(discovered, { skillPaths: [careerSkillsDirectory()] });
  const projection = JSON.stringify({ activeTools: resumed.activeTools, discovered, notifications: resumedContext.notifications });
  for (const sentinel of PRIVATE_SENTINELS) assert.doesNotMatch(projection, new RegExp(sentinel));
  assert.deepEqual(resumed.entries, item.entries);
  assert.deepEqual(resumedSpies, { appends: 0, sends: 0, reloads: 0, newSessions: 0 });
  assert.deepEqual(firstSpies, { appends: 0, sends: 0, reloads: 0, newSessions: 0 });
  assert.deepEqual(await treeSnapshot(item.base), before);
});

const invalidCases = {
  "malformed attachment record": {
    invalid: (entries) => [{ ...entries[0], data: { schema_version: "malformed" } }, entries[1]],
  },
  "activation without attachment": { invalid: (entries) => [entries[1]] },
  "duplicate attachment transition": {
    invalid: (entries) => [entries[0], { ...entries[0], id: "persisted-entry-2", parentId: "persisted-entry-1",
      data: { ...entries[0].data, attachment_id: "00000000-0000-4000-8000-000000000009" } }],
  },
  "conflicting application UUID claim": {
    invalid: (entries) => [entries[0], { ...entries[1], data: { ...entries[1].data, application_id: OTHER_APPLICATION_ID } }],
  },
  "drifted exact pointer": {
    invalid: (entries) => [{ ...entries[0], data: { ...entries[0].data, root_created_at: "2026-07-31T00:00:00.000Z" } }, entries[1]],
  },
  "missing configured pointer": { fixtureOptions: { missingPointer: true }, invalid: (entries) => entries },
  "drifted selected source binding": {
    fixtureOptions: { sourceDrift: true }, invalid: (entries) => entries, initiallyPointerValid: true,
  },
};

test("P3-56 installed invalid restore/action matrix fails closed without append or mutation", async (t) => {
  for (const [name, scenario] of Object.entries(invalidCases)) {
    await t.test(name, async () => {
      const item = await fixture(t, scenario.fixtureOptions);
      const before = await treeSnapshot(item.base);
      const fake = makeFakePi();
      fake.entries.push(...scenario.invalid(await persistedEntries(item)));
      const entriesBefore = structuredClone(fake.entries);
      const spies = boundarySpies(fake);
      registerInstalled(fake, item.agentDir);
      const newSessions = [];
      const rpc = makeContext(fake, {
        reload: () => { spies.reloads += 1; }, newSessions,
      });
      let action;
      await withCoreTrap(item, async () => {
        for (const handler of fake.events.get("session_start") ?? []) await handler({}, rpc.ctx);
        action = await fake.events.get("input")[0]({ text: "/skill:career-core" }, rpc.ctx);
        await assert.rejects(
          fake.tools.get("career_run").execute(
            "synthetic-tool-call", { command: "context" }, new AbortController().signal, undefined, rpc.ctx,
          ),
          (error) => {
            assert.equal(error.code, "assistance_required");
            assert.deepEqual(JSON.parse(error.message), {
              schema_version: "pi.career.run_error.v1",
              code: "assistance_required",
              message: "Career assistance is inactive in this session.",
            });
            for (const sentinel of PRIVATE_SENTINELS) assert.doesNotMatch(String(error.stack), new RegExp(sentinel));
            return true;
          },
        );
      });
      assert.deepEqual(fake.activeTools, []);
      assert.deepEqual(await fake.events.get("resources_discover")[0]({}), {});
      assert.deepEqual(action, { action: scenario.initiallyPointerValid ? "continue" : "handled" });
      assert.deepEqual(rpc.notifications, scenario.initiallyPointerValid ? [] : [
        { message: "Career assistance is inactive in this session.", type: "warning" },
      ]);
      assert.deepEqual(fake.entries, entriesBefore);
      assert.deepEqual(spies, { appends: 0, sends: 0, reloads: 0, newSessions: 0 });
      assert.deepEqual(newSessions, []);
      assert.deepEqual(await treeSnapshot(item.base), before);
      const observed = JSON.stringify({ activeTools: fake.activeTools, notifications: rpc.notifications, action });
      for (const sentinel of PRIVATE_SENTINELS) assert.doesNotMatch(observed, new RegExp(sentinel));
    });
  }
});
