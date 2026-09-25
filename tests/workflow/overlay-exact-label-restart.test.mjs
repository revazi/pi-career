// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import { CAREER_UI_RPC_ACTIONS, buildCareerUiModel } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { reconstructWorkflowState } from "../../src/workflow/session-state.ts";
import { canonicalJson } from "./fixtures/persistence-v2.mjs";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000061";
const CREATED_AT = "2026-08-12T00:00:00.000Z";
const EXACT_ID = "00000000-0000-4000-8000-000000000061";
const NFC_ID = "00000000-0000-4000-8000-000000000062";
const NFD_ID = "00000000-0000-4000-8000-000000000063";
const COLLIDING_ID = "00000000-0000-4000-8000-000000000064";
const MALFORMED_ID = "00000000-0000-4000-8000-000000000065";
const EXACT_COMPANY = "Synthetic  Two Spaces";
const EXACT_ROLE = "Synthetic / Role";
const NFC_COMPANY = "Synth\u00e9tic";
const NFC_ROLE = "Caf\u00e9 Engineer";
const NFD_COMPANY = "Synthe\u0301tic";
const NFD_ROLE = "Cafe\u0301 Engineer";
const COLLIDING_LEFT = "Colliding Left Label";
const COLLIDING_RIGHT = "Colliding Right Label";
const MALFORMED_SENTINEL = "SYNTHETIC_MALFORMED_IDENTITY_SENTINEL";
const LIBRARY_SENTINEL = "SYNTHETIC_PRIVATE_DOCUMENT_BODY_P3_06_07";
const SESSION_SENTINEL = "SYNTHETIC_SESSION_BYTES_P3_06_07";
const STATUS = "Preparing";
const READINESS = "Incomplete 0/3";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Independent copy of the documented slug algorithm. Display must not use it.
function documentedSlug(value, fallback) {
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return normalized || fallback;
}

function rowLabel(company, role) {
  return `${company} — ${role} — ${STATUS} — ${READINESS}`;
}

function detail(company, role) {
  return `${company} — ${role}\nStatus: ${STATUS}\nReadiness: ${READINESS}\nClassification: valid\nOpening does not attach. Press a to attach this application without activating assistance.`;
}

function containsExact(text, value) {
  return Buffer.from(text, "utf8").includes(Buffer.from(value, "utf8"));
}

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
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

async function writePackage(root, {
  id, company, role, companySlug, roleSlug, updatedAt, identityBytes,
}) {
  const directoryName = `${companySlug}--${roleSlug}--${id}`;
  const directory = path.join(root, directoryName);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const manifest = canonicalJson({
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: id,
    root_id: ROOT_ID,
    application_created_at: CREATED_AT,
    workspace_created_at: CREATED_AT,
  });
  await privateFile(path.join(directory, "application.json"), manifest);
  const identity = identityBytes ?? canonicalJson({
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: id,
    company_label: company,
    role_label: role,
    created_at: CREATED_AT,
  });
  await privateFile(path.join(directory, ".pi-career-identity.json"), identity);
  await privateFile(path.join(directory, ".pi-career-state-000001.json"), canonicalJson({
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: id,
    sequence: 1,
    parent_sha256: hash(manifest),
    status: "preparing",
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    updated_at: updatedAt,
  }));
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  for (const name of await readdir(directory)) assert.equal((await lstat(path.join(directory, name))).mode & 0o777, 0o600);
  return { directoryName, identity };
}

function register(agentDir) {
  const fake = makeFakePi();
  const calls = [];
  const sends = [];
  const reloads = [];
  const newSessions = [];
  const toolChanges = [];
  const appends = [];
  const setActiveTools = fake.api.setActiveTools.bind(fake.api);
  fake.api.setActiveTools = (names) => {
    toolChanges.push(names);
    setActiveTools(names);
  };
  const appendEntry = fake.api.appendEntry.bind(fake.api);
  fake.api.appendEntry = (customType, data) => {
    appends.push(customType);
    return appendEntry(customType, data);
  };
  fake.api.sendMessage = (...args) => sends.push(args);
  fake.api.sendUserMessage = (...args) => sends.push(args);
  registerCareerCommands(fake.api, {
    agentDir,
    uuid: () => "00000000-0000-4000-8000-0000000000aa",
    now: () => new Date("2026-08-13T00:00:00.000Z"),
    invoke: async (invocation) => {
      calls.push(invocation.kind ?? "core");
      throw new Error("Applications listing must not invoke Career Core");
    },
  });
  return { fake, calls, sends, reloads, newSessions, toolChanges, appends };
}

