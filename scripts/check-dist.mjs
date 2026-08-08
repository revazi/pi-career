#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildBundle, buildPdfWorker, repositoryRoot } from "./build.mjs";

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "pi-career-dist-"));
try {
  const firstIndex = path.join(temporaryDirectory, "first-index.js");
  const secondIndex = path.join(temporaryDirectory, "second-index.js");
  const firstWorker = path.join(temporaryDirectory, "first-worker.js");
  const secondWorker = path.join(temporaryDirectory, "second-worker.js");
  await Promise.all([
    buildBundle(firstIndex),
    buildBundle(secondIndex),
    buildPdfWorker(firstWorker),
    buildPdfWorker(secondWorker),
  ]);

  const [firstIndexBytes, secondIndexBytes, firstWorkerBytes, secondWorkerBytes, trackedIndex, trackedWorker] =
    await Promise.all([
      readFile(firstIndex),
      readFile(secondIndex),
      readFile(firstWorker),
      readFile(secondWorker),
      readFile(path.join(repositoryRoot, "dist", "index.js")),
      readFile(path.join(repositoryRoot, "dist", "pdf-worker.js")),
    ]);
  assert.deepEqual(firstIndexBytes, secondIndexBytes, "two clean index builds must be byte-equivalent");
  assert.deepEqual(firstWorkerBytes, secondWorkerBytes, "two clean PDF worker builds must be byte-equivalent");
  assert.deepEqual(trackedIndex, firstIndexBytes, "dist/index.js is stale; run npm run build");
  assert.deepEqual(trackedWorker, firstWorkerBytes, "dist/pdf-worker.js is stale; run npm run build");
  assert.ok(trackedIndex.length > 0 && trackedIndex.length < 180_000, "extension bundle must remain bounded");
  assert.ok(trackedWorker.length > 0 && trackedWorker.length < 2_000_000, "PDF worker bundle must remain bounded");
  process.stdout.write(
    `Reproducible dist/index.js (${trackedIndex.length} bytes) and dist/pdf-worker.js (${trackedWorker.length} bytes)\n`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
