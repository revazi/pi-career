// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { configPath, rootId } from "../../src/workflow/config.ts";
import { workflowErrorMessage } from "../../src/workflow/types.ts";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000105";
const VALID_ID = "00000000-0000-4000-8000-0000000000a1";
const LEGACY_ID = "00000000-0000-4000-8000-0000000000a2";
const COLLISION_ID = "00000000-0000-4000-8000-0000000000a3";
const ATTACHMENT_ID = "00000000-0000-4000-8000-0000000000aa";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const VALID_UPDATED_AT = "2026-08-12T00:00:02.000Z";
const LEGACY_UPDATED_AT = "2026-08-12T00:00:01.000Z";
const COMPANY = "Synthetic Company";
const ROLE = "Synthetic Engineer";
const UNKNOWN_NAME = ".synthetic-unknown-child";
const UNKNOWN_BODY = "SYNTHETIC_UNKNOWN_CHILD_BODY_P3_05\n";
const COLLISION_BODY = "SYNTHETIC_COLLISION_BODY_P3_05\n";
const LIBRARY_BODY = "SYNTHETIC_LIBRARY_BODY_P3_05\n";
const SESSION_BODY = "SYNTHETIC_SESSION_BODY_P3_05\n";
const VALID_LABEL = `${COMPANY} — ${ROLE} — Preparing — Incomplete 0/3`;
const LEGACY_LABEL = "Legacy application — preparing";
const CATALOG_OPTION = `${COMPANY} — ${ROLE} — preparing`;
const LEGACY_DETAIL = "Legacy application\nStatus: preparing\nClassification: legacy\nOpening does not attach this application.";
const VALID_DETAIL = `${COMPANY} — ${ROLE}\nStatus: Preparing\nReadiness: Incomplete 0/3\nClassification: valid\nOpening does not attach. Press a to attach this application without activating assistance.`;
const DRIFT_NOTICE = "Workspace drift detected. Package mutations are blocked; reconciliation made no change.";
const cancel = () => undefined;
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function privateDirectory(parent, name) {
  const directory = path.join(parent, name);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  return realpath(directory);
}

async function snapshot(directory) {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    const metadata = await lstat(target);
    result[entry.name] = entry.isDirectory()
      ? { type: "directory", mode: metadata.mode & 0o777, entries: await snapshot(target) }
      : {
        type: "file",
        mode: metadata.mode & 0o777,
        sha256: hash(await readFile(target)),
        bytes: (await readFile(target)).toString("hex"),
      };
  }
  return result;
}

function assertPrivateModes(tree) {
  for (const entry of Object.values(tree)) {
    if (entry.type === "directory") {
      assert.equal(entry.mode, 0o700);
      assertPrivateModes(entry.entries);
    } else {
      assert.equal(entry.mode, 0o600);
    }
  }
}