function bindContext(registration, options) {
  const context = makeContext(registration.fake, {
    mode: options.mode,
    persisted: false,
    components: options.components,
    keybindings: options.keybindings,
    reload: async () => registration.reloads.push("reload"),
    newSessions: registration.newSessions,
  });
  context.ctx.sendMessage = (...args) => registration.sends.push(args);
  context.ctx.sendUserMessage = (...args) => registration.sends.push(args);
  return context;
}

function assertNoLeak(text, temp) {
  const forbidden = [
    temp, LIBRARY_SENTINEL, SESSION_SENTINEL, MALFORMED_SENTINEL,
    COLLIDING_LEFT, COLLIDING_RIGHT,
    "unrelated-company", "unrelated-role", "ascii-company", "ascii-role",
    "other-company", "other-role", "collision-left", "collision-right", "malformed-child",
    "synthetic-two-spaces", "synthetic-role", "cafe-engineer",
  ];
  for (const value of forbidden) assert.equal(text.includes(value), false, value);
}

function assertExactSurfaces(text) {
  for (const value of [EXACT_COMPANY, EXACT_ROLE, NFC_COMPANY, NFC_ROLE, NFD_COMPANY, NFD_ROLE]) {
    assert.equal(containsExact(text, value), true, value);
  }
  assert.equal(text.includes(`${NFC_COMPANY} · `), false);
  assert.equal(text.includes(`${NFD_COMPANY} · `), false);
  assert.equal(text.normalize("NFC") === text, false);
}

const EXPECTED = [
  [EXACT_ID, EXACT_COMPANY, EXACT_ROLE],
  [NFC_ID, NFC_COMPANY, NFC_ROLE],
  [NFD_ID, NFD_COMPANY, NFD_ROLE],
];

async function assertModel(agentDir, ctx) {
  const model = await buildCareerUiModel(agentDir, ctx);
  assert.deepEqual(model.applications.items.map((item) => [item.id, item.label, item.detail]), EXPECTED.map(([id, company, role]) => [
    id, rowLabel(company, role), detail(company, role),
  ]));
  assert.equal(model.applications.items[1].label.normalize("NFC"), model.applications.items[2].label.normalize("NFC"));
  assert.notEqual(model.applications.items[1].label, model.applications.items[2].label);
  assert.deepEqual(model.applications.items.map((item) => item.pointer?.applicationId), [EXACT_ID, NFC_ID, NFD_ID]);
  assert.equal(JSON.stringify(model.applications).includes("Not persisted"), false);
}

async function exerciseRpc(agentDir, temp) {
  const registration = register(agentDir);
  const dialogs = [];
  const choices = [];
  for (const [, company, role] of EXPECTED) choices.push(rowLabel(company, role), CAREER_UI_RPC_ACTIONS.back);
  choices.push(CAREER_UI_RPC_ACTIONS.close);
  const context = bindContext(registration, { mode: "rpc" });
  context.ctx.ui.select = async (title, options) => {
    dialogs.push({ title, options: [...options] });
    const choice = choices.shift();
    assert.equal(options.includes(choice), true);
    return choice;
  };
  await registration.fake.commands.get("career").handler("", context.ctx);
  assert.deepEqual(choices, []);
  const lists = dialogs.filter((dialog) => dialog.title.startsWith("Career • Applications\n"));
  const details = dialogs.filter((dialog) => !dialog.title.startsWith("Career • Applications\n"));
  assert.equal(lists.length, 4);
  assert.deepEqual(details.map((dialog) => dialog.title), EXPECTED.map(([, company, role]) => detail(company, role)));
  for (const dialog of lists) {
    assert.deepEqual(dialog.options.slice(0, 3), EXPECTED.map(([, company, role]) => rowLabel(company, role)));
  }
  const rendered = JSON.stringify(dialogs);
  assertExactSurfaces(rendered);
  assertNoLeak(rendered, temp);
  assert.deepEqual(context.notifications, []);
  await assertModel(agentDir, context.ctx);
  assert.deepEqual(registration.fake.entries, []);
  assert.equal(reconstructWorkflowState(registration.fake.entries).application, undefined);
  assert.deepEqual(registration.calls, []);
  assert.deepEqual(registration.sends, []);
  assert.deepEqual(registration.reloads, []);
  assert.deepEqual(registration.newSessions, []);
  assert.deepEqual(registration.toolChanges, []);
  assert.deepEqual(registration.appends, []);
  assert.deepEqual(registration.fake.activeTools, []);
}

