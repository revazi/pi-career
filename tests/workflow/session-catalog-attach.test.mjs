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
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000077";
const OTHER_APPLICATION_ID = "00000000-0000-4000-8000-000000000088";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const OTHER_APPLICATION_CREATED_AT = "2026-08-04T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const OTHER_WORKSPACE_CREATED_AT = "2026-08-05T00:00:00.000Z";
const OPTION = "Synthetic Company — Synthetic Engineer — preparing";
const OTHER_OPTION = "Other Synthetic Company — Other Synthetic Engineer — preparing";
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

async function writeApplication(root, { applicationId, company, role, applicationCreatedAt, workspaceCreatedAt }) {
  const basename = `${company.toLowerCase().replaceAll(" ", "-")}--${role.toLowerCase().replaceAll(" ", "-")}--${applicationId}`;
  const directory = path.join(root, basename);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const manifest = canonical({
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: applicationId,
    root_id: ROOT_ID,
    application_created_at: applicationCreatedAt,
    workspace_created_at: workspaceCreatedAt,
  });
  await writeFile(path.join(directory, "application.json"), manifest, { mode: 0o600 });
  await chmod(path.join(directory, "application.json"), 0o600);
  await privateJson(path.join(directory, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: applicationId,
    company_label: company,
    role_label: role,
    created_at: applicationCreatedAt,
  });
  await privateJson(path.join(directory, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: applicationId,
    sequence: 1,
    parent_sha256: hash(manifest),
    status: "preparing",
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    updated_at: workspaceCreatedAt,
  });
}

async function fixture() {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-catalog-attach-")));
  const agentDir = path.join(temp, "agent");
  const root = path.join(temp, "applications");
  const library = path.join(temp, "library");
  await prepareConfigDirectory(agentDir);
  await mkdir(library, { mode: 0o700 });
  await chmod(library, 0o700);
  await writeFile(path.join(library, "synthetic-resume.md"), "# Synthetic Resume\n", { mode: 0o600 });
  await chmod(path.join(library, "synthetic-resume.md"), 0o600);
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
  await writeApplication(root, {
    applicationId: APPLICATION_ID,
    company: "Synthetic Company",
    role: "Synthetic Engineer",
    applicationCreatedAt: APPLICATION_CREATED_AT,
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
  });
  await writeApplication(root, {
    applicationId: OTHER_APPLICATION_ID,
    company: "Other Synthetic Company",
    role: "Other Synthetic Engineer",
    applicationCreatedAt: OTHER_APPLICATION_CREATED_AT,
    workspaceCreatedAt: OTHER_WORKSPACE_CREATED_AT,
  });
  const fake = makeFakePi();
  const coreCalls = [];
  let tick = 10;
  const workspaceNow = () => new Date(`2026-08-12T00:00:${String(tick++).padStart(2, "0")}.000Z`);
  const ids = uuidSequence();
  registerCareerCommands(fake.api, {
    agentDir,
    now: workspaceNow,
    uuid: ids,
    invoke: async (...args) => {
      coreCalls.push(args);
      throw new Error("catalog attach must not invoke Career Core");
    },
  });
  const workspace = new ApplicationWorkspaceWorkflow({
    agentDir, now: workspaceNow, uuid: ids,
    appendEntry: (customType, data) => fake.api.appendEntry(customType, data),
  });
  return { temp, root, agentDir, fake, workspace, coreCalls };
}

async function runWorkspace(value, options = {}) {
  const context = makeContext(value.fake, { mode: "rpc", persisted: false, ...options });
  if (options.submitted) {
    context.ctx.sendMessage = options.submitted;
    context.ctx.sendUserMessage = options.submitted;
  }
  await value.workspace.run("", context.ctx);
  return context;
}

