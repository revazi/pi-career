// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import {
  SYNTHETIC, buildChain, canonicalJson, completeApplicationFixture,
  makeManifest, materializeApplicationFixture, mixedChainFixtures,
} from "./fixtures/persistence-v2.mjs";

// These oracles are constructed from literal synthetic contract bytes, never from
// the catalog parser's output. Each root is disposable and private.
async function rootFor(t, fixture = completeApplicationFixture()) {
  const value = await materializeApplicationFixture(fixture);
  t.after(() => rm(value.root, { recursive: true, force: true }));
  return value;
}

async function bytesAndNames(directory) {
  const result = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    result.set(entry.name, entry.isDirectory() ? await bytesAndNames(file) : await readFile(file));
  }
  return result;
}

const clean = { interrupted: 0, drifted: 0, duplicate_id: 0, unsupported: 0, over_limit: 0 };

for (const [id, company, role] of [
  ["exact-labels", "Synthetic  Two Spaces", "Synthetic / Role"],
  ["unicode-labels", "Synthétic", "Synthetic Engineer"],
]) {
  test(`catalog fresh reads restore ${id} from identity bytes, not slug`, async (t) => {
    const fixture = completeApplicationFixture();
    const identity = { ...fixture.identity, company_label: company, role_label: role };
    fixture.files.set(".pi-career-identity.json", canonicalJson(identity));
    const { root } = await rootFor(t, fixture);
    const before = await bytesAndNames(root);
    const first = await readApplicationCatalog(root, SYNTHETIC.rootId);
    const second = await readApplicationCatalog(root, SYNTHETIC.rootId);
    assert.notStrictEqual(first, second);
    assert.deepEqual(second, first);
    assert.deepEqual(first, {
      schema_version: "pi.career.application_catalog.v1",
      applications: [{
        application_id: SYNTHETIC.applicationId, classification: "valid",
        identity: {
          schema_version: "pi.career.application_identity.v1", kind: "application_identity",
          application_id: "00000000-0000-4000-8000-000000000001",
          company_label: company, role_label: role,
          created_at: "2026-08-12T00:00:00.000Z",
        },
        status: "preparing", updated_at: "2026-08-12T00:00:01.000Z",
      }],
      reconciliation: clean,
    });
    assert.deepEqual(await bytesAndNames(root), before);
    assert.doesNotMatch(JSON.stringify(first), /synthetic-company--synthetic-engineer--|pi-career-persistence-v2-/);
  });
}

test("catalog retains byte-distinct Unicode-equivalent labels on separate UUIDs", async (t) => {
  const first = completeApplicationFixture();
  first.files.set(".pi-career-identity.json", canonicalJson({
    ...first.identity, company_label: "Synthétic",
  }));
  const { root } = await rootFor(t, first);
  const secondId = "00000000-0000-4000-8000-000000000002";
  const second = buildChain([{ version: 1 }], {
    manifest: { ...makeManifest(), application_id: secondId },
  });
  // buildChain's state defaults to the first ID: override both state bytes and
  // the manifest-parent link with explicit canonical contract bytes.
  const state = { ...second.revisions[0].value, application_id: secondId };
  const directory = path.join(root, `second--role--${secondId}`);
  await mkdir(directory, { mode: 0o700 });
  for (const [name, bytes] of [
    ["application.json", second.manifestBytes],
    [".pi-career-identity.json", canonicalJson({ ...first.identity,
      application_id: secondId, company_label: "Synthe\u0301tic" })],
    [second.revisions[0].name, canonicalJson(state)],
  ]) await writeFile(path.join(directory, name), bytes, { mode: 0o600 });
  const before = await bytesAndNames(root);
  const result = await readApplicationCatalog(root, SYNTHETIC.rootId);
  assert.deepEqual(result.applications.map((item) => [item.application_id, item.identity.company_label]), [
    [SYNTHETIC.applicationId, "Synthétic"], [secondId, "Synthe\u0301tic"],
  ]);
  assert.deepEqual(result.reconciliation, clean);
  assert.deepEqual(await bytesAndNames(root), before);
});

test("mixed-chain catalog classifications preserve bytes and expose no partial head", async (t) => {
  for (const fixture of mixedChainFixtures()) {
    const { root } = await rootFor(t, completeApplicationFixture(fixture.chain));
    const before = await bytesAndNames(root);
    const result = await readApplicationCatalog(root, SYNTHETIC.rootId);
    if (fixture.expected === "valid") {
      assert.equal(result.applications.length, 1, fixture.id);
      assert.deepEqual(result.reconciliation, clean);
    } else {
      assert.deepEqual(result.applications, [], fixture.id);
      assert.deepEqual(result.reconciliation, { ...clean, [fixture.expected]: 1 }, fixture.id);
    }
    assert.deepEqual(await bytesAndNames(root), before, fixture.id);
  }
});

test("P3-04 corrupt manifest identity and chain are never exposed as valid", async (t) => {
  for (const [name, file, bytes] of [
    ["manifest", "application.json", Buffer.from("Synthetic malformed manifest")],
    ["identity", ".pi-career-identity.json", Buffer.from("Synthetic malformed identity")],
    ["chain", ".pi-career-state-000001.json", Buffer.from("Synthetic malformed state")],
  ]) {
    const { root, directory } = await rootFor(t);
    await writeFile(path.join(directory, file), bytes, { mode: 0o600 });
    const before = await bytesAndNames(root);
    const result = await readApplicationCatalog(root, SYNTHETIC.rootId);
    assert.deepEqual(result, {
      schema_version: "pi.career.application_catalog.v1",
      applications: [], reconciliation: { ...clean, drifted: 1 },
    }, name);
    assert.doesNotMatch(JSON.stringify(result), /Synthetic|00000000-0000-4000-8000-000000000001/);
    assert.deepEqual(await bytesAndNames(root), before, name);
  }
});

test("crash-left root lock blocks catalog reads without cleanup or read repair", async (t) => {
  const { root } = await rootFor(t, completeApplicationFixture(buildChain([{ version: 1 }, { version: 2 }])));
  const lock = path.join(root, ".pi-career-workspace.lock");
  await writeFile(lock, Buffer.from("Synthetic crash-left lock"), { mode: 0o600 });
  await chmod(lock, 0o600);
  const before = await bytesAndNames(root);
  await assert.rejects(readApplicationCatalog(root, SYNTHETIC.rootId), (error) => {
    assert.equal(error.name, "CareerWorkflowError");
    assert.match(error.message, /workspace_busy/);
    assert.doesNotMatch(error.message, /Synthetic|pi-career-persistence-v2-|crash-left/);
    return true;
  });
  assert.deepEqual(await bytesAndNames(root), before);
});
