// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Specification bookkeeping only: passing this test does not demonstrate that
// any proposed persistence behavior is implemented. Integration tests own that.
const contractUrl = new URL("../../docs/persistence-acceptance.md", import.meta.url);

test("persistence acceptance ledger preserves all 48 scenarios and explicit owners", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| P3-/.test(line));
  assert.equal(rows.length, 48, "every approved scenario must remain accounted for");
  rows.forEach((row, index) => {
    const columns = row.split("|").slice(1, -1).map((column) => column.trim());
    assert.equal(columns.length, 5, `scenario row ${index + 1} needs ID/Given/When/Then/Owner`);
    assert.equal(columns[0], `P3-${String(index + 1).padStart(2, "0")}`);
    for (const column of columns.slice(1, 4)) assert.ok(column.length > 0);
    assert.match(columns[4], /^#\d+(?:\/#\d+)*$/, "each scenario needs explicit issue ownership");
  });
});

// Contract bookkeeping only: this fixes the reviewed byte shape and fixture map
// without claiming that v2 parsing or readiness derivation is implemented.
test("state-v2 contract fixes canonical field order and #60 fixture ownership", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const match = markdown.match(/The canonical value is:\n\n```json\n([\s\S]*?)\n```/);
  assert.ok(match, "state-v2 canonical JSON example must remain present");
  const state = JSON.parse(match[1]);
  assert.deepEqual(Object.keys(state), [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
    "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
  ]);
  assert.equal(state.schema_version, "pi.career.application_state.v2");
  assert.deepEqual(Object.keys(state.cover_letter_artifact), [
    "relative_path", "artifact_sha256", "utf8_bytes", "format", "authority",
    "job_description_sha256", "effective_resume_sha256",
  ]);
  assert.equal(state.cover_letter_artifact.authority, "user_authored");

  for (const classification of ["Missing", "Available", "Stale", "Unavailable", "Drifted"]) {
    assert.match(markdown, new RegExp(`\\b${classification}\\b`));
  }
  for (const family of [
    "state-v2-canonical", "mixed-chain", "historical-references", "cover-letter-reference",
    "package-completeness", "source-authority", "read-races-and-privacy", "transaction-orphans",
  ]) assert.ok(markdown.includes(`| \`${family}\` |`));
  assert.equal(markdown.split("\n").filter((line) => /^\| (?:yes|no) \| (?:yes|no) \| (?:yes|no) \|/.test(line)).length, 8);
});