async function runApplications(value, options = {}) {
  const context = makeContext(value.fake, { mode: "rpc", ...options });
  if (options.branchEntries !== undefined) {
    context.ctx.sessionManager.getBranch = () => structuredClone(options.branchEntries);
  }
  if (options.allEntries !== undefined) {
    context.ctx.sessionManager.getEntries = () => structuredClone(options.allEntries);
  }
  if (options.submitted) {
    context.ctx.sendMessage = options.submitted;
    context.ctx.sendUserMessage = options.submitted;
  }
  await value.fake.commands.get("career-application").handler("", context.ctx);
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

test("P3-29/P3-54 public attach rejects another UUID on active and non-active branches and offers explicit replacement", async () => {
  for (const claimLocation of ["active", "non-active"]) {
    const value = await fixture();
    try {
      await runApplications(value, {
        selects: [OPTION, "Attach", "Close"],
        confirms: [true],
      });
      assert.deepEqual(value.fake.entries.map(({ customType, data }) => [customType, data.application_id]), [
        ["career.application_attachment", APPLICATION_ID],
      ]);
      const originalEntries = structuredClone(value.fake.entries);
      const branchEntries = claimLocation === "active" ? originalEntries : [];
      const originalTree = await snapshot(value.temp);
      let sends = 0;
      const submitted = () => { sends += 1; throw new Error("automatic model send forbidden"); };
      value.fake.api.sendMessage = submitted;
      value.fake.api.sendUserMessage = submitted;

      const offerTitles = [];
      const rejectedNewSessions = [];
      const rejectedReplacementEntries = [];
      const rejected = await runApplications(value, {
        selects: [OTHER_OPTION, "Attach", "Close"],
        confirms: [(title, message) => {
          offerTitles.push([title, message]);
          return false;
        }],
        branchEntries,
        allEntries: originalEntries,
        submitted,
        newSessions: rejectedNewSessions,
        replacementEntries: rejectedReplacementEntries,
      });
      assert.deepEqual(rejected.notifications, [{
        message: "This session already belongs to another application. The selected application was not attached.",
        type: "warning",
      }]);
      assert.deepEqual(offerTitles, [[
        "Open application in new Pi session",
        "Open this application in a new Pi session? The current session is unchanged.",
      ]]);
      assert.deepEqual(rejectedNewSessions, []);
      assert.deepEqual(rejectedReplacementEntries, []);
      assert.deepEqual(value.fake.entries, originalEntries);
      assert.deepEqual(await snapshot(value.temp), originalTree);
      assert.equal(value.coreCalls.length, 0);
      assert.equal(sends, 0);
      assert.deepEqual(value.fake.activeTools, []);

      const acceptedTitles = [];
      const replacementEntries = [];
      const newSessions = [];
      const accepted = await runApplications(value, {
        selects: [OTHER_OPTION, "Attach", "Close"],
        confirms: [(title, message) => {
          acceptedTitles.push([title, message]);
          return true;
        }],
        branchEntries,
        allEntries: originalEntries,
        submitted,
        replacementEntries,
        newSessions,
      });
      assert.deepEqual(acceptedTitles, offerTitles);
      assert.deepEqual(accepted.notifications, [
        {
          message: "This session already belongs to another application. The selected application was not attached.",
          type: "warning",
        },
        {
          message: "Application attached in the new session. Career assistance remains inactive.",
          type: "info",
        },
      ]);
      assert.equal(newSessions.length, 1, "explicit acceptance must create the replacement session");
      assert.equal(newSessions[0].parentSession, "/synthetic/session.jsonl");
      assert.deepEqual(replacementEntries.map(({ customType, data }) => [customType, data.kind, data.application_id]), [
        ["career.application_attachment", "application_attachment", OTHER_APPLICATION_ID],
      ]);
      assert.doesNotMatch(JSON.stringify(replacementEntries), /Other Synthetic|applications|resume/);
      assert.deepEqual(value.fake.entries, originalEntries);
      assert.deepEqual(await snapshot(value.temp), originalTree);
      assert.equal(value.coreCalls.length, 0);
      assert.equal(sends, 0);
      assert.deepEqual(value.fake.activeTools, []);
    } finally {
      await rm(value.temp, { recursive: true, force: true });
    }
  }
});

test("P3-55 an activated session opens a replacement with attachment only and no conversation", async () => {
  const value = await fixture();
  try {
    await runWorkspace(value, { selects: ["Attach application", OPTION], confirms: [true] });
    await runWorkspace(value, {
      selects: ["Activate Career assistance"], confirms: [true], reload: async () => {},
    });
    assert.deepEqual(value.fake.entries.map(({ customType }) => customType), [
      "career.application_attachment", "career.application_assistance",
    ]);
    value.fake.entries.push({
      type: "message", role: "user", content: "Synthetic conversation marker",
      id: "conversation-1", parentId: value.fake.entries.at(-1).id,
      timestamp: APPLICATION_CREATED_AT,
    });
    const beforeEntries = structuredClone(value.fake.entries);
    const beforeRoot = await snapshot(value.root);
    let submissions = 0;
    const submitted = () => { submissions += 1; throw new Error("automatic message forbidden"); };
    value.fake.api.sendMessage = submitted;
    value.fake.api.sendUserMessage = submitted;
    const replacementEntries = [];
    const newSessions = [];
    await runWorkspace(value, {
      selects: ["Open application in new Pi session", OPTION],
      confirms: [true],
      replacementEntries,
      newSessions,
      submitted,
    });
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.equal(replacementEntries.length, 1);
    assert.equal(replacementEntries[0].customType, "career.application_attachment");
    assert.equal(replacementEntries[0].data.application_id, APPLICATION_ID);
    assert.equal(replacementEntries[0].data.kind, "application_attachment");
    assert.equal(newSessions.length, 1);
    assert.equal(submissions, 0);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
    assert.doesNotMatch(JSON.stringify(replacementEntries), /applications|resume\.md/);
    const cancelledEntries = [];
    await runWorkspace(value, {
      selects: ["Open application in new Pi session", OPTION],
      confirms: [true],
      replacementEntries: cancelledEntries,
      newSessionCancelled: true,
      submitted,
    });
    assert.deepEqual(cancelledEntries, []);
    assert.deepEqual(value.fake.entries, beforeEntries);
    assert.equal(submissions, 0);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
