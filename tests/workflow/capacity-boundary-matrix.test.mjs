// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplicationWorkspaceWorkflow, readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { addLibraryRoot, configPath, loadConfig, rootId, writeConfig } from "../../src/workflow/config.ts";
import { createApplicationAttachmentEntry } from "../../src/workflow/session-attachment.ts";
import { createApplicationEntry } from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-0000000000c4";
const APPLICATION_ID = "00000000-0000-4000-8000-0000000000c5";
const ROOT_CREATED_AT = "2026-09-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-09-01T00:00:01.000Z";
const WORKSPACE_CREATED_AT = "2026-09-01T00:00:02.000Z";
const MUTATION_AT = "2026-09-02T00:00:00.000Z";
const SENTINEL = "SYNTHETIC-CAPACITY-PRIVATE-SENTINEL";
const PREVIEW_MAX = 5_242_880;
const MANAGED_MAX = 2_097_152;
const DOCUMENT_MAX = 262_144;
const METADATA_MAX = 16_384;
const CONFIG_MAX = 65_536;
const ROOT_MAX = 1_024;
const ENTRY_MAX = 160;
const REVISION_MAX = 64;
const LABEL_MAX = 80;
const IDENTITY_LABEL_MAX = 120;
const DIRECTORY_NAME = `synthetic-company--synthetic-engineer--${APPLICATION_ID}`;
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const appId = (index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const fillerId = (index) => `00000000-0000-4000-8001-${index.toString(16).padStart(12, "0")}`;

function codeOf(error) {
  assert.equal(error?.name, "CareerWorkflowError");
  const parsed = JSON.parse(error.message);
  assert.equal(typeof parsed.code, "string");
  assert.equal(error.message.includes(SENTINEL), false);
  return parsed.code;
}

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function privateDir(directory) {
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
}

async function mapPool(count, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(32, count) }, async () => {
    while (index < count) {
      const current = index;
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

async function snapshot(directory) {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    const metadata = await lstat(target);
    if (entry.isDirectory()) {
      result[entry.name] = { type: "directory", mode: metadata.mode & 0o777, entries: await snapshot(target) };
    } else {
      const bytes = await readFile(target);
      result[entry.name] = {
        type: "file",
        mode: metadata.mode & 0o777,
        size: bytes.length,
        sha256: hash(bytes),
        ...(bytes.length <= 8_192 ? { hex: bytes.toString("hex") } : {}),
      };
    }
  }
  return result;
}

function assertPrivate(tree) {
  for (const entry of Object.values(tree)) {
    assert.equal(entry.mode, entry.type === "directory" ? 0o700 : 0o600);
    if (entry.type === "directory") assertPrivate(entry.entries);
  }
}

async function residue(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.name.includes(".tmp") || entry.name.endsWith(".lock")) found.push(entry.name);
    if (entry.isDirectory()) found.push(...(await residue(target)).map((name) => `${entry.name}/${name}`));
  }
  return found;
}

function manifestBytes(applicationId = APPLICATION_ID) {
  return canonical({
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: applicationId,
    root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT,
    workspace_created_at: WORKSPACE_CREATED_AT,
  });
}

function identityBytes(applicationId = APPLICATION_ID, company = "Synthetic Company", role = "Synthetic Engineer") {
  return canonical({
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: applicationId,
    company_label: company,
    role_label: role,
    created_at: APPLICATION_CREATED_AT,
  });
}

function stateBytes(fields) {
  return canonical({
    schema_version: "pi.career.application_state.v2",
    kind: "application_state_revision",
    application_id: fields.applicationId ?? APPLICATION_ID,
    sequence: fields.sequence,
    parent_sha256: fields.parent,
    status: fields.status ?? "preparing",
    vacancy: fields.vacancy ?? null,
    selected_original: fields.selected ?? null,
    resume_artifact: fields.resume ?? null,
    cover_letter_artifact: null,
    updated_at: fields.updatedAt,
  });
}

function timestamp(sequence) {
  return new Date(Date.parse(WORKSPACE_CREATED_AT) + sequence * 1_000).toISOString();
}

async function fixture(name) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), `pi-career-capacity-${name}-`)));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  const library = path.join(temp, "library");
  const sessions = path.join(temp, "sessions");
  await prepareConfigDirectory(agentDir);
  await privateDir(root);
  await privateDir(library);
  await privateDir(sessions);
  await privateFile(path.join(library, "synthetic-original.md"), Buffer.from(`# Synthetic original\n${SENTINEL}\n`));
  await privateFile(path.join(sessions, "synthetic-session.jsonl"), Buffer.from(`${SENTINEL}\n`));
  await privateFile(configPath(agentDir), canonical({
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: rootId(library), path: library, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  }));
  await privateFile(path.join(root, ".pi-career-applications.json"), canonical({
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: ROOT_CREATED_AT,
  }));
  return { temp, agentDir, root, library, sessions, sessionFile: path.join(sessions, "synthetic-session.jsonl") };
}

