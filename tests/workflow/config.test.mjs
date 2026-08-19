// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, link, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
import { prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

test("fresh and ordinary config mutations bootstrap safely and remain canonical v1", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-config-")));
  try {
    const agentDir = path.join(root, "agent");
    const library = path.join(root, "library");
    await mkdir(agentDir);
    await mkdir(library);
    const initial = await loadConfig(agentDir);
    assert.deepEqual(initial, emptyConfig());
    const configured = await addLibraryRoot(initial, library, "Synthetic resumes");
    await writeConfig(agentDir, configured, uuidSequence());

    const file = configPath(agentDir);
    assert.equal((await lstat(path.dirname(file))).mode & 0o7777, 0o700);
    assert.equal((await lstat(file)).mode & 0o7777, 0o600);
    assert.deepEqual(await loadConfig(agentDir), configured);
    assert.equal(JSON.parse(await readFile(file, "utf8")).schema_version, "pi.career.config.v1");
    assert.equal(
      suggestedGeneratedVariantsRoot(configured),
      path.join(configured.library_roots[0].path, "variants"),
    );

    const variants = setGeneratedVariantsRoot(
      await loadConfig(agentDir),
      `${path.join(root, "generated", "..", "generated")}${path.sep}`,
    );
    assert.equal(variants.generated_variants_root, path.join(root, "generated"));
    await writeConfig(agentDir, variants, uuidSequence());
    const variantBytes = JSON.parse(await readFile(file, "utf8"));
    assert.equal(variantBytes.schema_version, "pi.career.config.v1");
    assert.equal(variantBytes.generated_variants_root, path.join(root, "generated"));

    const cleared = clearGeneratedVariantsRoot(await loadConfig(agentDir));
    await writeConfig(agentDir, cleared, uuidSequence());
    const clearedBytes = JSON.parse(await readFile(file, "utf8"));
    assert.equal(clearedBytes.schema_version, "pi.career.config.v1");
    assert.equal(Object.hasOwn(clearedBytes, "generated_variants_root"), false);
    assert.equal(
      suggestedGeneratedVariantsRoot(cleared),
      path.join(configured.library_roots[0].path, "variants"),
    );
    assert.throws(() => setGeneratedVariantsRoot(configured, configured.library_roots[0].path), /root_invalid/);

    const removed = removeLibraryRoot(await loadConfig(agentDir), configured.library_roots[0].id);
    await writeConfig(agentDir, removed, uuidSequence());
    assert.equal((await loadConfig(agentDir)).library_roots.length, 0);
    const finalBytes = await readFile(file, "utf8");
    assert.equal(JSON.parse(finalBytes).schema_version, "pi.career.config.v1");
    assert.doesNotMatch(finalBytes, /resume text|vacancy text|provider/i);
    assert.deepEqual((await readdir(path.dirname(file))).sort(), ["config.v1.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("strict v1/v2 config parsing rejects duplicate keys, BOM, noncanonical bytes, unsafe metadata, and links", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-config-strict-")));
  try {
    const agentDir = path.join(root, "agent");
    const file = configPath(agentDir);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await chmod(path.dirname(file), 0o700);
    const cases = [
      '{"schema_version":"pi.career.config.v1","schema_version":"pi.career.config.v1","library_roots":[]}\n',
      '\ufeff{"schema_version":"pi.career.config.v1","library_roots":[]}\n',
      JSON.stringify({
        schema_version: "pi.career.config.v2",
        library_roots: [],
        generated_variants_root: null,
        application_workspace: null,
      }),
    ];
    for (const text of cases) {
      await writeFile(file, text, { mode: 0o600 });
      await chmod(file, 0o600);
      await assert.rejects(loadConfig(agentDir), /config_invalid/);
    }

    const canonical = `${JSON.stringify({
      schema_version: "pi.career.config.v2",
      library_roots: [],
      generated_variants_root: null,
      application_workspace: null,
    }, null, 2)}\n`;
    await writeFile(file, canonical, { mode: 0o644 });
    await chmod(file, 0o644);
    await assert.rejects(loadConfig(agentDir), /config_invalid/);
    await chmod(file, 0o600);
    const alias = path.join(path.dirname(file), "config-alias.json");
    await link(file, alias);
    await assert.rejects(loadConfig(agentDir), /config_invalid/);
    await rm(alias);
    assert.equal((await loadConfig(agentDir)).schema_version, "pi.career.config.v2");

    await chmod(path.dirname(file), 0o755);
    await assert.rejects(loadConfig(agentDir), /config_invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ordinary bootstrap requires the existing canonical agent directory and never adopts unsafe config directories", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-config-parent-")));
  try {
    const missingAgentDir = path.join(root, "missing-agent");
    assert.deepEqual(await loadConfig(missingAgentDir), emptyConfig());
    await assert.rejects(writeConfig(missingAgentDir, emptyConfig(), uuidSequence()), /config_invalid/);
    await assert.rejects(lstat(missingAgentDir), (error) => error?.code === "ENOENT");

    const wrongModeAgent = path.join(root, "wrong-mode-agent");
    await prepareConfigDirectory(wrongModeAgent);
    const wrongModeDirectory = path.dirname(configPath(wrongModeAgent));
    await chmod(wrongModeDirectory, 0o755);
    await assert.rejects(loadConfig(wrongModeAgent), /config_invalid/);
    await assert.rejects(writeConfig(wrongModeAgent, emptyConfig(), uuidSequence()), /config_invalid/);
    assert.equal((await lstat(wrongModeDirectory)).mode & 0o7777, 0o755);

    const realAgent = path.join(root, "real-agent");
    const realCareer = await prepareConfigDirectory(realAgent);
    const linkedAgent = path.join(root, "linked-agent");
    await symlink(realAgent, linkedAgent);
    await assert.rejects(loadConfig(linkedAgent), /config_invalid/);
    await assert.rejects(writeConfig(linkedAgent, emptyConfig(), uuidSequence()), /config_invalid/);
    assert.equal((await lstat(realCareer)).mode & 0o7777, 0o700);
    assert.deepEqual(await readdir(realCareer), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("root and config validation reject symlinks and malformed fields", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-config-invalid-")));
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
