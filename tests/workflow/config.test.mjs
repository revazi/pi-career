// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  addLibraryRoot,
  clearGeneratedVariantsRoot,
  configPath,
  emptyConfig,
  loadConfig,
  removeLibraryRoot,
  setGeneratedVariantsRoot,
  suggestedGeneratedVariantsRoot,
  writeConfig,
} from "../../src/workflow/config.ts";
import { uuidSequence } from "./helpers.mjs";

test("config uses injected agentDir, exact schema, private modes, and atomic replacement", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-config-"));
  try {
    const agentDir = path.join(root, "agent");
    const library = path.join(root, "library");
    await mkdir(library);
    const initial = await loadConfig(agentDir);
    assert.deepEqual(initial, emptyConfig());
    const configured = await addLibraryRoot(initial, library, "Synthetic resumes");
    await writeConfig(agentDir, configured, uuidSequence());

    const file = configPath(agentDir);
    assert.equal((await lstat(path.dirname(file))).mode & 0o777, 0o700);
    assert.equal((await lstat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await loadConfig(agentDir), configured);
    assert.equal(
      suggestedGeneratedVariantsRoot(configured),
      path.join(configured.library_roots[0].path, "variants"),
    );

    const variants = setGeneratedVariantsRoot(configured, `${path.join(root, "generated", "..", "generated")}${path.sep}`);
    assert.equal(variants.generated_variants_root, path.join(root, "generated"));
    assert.equal(suggestedGeneratedVariantsRoot(variants, configured.library_roots[0].id), path.join(root, "generated"));
    await writeConfig(agentDir, variants, uuidSequence());
    assert.deepEqual(await loadConfig(agentDir), variants);
    assert.equal(
      suggestedGeneratedVariantsRoot(clearGeneratedVariantsRoot(variants)),
      path.join(configured.library_roots[0].path, "variants"),
    );
    assert.throws(() => setGeneratedVariantsRoot(configured, configured.library_roots[0].path), /root_invalid/);

    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /resume text|vacancy text|provider/i);
    assert.deepEqual((await readdir(path.dirname(file))).sort(), ["config.v1.json"]);

    const removed = removeLibraryRoot(configured, configured.library_roots[0].id);
    await writeConfig(agentDir, removed, uuidSequence());
    assert.equal((await loadConfig(agentDir)).library_roots.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("root and config validation reject symlinks and malformed fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-career-config-invalid-"));
  try {
    const real = path.join(root, "real");
    const link = path.join(root, "link");
    await mkdir(real);
    await symlink(real, link);
    await assert.rejects(addLibraryRoot(emptyConfig(), link), /root_invalid/);

    const agentDir = path.join(root, "agent");
    const file = configPath(agentDir);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, '{"schema_version":"pi.career.config.v1","library_roots":[],"extra":true}\n', { mode: 0o600 });
    await assert.rejects(loadConfig(agentDir), /config_invalid/);
    await writeFile(file, '{"schema_version":"pi.career.config.v1","library_roots":[],"generated_variants_root":"relative"}\n', { mode: 0o600 });
    await assert.rejects(loadConfig(agentDir), /config_invalid/);
    await assert.rejects(writeConfig(agentDir, emptyConfig(), () => "../escape"), /config_invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