async function writePackage(value, { revisions = 1, userFiles = 0, vacancyBytes = 0, resumeBytes = 0 } = {}) {
  const directory = path.join(value.root, DIRECTORY_NAME);
  await privateDir(directory);
  const manifest = manifestBytes();
  await privateFile(path.join(directory, "application.json"), manifest);
  await privateFile(path.join(directory, ".pi-career-identity.json"), identityBytes());
  let parent = hash(manifest);
  let selected;
  let resume;
  if (resumeBytes > 0) {
    const originalPath = path.join(value.library, "synthetic-original.md");
    const original = await readFile(originalPath);
    selected = {
      document_id: hash(Buffer.from(await realpath(originalPath))),
      library_root_id: rootId(value.library),
      text_sha256: hash(original),
      format: "markdown",
    };
    const artifact = Buffer.alloc(resumeBytes, 0x61);
    const sidecar = canonical({
      schema_version: "pi.career.assisted_variant_meta.v2",
      kind: "assisted_variant",
      authority: "assisted_non_authoritative",
      base_document_id: selected.document_id,
      base_text_sha256: selected.text_sha256,
      artifact_sha256: hash(artifact),
      created_at: "2026-09-01T00:00:03.000Z",
    });
    await privateFile(path.join(directory, "resume.md"), artifact);
    await privateFile(path.join(directory, "resume.pi-career.json"), sidecar);
    resume = {
      relative_path: "resume.md",
      artifact_sha256: hash(artifact),
      sidecar_relative_path: "resume.pi-career.json",
      sidecar_sha256: hash(sidecar),
    };
  }
  for (let sequence = 1; sequence <= revisions; sequence += 1) {
    let vacancy = null;
    if (vacancyBytes > 0) {
      const name = sequence === 1 ? "vacancy.md" : `vacancy-${String(sequence).padStart(6, "0")}.md`;
      const bytes = Buffer.alloc(vacancyBytes, 0x62);
      await privateFile(path.join(directory, name), bytes);
      vacancy = {
        relative_path: name,
        content_sha256: hash(bytes),
        utf8_bytes: bytes.length,
        source_state_id: appId(0xc600 + sequence),
      };
    }
    const bytes = stateBytes({
      sequence,
      parent,
      updatedAt: timestamp(sequence),
      vacancy,
      selected: resume === undefined ? null : selected,
      resume: resume ?? null,
    });
    await privateFile(path.join(directory, `.pi-career-state-${String(sequence).padStart(6, "0")}.json`), bytes);
    parent = hash(bytes);
  }
  await mapPool(userFiles, async (index) => {
    await privateFile(path.join(directory, `user-${String(index).padStart(3, "0")}.txt`), Buffer.from(`${SENTINEL} ${index}\n`));
  });
  const attachment = createApplicationAttachmentEntry({
    applicationId: APPLICATION_ID,
    rootId: ROOT_ID,
    rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT,
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
  }, { uuid: () => "00000000-0000-4000-8000-0000000000c6" });
  return { directory, attachment };
}

function instrument(fake, sessionFile, script = {}) {
  const effects = { core: 0, sends: 0, sessions: 0, previews: [], inputs: 0 };
  const inputs = [...(script.inputs ?? [])];
  const context = makeContext(fake, {
    mode: "rpc",
    persisted: true,
    selects: script.selects ?? [],
    inputs: [],
    confirms: script.confirms ?? [true],
  });
  context.ctx.ui.input = async () => {
    effects.inputs += 1;
    return inputs.shift();
  };
  context.ctx.sessionManager.getSessionFile = () => sessionFile;
  context.ctx.ui.editor = async (_title, preview) => {
    effects.previews.push(Buffer.byteLength(preview, "utf8"));
    assert.equal(preview.includes("\u0000"), false);
    return preview;
  };
  context.ctx.ui.confirm = async () => script.confirm ?? true;
  context.ctx.sendMessage = () => { effects.sends += 1; };
  context.ctx.sendUserMessage = () => { effects.sends += 1; };
  context.ctx.newSession = async () => { effects.sessions += 1; return { cancelled: true }; };
  return { context, effects };
}

function workflow(value, hook) {
  let sequence = 0xd000;
  return new ApplicationWorkspaceWorkflow({
    agentDir: value.agentDir,
    now: () => new Date(MUTATION_AT),
    uuid: () => appId(sequence++),
    afterWorkspaceLockAcquired: hook,
  });
}

function attach(fake, attachment) {
  fake.entries.push({
    type: "custom",
    customType: "career.application_attachment",
    data: attachment,
    id: "synthetic-attachment",
    parentId: null,
    timestamp: APPLICATION_CREATED_AT,
  });
}

function assertNoEffects(effects, entriesBefore, entriesAfter, toolsBefore, toolsAfter) {
  assert.equal(effects.core, 0);
  assert.equal(effects.sends, 0);
  assert.equal(effects.sessions, 0);
  assert.deepEqual(entriesAfter, entriesBefore);
  assert.deepEqual(toolsAfter, toolsBefore);
}

async function fillerDirectories(root, count) {
  await mapPool(count, async (index) => {
    const id = fillerId(index + 1);
    const directory = path.join(root, `co--role--${id}`);
    await privateDir(directory);
    await privateFile(path.join(directory, "application.json"), manifestBytes(id));
  });
}

async function catalogOf(root) {
  return readApplicationCatalog(root, ROOT_ID);
}

