// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { readApplicationCatalog } from "../../src/workflow/application-workspace.ts";

const createdAt = "2026-08-12T00:00:00.000Z";
const rootId = "00000000-0000-4000-8000-000000000099";
const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const emptyReconciliation = () => ({ interrupted: 0, drifted: 0, duplicate_id: 0, unsupported: 0, over_limit: 0 });

async function privateJson(file, value) {
  const bytes = canonical(value);
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
  return bytes;
}

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-catalog-")));
  await chmod(root, 0o700);
  t.after(() => rm(root, { recursive: true, force: true }));
  await privateJson(path.join(root, ".pi-career-applications.json"), {
    schema_version: "pi.career.application_root.v1", kind: "application_workspace_root",
    root_id: rootId, created_at: createdAt,
  });
  return root;
}

async function application(root, number, { legacy = false, slug = "untrusted", updatedAt = createdAt } = {}) {
  const directory = path.join(root, `${slug}--role--${uuid(number)}`);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const manifest = await privateJson(path.join(directory, "application.json"), {
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: uuid(number), root_id: rootId,
    application_created_at: createdAt, workspace_created_at: createdAt,
  });
  const state = {
    schema_version: "pi.career.application_state.v1", kind: "application_state_revision",
    application_id: uuid(number), sequence: 1, parent_sha256: hash(manifest), status: "preparing",
    vacancy: null, selected_original: null, resume_artifact: null, updated_at: updatedAt,
  };
  const stateFile = path.join(directory, ".pi-career-state-000001.json");
  await privateJson(stateFile, state);
  const identity = {
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: uuid(number), company_label: "Synthetic Company", role_label: "Synthetic Engineer",
    created_at: createdAt,
  };
  const identityFile = path.join(directory, ".pi-career-identity.json");
  if (!legacy) await privateJson(identityFile, identity);
  return { directory, identityFile, identity, stateFile, state };
}

async function snapshot(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    result[entry.name] = entry.isDirectory() ? await snapshot(file) : (await readFile(file)).toString("hex");
  }
  return result;
}

function privateFailure(code) {
  return (error) => {
    assert.equal(error.name, "CareerWorkflowError");
    assert.ok(error.message.includes(code));
    assert.doesNotMatch(error.message, /Synthetic|untrusted|00000000-|pi-career-catalog-|ENOENT|ELOOP/);
    return true;
  };
}

test("catalog reads an empty marked root without creating an index", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  assert.deepEqual(await readApplicationCatalog(root, rootId), {
    schema_version: "pi.career.application_catalog.v1",
    applications: [],
    reconciliation: emptyReconciliation(),
  });
  assert.deepEqual(await snapshot(root), before);
});

test("catalog sorts valid and legacy applications and does not derive labels from slugs", async (t) => {
  const root = await fixture(t);
  await application(root, 3);
  const latest = "2026-08-12T00:00:01.000Z";
  await application(root, 2, { updatedAt: latest, legacy: true });
  const first = await application(root, 1, { updatedAt: latest });
  await writeFile(path.join(first.directory, "user-owned.txt"), "Synthetic unrelated content");
  const before = await snapshot(root);
  const catalog = await readApplicationCatalog(root, rootId);
  assert.deepEqual(catalog.applications.map((record) => record.application_id), [uuid(1), uuid(2), uuid(3)]);
  assert.deepEqual(catalog.applications[0], {
    application_id: uuid(1), classification: "valid", identity: first.identity,
    status: "preparing", updated_at: latest,
  });
  assert.deepEqual(catalog.applications[1], {
    application_id: uuid(2), classification: "legacy", status: "preparing", updated_at: latest,
  });
  assert.deepEqual(catalog.reconciliation, emptyReconciliation());
  assert.doesNotMatch(JSON.stringify(catalog), /untrusted|user-owned|unrelated|pi-career-catalog-|parent_sha256/);
  assert.deepEqual(await readApplicationCatalog(root, rootId), catalog);
  assert.deepEqual(await snapshot(root), before);
});

test("catalog classifies a mixed root exactly once per child without exposing invalid details", async (t) => {
  const root = await fixture(t);
  await application(root, 1);
  await application(root, 2, { legacy: true });

  const interrupted = await application(root, 3);
  await rm(interrupted.stateFile);
  const drifted = await application(root, 4);
  await writeFile(drifted.identityFile, "Synthetic malformed private sentinel");
  const unsupported = await application(root, 5);
  await privateJson(unsupported.stateFile, { ...unsupported.state, schema_version: "pi.career.application_state.v99" });
  const overLimit = await application(root, 6);
  for (let i = 0; i < 160; i++) await writeFile(path.join(overLimit.directory, `private-${i}`), "");
  await application(root, 7, { slug: "duplicate-a" });
  await application(root, 7, { slug: "duplicate-b" });

  const before = await snapshot(root);
  const catalog = await readApplicationCatalog(root, rootId);
  assert.deepEqual(catalog.applications.map((record) => [record.application_id, record.classification]), [
    [uuid(1), "valid"], [uuid(2), "legacy"],
  ]);
  assert.deepEqual(catalog.reconciliation, {
    interrupted: 1, drifted: 1, duplicate_id: 2, unsupported: 1, over_limit: 1,
  });
  assert.doesNotMatch(JSON.stringify(catalog), /malformed|sentinel|private-|duplicate-|untrusted|pi-career-catalog-/);
  assert.deepEqual(await readApplicationCatalog(root, rootId), catalog);
  assert.deepEqual(await snapshot(root), before);
});

