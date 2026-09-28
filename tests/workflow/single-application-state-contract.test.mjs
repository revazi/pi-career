// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL("../../docs/single-application-state.md", import.meta.url);

function jsonAfter(markdown, anchor) {
  const start = markdown.indexOf(anchor);
  assert.notEqual(start, -1, `missing contract anchor: ${anchor}`);
  const match = markdown.slice(start).match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, `missing JSON after: ${anchor}`);
  return JSON.parse(match[1]);
}

test("#140 defines one application-state schema with no compatibility path", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const state = jsonAfter(markdown, "## Canonical schema");

  assert.deepEqual(Object.keys(state), [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
    "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
  ]);
  assert.equal(state.schema_version, "pi.career.application_state");
  assert.equal(state.kind, "application_state_revision");
  assert.equal(state.cover_letter_artifact, null);

  assert.match(markdown, /There is no application-state schema migration or compatibility path\./);
  assert.match(markdown, /Files whose `schema_version` is `pi\.career\.application_state\.v1`, `pi\.career\.application_state\.v2`, or any other value are unsupported and fail closed\./);
  assert.match(markdown, /There is no transition revision, upgrade, downgrade, dual reader, or mixed-schema chain\./);
  assert.match(markdown, /Revision numbers and parent hashes protect immutable history, concurrency, crash settlement, and no-clobber publication; they are not schema versions\./);
});

test("#140 retains the exact nullable cover-letter reference without write authority", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const cover = jsonAfter(markdown, "A non-null cover-letter reference");

  assert.deepEqual(Object.keys(cover), [
    "relative_path", "artifact_sha256", "utf8_bytes", "format", "authority",
    "job_description_sha256", "effective_resume_sha256",
  ]);
  assert.equal(cover.authority, "user_authored");
  assert.match(markdown, /does not authorize a cover-letter writer, rebind, publication, deletion, or adoption flow/);
});

test("#140 assigns focused single-schema acceptance scenarios to #141", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| S1-/.test(line));

  assert.equal(rows.length, 12);
  rows.forEach((row, index) => {
    const columns = row.split("|").slice(1, -1).map((column) => column.trim());
    assert.equal(columns.length, 4);
    assert.equal(columns[0], `S1-${String(index + 1).padStart(2, "0")}`);
    for (const column of columns.slice(1)) assert.ok(column.length > 0);
  });
  assert.match(markdown, /Issue #141 owns production, fixture, generated-bundle, and documentation convergence\./);
});