test("P3-44 root persistent entries accept 1,024 including the marker and fail closed above it", async () => {
  const above = await fixture("root-above");
  try {
    await fillerDirectories(above.root, ROOT_MAX - 1);
    const before = await snapshot(above.temp);
    const fake = makeFakePi();
    fake.entries.push({
      type: "custom", customType: "career.workflow",
      data: createApplicationEntry("Synthetic Company", "Synthetic Engineer", "preparing", {
        uuid: () => "00000000-0000-4000-8000-0000000000c7",
        now: () => new Date(APPLICATION_CREATED_AT),
      }, APPLICATION_ID),
      id: "identity", parentId: null, timestamp: APPLICATION_CREATED_AT,
    });
    const { context, effects } = instrument(fake, above.sessionFile);
    const tools = fake.activeTools;
    await assert.rejects(
      workflow(above).initializeCurrentApplication(context.ctx),
      (error) => codeOf(error) === "workspace_limit_reached",
    );
    assert.equal(effects.previews.length, 0);
    assert.deepEqual(await snapshot(above.temp), before);
    assert.deepEqual(await residue(above.temp), []);
    assertNoEffects(effects, fake.entries, fake.entries, tools, fake.activeTools);
    await rm(path.join(above.root, `co--role--${fillerId(1)}`), { recursive: true, force: true });
    const atBefore = await snapshot(above.temp);
    const atEffects = instrument(fake, above.sessionFile, { selects: ["Initialize current application"] });
    await workflow(above).run("", atEffects.context.ctx);
    assert.equal(atEffects.effects.previews.length, 1);
    assert.ok(atEffects.effects.previews[0] < PREVIEW_MAX);
    assert.equal((await readdir(above.root)).length, ROOT_MAX);
    assert.equal((await readdir(path.join(above.root, DIRECTORY_NAME))).length, 3);
    assertPrivate(await snapshot(path.join(above.root, DIRECTORY_NAME)));
    const atAfter = await snapshot(above.temp);
    delete atAfter.applications.entries[DIRECTORY_NAME];
    delete atBefore.applications.entries[DIRECTORY_NAME];
    assert.deepEqual(atAfter, atBefore);
    assert.deepEqual(await residue(above.temp), []);
    assertNoEffects(atEffects.effects, fake.entries, fake.entries, tools, fake.activeTools);
  } finally {
    await rm(above.temp, { recursive: true, force: true });
  }

  const below = await fixture("root-below");
  try {
    await fillerDirectories(below.root, ROOT_MAX - 3);
    const fake = makeFakePi();
    fake.entries.push({
      type: "custom", customType: "career.workflow",
      data: createApplicationEntry("Synthetic Company", "Synthetic Engineer", "preparing", {
        uuid: () => "00000000-0000-4000-8000-0000000000c8",
        now: () => new Date(APPLICATION_CREATED_AT),
      }, APPLICATION_ID),
      id: "identity", parentId: null, timestamp: APPLICATION_CREATED_AT,
    });
    const { context, effects } = instrument(fake, below.sessionFile, { selects: ["Initialize current application"] });
    await workflow(below).run("", context.ctx);
    assert.equal((await readdir(below.root)).length, ROOT_MAX - 1);
    assert.equal(effects.previews.length, 1);
    assertNoEffects(effects, fake.entries, fake.entries, fake.activeTools, fake.activeTools);
  } finally {
    await rm(below.temp, { recursive: true, force: true });
  }

  const overflow = await fixture("root-read");
  try {
    await fillerDirectories(overflow.root, ROOT_MAX);
    const before = await snapshot(overflow.root);
    await assert.rejects(catalogOf(overflow.root), (error) => codeOf(error) === "workspace_limit_reached");
    assert.deepEqual(await snapshot(overflow.root), before);
  } finally {
    await rm(overflow.temp, { recursive: true, force: true });
  }
});

