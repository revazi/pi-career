// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";

import { careerSkillsDirectory } from "../../src/career-paths.ts";
import { registerCareerRun } from "../../src/managed/tool.ts";
import { validateApplicationAttachment } from "../../src/workflow/application-workspace.ts";
import {
  APPLICATION_ASSISTANCE_CUSTOM_TYPE,
  APPLICATION_ATTACHMENT_CUSTOM_TYPE,
  createApplicationAssistanceActivationEntry,
  createApplicationAttachmentEntry,
} from "../../src/workflow/session-attachment.ts";
import {
  ACTIVE_MANAGED_CAREER_MODEL_SURFACE,
  applyCareerToolSurface,
  INACTIVE_CAREER_MODEL_SURFACE,
  resolveCareerModelSurface,
} from "../../src/workflow/session-model-surface.ts";
import { makeContext, makeFakePi, uuidSequence } from "./helpers.mjs";

const APPLICATION_ID = "00000000-0000-4000-8000-000000000077";
const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function customEntry(customType, data, index) {
  return {
    type: "custom", customType, data, id: `entry-${index}`,
    parentId: index === 1 ? null : `entry-${index - 1}`, timestamp: WORKSPACE_CREATED_AT,
  };
}

function records() {
  const uuid = uuidSequence();
  const attachment = createApplicationAttachmentEntry({
    applicationId: APPLICATION_ID,
    rootId: ROOT_ID,
    rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT,
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
  }, { uuid });
  const activation = createApplicationAssistanceActivationEntry(attachment, { uuid });
  return { attachment, activation };
}

async function privateJson(file, value) {
  await writeFile(file, canonical(value), { mode: 0o600 });
  await chmod(file, 0o600);
}

async function workspace(t) {
  const agentDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-surface-agent-")));
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-surface-root-")));
  await chmod(agentDir, 0o700);
  await chmod(root, 0o700);
  t.after(() => Promise.all([
    rm(agentDir, { recursive: true, force: true }),
    rm(root, { recursive: true, force: true }),
  ]));
  const careerDir = path.join(agentDir, "career");
  await mkdir(careerDir, { mode: 0o700 });
  await chmod(careerDir, 0o700);
  await privateJson(path.join(careerDir, "config.v1.json"), {
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
  const directory = path.join(root, `synthetic-company--synthetic-engineer--${APPLICATION_ID}`);
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
  await writeFile(path.join(directory, "application.json"), manifest, { mode: 0o600 });
  await chmod(path.join(directory, "application.json"), 0o600);
  await privateJson(path.join(directory, ".pi-career-identity.json"), {
    schema_version: "pi.career.application_identity.v1",
    kind: "application_identity",
    application_id: APPLICATION_ID,
    company_label: "Synthetic Company",
    role_label: "Synthetic Engineer",
    created_at: APPLICATION_CREATED_AT,
  });
  await privateJson(path.join(directory, ".pi-career-state-000001.json"), {
    schema_version: "pi.career.application_state.v1",
    kind: "application_state_revision",
    application_id: APPLICATION_ID,
    sequence: 1,
    parent_sha256: hash(manifest),
    status: "preparing",
    vacancy: null,
    selected_original: null,
    resume_artifact: null,
    updated_at: WORKSPACE_CREATED_AT,
  });
  return agentDir;
}

test("P3-49/P3-50 inactive surface without activation or when validation fails", async () => {
  const { attachment, activation } = records();
  const attach = customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1);
  const activate = customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2);
  assert.deepEqual(await resolveCareerModelSurface([]), INACTIVE_CAREER_MODEL_SURFACE);
  assert.deepEqual(await resolveCareerModelSurface([attach]), INACTIVE_CAREER_MODEL_SURFACE);
  assert.deepEqual(await resolveCareerModelSurface([attach, activate]), INACTIVE_CAREER_MODEL_SURFACE);
  assert.deepEqual(
    await resolveCareerModelSurface([attach, activate], [attach, activate], async () => {
      throw new Error("Synthetic private path must not escape");
    }),
    INACTIVE_CAREER_MODEL_SURFACE,
  );
});

