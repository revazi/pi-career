// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readApplicationIdentity } from "../../src/workflow/application-workspace.ts";

const identity = {
  schema_version: "pi.career.application_identity.v1",
  kind: "application_identity",
  application_id: "00000000-0000-4000-8000-000000000001",
  company_label: "Synthetic Company",
  role_label: "Synthetic Engineer",
  created_at: "2026-08-12T00:00:00.000Z",
};
const manifest = { application_id: identity.application_id, application_created_at: identity.created_at };
const bytes = Buffer.from(`${JSON.stringify(identity, null, 2)}\n`);

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-identity-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "application");
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  return { root, directory, file: path.join(directory, ".pi-career-identity.json") };
}

function publicDrift(error) {
  assert.match(error.message, /workspace_drift/);
  assert.doesNotMatch(error.message, /Synthetic|pi-career-identity-|ENOENT|ELOOP/);
  return true;
}

test("identity reader leaves absent legacy identity absent and existing identity bytes unchanged", async (t) => {
  const { directory, file } = await fixture(t);
  assert.equal(await readApplicationIdentity(directory, manifest), undefined);
  assert.deepEqual(await readdir(directory), []);
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
  for (let i = 0; i < 2; i += 1) assert.deepEqual(await readApplicationIdentity(directory, manifest), identity);
  assert.deepEqual(await readFile(file), bytes);
  assert.deepEqual(await readdir(directory), [".pi-career-identity.json"]);
});

for (const kind of ["symlink", "hardlink", "directory", "public-file", "public-directory", "aliased-directory", "malformed", "oversized", "foreign-identity", "missing-directory"]) {
  test(`identity reader rejects ${kind} without adopting or modifying content`, async (t) => {
    const { root, directory, file } = await fixture(t);
    let suppliedDirectory = directory;
    if (kind === "symlink") {
      const target = path.join(root, "target");
      await writeFile(target, bytes, { mode: 0o600 });
      await symlink(target, file);
    } else if (kind === "directory") {
      await mkdir(file, { mode: 0o700 });
    } else if (kind === "missing-directory") {
      await rm(directory, { recursive: true });
    } else {
      await writeFile(file, kind === "malformed" ? "Synthetic invalid JSON" : kind === "oversized" ? Buffer.alloc(16_385, 32) : bytes, { mode: 0o600 });
      await chmod(file, kind === "public-file" ? 0o644 : 0o600);
      if (kind === "hardlink") await link(file, path.join(root, "alias"));
      if (kind === "public-directory") await chmod(directory, 0o755);
      if (kind === "aliased-directory") {
        suppliedDirectory = path.join(root, "directory-alias");
        await symlink(directory, suppliedDirectory);
      }
    }
    const expectedManifest = kind === "foreign-identity" ? { ...manifest, application_id: "00000000-0000-4000-8000-000000000002" } : manifest;
    const before = kind === "directory" || kind === "missing-directory" ? undefined : await readFile(file);
    await assert.rejects(readApplicationIdentity(suppliedDirectory, expectedManifest), publicDrift);
    if (before !== undefined) assert.deepEqual(await readFile(file), before);
  });
}
