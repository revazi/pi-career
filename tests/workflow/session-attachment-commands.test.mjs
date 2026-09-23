// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplicationWorkspaceWorkflow } from "../../src/workflow/application-workspace.ts";
import { addLibraryRoot, emptyConfig, writeConfig } from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_ASSISTANCE_HANDOFF } from "../../src/workflow/session-attachment.ts";
import { createApplicationEntry, createVacancyEntry } from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

const now = () => new Date("2026-08-12T00:00:00.000Z");

function sessionEntry(data, index) {
  return {
    type: "custom", customType: "career.workflow", data,
    id: `workspace-${index}`, parentId: index === 1 ? null : `workspace-${index - 1}`,
    timestamp: data.created_at,
  };
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
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-attach-cmd-")));
  const libraryInput = path.join(temp, "library");
  await mkdir(libraryInput);
  await writeFile(path.join(libraryInput, "resume.md"), "# Synthetic Original\n\nBuilt reliable APIs.\n");
  const library = await realpath(libraryInput);
  const root = path.join(temp, "applications");
  await mkdir(root, { mode: 0o700 });
  await chmod(root, 0o700);
  const agentDir = path.join(temp, "agent");
  await prepareConfigDirectory(agentDir);
  await writeConfig(agentDir, await addLibraryRoot(emptyConfig(), library, "Synthetic resume library"), uuidSequence(), { now });
  const ids = uuidSequence();
  const identity = createApplicationEntry("Synthetic Company", "Platform Engineer", "preparing", { uuid: ids, now });
  const vacancy = createVacancyEntry("Synthetic vacancy bytes", "paste", {
    uuid: ids, now: () => new Date("2026-08-12T00:00:01.000Z"), applicationId: identity.application_id,
  });
  const fake = makeFakePi();
  fake.entries.push(sessionEntry(identity, 1), sessionEntry(vacancy, 2));
  let tick = 10;
  const workspaceNow = () => new Date(`2026-08-12T00:00:${String(tick++).padStart(2, "0")}.000Z`);
  registerCareerCommands(fake.api, {
    agentDir,
    now: workspaceNow,
    uuid: ids,
    invoke: async () => { throw new Error("attachment commands must not invoke Career Core"); },
  });
  const workspace = new ApplicationWorkspaceWorkflow({
    agentDir, now: workspaceNow, uuid: ids,
    appendEntry: (customType, data) => fake.api.appendEntry(customType, data),
  });
  return { temp, root, agentDir, fake, identity, workspace };
}

async function runWorkspace(value, options = {}) {
  const context = makeContext(value.fake, { mode: "rpc", persisted: false, ...options });
  await value.workspace.run("", context.ctx);
  return context;
}

async function initialize(value) {
  await runWorkspace(value, {
    selects: ["Configure application root"], inputs: [value.root],
    editors: [(_title, preview) => preview], confirms: [true],
  });
  await runWorkspace(value, {
    selects: ["Initialize current application"],
    editors: [(_title, preview) => preview], confirms: [true],
  });
}

