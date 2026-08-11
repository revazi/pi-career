// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CareerRunError } from "../../src/managed/errors.ts";
import { VariantSaveWorkflow } from "../../src/workflow/variant-save.ts";
import {
  addLibraryRoot,
  emptyConfig,
  setGeneratedVariantsRoot,
  writeConfig,
} from "../../src/workflow/config.ts";
import { eligibleOriginals, scanLibrary } from "../../src/workflow/scan.ts";
import {
  encodeManagedVariantsMarker,
} from "../../src/workflow/variant-metadata.ts";
import { makeContext, makeFakePi, uuidSequence } from "./helpers.mjs";

const now = () => new Date("2026-08-11T03:04:05.123Z");
const defaultFs = { chmod, link, lstat, mkdir, open, readFile, readdir, realpath, unlink };

async function fixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-save-"));
  const rootInput = path.join(temp, "library");
  const agentDir = path.join(temp, "agent");
  await mkdir(rootInput);
  await writeFile(path.join(rootInput, "resume.md"), "# Synthetic Original\n\nBuilt reliable APIs.\n");
  const config = await addLibraryRoot(emptyConfig(), rootInput, "Synthetic");
  await writeConfig(agentDir, config, uuidSequence());
  const scan = await scanLibrary(config);
  const original = eligibleOriginals(scan)[0];
  assert.ok(original);
  const candidate = {
    handle: "variant:00000000-0000-4000",
    assistedText: "# Synthetic Assisted\n\nBuilt reliable TypeScript APIs.\n",
    selectedChangeIds: ["change-0001"],
    source: {
      resumeId: original.id,
      rootId: original.root_id,
      format: original.format,
      textSha256: original.text_sha256,
    },
  };
  return { temp, agentDir, root: config.library_roots[0].path, originalPath: original.path, config, candidate };
}

function workflow(agentDir, options = {}) {
  return new VariantSaveWorkflow({
    agentDir,
    now,
    uuid: uuidSequence(),
    platform: "darwin",
    ...options,
  });
}

