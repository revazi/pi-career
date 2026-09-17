// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Specification bookkeeping only: passing this test does not demonstrate that
// any proposed persistence behavior is implemented. Integration tests own that.
const contractUrl = new URL("../../docs/persistence-acceptance.md", import.meta.url);

test("persistence acceptance ledger preserves all 58 scenarios and explicit owners", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| P3-/.test(line));
  assert.equal(rows.length, 58, "every approved scenario must remain accounted for");
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

test("#64 contract fixes exact attachment, detachment, activation, and Pi lifecycle", async () => {
  const workspaceContract = await readFile(
    new URL("../../docs/application-workspaces.md", import.meta.url),
    "utf8",
  );
  const jsonAfter = (anchor) => {
    const start = workspaceContract.indexOf(anchor);
    assert.notEqual(start, -1, `missing contract anchor: ${anchor}`);
    const match = workspaceContract.slice(start).match(/```json\n([\s\S]*?)\n```/);
    assert.ok(match, `missing JSON after: ${anchor}`);
    return JSON.parse(match[1]);
  };

  const attachment = jsonAfter("An attach entry has exactly this ordered data object:");
  assert.deepEqual(Object.keys(attachment), [
    "schema_version", "kind", "attachment_id", "application_id", "root_id",
    "root_created_at", "application_created_at", "workspace_created_at",
  ]);
  assert.equal(attachment.schema_version, "pi.career.application_attachment.v1");
  assert.equal(attachment.kind, "application_attachment");

  const detachment = jsonAfter("A detach entry uses the same custom type and exactly this ordered data object:");
  assert.deepEqual(Object.keys(detachment), [
    "schema_version", "kind", "detachment_id", "attachment_id",
  ]);
  assert.equal(detachment.schema_version, "pi.career.application_attachment.v1");
  assert.equal(detachment.kind, "application_detachment");

  const activation = jsonAfter("The custom type for explicit activation is exactly");
  assert.deepEqual(Object.keys(activation), [
    "schema_version", "kind", "activation_id", "attachment_id", "application_id",
  ]);
  assert.equal(activation.schema_version, "pi.career.application_assistance.v1");
  assert.equal(activation.kind, "application_assistance_activation");

  for (const required of [
    "SessionManager.getEntries()", "SessionManager.getBranch()", "session_start",
    "resources_discover", "ctx.reload(); return;", "ctx.newSession({ parentSession, setup, withSession })",
    "`input` handler", "returns `handled`", "sendMessage()", "sendUserMessage()", "pi --no-session",
  ]) assert.ok(workspaceContract.includes(required), `missing Pi lifecycle boundary: ${required}`);
  assert.match(workspaceContract, /no Career Skill path/);
  assert.match(workspaceContract, /ordinary model turns contain neither Career Skill metadata\/content nor a Career tool schema/);
});
