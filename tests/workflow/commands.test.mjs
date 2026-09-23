// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { addLibraryRoot, configPath, emptyConfig, writeConfig } from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_UI_COMMAND_VIEWS, CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import {
  createApplicationEntry,
  createVacancyEntry,
  reconstructWorkflowState,
} from "../../src/workflow/session-state.ts";
import {
  makeContext,
  makeFakePi,
  prepareConfigDirectory,
  uuidSequence,
} from "./helpers.mjs";

const now = () => new Date("2026-08-04T17:56:06.000Z");

async function configuredAgent(temp, files = ["resume.md"]) {
  temp = await realpath(temp);
  const root = path.join(temp, "library");
  const agentDir = path.join(temp, "agent");
  await mkdir(root);
  for (const file of files) await writeFile(path.join(root, file), `# ${file}\nSynthetic resume content\n`);
  const config = await addLibraryRoot(emptyConfig(), root, "Synthetic library");
  await prepareConfigDirectory(agentDir);
  await writeConfig(agentDir, config, uuidSequence());
  return { agentDir, root };
}

test("registers the approved deterministic commands and reviewable workbench handoff", () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, { agentDir: "/synthetic/agent" });
  assert.deepEqual([...fake.commands.keys()].sort(), [
    "career", "career-analyze", "career-application", "career-library", "career-match", "career-setup", "career-vacancy", "career-workbench", "career-workspace",
  ]);
});

test("print/JSON modes fail closed including vacancy clear", async () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, { agentDir: "/synthetic/agent", uuid: uuidSequence(), now });
  const nonUi = makeContext(fake, { mode: "print", hasUI: false });
  await assert.rejects(fake.commands.get("career-setup").handler("status", nonUi.ctx), /interactive_mode_required/);
  await assert.rejects(fake.commands.get("career-workbench").handler("", nonUi.ctx), /interactive_mode_required/);

  const vacancy = createVacancyEntry("Synthetic vacancy", "paste", { uuid: uuidSequence(), now });
  fake.entries.push({ type: "custom", customType: "career.workflow", data: vacancy, id: "seed", parentId: null, timestamp: now().toISOString() });
  const beforeEntries = structuredClone(fake.entries);
  await assert.rejects(fake.commands.get("career-vacancy").handler("clear", nonUi.ctx), /interactive_mode_required/);
  assert.deepEqual(fake.entries, beforeEntries);
});

test("empty career commands open the shared UI without Core, custom overlays, or session append", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-ui-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    const calls = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async (invocation) => {
        calls.push(invocation);
        throw new Error("empty career commands must not invoke Career Core");
      },
    });
    for (const command of Object.keys(CAREER_UI_COMMAND_VIEWS)) {
      const rpc = makeContext(fake, {
        mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close],
      });
      const before = fake.entries.length;
      await fake.commands.get(command).handler("", rpc.ctx);
      assert.equal(rpc.customCalls, 0);
      assert.equal(fake.entries.length, before);
    }
    assert.equal(calls.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("fresh career-setup browse does not write package config", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-command-first-setup-")));
  try {
    const agentDir = path.join(temp, "agent");
    await mkdir(agentDir);
    const fake = makeFakePi();
    registerCareerCommands(fake.api, { agentDir, uuid: uuidSequence(), now });
    const rpc = makeContext(fake, {
      mode: "rpc", persisted: false, selects: [CAREER_UI_RPC_ACTIONS.close],
    });
    await fake.commands.get("career-setup").handler("", rpc.ctx);
    await assert.rejects(lstat(configPath(agentDir)), (error) => error?.code === "ENOENT");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("setup status explains the configured variation suggestion without opening a mutation menu", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-variants-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    registerCareerCommands(fake.api, { agentDir, uuid: uuidSequence(), now });
    const status = makeContext(fake, { mode: "rpc", persisted: false });
    await fake.commands.get("career-setup").handler("status", status.ctx);
    assert.ok(status.notifications.some(({ message }) =>
      message.includes("Resume variation suggestion") && message.includes("variants") &&
      message.includes("default under the first configured root")));
    assert.equal(status.customCalls, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("library status explains why an unusable PDF was not indexed", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-command-pdf-notice-")));
  try {
    const root = path.join(temp, "library");
    const agentDir = path.join(temp, "agent");
    await mkdir(root);
    await writeFile(path.join(root, "scanned-resume.pdf"), "%PDF-1.4\nnot searchable\n");
    await prepareConfigDirectory(agentDir);
    await writeConfig(agentDir, await addLibraryRoot(emptyConfig(), root, "Synthetic library"), uuidSequence());

    const fake = makeFakePi();
    registerCareerCommands(fake.api, { agentDir, uuid: uuidSequence(), now });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    await fake.commands.get("career-library").handler("status", rpc.ctx);
    assert.ok(rpc.notifications.some(({ message }) =>
      message.includes("scanned-resume.pdf") &&
      message.includes("searchable, unencrypted PDF") &&
      message.includes("OCR is not supported")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("application status and clear remain available beside the shared UI", async () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, {
    agentDir: "/synthetic/agent", uuid: uuidSequence(), now,
    invoke: async () => { throw new Error("application status must not invoke Career Core"); },
  });
  const ids = uuidSequence();
  const application = createApplicationEntry("Synthetic Company", "Senior Engineer", "preparing", { uuid: ids, now });
  const vacancy = createVacancyEntry("Synthetic vacancy\nTesting required", "paste", {
    uuid: ids, now, applicationId: application.application_id,
  });
  fake.entries.push(
    { type: "custom", customType: "career.workflow", data: application, id: "a", parentId: null, timestamp: now().toISOString() },
    { type: "custom", customType: "career.workflow", data: vacancy, id: "v", parentId: "a", timestamp: now().toISOString() },
  );
  const status = makeContext(fake, { mode: "rpc", persisted: false });
  await fake.commands.get("career-application").handler("status", status.ctx);
  assert.ok(status.notifications.some(({ message }) => message.includes("Synthetic Company")));

  const clearRpc = makeContext(fake, { mode: "rpc", persisted: false });
  await fake.commands.get("career-application").handler("clear", clearRpc.ctx);
  const cleared = reconstructWorkflowState(fake.entries);
  assert.equal(cleared.application, undefined);
  assert.equal(cleared.vacancy, undefined);
  assert.equal(cleared.application_context_seen, true);
});
