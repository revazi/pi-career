// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateApplicationAttachment } from "../../src/workflow/application-workspace.ts";
import { createApplicationAttachmentEntry } from "../../src/workflow/session-attachment.ts";
import { uuidSequence } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const OTHER_ROOT_ID = "00000000-0000-4000-8000-000000000098";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000077";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function privateJson(file, value) {
  const bytes = canonical(value);
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
  return bytes;
}

async function fixture(t, options = {}) {
  const agentDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-attachment-agent-")));
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-attachment-root-")));
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
    application_workspace: options.detached ? null : { root_id: ROOT_ID, root_path: root },
  });
  await privateJson(path.join(root, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1",
    kind: "application_workspace_root",
    root_id: ROOT_ID,
    created_at: ROOT_CREATED_AT,
  });
  const basename = `${options.companySlug ?? "synthetic-company"}--synthetic-engineer--${APPLICATION_ID}`;
  const directory = path.join(root, basename);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const manifest = await privateJson(path.join(directory, "application.json"), {
    schema_version: "pi.career.application_manifest.v1",
    kind: "career_application",
    application_id: APPLICATION_ID,
    root_id: ROOT_ID,
    application_created_at: APPLICATION_CREATED_AT,
    workspace_created_at: WORKSPACE_CREATED_AT,
  });
  if (!options.legacy) {
    await privateJson(path.join(directory, ".pi-career-identity.json"), {
      schema_version: "pi.career.application_identity.v1",
      kind: "application_identity",
      application_id: APPLICATION_ID,
      company_label: options.companyLabel ?? "Synthetic Company",
      role_label: "Synthetic Engineer",
      created_at: APPLICATION_CREATED_AT,
    });
  }
  const stateFile = path.join(directory, ".pi-career-state-000001.json");
  await privateJson(stateFile, {
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
  const attachment = createApplicationAttachmentEntry({
    applicationId: APPLICATION_ID,
    rootId: ROOT_ID,
    rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT,
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
  }, { uuid: uuidSequence() });
  return { agentDir, root, directory, stateFile, attachment };
}

async function snapshot(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    result[entry.name] = entry.isDirectory() ? await snapshot(target) : (await readFile(target)).toString("hex");
  }
  return result;
}

function failsWith(code) {
  return (error) => {
    assert.equal(error.name, "CareerWorkflowError");
    assert.ok(error.message.includes(code));
    assert.doesNotMatch(error.message, /Synthetic|00000000-|pi-career-attachment-|application\.json/);
    return true;
  };
}

test("P3-28/P3-31 validates one exact current path-free attachment without mutation", async (t) => {
  const item = await fixture(t);
  const beforeAgent = await snapshot(item.agentDir);
  const beforeRoot = await snapshot(item.root);
  const result = await validateApplicationAttachment(item.agentDir, item.attachment);
  assert.deepEqual(result, {
    attachment_id: item.attachment.attachment_id,
    application_id: APPLICATION_ID,
    root_id: ROOT_ID,
    company_label: "Synthetic Company",
    role_label: "Synthetic Engineer",
    status: "preparing",
    updated_at: WORKSPACE_CREATED_AT,
  });
  assert.doesNotMatch(JSON.stringify(result), /pi-career-attachment-|application\.json|root_path/);
  assert.deepEqual(await snapshot(item.agentDir), beforeAgent);
  assert.deepEqual(await snapshot(item.root), beforeRoot);
});

test("P3-31 missing configuration or a legacy identity is unavailable", async (t) => {
  const detached = await fixture(t, { detached: true });
  await assert.rejects(
    validateApplicationAttachment(detached.agentDir, detached.attachment),
    failsWith("attachment_unavailable"),
  );
  const legacy = await fixture(t, { legacy: true });
  await assert.rejects(
    validateApplicationAttachment(legacy.agentDir, legacy.attachment),
    failsWith("attachment_unavailable"),
  );
});

test("P3-31/P3-56 root, manifest, and expected-name identity drift fails closed", async (t) => {
  const rootMismatch = await fixture(t);
  await assert.rejects(
    validateApplicationAttachment(rootMismatch.agentDir, {
      ...rootMismatch.attachment, root_id: OTHER_ROOT_ID,
    }),
    failsWith("workspace_identity_conflict"),
  );

  const rootTime = await fixture(t);
  await assert.rejects(
    validateApplicationAttachment(rootTime.agentDir, {
      ...rootTime.attachment, root_created_at: "2026-07-31T00:00:00.000Z",
    }),
    failsWith("workspace_identity_conflict"),
  );

  const manifestTime = await fixture(t);
  await assert.rejects(
    validateApplicationAttachment(manifestTime.agentDir, {
      ...manifestTime.attachment, workspace_created_at: "2026-08-04T00:00:00.000Z",
    }),
    failsWith("workspace_identity_conflict"),
  );

  const renamed = await fixture(t, { companySlug: "renamed" });
  await assert.rejects(
    validateApplicationAttachment(renamed.agentDir, renamed.attachment),
    failsWith("workspace_identity_conflict"),
  );
});

test("P3-31/P3-56 drifted and duplicate selected applications are never adopted", async (t) => {
  const drifted = await fixture(t);
  await writeFile(drifted.stateFile, "Synthetic invalid state", { mode: 0o600 });
  await assert.rejects(
    validateApplicationAttachment(drifted.agentDir, drifted.attachment),
    failsWith("attachment_unavailable"),
  );

  const duplicate = await fixture(t);
  const duplicateDirectory = path.join(
    duplicate.root,
    `duplicate--synthetic-engineer--${APPLICATION_ID}`,
  );
  await mkdir(duplicateDirectory, { mode: 0o700 });
  await chmod(duplicateDirectory, 0o700);
  for (const name of ["application.json", ".pi-career-identity.json", ".pi-career-state-000001.json"]) {
    await writeFile(path.join(duplicateDirectory, name), await readFile(path.join(duplicate.directory, name)), { mode: 0o600 });
    await chmod(path.join(duplicateDirectory, name), 0o600);
  }
  await assert.rejects(
    validateApplicationAttachment(duplicate.agentDir, duplicate.attachment),
    failsWith("workspace_identity_conflict"),
  );
});