test("P3-27/P3-28 attach appends only the identity pointer after confirmation", async () => {
  const value = await fixture();
  try {
    await initialize(value);
    const beforeEntries = value.fake.entries.length;
    const beforeRoot = await snapshot(value.root);
    const cancelled = await runWorkspace(value, {
      selects: ["Attach current application"], confirms: [false],
    });
    assert.equal(value.fake.entries.length, beforeEntries);
    assert.ok(cancelled.notifications.every(({ message }) => !message.includes("attached")));
    const editorText = [];
    let reloads = 0;
    const attached = await runWorkspace(value, {
      selects: ["Attach current application"], confirms: [true],
      editorText, reload: async () => { reloads += 1; },
    });
    assert.equal(reloads, 0);
    assert.deepEqual(editorText, []);
    assert.equal(value.fake.entries.length, beforeEntries + 1);
    const entry = value.fake.entries.at(-1);
    assert.equal(entry.customType, "career.application_attachment");
    assert.equal(entry.data.kind, "application_attachment");
    assert.equal(entry.data.application_id, value.identity.application_id);
    assert.equal(entry.data.root_created_at.endsWith("Z"), true);
    assert.doesNotMatch(JSON.stringify(entry.data), /Synthetic|resume\.md|applications|vacancy/);
    assert.ok(attached.notifications.some(({ message }) => message.includes("attached")));
    assert.deepEqual(await snapshot(value.root), beforeRoot);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-30/P3-53 detach clears activation with reload and leaves workspace bytes", async () => {
  const value = await fixture();
  try {
    await initialize(value);
    await runWorkspace(value, { selects: ["Attach current application"], confirms: [true] });
    const editorText = [];
    let reloads = 0;
    await runWorkspace(value, {
      selects: ["Activate Career assistance"], confirms: [true],
      editorText, reload: async () => { reloads += 1; },
    });
    assert.equal(reloads, 1);
    assert.deepEqual(editorText, [CAREER_ASSISTANCE_HANDOFF]);
    assert.ok(value.fake.entries.some((entry) => entry.customType === "career.application_assistance"));
    const beforeRoot = await snapshot(value.root);
    reloads = 0;
    await runWorkspace(value, {
      selects: ["Detach current application from session"], confirms: [true],
      reload: async () => { reloads += 1; },
    });
    assert.equal(reloads, 1);
    const last = value.fake.entries.at(-1);
    assert.equal(last.customType, "career.application_attachment");
    assert.equal(last.data.kind, "application_detachment");
    assert.deepEqual(await snapshot(value.root), beforeRoot);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("P3-51 activation prepares a document-free handoff and does not submit", async () => {
  const value = await fixture();
  try {
    await initialize(value);
    await runWorkspace(value, { selects: ["Attach current application"], confirms: [true] });
    const cancelled = await runWorkspace(value, {
      selects: ["Activate Career assistance"], confirms: [false],
    });
    assert.equal(value.fake.entries.some((entry) => entry.customType === "career.application_assistance"), false);
    assert.ok(cancelled.notifications.every(({ message }) => !message.includes("prepared")));
    const editorText = [];
    const beforeEntries = structuredClone(value.fake.entries);
    const beforeRoot = await snapshot(value.root);
    const attachment = beforeEntries.at(-1).data;
    let reloads = 0;
    let submissions = 0;
    const submitted = () => { submissions += 1; throw new Error("automatic submission forbidden"); };
    value.fake.api.sendMessage = submitted;
    value.fake.api.sendUserMessage = submitted;
    const context = makeContext(value.fake, {
      mode: "rpc", persisted: false,
      selects: ["Activate Career assistance"], confirms: [true],
      editorText, reload: async () => { reloads += 1; },
    });
    context.ctx.sendMessage = submitted;
    context.ctx.sendUserMessage = submitted;
    await value.workspace.run("", context.ctx);
    assert.equal(value.fake.entries.length, beforeEntries.length + 1);
    assert.deepEqual(value.fake.entries.slice(0, -1), beforeEntries);
    const activation = value.fake.entries.at(-1);
    assert.equal(activation.customType, "career.application_assistance");
    assert.deepEqual(Object.keys(activation.data), [
      "schema_version", "kind", "activation_id", "attachment_id", "application_id",
    ]);
    assert.equal(activation.data.schema_version, "pi.career.application_assistance.v1");
    assert.equal(activation.data.kind, "application_assistance_activation");
    assert.equal(activation.data.attachment_id, attachment.attachment_id);
    assert.equal(activation.data.application_id, value.identity.application_id);
    assert.match(activation.data.activation_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await snapshot(value.root), beforeRoot);
    assert.equal(submissions, 0);
    assert.equal(reloads, 1);
    assert.deepEqual(editorText, [CAREER_ASSISTANCE_HANDOFF]);
    assert.doesNotMatch(CAREER_ASSISTANCE_HANDOFF, /Synthetic|resume\.md|vacancy/);
    assert.ok(CAREER_ASSISTANCE_HANDOFF.startsWith("/skill:career-core"));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