test("P3-44 root under-lock entry crossing fails closed without blessing the new package", async () => {
  const value = await fixture("root-race");
  try {
    await fillerDirectories(value.root, ROOT_MAX - 2);
    const fake = makeFakePi();
    fake.entries.push({
      type: "custom", customType: "career.workflow",
      data: createApplicationEntry("Synthetic Company", "Synthetic Engineer", "preparing", {
        uuid: () => "00000000-0000-4000-8000-0000000000c9",
        now: () => new Date(APPLICATION_CREATED_AT),
      }, APPLICATION_ID),
      id: "identity", parentId: null, timestamp: APPLICATION_CREATED_AT,
    });
    const injectedId = fillerId(0x0f00);
    const injected = path.join(value.root, `co--role--${injectedId}`);
    let hooked = 0;
    const { context, effects } = instrument(fake, value.sessionFile, { selects: ["Initialize current application"] });
    const before = await snapshot(value.temp);
    await assert.rejects(workflow(value, async (operation) => {
      hooked += 1;
      assert.equal(operation, "initialize_application");
      await privateDir(injected);
      await privateFile(path.join(injected, "application.json"), manifestBytes(injectedId));
    }).run("", context.ctx), (error) => codeOf(error) === "workspace_drift");
    assert.equal(hooked, 1);
    assert.equal(effects.previews.length, 1);
    assert.equal((await readdir(value.root)).includes(DIRECTORY_NAME), false);
    assert.deepEqual(await residue(value.temp), []);
    const after = await snapshot(value.temp);
    const injectedTree = after.applications.entries[`co--role--${injectedId}`];
    delete after.applications.entries[`co--role--${injectedId}`];
    assert.deepEqual(after, before);
    assert.equal(injectedTree.type, "directory");
    assert.equal(injectedTree.entries["application.json"].sha256, hash(manifestBytes(injectedId)));
    assertNoEffects(effects, fake.entries, fake.entries, fake.activeTools, fake.activeTools);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-44 application entries, revisions, and registered status mutation preserve unknown files", async () => {
  async function statusCase(name, { revisions, userFiles, expect }) {
    const value = await fixture(name);
    try {
      const { directory, attachment } = await writePackage(value, { revisions, userFiles });
      const userBefore = await readFile(path.join(directory, "user-000.txt"));
      const fake = makeFakePi();
      attach(fake, attachment);
      const calls = [];
      registerCareerCommands(fake.api, {
        agentDir: value.agentDir,
        now: () => new Date(MUTATION_AT),
        uuid: (() => { let n = 0xe000; return () => appId(n++); })(),
        invoke: async () => { calls.push("core"); throw new Error("core"); },
        afterWorkspaceLockAcquired: async () => { calls.push("lock"); },
      });
      const { context, effects } = instrument(fake, value.sessionFile, {
        selects: [CAREER_UI_RPC_ACTIONS.updateStatus, "Applied", CAREER_UI_RPC_ACTIONS.close],
      });
      const before = await snapshot(value.temp);
      const entries = structuredClone(fake.entries);
      const tools = fake.activeTools;
      await fake.commands.get("career").handler("", context.ctx);
      assert.deepEqual(calls.filter((call) => call === "core"), []);
      assert.equal((await readFile(path.join(directory, "user-000.txt"))).toString(), userBefore.toString());
      if (expect === "written") {
        assert.equal(effects.previews.length, 1, JSON.stringify(context.notifications));
        assert.ok(effects.previews[0] < PREVIEW_MAX);
        assert.equal((await readdir(directory)).filter((entry) => entry.startsWith(".pi-career-state-")).length, revisions + 1);
        const added = (await readdir(directory)).length - (revisions + 2 + userFiles);
        assert.equal(added, 1);
        assert.deepEqual(calls, ["lock"]);
      } else {
        assert.equal(effects.previews.length, 0);
        assert.deepEqual(calls, []);
        assert.deepEqual(await snapshot(value.temp), before);
        const direct = instrument(fake, value.sessionFile);
        await assert.rejects(
          workflow(value).writeAttachedStatus(direct.context.ctx, "applied"),
          (error) => codeOf(error) === "workspace_limit_reached",
        );
        assert.equal(direct.effects.previews.length, 0);
        assert.deepEqual(await snapshot(value.temp), before);
      }
      assert.deepEqual(await residue(value.temp), []);
      assertNoEffects(effects, entries, fake.entries, tools, fake.activeTools);
      assert.equal(JSON.stringify(context.notifications).includes(SENTINEL), false);
    } finally {
      await rm(value.temp, { recursive: true, force: true });
    }
  }

  await statusCase("entries-below", { revisions: 1, userFiles: ENTRY_MAX - 5, expect: "written" });
  await statusCase("entries-at", { revisions: 1, userFiles: ENTRY_MAX - 4, expect: "written" });
  await statusCase("entries-above", { revisions: 1, userFiles: ENTRY_MAX - 3, expect: "rejected" });
  await statusCase("revisions-below", { revisions: REVISION_MAX - 2, userFiles: 1, expect: "written" });
  await statusCase("revisions-at", { revisions: REVISION_MAX - 1, userFiles: 1, expect: "written" });
  await statusCase("revisions-above", { revisions: REVISION_MAX, userFiles: 1, expect: "rejected" });

  const read = await fixture("revision-read");
  try {
    const { directory } = await writePackage(read, { revisions: REVISION_MAX, userFiles: 1 });
    const before = await snapshot(read.root);
    const valid = await catalogOf(read.root);
    assert.equal(valid.applications.length, 1);
    assert.equal(valid.reconciliation.over_limit, 0);
    await privateFile(path.join(directory, ".pi-career-state-000065.json"), Buffer.from("synthetic\n"));
    const over = await catalogOf(read.root);
    assert.equal(over.applications.length, 0);
    assert.equal(over.reconciliation.over_limit, 1);
    assert.equal((await readFile(path.join(directory, "user-000.txt"))).toString().includes(SENTINEL), true);
    const after = await snapshot(read.root);
    delete after[DIRECTORY_NAME].entries[".pi-career-state-000065.json"];
    assert.deepEqual(after, before);
    assert.equal((await readFile(path.join(directory, ".pi-career-state-000065.json"))).toString(), "synthetic\n");
  } finally {
    await rm(read.temp, { recursive: true, force: true });
  }
});

test("P3-44 under-lock application-entry and revision crossings do not publish a new head", async () => {
  const entries = await fixture("entry-race");
  try {
    const { directory, attachment } = await writePackage(entries, { revisions: 1, userFiles: ENTRY_MAX - 4 });
    const fake = makeFakePi();
    attach(fake, attachment);
    const before = await snapshot(entries.temp);
    let hooked = 0;
    const { context, effects } = instrument(fake, entries.sessionFile);
    await assert.rejects(workflow(entries, async () => {
      hooked += 1;
      await privateFile(path.join(directory, "user-race.txt"), Buffer.from(`${SENTINEL} race\n`));
    }).writeAttachedStatus(context.ctx, "applied"), (error) => codeOf(error) === "workspace_limit_reached");
    assert.equal(hooked, 1);
    assert.equal(effects.previews.length, 1);
    assert.equal((await readdir(directory)).filter((name) => name.startsWith(".pi-career-state-")).length, 1);
    assert.deepEqual(await residue(entries.temp), []);
    const after = await snapshot(entries.temp);
    const race = after.applications.entries[DIRECTORY_NAME].entries["user-race.txt"];
    delete after.applications.entries[DIRECTORY_NAME].entries["user-race.txt"];
    assert.deepEqual(after, before);
    assert.equal(race.sha256, hash(Buffer.from(`${SENTINEL} race\n`)));
    assertNoEffects(effects, fake.entries, fake.entries, fake.activeTools, fake.activeTools);
  } finally {
    await rm(entries.temp, { recursive: true, force: true });
  }

  const revisions = await fixture("revision-race");
  try {
    const { directory, attachment } = await writePackage(revisions, { revisions: REVISION_MAX - 1, userFiles: 1 });
    const fake = makeFakePi();
    attach(fake, attachment);
    const before = await snapshot(revisions.temp);
    const { context, effects } = instrument(fake, revisions.sessionFile);
    await assert.rejects(workflow(revisions, async () => {
      await privateFile(path.join(directory, ".pi-career-state-000064.json"), Buffer.from("not-a-revision\n"));
    }).writeAttachedStatus(context.ctx, "applied"), (error) => codeOf(error) === "workspace_drift");
    assert.equal(effects.previews.length, 1);
    assert.equal((await readdir(directory)).includes(".pi-career-state-000065.json"), false);
    const after = await snapshot(revisions.temp);
    delete after.applications.entries[DIRECTORY_NAME].entries[".pi-career-state-000064.json"];
    assert.deepEqual(after, before);
    assert.deepEqual(await residue(revisions.temp), []);
    assertNoEffects(effects, fake.entries, fake.entries, fake.activeTools, fake.activeTools);
  } finally {
    await rm(revisions.temp, { recursive: true, force: true });
  }
});

test("P3-44 managed bytes and document bytes use independent read and commit ceilings", async () => {
  async function managed(target, name) {
    const value = await fixture(name);
    const { directory } = await writePackage(value, { revisions: 8, vacancyBytes: 200_000, userFiles: 1 });
    const names = (await readdir(directory)).filter((entry) => entry !== "user-000.txt");
    const vacancies = names.filter((entry) => entry.startsWith("vacancy"));
    const nonVacancy = (await Promise.all(names.filter((entry) => !entry.startsWith("vacancy"))
      .map(async (entry) => (await readFile(path.join(directory, entry))).length)))
      .reduce((total, size) => total + size, 0);
    const budget = target - nonVacancy;
    const sizes = Array.from({ length: vacancies.length }, () => Math.floor(budget / vacancies.length));
    sizes[sizes.length - 1] += budget - sizes.reduce((total, size) => total + size, 0);
    assert.ok(sizes.every((size) => size >= 100_000 && size <= DOCUMENT_MAX), `managed split ${sizes.join(",")} is not independent`);
    let parent = hash(await readFile(path.join(directory, "application.json")));
    for (let sequence = 1; sequence <= vacancies.length; sequence += 1) {
      const vacancyName = sequence === 1 ? "vacancy.md" : `vacancy-${String(sequence).padStart(6, "0")}.md`;
      assert.equal(vacancies.includes(vacancyName), true);
      const bytes = Buffer.alloc(sizes[sequence - 1], 0x63);
      await privateFile(path.join(directory, vacancyName), bytes);
      const stateName = `.pi-career-state-${String(sequence).padStart(6, "0")}.json`;
      const state = JSON.parse(await readFile(path.join(directory, stateName), "utf8"));
      state.vacancy = {
        relative_path: vacancyName,
        content_sha256: hash(bytes),
        utf8_bytes: bytes.length,
        source_state_id: state.vacancy.source_state_id,
      };
      state.parent_sha256 = parent;
      const rewritten = canonical(state);
      await privateFile(path.join(directory, stateName), rewritten);
      parent = hash(rewritten);
    }
    const managedBytes = (await Promise.all(names.map(async (entry) => (await readFile(path.join(directory, entry))).length)))
      .reduce((total, size) => total + size, 0);
    assert.equal(managedBytes, target);
    return { value, directory };
  }

  const at = await managed(MANAGED_MAX, "managed-at");
  try {
    const before = await snapshot(at.value.root);
    const catalog = await catalogOf(at.value.root);
    assert.equal(catalog.applications.length, 1, "exactly 2,097,152 managed bytes remain readable");
    assert.deepEqual(await snapshot(at.value.root), before);
  } finally {
    await rm(at.value.temp, { recursive: true, force: true });
  }
  const below = await managed(MANAGED_MAX - 1, "managed-below");
  try {
    assert.equal((await catalogOf(below.value.root)).applications.length, 1);
  } finally {
    await rm(below.value.temp, { recursive: true, force: true });
  }
  const above = await managed(MANAGED_MAX + 1, "managed-above");
  try {
    const before = await snapshot(above.value.root);
    const catalog = await catalogOf(above.value.root);
    assert.equal(catalog.reconciliation.over_limit, 1);
    assert.equal(catalog.applications.length, 0);
    assert.deepEqual(await snapshot(above.value.root), before);
  } finally {
    await rm(above.value.temp, { recursive: true, force: true });
  }

  const mutation = await fixture("managed-mutation");
  try {
    const { directory, attachment } = await writePackage(mutation, { revisions: 1, vacancyBytes: 100_000, userFiles: 1 });
    const files = await readdir(directory);
    const managedBytes = (await Promise.all(files.filter((entry) => entry !== "user-000.txt")
      .map(async (entry) => (await readFile(path.join(directory, entry))).length)))
      .reduce((total, size) => total + size, 0);
    const fake = makeFakePi();
    attach(fake, attachment);
    const { context, effects } = instrument(fake, mutation.sessionFile);
    const probe = workflow(mutation);
    const head = JSON.parse(await readFile(path.join(directory, ".pi-career-state-000001.json"), "utf8"));
    const predicted = stateBytes({
      sequence: 2,
      parent: hash(await readFile(path.join(directory, ".pi-career-state-000001.json"))),
      status: "applied",
      updatedAt: MUTATION_AT,
      vacancy: head.vacancy,
    });
    assert.ok(managedBytes + predicted.length < MANAGED_MAX);
    await probe.writeAttachedStatus(context.ctx, "applied");
    assert.equal(effects.previews.length, 1);
    assert.ok(effects.previews[0] > predicted.length, "preview encoding is larger than the managed state bytes");
    assert.ok(effects.previews[0] < PREVIEW_MAX);
    const grown = await fixture("managed-race");
    const grownPackage = await writePackage(grown, { revisions: 1, vacancyBytes: 100_000, userFiles: 1 });
    const grownFake = makeFakePi();
    attach(grownFake, grownPackage.attachment);
    const before = await snapshot(grown.temp);
    const grownContext = instrument(grownFake, grown.sessionFile);
    await assert.rejects(workflow(grown, async () => {
      await privateFile(path.join(grownPackage.directory, "vacancy.md"), Buffer.alloc(100_001, 0x64));
    }).writeAttachedStatus(grownContext.context.ctx, "applied"), (error) => codeOf(error) === "workspace_drift");
    const after = await snapshot(grown.temp);
    assert.equal(after.applications.entries[DIRECTORY_NAME].entries["vacancy.md"].size, 100_001);
    delete after.applications.entries[DIRECTORY_NAME].entries["vacancy.md"];
    delete before.applications.entries[DIRECTORY_NAME].entries["vacancy.md"];
    assert.deepEqual(after, before);
    assert.equal((await readdir(grownPackage.directory)).includes(".pi-career-state-000002.json"), false);
    await rm(grown.temp, { recursive: true, force: true });
  } finally {
    await rm(mutation.temp, { recursive: true, force: true });
  }

  for (const [name, size, expected] of [
    ["document-below", DOCUMENT_MAX - 1, "valid"],
    ["document-at", DOCUMENT_MAX, "valid"],
    ["document-above", DOCUMENT_MAX + 1, "over_limit"],
  ]) {
    const value = await fixture(name);
    try {
      const { directory } = await writePackage(value, { revisions: 1, resumeBytes: size, userFiles: 1 });
      const before = await snapshot(value.root);
      const catalog = await catalogOf(value.root);
      if (expected === "valid") assert.equal(catalog.applications.length, 1, name);
      else {
        assert.equal(catalog.reconciliation.over_limit, 1, name);
        assert.equal(catalog.applications.length, 0, name);
      }
      assert.deepEqual(await snapshot(value.root), before, name);
      assert.equal((await readFile(path.join(directory, "resume.md"))).length, size);
    } finally {
      await rm(value.temp, { recursive: true, force: true });
    }
  }

  const race = await fixture("document-race");
  try {
    const { directory, attachment } = await writePackage(race, { revisions: 1, resumeBytes: DOCUMENT_MAX, userFiles: 1 });
    const fake = makeFakePi();
    attach(fake, attachment);
    const before = await snapshot(race.temp);
    const { context, effects } = instrument(fake, race.sessionFile);
    await assert.rejects(workflow(race, async () => {
      await writeFile(path.join(directory, "resume.md"), Buffer.alloc(DOCUMENT_MAX + 1, 0x61));
    }).writeAttachedStatus(context.ctx, "applied"), (error) => codeOf(error) === "workspace_limit_reached");
    assert.equal(effects.previews.length, 1);
    assert.equal((await readdir(directory)).includes(".pi-career-state-000002.json"), false);
    const after = await snapshot(race.temp);
    assert.equal(after.applications.entries[DIRECTORY_NAME].entries["resume.md"].size, DOCUMENT_MAX + 1);
    delete after.applications.entries[DIRECTORY_NAME].entries["resume.md"];
    delete before.applications.entries[DIRECTORY_NAME].entries["resume.md"];
    assert.deepEqual(after, before);
    assert.deepEqual(await residue(race.temp), []);
    const input = await fixture("document-input");
    const inputPackage = await writePackage(input, { revisions: 1, userFiles: 1 });
    const inputFake = makeFakePi();
    attach(inputFake, inputPackage.attachment);
    const inputBefore = await snapshot(input.temp);
    const rejected = instrument(inputFake, input.sessionFile);
    await assert.rejects(
      workflow(input).writeAttachedVacancy(rejected.context.ctx, "x".repeat(DOCUMENT_MAX)),
      (error) => codeOf(error) === "invalid_command_arguments",
    );
    assert.equal(rejected.effects.previews.length, 0);
    assert.deepEqual(await snapshot(input.temp), inputBefore);
    await rm(input.temp, { recursive: true, force: true });
  } finally {
    await rm(race.temp, { recursive: true, force: true });
  }
});

test("P3-44 metadata size gate differs from mutation drift and preview bytes are measured, not inferred", async () => {
  const value = await fixture("metadata");
  try {
    const { directory, attachment } = await writePackage(value, { revisions: 1, userFiles: 1 });
    const stateName = ".pi-career-state-000001.json";
    const original = await readFile(path.join(directory, stateName));
    await privateFile(path.join(directory, stateName), Buffer.alloc(METADATA_MAX, 0x20));
    const at = await catalogOf(value.root);
    assert.equal(at.reconciliation.over_limit, 0);
    assert.equal(at.applications.length, 0);
    await privateFile(path.join(directory, stateName), Buffer.alloc(METADATA_MAX + 1, 0x20));
    const above = await catalogOf(value.root);
    assert.equal(above.reconciliation.over_limit, 1);
    await privateFile(path.join(directory, stateName), original);
    assert.equal((await catalogOf(value.root)).applications.length, 1);

    const fake = makeFakePi();
    attach(fake, attachment);
    const { context, effects } = instrument(fake, value.sessionFile);
    await workflow(value).writeAttachedStatus(context.ctx, "applied");
    const published = await readFile(path.join(directory, ".pi-career-state-000002.json"));
    assert.ok(published.length > 0 && published.length < METADATA_MAX);
    assert.ok(effects.previews[0] > published.length);
    assert.ok(effects.previews[0] < PREVIEW_MAX);
    const parsed = JSON.parse(effects.previews.length === 1
      ? await (async () => {
        const text = (await readFile(path.join(directory, ".pi-career-state-000002.json"))).toString();
        return text;
      })()
      : "{}");
    assert.equal(parsed.sequence, 2);

    const before = await snapshot(value.temp);
    const raced = instrument(fake, value.sessionFile);
    const later = new ApplicationWorkspaceWorkflow({
      agentDir: value.agentDir,
      now: () => new Date("2026-09-03T00:00:00.000Z"),
      uuid: (() => { let n = 0xf100; return () => appId(n++); })(),
      afterWorkspaceLockAcquired: async () => {
        await privateFile(path.join(directory, stateName), Buffer.alloc(METADATA_MAX + 1, 0x20));
      },
    });
    await assert.rejects(later.writeAttachedStatus(raced.context.ctx, "closed"), (error) => codeOf(error) === "workspace_drift");
    assert.equal((await catalogOf(value.root)).reconciliation.over_limit, 1);
    assert.equal((await readdir(directory)).includes(".pi-career-state-000003.json"), false);
    const after = await snapshot(value.temp);
    delete after.applications.entries[DIRECTORY_NAME].entries[stateName];
    delete before.applications.entries[DIRECTORY_NAME].entries[stateName];
    delete after.applications.entries[DIRECTORY_NAME].entries[".pi-career-state-000002.json"];
    delete before.applications.entries[DIRECTORY_NAME].entries[".pi-career-state-000002.json"];
    assert.deepEqual(after, before);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }

  const preview = await fixture("preview");
  try {
    const { attachment } = await writePackage(preview, { revisions: 1, userFiles: 1 });
    const fake = makeFakePi();
    attach(fake, attachment);
    const text = `${SENTINEL}\n${"\\".repeat(49_000)}`;
    const { context, effects } = instrument(fake, preview.sessionFile);
    const outcome = await workflow(preview).writeAttachedVacancy(context.ctx, text);
    assert.equal(outcome, "written");
    assert.equal(effects.previews.length, 1);
    const encoded = effects.previews[0];
    const managed = Buffer.byteLength(text, "utf8");
    assert.ok(encoded > managed * 2, "canonical preview escaping is not inferred from managed bytes");
    assert.ok(encoded < PREVIEW_MAX);
    assert.equal(JSON.parse(await readFile(path.join(preview.root, DIRECTORY_NAME, "vacancy-000002.md"), "utf8").then((body) => JSON.stringify(body))).length, text.length);
  } finally {
    await rm(preview.temp, { recursive: true, force: true });
  }
});

test("P3-44 config bytes and 80-character labels reject over-limit input without truncation", async () => {
  function rootRecord(index, body) {
    const rootPath = `/synthetic/${String(index).padStart(4, "0")}/${"p".repeat(body)}`;
    assert.equal(path.resolve(rootPath), rootPath);
    assert.ok(Buffer.byteLength(rootPath) <= 4_096);
    return { id: hash(Buffer.from(rootPath)), path: rootPath, label: "L".repeat(LABEL_MAX) };
  }
  function encode(roots) {
    return canonical({
      schema_version: "pi.career.config.v2",
      library_roots: roots,
      generated_variants_root: null,
      application_workspace: null,
    });
  }
  const roots = Array.from({ length: 289 }, (_unused, index) => rootRecord(index + 1, 1));
  roots[288] = rootRecord(289, 84);
  const at = encode(roots);
  roots[288] = rootRecord(289, 83);
  const under = encode(roots);
  assert.equal(at.length, CONFIG_MAX);
  assert.equal(under.length, CONFIG_MAX - 1);
  const exact = { at, under };
  const value = await fixture("config");
  try {
    const before = await snapshot(value.temp);
    await privateFile(configPath(value.agentDir), exact.at);
    assert.equal((await loadConfig(value.agentDir)).library_roots.at(-1).label.length, LABEL_MAX);
    await privateFile(configPath(value.agentDir), exact.under);
    assert.equal((await readFile(configPath(value.agentDir))).length, CONFIG_MAX - 1);
    assert.equal((await loadConfig(value.agentDir)).library_roots.length, 289);
    await privateFile(configPath(value.agentDir), Buffer.concat([exact.at, Buffer.from("x")]));
    await assert.rejects(loadConfig(value.agentDir), (error) => codeOf(error) === "config_invalid");
    assert.equal((await readFile(configPath(value.agentDir))).length, CONFIG_MAX + 1);
    const restored = await readFile(configPath(value.agentDir));
    assert.notEqual(restored.length, before.agent.entries.career.entries["config.v1.json"].size);
    await privateFile(configPath(value.agentDir), await (async () => {
      const original = Buffer.from(before.agent.entries.career.entries["config.v1.json"].hex, "hex");
      return original;
    })());
    const loaded = await loadConfig(value.agentDir);
    await assert.rejects(addLibraryRoot(loaded, value.library, "L".repeat(LABEL_MAX + 1)), (error) => codeOf(error) === "root_invalid");
    const accepted = await addLibraryRoot(loaded, value.library, "L".repeat(LABEL_MAX));
    assert.equal(accepted.library_roots.at(-1).label, "L".repeat(LABEL_MAX));
    const shorter = await addLibraryRoot(loaded, value.library, "L".repeat(LABEL_MAX - 1));
    assert.equal(shorter.library_roots.at(-1).label.length, LABEL_MAX - 1);
    const longDir = path.join(value.temp, "n".repeat(LABEL_MAX + 1));
    await privateDir(longDir);
    const truncated = await addLibraryRoot(loaded, longDir);
    assert.equal(truncated.library_roots.at(-1).label.length, LABEL_MAX);
    assert.notEqual(truncated.library_roots.at(-1).label, path.basename(longDir));
    await writeConfig(value.agentDir, accepted, () => "00000000-0000-4000-8000-0000000000d1");
    assert.equal((await loadConfig(value.agentDir)).library_roots.at(-1).label, "L".repeat(LABEL_MAX));
    assert.deepEqual(await residue(value.temp), []);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }

  const labels = await fixture("labels");
  try {
    await privateFile(configPath(labels.agentDir), canonical({
      schema_version: "pi.career.config.v2",
      library_roots: [],
      generated_variants_root: null,
      application_workspace: null,
    }));
    const fake = makeFakePi();
    registerCareerCommands(fake.api, {
      agentDir: labels.agentDir,
      invoke: async () => { throw new Error("core"); },
    });
    const rejected = instrument(fake, labels.sessionFile, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: ["界".repeat(IDENTITY_LABEL_MAX + 1), "Role"],
      persisted: false,
    });
    rejected.context.ctx.sessionManager.getSessionFile = () => undefined;
    const before = await snapshot(labels.temp);
    await fake.commands.get("career").handler("", rejected.context.ctx);
    assert.equal(rejected.effects.inputs, 1);
    assert.equal(fake.entries.length, 0);
    assert.deepEqual(await snapshot(labels.temp), before);
    const accepted = instrument(fake, labels.sessionFile, {
      selects: [CAREER_UI_RPC_ACTIONS.create, CAREER_UI_RPC_ACTIONS.close],
      inputs: ["界".repeat(IDENTITY_LABEL_MAX), "Role"],
      confirms: [true],
    });
    accepted.context.ctx.sessionManager.getSessionFile = () => undefined;
    await fake.commands.get("career").handler("", accepted.context.ctx);
    assert.equal(fake.entries.length, 1);
    assert.equal([...fake.entries[0].data.company_label].length, IDENTITY_LABEL_MAX);
    assert.equal(fake.api.getSessionName()?.includes("界"), true, fake.api.getSessionName());
    assert.deepEqual(await snapshot(labels.temp), before);
    assert.equal(accepted.effects.core, 0);
    assert.equal(accepted.effects.sends, 0);
  } finally {
    await rm(labels.temp, { recursive: true, force: true });
  }
});