test("P3-51/P3-52 valid activation with successful pointer validation enables managed surface", async () => {
  const { attachment, activation } = records();
  const entries = [
    customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1),
    customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2),
  ];
  let validated = 0;
  assert.deepEqual(
    await resolveCareerModelSurface(entries, entries, async (value) => {
      validated += 1;
      assert.equal(value.attachment_id, attachment.attachment_id);
    }),
    ACTIVE_MANAGED_CAREER_MODEL_SURFACE,
  );
  assert.equal(validated, 1);
});

test("applyCareerToolSurface preserves unrelated tools and never enables raw by default", () => {
  let active = ["read", "career_run", "career_core_discover"];
  applyCareerToolSurface(() => active, (names) => { active = names; }, INACTIVE_CAREER_MODEL_SURFACE);
  assert.deepEqual(active, ["read"]);
  applyCareerToolSurface(() => active, (names) => { active = names; }, ACTIVE_MANAGED_CAREER_MODEL_SURFACE);
  assert.deepEqual(active, ["read", "career_run"]);
});

test("P3-49/P3-57 session start keeps Career tools and Skill discovery inactive", async () => {
  const fake = makeFakePi();
  for (const name of ["read", "career_core_discover", "career_core_resume", "career_core_job"]) {
    fake.api.registerTool({ name, description: name, parameters: {}, execute() {} });
  }
  registerCareerRun(fake.api, { invoke: async () => ({ json: "{}" }), uuid: uuidSequence() });
  const rpc = makeContext(fake, { persisted: false });
  for (const handler of fake.events.get("session_start") ?? []) await handler({}, rpc.ctx);
  assert.deepEqual(fake.activeTools, ["read"]);
  const discovered = await (fake.events.get("resources_discover") ?? [])[0]({});
  assert.deepEqual(discovered, {});
  await fake.commands.get("career-tools").handler("raw", rpc.ctx);
  assert.ok(rpc.notifications.some(({ message }) => message.includes("inactive")));
  assert.deepEqual(fake.activeTools, ["read"]);
  const input = await (fake.events.get("input") ?? [])[0]({ text: "/skill:career-core" }, rpc.ctx);
  assert.deepEqual(input, { action: "handled" });
});

test("P3-51/P3-52 activated session discovers Skill path and managed tool only", async (t) => {
  const agentDir = await workspace(t);
  const { attachment, activation } = records();
  const fake = makeFakePi();
  for (const name of ["read", "career_core_discover", "career_core_resume", "career_core_job"]) {
    fake.api.registerTool({ name, description: name, parameters: {}, execute() {} });
  }
  fake.entries.push(
    customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1),
    customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2),
  );
  registerCareerRun(fake.api, {
    agentDir, invoke: async () => ({ json: "{}" }), uuid: uuidSequence(),
  });
  const rpc = makeContext(fake, { persisted: false });
  for (const handler of fake.events.get("session_start") ?? []) await handler({}, rpc.ctx);
  assert.deepEqual(fake.activeTools, ["read", "career_run"]);
  const discovered = await (fake.events.get("resources_discover") ?? [])[0]({});
  assert.deepEqual(discovered, { skillPaths: [careerSkillsDirectory()] });
  assert.equal(path.basename(discovered.skillPaths[0]), "skills");
  await validateApplicationAttachment(agentDir, attachment);
  const ordinary = await (fake.events.get("input") ?? [])[0]({ text: "hello" }, rpc.ctx);
  assert.deepEqual(ordinary, { action: "continue" });
  await fake.commands.get("career-tools").handler("raw", rpc.ctx);
  assert.deepEqual(new Set(fake.activeTools), new Set([
    "read", "career_run", "career_core_discover", "career_core_resume", "career_core_job",
  ]));
});