for (const [kind, classification] of [
  ["foreign-identity", "drifted"],
  ["public-identity", "drifted"],
  ["broken-parent", "drifted"],
  ["gap", "drifted"],
  ["orphan", "drifted"],
  ["unknown-root-entry", "drifted"],
  ["missing-state", "interrupted"],
  ["unsupported-state", "unsupported"],
  ["entry-limit", "over_limit"],
]) {
  test(`catalog classifies ${kind} without mutation`, async (t) => {
    const root = await fixture(t);
    await application(root, 1);
    const item = await application(root, 2);
    if (kind === "foreign-identity") {
      await privateJson(item.identityFile, { ...item.identity, application_id: uuid(3) });
    } else if (kind === "public-identity") {
      await chmod(item.identityFile, 0o644);
    } else if (kind === "broken-parent") {
      await privateJson(item.stateFile, { ...item.state, parent_sha256: "0".repeat(64) });
    } else if (kind === "gap") {
      await privateJson(path.join(item.directory, ".pi-career-state-000003.json"), { ...item.state, sequence: 3 });
    } else if (kind === "missing-state") {
      await rm(item.stateFile);
    } else if (kind === "orphan") {
      await writeFile(path.join(item.directory, "vacancy.md"), "Synthetic orphan");
    } else if (kind === "unknown-root-entry") {
      await writeFile(path.join(root, "Synthetic-private-root-entry"), "Synthetic unknown");
    } else if (kind === "unsupported-state") {
      await privateJson(item.stateFile, { ...item.state, schema_version: "pi.career.application_state.v99" });
    } else if (kind === "entry-limit") {
      for (let i = 0; i < 160; i++) await writeFile(path.join(item.directory, `unknown-${i}`), "");
    }
    const before = await snapshot(root);
    const catalog = await readApplicationCatalog(root, rootId);
    assert.equal(catalog.reconciliation[classification], 1);
    assert.deepEqual(catalog.applications.map((record) => record.application_id),
      kind === "unknown-root-entry" ? [uuid(1), uuid(2)] : [uuid(1)]);
    assert.doesNotMatch(JSON.stringify(catalog), /Synthetic-private-root-entry|unknown-|orphan|pi-career-catalog-/);
    assert.deepEqual(await snapshot(root), before);
  });
}

test("catalog recognizes a canonical bound future identity schema", async (t) => {
  const root = await fixture(t);
  const item = await application(root, 1);
  await privateJson(item.identityFile, { ...item.identity, schema_version: "pi.career.application_identity.v99" });
  const catalog = await readApplicationCatalog(root, rootId);
  assert.deepEqual(catalog.applications, []);
  assert.equal(catalog.reconciliation.unsupported, 1);
});

test("catalog rejects an untrusted or locked root without a partial projection", async (t) => {
  const root = await fixture(t);
  await application(root, 1);
  await assert.rejects(readApplicationCatalog(root, uuid(98)), privateFailure("workspace_identity_conflict"));
  await writeFile(path.join(root, ".pi-career-workspace.lock"), "Synthetic private lock", { mode: 0o600 });
  await assert.rejects(readApplicationCatalog(root, rootId), privateFailure("workspace_busy"));
});

test("catalog rejects root entry-set drift observed between bounded snapshots", async (t) => {
  const root = await fixture(t);
  for (let number = 100; number < 500; number++) {
    const directory = path.join(root, `race--role--${uuid(number)}`);
    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o700);
  }
  await readdir(root);
  const pending = readApplicationCatalog(root, rootId);
  await delay(10);
  await writeFile(path.join(root, "Synthetic-late-private-entry"), "Synthetic late bytes");
  await assert.rejects(pending, privateFailure("workspace_drift"));
});

test("catalog uses the latest head but classifies changed referenced bytes as drifted", async (t) => {
  const root = await fixture(t);
  const item = await application(root, 1);
  const vacancy = Buffer.from("Synthetic vacancy bytes");
  const vacancyFile = path.join(item.directory, "vacancy.md");
  await writeFile(vacancyFile, vacancy, { mode: 0o600 });
  await chmod(vacancyFile, 0o600);
  const first = await privateJson(item.stateFile, {
    ...item.state,
    vacancy: {
      relative_path: "vacancy.md", content_sha256: hash(vacancy), utf8_bytes: vacancy.length,
      source_state_id: uuid(80),
    },
  });
  const updatedAt = "2026-08-12T00:00:01.000Z";
  await privateJson(path.join(item.directory, ".pi-career-state-000002.json"), {
    ...item.state, sequence: 2, parent_sha256: hash(first), status: "applied", updated_at: updatedAt,
  });
  const before = await snapshot(root);
  const catalog = await readApplicationCatalog(root, rootId);
  assert.equal(catalog.applications[0].status, "applied");
  assert.equal(catalog.applications[0].updated_at, updatedAt);
  assert.deepEqual(await snapshot(root), before);
  await writeFile(vacancyFile, "Synthetic altered bytes");
  const drifted = await readApplicationCatalog(root, rootId);
  assert.deepEqual(drifted.applications, []);
  assert.equal(drifted.reconciliation.drifted, 1);
});

test("catalog classifies an aliased application directory without following it", async (t) => {
  const root = await fixture(t);
  const item = await application(root, 1);
  await symlink(item.directory, path.join(root, `alias--role--${uuid(2)}`));
  const catalog = await readApplicationCatalog(root, rootId);
  assert.deepEqual(catalog.applications.map((record) => record.application_id), [uuid(1)]);
  assert.equal(catalog.reconciliation.drifted, 1);
});