async function writePackage(root, { id, companySlug, roleSlug, updatedAt, legacy = false }) {
  const directory = await privateDirectory(root, `${companySlug}--${roleSlug}--${id}`);
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: id,
    root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT,
    workspace_created_at: WORKSPACE_CREATED_AT,
  });
  await privateFile(path.join(directory, "application.json"), manifest);
  if (!legacy) {
    await privateFile(path.join(directory, ".pi-career-identity.json"), canonical({
      schema_version: "pi.career.application_identity.v1",
      kind: "application_identity",
      application_id: id,
      company_label: COMPANY,
      role_label: ROLE,
      created_at: APPLICATION_CREATED_AT,
    }));
  }
  if (updatedAt !== undefined) {
    await privateFile(path.join(directory, ".pi-career-state-000001.json"), canonical({
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
  }
  return directory;
}

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-p3-05-")));
  await chmod(temp, 0o700);
  const agentDir = await privateDirectory(temp, "agent");
  const root = await privateDirectory(temp, "applications");
  const otherRoot = await privateDirectory(temp, "other-applications");
  const library = await privateDirectory(temp, "library");
  const sessions = await privateDirectory(temp, "sessions");
  await prepareConfigDirectory(agentDir);
  await chmod(path.join(agentDir, "career"), 0o700);
  await privateFile(path.join(library, "synthetic-original.md"), Buffer.from(`# Synthetic original\n${LIBRARY_BODY}`));
  await privateFile(path.join(sessions, "synthetic-session.jsonl"), Buffer.from(SESSION_BODY));
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
  await writePackage(root, {
    id: VALID_ID,
    companySlug: "synthetic-company",
    roleSlug: "synthetic-engineer",
    updatedAt: VALID_UPDATED_AT,
  });
  await writePackage(root, {
    id: LEGACY_ID,
    companySlug: "legacy-company",
    roleSlug: "legacy-role",
    updatedAt: LEGACY_UPDATED_AT,
    legacy: true,
  });
  const left = await writePackage(root, {
    id: COLLISION_ID, companySlug: "collision-left", roleSlug: "role", updatedAt: LEGACY_UPDATED_AT,
  });
  const right = await writePackage(root, {
    id: COLLISION_ID, companySlug: "collision-right", roleSlug: "role", updatedAt: LEGACY_UPDATED_AT,
  });
  await privateFile(path.join(left, "collision-sentinel.txt"), Buffer.from(COLLISION_BODY));
  await privateFile(path.join(right, "collision-sentinel.txt"), Buffer.from(COLLISION_BODY));
  await privateFile(path.join(root, UNKNOWN_NAME), Buffer.from(UNKNOWN_BODY));

  const calls = [];
  const sends = [];
  const reloads = [];
  const newSessions = [];
  const toolChanges = [];
  const editorText = [];
  const fake = makeFakePi();
  const setActiveTools = fake.api.setActiveTools.bind(fake.api);
  fake.api.setActiveTools = (names) => {
    toolChanges.push(names);
    setActiveTools(names);
  };
  fake.api.sendMessage = (...args) => sends.push(args);
  fake.api.sendUserMessage = (...args) => sends.push(args);
  registerCareerCommands(fake.api, {
    agentDir,
    uuid: () => ATTACHMENT_ID,
    now: () => new Date("2026-08-13T00:00:00.000Z"),
    invoke: async (invocation) => {
      calls.push(invocation.kind ?? invocation.operation ?? "core");
      throw new Error("Career Core must not be resolved or invoked");
    },
  });
  return {
    temp, agentDir, root, otherRoot, library, sessions, fake, calls, sends, reloads, newSessions, toolChanges, editorText,
  };
}

function bind(value, script) {
  const context = makeContext(value.fake, {
    mode: "rpc",
    persisted: true,
    reload: async () => value.reloads.push("reload"),
    newSessions: value.newSessions,
    editorText: value.editorText,
  });
  const dialogs = [];
  context.ctx.sendMessage = (...args) => value.sends.push(args);
  context.ctx.sendUserMessage = (...args) => value.sends.push(args);
  context.ctx.ui.select = async (title, options) => {
    dialogs.push({ select: title, options: [...options] });
    const next = script.selects.shift();
    return typeof next === "function" ? next(title, options) : next;
  };
  context.ctx.ui.input = async (title, placeholder) => {
    dialogs.push({ input: title, placeholder });
    return script.inputs.shift();
  };
  context.ctx.ui.editor = async (title, prefill) => {
    dialogs.push({ editor: title, prefill });
    return script.editors.shift();
  };
  context.ctx.ui.confirm = async (title, message) => {
    dialogs.push({ confirm: title, message });
    const next = script.confirms.shift();
    return typeof next === "function" ? next(title, message) : next;
  };
  return { context, dialogs };
}

function surfaceText(dialogs, notifications, entries) {
  return JSON.stringify({ dialogs, notifications, entries });
}

function assertNoLeak(text, temp) {
  for (const value of [
    temp, UNKNOWN_NAME, UNKNOWN_BODY.trim(), COLLISION_BODY.trim(), LIBRARY_BODY.trim(), SESSION_BODY.trim(),
    "collision-left", "collision-right", "legacy-company", "legacy-role", "other-applications",
  ]) {
    assert.equal(text.includes(value), false, value);
  }
}

function assertNoForbiddenEffects(value) {
  assert.deepEqual(value.calls, []);
  assert.deepEqual(value.sends, []);
  assert.deepEqual(value.reloads, []);
  assert.deepEqual(value.newSessions, []);
  assert.deepEqual(value.toolChanges, []);
  assert.deepEqual(value.editorText, []);
  assert.deepEqual(value.fake.activeTools, []);
  assert.equal(value.fake.api.getSessionName(), undefined);
  assert.equal(value.fake.entries.some((entry) => entry.customType === "career.application_assistance"), false);
  assert.equal(value.fake.entries.some((entry) => entry.data?.kind === "result_card" || entry.data?.kind === "prompt"), false);
}

async function runCommand(value, name, script) {
  const selects = [...script.selects];
  const inputs = [...(script.inputs ?? [])];
  const editors = [...(script.editors ?? [])];
  const confirms = [...(script.confirms ?? [])];
  const bound = bind(value, { selects, inputs, editors, confirms });
  await value.fake.commands.get(name).handler("", bound.context.ctx);
  assert.deepEqual({ selects, inputs, editors, confirms }, {
    selects: [], inputs: [], editors: [], confirms: [],
  }, JSON.stringify({ notifications: bound.context.notifications, dialogs: bound.dialogs }));
  return bound;
}

test("P3-05 registered configure-root and Applications discovery/attach leave an unknown direct child aggregate drifted and non-attachable", async () => {
  const value = await fixture();
  try {
    const before = await snapshot(value.temp);
    assertPrivateModes(before);
    assert.equal(before.applications.entries[UNKNOWN_NAME].sha256, hash(Buffer.from(UNKNOWN_BODY)));
    const catalog = await readApplicationCatalog(value.root, ROOT_ID);
    assert.deepEqual(await readApplicationCatalog(value.root, ROOT_ID), catalog);
    assert.deepEqual(catalog.applications.map((record) => [record.application_id, record.classification]), [
      [VALID_ID, "valid"],
      [LEGACY_ID, "legacy"],
    ]);
    assert.deepEqual(catalog.reconciliation, {
      interrupted: 0, drifted: 1, duplicate_id: 2, unsupported: 0, over_limit: 0,
    });
    assert.equal(JSON.stringify(catalog).includes(UNKNOWN_NAME), false);
    assert.equal(JSON.stringify(catalog).includes(COLLISION_ID), false);
    assert.deepEqual(await snapshot(value.temp), before);

    const listOptions = [
      VALID_LABEL,
      LEGACY_LABEL,
      CAREER_UI_RPC_ACTIONS.attach,
      CAREER_UI_RPC_ACTIONS.create,
      CAREER_UI_RPC_ACTIONS.updateStatus,
      CAREER_UI_RPC_ACTIONS.detach,
      CAREER_UI_RPC_ACTIONS.switchView,
      CAREER_UI_RPC_ACTIONS.close,
    ];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const listed = await runCommand(value, "career", { selects: [CAREER_UI_RPC_ACTIONS.close] });
      assert.deepEqual(listed.dialogs[0].options, listOptions);
      assert.equal(listed.dialogs[0].select.startsWith("Career • Applications\n"), true);
      assert.equal(listed.dialogs[0].options.includes(UNKNOWN_NAME), false);
      assert.deepEqual(listed.context.notifications, []);

      const legacy = await runCommand(value, "career", {
        selects: [LEGACY_LABEL, CAREER_UI_RPC_ACTIONS.back, CAREER_UI_RPC_ACTIONS.close],
      });
      assert.equal(legacy.dialogs[1].select, LEGACY_DETAIL);
      assert.equal(legacy.dialogs[1].options.includes(CAREER_UI_RPC_ACTIONS.attach), false);
      assert.equal(legacy.dialogs[1].options.includes(CAREER_UI_RPC_ACTIONS.migrate), true);
      assert.equal(legacy.dialogs.some((dialog) => dialog.confirm !== undefined || dialog.editor !== undefined), false);

      const status = await runCommand(value, "career-workspace", {
        selects: [CAREER_UI_RPC_ACTIONS.workspace, "Status and reconcile", CAREER_UI_RPC_ACTIONS.close],
      });
      assert.equal(status.dialogs[1].select, "Career application workspace");
      assert.equal(status.dialogs[1].options.includes("Configure application root"), true);
      assert.equal(status.dialogs[1].options.includes("Attach application"), true);
      assert.equal(status.dialogs[1].options.includes("Open application in new Pi session"), false);
      assert.equal(status.dialogs[1].options.includes("Activate Career assistance"), false);
      assert.deepEqual(status.context.notifications, [{
        message: `applications • ${DRIFT_NOTICE}`,
        type: "warning",
      }]);

      const sameRoot = await runCommand(value, "career-workspace", {
        selects: [CAREER_UI_RPC_ACTIONS.workspace, "Configure application root", CAREER_UI_RPC_ACTIONS.close],
        inputs: [value.root],
      });
      assert.equal(sameRoot.dialogs.some((dialog) => dialog.editor !== undefined || dialog.confirm !== undefined), false);
      assert.deepEqual(sameRoot.context.notifications, [{
        message: workflowErrorMessage("workspace_drift"),
        type: "error",
      }]);

      const otherRoot = await runCommand(value, "career-workspace", {
        selects: [CAREER_UI_RPC_ACTIONS.workspace, "Configure application root", CAREER_UI_RPC_ACTIONS.close],
        inputs: [value.otherRoot],
      });
      assert.equal(otherRoot.dialogs.some((dialog) => dialog.editor !== undefined || dialog.confirm !== undefined), false);
      assert.deepEqual(otherRoot.context.notifications, [{
        message: workflowErrorMessage("workspace_unavailable"),
        type: "error",
      }]);

      const detach = await runCommand(value, "career-workspace", {
        selects: [CAREER_UI_RPC_ACTIONS.workspace, "Detach application root from config", CAREER_UI_RPC_ACTIONS.close],
      });
      assert.equal(detach.dialogs.some((dialog) => dialog.confirm !== undefined || dialog.editor !== undefined), false);
      assert.deepEqual(detach.context.notifications, [{
        message: workflowErrorMessage("workspace_drift"),
        type: "error",
      }]);

      const attachMenu = await runCommand(value, "career-workspace", {
        selects: [CAREER_UI_RPC_ACTIONS.workspace, "Attach application", cancel, CAREER_UI_RPC_ACTIONS.close],
      });
      assert.deepEqual(attachMenu.dialogs.find((dialog) => dialog.select === "Attach application")?.options, [CATALOG_OPTION]);
      assert.equal(attachMenu.dialogs.some((dialog) => dialog.confirm !== undefined), false);
      assert.deepEqual(attachMenu.context.notifications, []);
      assertNoLeak(surfaceText(
        [...listed.dialogs, ...legacy.dialogs, ...status.dialogs, ...sameRoot.dialogs, ...otherRoot.dialogs, ...detach.dialogs, ...attachMenu.dialogs],
        [
          ...listed.context.notifications,
          ...legacy.context.notifications,
          ...status.context.notifications,
          ...sameRoot.context.notifications,
          ...otherRoot.context.notifications,
          ...detach.context.notifications,
          ...attachMenu.context.notifications,
        ],
        value.fake.entries,
      ), value.temp);
    }

    const declined = await runCommand(value, "career", {
      selects: [VALID_LABEL, CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [false],
    });
    assert.equal(declined.dialogs[1].select, VALID_DETAIL);
    assert.equal(declined.dialogs[1].options.includes(CAREER_UI_RPC_ACTIONS.migrate), false);
    assert.deepEqual(declined.dialogs.filter((dialog) => dialog.confirm !== undefined), [{
      confirm: "Attach application",
      message: "Attach this application to the Pi session? Only identity pointers are stored. Career model tools stay inactive.",
    }]);
    assert.deepEqual(value.fake.entries, []);
    assert.deepEqual(await snapshot(value.temp), before);
    assertNoForbiddenEffects(value);

    const attached = await runCommand(value, "career", {
      selects: [VALID_LABEL, CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    });
    assert.equal(value.fake.entries.length, 1);
    assert.deepEqual(value.fake.entries[0], {
      type: "custom",
      customType: "career.application_attachment",
      id: "e1",
      parentId: null,
      timestamp: new Date(0).toISOString(),
      data: {
        schema_version: "pi.career.application_attachment.v1",
        kind: "application_attachment",
        attachment_id: ATTACHMENT_ID,
        application_id: VALID_ID,
        root_id: ROOT_ID,
        root_created_at: ROOT_CREATED_AT,
        application_created_at: APPLICATION_CREATED_AT,
        workspace_created_at: WORKSPACE_CREATED_AT,
      },
    });
    assert.equal(JSON.stringify(value.fake.entries[0].data).includes(UNKNOWN_NAME), false);
    assert.deepEqual(attached.context.notifications, [{
      message: "Application attached. Career assistance remains inactive.",
      type: "info",
    }]);
    assert.deepEqual(await snapshot(value.temp), before);

    const repeated = await runCommand(value, "career", {
      selects: [VALID_LABEL, CAREER_UI_RPC_ACTIONS.attach, CAREER_UI_RPC_ACTIONS.close],
      confirms: [true],
    });
    assert.equal(repeated.dialogs.some((dialog) => dialog.confirm === "Attach application"), true);
    assert.deepEqual(repeated.context.notifications, []);
    assert.equal(value.fake.entries.length, 1);
    assert.equal(value.fake.entries[0].data.application_id, VALID_ID);
    assert.equal(value.fake.entries[0].data.attachment_id, ATTACHMENT_ID);
    const rediscovered = await runCommand(value, "career", { selects: [CAREER_UI_RPC_ACTIONS.close] });
    assert.deepEqual(rediscovered.dialogs[0].options, listOptions);
    assert.equal(rediscovered.dialogs[0].options.includes(UNKNOWN_NAME), false);
    assert.deepEqual(await readApplicationCatalog(value.root, ROOT_ID), catalog);
    assert.deepEqual(await snapshot(value.temp), before);
    assert.deepEqual(await readdir(value.otherRoot), []);
    assertNoLeak(surfaceText(
      [...declined.dialogs, ...attached.dialogs, ...repeated.dialogs, ...rediscovered.dialogs],
      [
        ...declined.context.notifications,
        ...attached.context.notifications,
        ...repeated.context.notifications,
        ...rediscovered.context.notifications,
      ],
      value.fake.entries,
    ), value.temp);
    assertNoForbiddenEffects(value);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