test("variant save cancellation or changed preview performs no filesystem mutation", async () => {
  const value = await fixture();
  try {
    const fake = makeFakePi();
    const resolve = () => value.candidate;

    const cancelled = makeContext(fake, { mode: "rpc", persisted: false, editors: [undefined] });
    assert.deepEqual(await workflow(value.agentDir).run(value.candidate.handle, cancelled.ctx, resolve), {
      status: "cancelled",
    });
    await assert.rejects(lstat(path.join(value.root, "variants")), (error) => error?.code === "ENOENT");

    const changed = makeContext(fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, prefill) => `${prefill} `],
      confirms: [true],
    });
    await assert.rejects(
      workflow(value.agentDir).run(value.candidate.handle, changed.ctx, resolve),
      (error) => error instanceof CareerRunError && error.code === "variant_save_preview_changed",
    );
    await assert.rejects(lstat(path.join(value.root, "variants")), (error) => error?.code === "ENOENT");

    const declined = makeContext(fake, {
      mode: "tui", persisted: false,
      editors: [(_title, prefill) => prefill],
      confirms: [false],
    });
    assert.deepEqual(await workflow(value.agentDir).run(value.candidate.handle, declined.ctx, resolve), {
      status: "cancelled",
    });
    await assert.rejects(lstat(path.join(value.root, "variants")), (error) => error?.code === "ENOENT");
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("variant save revalidates the original after confirmation and rejects noncanonical text", async () => {
  const value = await fixture();
  try {
    const fake = makeFakePi();
    const changedOriginal = makeContext(fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, prefill) => prefill],
      confirms: [async () => {
        await writeFile(value.originalPath, "# Changed after preview\n");
        return true;
      }],
    });
    await assert.rejects(
      workflow(value.agentDir).run(value.candidate.handle, changedOriginal.ctx, () => value.candidate),
      (error) => error instanceof CareerRunError && error.code === "variant_save_unavailable",
    );
    await assert.rejects(lstat(path.join(value.root, "variants")), (error) => error?.code === "ENOENT");

    const carriageReturn = {
      ...value.candidate,
      assistedText: "# Synthetic Assisted\r\n",
    };
    const rejectedText = makeContext(fake, { mode: "rpc", persisted: false });
    await assert.rejects(
      workflow(value.agentDir).run(carriageReturn.handle, rejectedText.ctx, () => carriageReturn),
      (error) => error instanceof CareerRunError && error.code === "variant_save_unavailable",
    );
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("variant save rejects unsupported platforms and unsafe existing destinations", async () => {
  const value = await fixture();
  try {
    const fake = makeFakePi();
    const ctx = makeContext(fake, { mode: "rpc", persisted: false });
    await assert.rejects(
      new VariantSaveWorkflow({ agentDir: value.agentDir, now, uuid: uuidSequence(), platform: "win32" })
        .run(value.candidate.handle, ctx.ctx, () => value.candidate),
      (error) => error instanceof CareerRunError && error.code === "variant_save_platform_unsupported",
    );

    const variants = path.join(value.root, "variants");
    await mkdir(variants, { mode: 0o700 });
    await chmod(variants, 0o700);
    await writeFile(path.join(variants, "unmanaged.txt"), "Synthetic\n", { mode: 0o600 });
    await assert.rejects(
      workflow(value.agentDir).run(value.candidate.handle, ctx.ctx, () => value.candidate),
      (error) => error instanceof CareerRunError && error.code === "variant_save_destination_invalid",
    );

    await rm(variants, { recursive: true, force: true });
    await symlink(path.join(value.root, "other"), variants);
    await assert.rejects(
      workflow(value.agentDir).run(value.candidate.handle, ctx.ctx, () => value.candidate),
      (error) => error instanceof CareerRunError && error.code === "variant_save_destination_invalid",
    );
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("variant save canonicalizes a direct-child trailing separator and rejects another configured root", async () => {
  const trailing = await fixture();
  try {
    const variants = path.join(trailing.root, "variants");
    const configured = setGeneratedVariantsRoot(trailing.config, `${variants}${path.sep}`);
    await writeConfig(trailing.agentDir, configured, uuidSequence());
    const fake = makeFakePi();
    const ctx = makeContext(fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    const outcome = await workflow(trailing.agentDir).run(
      trailing.candidate.handle,
      ctx.ctx,
      () => trailing.candidate,
    );
    assert.equal(outcome.status, "saved");
    assert.equal(path.dirname(outcome.artifactPath), variants);
  } finally {
    await rm(trailing.temp, { recursive: true, force: true });
  }

  const nested = await fixture();
  try {
    const variants = path.join(nested.root, "variants");
    await mkdir(variants, { mode: 0o700 });
    await chmod(variants, 0o700);
    const configured = await addLibraryRoot(nested.config, variants, "Nested configured root");
    await writeConfig(nested.agentDir, configured, uuidSequence());
    const ctx = makeContext(makeFakePi(), { mode: "rpc", persisted: false });
    await assert.rejects(
      workflow(nested.agentDir).run(nested.candidate.handle, ctx.ctx, () => nested.candidate),
      (error) => error instanceof CareerRunError && error.code === "variant_save_destination_invalid",
    );
    assert.deepEqual(await readdir(variants), []);
  } finally {
    await rm(nested.temp, { recursive: true, force: true });
  }
});

test("variant save never replaces a colliding artifact", async () => {
  const value = await fixture();
  try {
    const variants = path.join(value.root, "variants");
    await mkdir(variants, { mode: 0o700 });
    await chmod(variants, 0o700);
    await writeFile(
      path.join(variants, ".pi-career-variants.json"),
      encodeManagedVariantsMarker(value.config.library_roots[0].id, now().toISOString()),
      { mode: 0o600 },
    );
    const collision = path.join(variants, "resume-assisted-20260811T030405123Z-00000000.md");
    await writeFile(collision, "Existing synthetic content\n", { mode: 0o600 });
    const fake = makeFakePi();
    const ctx = makeContext(fake, { mode: "rpc", persisted: false });
    await assert.rejects(
      workflow(value.agentDir).run(value.candidate.handle, ctx.ctx, () => value.candidate),
      (error) => error instanceof CareerRunError && error.code === "variant_save_collision",
    );
    assert.equal(await readFile(collision, "utf8"), "Existing synthetic content\n");
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("variant save cleans its sidecar after a known artifact publication failure", async () => {
  const value = await fixture();
  try {
    const failingFs = {
      ...defaultFs,
      async link(source, destination) {
        if (destination.endsWith(".md")) {
          const error = new Error("synthetic link failure");
          error.code = "EIO";
          throw error;
        }
        return link(source, destination);
      },
    };
    const fake = makeFakePi();
    const ctx = makeContext(fake, {
      mode: "rpc", persisted: false,
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    await assert.rejects(
      workflow(value.agentDir, { fs: failingFs }).run(value.candidate.handle, ctx.ctx, () => value.candidate),
      (error) => error instanceof CareerRunError && error.code === "variant_save_status_unknown",
    );
    const variants = path.join(value.root, "variants");
    assert.deepEqual(await readdir(variants), [".pi-career-variants.json"]);
    assert.equal((await lstat(variants)).mode & 0o777, 0o700);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("variant save settles an exact owned pair before reporting status unknown", async () => {
  const value = await fixture();
  try {
    const variants = path.join(value.root, "variants");
    await mkdir(variants, { mode: 0o700 });
    await chmod(variants, 0o700);
    await writeFile(
      path.join(variants, ".pi-career-variants.json"),
      encodeManagedVariantsMarker(value.config.library_roots[0].id, now().toISOString()),
      { mode: 0o600 },
    );
    const syncFailingFs = {
      ...defaultFs,
      async open(file, flags, mode) {
        const handle = await open(file, flags, mode);
        if (file !== variants) return handle;
        return {
          async sync() { throw new Error("synthetic directory sync failure"); },
          async close() { await handle.close(); },
        };
      },
    };
    const ctx = makeContext(makeFakePi(), {
      mode: "rpc", persisted: false,
      editors: [(_title, prefill) => prefill],
      confirms: [true],
    });
    const outcome = await workflow(value.agentDir, { fs: syncFailingFs }).run(
      value.candidate.handle,
      ctx.ctx,
      () => value.candidate,
    );
    assert.equal(outcome.status, "saved");
    assert.equal(await readFile(outcome.artifactPath, "utf8"), value.candidate.assistedText);
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});

test("strict managed scanner quarantines an unmarked variants directory", async () => {
  const value = await fixture();
  try {
    const variants = path.join(value.root, "variants");
    await mkdir(variants, { mode: 0o700 });
    await chmod(variants, 0o700);
    await writeFile(path.join(variants, "candidate.md"), "# Not an original\n", { mode: 0o600 });
    const scan = await scanLibrary(value.config);
    assert.equal(scan.records.some((record) => record.relative_path === "variants/candidate.md"), false);
    assert.ok(scan.warnings.some((warning) =>
      warning.code === "invalid_assisted_sidecar" && warning.relative_path === "variants/candidate.md"));
  } finally {
    await rm(value.temp, { recursive: true, force: true });
  }
});