async function exerciseTui(agentDir, temp) {
  const registration = register(agentDir);
  const components = [];
  const context = bindContext(registration, {
    mode: "tui",
    components,
    keybindings: {
      matches(data, action) {
        return (action === "tui.select.cancel" && data === "esc") ||
          (action === "tui.select.down" && data === "down") ||
          (action === "tui.select.confirm" && data === "enter");
      },
    },
  });
  const pending = registration.fake.commands.get("career").handler("", context.ctx);
  const deadline = Date.now() + 2_000;
  while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
  const overlay = components[0];
  assert.equal(overlay.currentView, "applications");
  const rendered = [];
  const capture = () => {
    const lines = overlay.render(160);
    rendered.push(lines.join("\n"));
    return lines.join("\n");
  };
  assert.equal(overlay.showingDetail, false);
  assertExactSurfaces(capture());
  for (const [, company, role] of EXPECTED) {
    overlay.handleInput("enter");
    assert.equal(overlay.showingDetail, true);
    const opened = capture();
    assert.equal(containsExact(opened, rowLabel(company, role)), true);
    assert.equal(containsExact(opened, detail(company, role)), true);
    overlay.handleInput("esc");
    assert.equal(overlay.showingDetail, false);
    overlay.handleInput("down");
  }
  overlay.handleInput("esc");
  await pending;
  const text = rendered.join("\n");
  assertExactSurfaces(text);
  assertNoLeak(text, temp);
  assert.deepEqual(context.notifications, []);
  assert.deepEqual(registration.fake.entries, []);
  assert.equal(reconstructWorkflowState(registration.fake.entries).application, undefined);
  assert.deepEqual(registration.calls, []);
  assert.deepEqual(registration.sends, []);
  assert.deepEqual(registration.reloads, []);
  assert.deepEqual(registration.newSessions, []);
  assert.deepEqual(registration.toolChanges, []);
  assert.deepEqual(registration.appends, []);
  assert.deepEqual(registration.fake.activeTools, []);
}

