// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readApplicationCatalog } from "../../src/workflow/application-workspace.ts";

const createdAt = "2026-08-12T00:00:00.000Z";
const rootId = "00000000-0000-4000-8000-000000000099";
const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
  assert.deepEqual(await readApplicationCatalog(root, rootId), []);
  assert.deepEqual(await snapshot(root), before);
});

test("catalog sorts complete applications by head time then UUID, never deriving labels from slugs", async (t) => {
  const root = await fixture(t);
  await application(root, 3);
  const latest = "2026-08-12T00:00:01.000Z";
  await application(root, 2, { updatedAt: latest, legacy: true });
  const first = await application(root, 1, { updatedAt: latest });
  await writeFile(path.join(first.directory, "user-owned.txt"), "Synthetic unrelated content");
  const before = await snapshot(root);
  const records = await readApplicationCatalog(root, rootId);
  assert.deepEqual(records.map((record) => record.application_id), [uuid(1), uuid(2), uuid(3)]);
  assert.deepEqual(records[0], {
    application_id: uuid(1), classification: "valid", identity: first.identity,
    status: "preparing", updated_at: latest,
  });
  assert.deepEqual(records[1], {
    application_id: uuid(2), classification: "legacy", status: "preparing", updated_at: latest,
  });
  assert.doesNotMatch(JSON.stringify(records), /untrusted|user-owned|unrelated|pi-career-catalog-|parent_sha256/);
  assert.deepEqual(await readApplicationCatalog(root, rootId), records);
  assert.deepEqual(await snapshot(root), before);
});

for (const kind of ["duplicate", "malformed-identity", "foreign-identity", "public-identity", "broken-parent", "gap", "missing-state", "orphan", "unknown-root-entry", "root-binding", "unsupported-state", "entry-limit"]) {
  test(`catalog fails closed for ${kind}, with no partial list or mutation`, async (t) => {
    const root = await fixture(t);
    await application(root, 1);
    const item = await application(root, 2);
    let expectedRootId = rootId;
    let code = "workspace_drift";
    if (kind === "duplicate") {
      await application(root, 2, { slug: "duplicate" });
      code = "workspace_identity_conflict";
    } else if (kind === "malformed-identity") {
      await writeFile(item.identityFile, "Synthetic malformed bytes");
    } else if (kind === "foreign-identity") {
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
      await writeFile(path.join(root, "unknown"), "Synthetic unknown");
    } else if (kind === "root-binding") {
      expectedRootId = uuid(98);
      code = "workspace_identity_conflict";
    } else if (kind === "unsupported-state") {
      await privateJson(item.stateFile, { ...item.state, schema_version: "pi.career.application_state.v99" });
    } else if (kind === "entry-limit") {
      for (let i = 0; i < 160; i++) await writeFile(path.join(item.directory, `unknown-${i}`), "");
      code = "workspace_limit_reached";
    }
    const before = await snapshot(root);
    await assert.rejects(readApplicationCatalog(root, expectedRootId), privateFailure(code));
    assert.deepEqual(await snapshot(root), before);
  });
}

test("catalog uses the latest head but validates every earlier revision and referenced file", async (t) => {
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
  const [record] = await readApplicationCatalog(root, rootId);
  assert.equal(record.status, "applied");
  assert.equal(record.updated_at, updatedAt);
  assert.deepEqual(await snapshot(root), before);
  await writeFile(vacancyFile, "Synthetic altered bytes");
  await assert.rejects(readApplicationCatalog(root, rootId), privateFailure("workspace_drift"));
});

test("catalog rejects an aliased application directory", async (t) => {
  const root = await fixture(t);
  const item = await application(root, 1);
  await symlink(item.directory, path.join(root, `alias--role--${uuid(2)}`));
  await assert.rejects(readApplicationCatalog(root, rootId), privateFailure("workspace_drift"));
});