test("P3-06/P3-07 registered Applications restart-like reconstruction lists and opens exact identity labels without slug or Unicode conflation", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-p3-06-07-")));
  try {
    assert.equal(NFC_COMPANY.normalize("NFC"), NFD_COMPANY.normalize("NFC"));
    assert.equal(NFC_ROLE.normalize("NFC"), NFD_ROLE.normalize("NFC"));
    assert.equal(Buffer.from(NFC_COMPANY).equals(Buffer.from(NFD_COMPANY)), false);
    assert.equal(Buffer.from(NFC_ROLE).equals(Buffer.from(NFD_ROLE)), false);
    assert.equal(documentedSlug(NFC_COMPANY, "company"), documentedSlug(NFD_COMPANY, "company"));
    assert.equal(documentedSlug(NFC_ROLE, "role"), documentedSlug(NFD_ROLE, "role"));
    assert.notEqual(`${documentedSlug(EXACT_COMPANY, "company")}--${documentedSlug(EXACT_ROLE, "role")}`, "unrelated-company--unrelated-role");

    const agentDir = path.join(temp, "agent");
    const root = await realpath(await mkdir(path.join(temp, "applications"), { mode: 0o700 }).then(() => path.join(temp, "applications")));
    const library = await realpath(await mkdir(path.join(temp, "library"), { mode: 0o700 }).then(() => path.join(temp, "library")));
    const sessions = await realpath(await mkdir(path.join(temp, "sessions"), { mode: 0o700 }).then(() => path.join(temp, "sessions")));
    await chmod(root, 0o700);
    await chmod(library, 0o700);
    await chmod(sessions, 0o700);
    await prepareConfigDirectory(agentDir);
    await privateFile(path.join(library, "synthetic-original.md"), Buffer.from(`# Synthetic original\n${LIBRARY_SENTINEL}\n`));
    await privateFile(path.join(sessions, "unrelated-session.jsonl"), Buffer.from(`${SESSION_SENTINEL}\n`));
    await privateFile(configPath(agentDir), canonicalJson({
      schema_version: "pi.career.config.v2",
      library_roots: [{ id: rootId(library), path: library, label: "Synthetic library" }],
      generated_variants_root: null,
      application_workspace: { root_id: ROOT_ID, root_path: root },
    }));
    await privateFile(path.join(root, ".pi-career-applications.json"), canonicalJson({
      schema_version: "pi.career.application_root.v1",
      kind: "application_workspace_root",
      root_id: ROOT_ID,
      created_at: "2026-08-01T00:00:00.000Z",
    }));
    const packages = [
      [EXACT_ID, EXACT_COMPANY, EXACT_ROLE, "unrelated-company", "unrelated-role", "2026-08-12T00:00:03.000Z"],
      [NFC_ID, NFC_COMPANY, NFC_ROLE, "ascii-company", "ascii-role", "2026-08-12T00:00:02.000Z"],
      [NFD_ID, NFD_COMPANY, NFD_ROLE, "other-company", "other-role", "2026-08-12T00:00:01.000Z"],
    ];
    const identities = new Map();
    for (const [id, company, role, companySlug, roleSlug, updatedAt] of packages) {
      const written = await writePackage(root, { id, company, role, companySlug, roleSlug, updatedAt });
      identities.set(id, written.identity);
      assert.equal(written.directoryName.includes(company), false);
      assert.equal(written.directoryName.includes(role), false);
    }
    await writePackage(root, {
      id: COLLIDING_ID, company: COLLIDING_LEFT, role: "Synthetic Engineer",
      companySlug: "collision-left", roleSlug: "role", updatedAt: CREATED_AT,
    });
    await writePackage(root, {
      id: COLLIDING_ID, company: COLLIDING_RIGHT, role: "Synthetic Engineer",
      companySlug: "collision-right", roleSlug: "role", updatedAt: CREATED_AT,
    });
    await writePackage(root, {
      id: MALFORMED_ID, company: "Unused", role: "Unused",
      companySlug: "malformed-child", roleSlug: "role", updatedAt: CREATED_AT,
      identityBytes: Buffer.from(MALFORMED_SENTINEL),
    });

    const before = await snapshot(temp);
    await exerciseRpc(agentDir, temp);
    assert.deepEqual(await snapshot(temp), before);
    await exerciseRpc(agentDir, temp);
    assert.deepEqual(await snapshot(temp), before);
    await exerciseTui(agentDir, temp);
    assert.deepEqual(await snapshot(temp), before);

    const catalog = await readApplicationCatalog(root, ROOT_ID);
    assert.deepEqual(catalog.applications.map((record) => [
      record.application_id, record.classification, record.identity.company_label, record.identity.role_label,
    ]), EXPECTED.map(([id, company, role]) => [id, "valid", company, role]));
    assert.deepEqual(catalog.reconciliation, {
      interrupted: 0, drifted: 1, duplicate_id: 2, unsupported: 0, over_limit: 0,
    });
    const catalogText = JSON.stringify(catalog);
    assertNoLeak(catalogText, temp);
    assert.equal(catalogText.includes(EXACT_COMPANY), true);
    for (const [id, identity] of identities) {
      const directory = (await readdir(root)).find((name) => name.endsWith(id));
      assert.equal(directory === undefined, false);
      assert.deepEqual(await readFile(path.join(root, directory, ".pi-career-identity.json")), identity);
    }
    assert.deepEqual(await snapshot(temp), before);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
