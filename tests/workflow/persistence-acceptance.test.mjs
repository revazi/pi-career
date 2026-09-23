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

// An evidence pointer is a behavioral test title, not a fixture assertion. Keep
// deferred reasons explicit: finding a public API later does not silently promote
// a scenario to passing acceptance coverage.
const behavioral = {
  1: ["application-catalog", "catalog reads an empty marked root"],
  2: ["application-catalog", "catalog sorts valid and legacy applications"],
  3: ["application-catalog", "catalog classifies a mixed root"],
  4: ["application-state-v2-reader", "complete-chain validation rejects downgrade"],
  5: ["application-catalog", "catalog classifies a mixed root"],
  8: ["application-state-v2-reader", "catalog reads all-v1"],
  10: ["application-state-v2-reader", "complete-chain validation rejects downgrade"],
  17: ["application-readiness", "pure readiness implements every reachable availability row"],
  18: ["application-readiness", "pure readiness implements every reachable availability row"],
  19: ["application-readiness", "pure readiness implements every reachable availability row"],
  20: ["application-readiness", "a locally valid cover resolves unavailable before stale"],
  21: ["application-readiness", "an artifact without a selected original"],
  22: ["application-readiness", "selected originals require one eligible record"],
  23: ["application-readiness", "exact tailored evidence selects tailored"],
  25: ["application-readiness", "pure readiness implements every reachable availability row"],
  28: ["session-attachment-commands", "attach appends only the identity pointer"],
  29: ["session-catalog-attach", "a used session opens another application only in a replacement session"],
  30: ["session-attachment-commands", "detach clears activation with reload"],
  31: ["session-attachment-validation", "missing configuration or a legacy identity is unavailable"],
  45: ["application-status-authority", "attached application status is workspace-only"],
  50: ["session-model-surface", "inactive surface without activation"],
  51: ["session-attachment-commands", "activation prepares a document-free handoff"],
  52: ["session-model-surface", "activated session discovers Skill path"],
  53: ["session-attachment-commands", "detach clears activation with reload"],
  54: ["session-attachment", "all session branches retain one application claim"],
  55: ["session-catalog-attach", "a used session opens another application only in a replacement session"],
  56: ["session-attachment-validation", "root, manifest, and expected-name identity drift fails closed"],
  57: ["session-model-surface", "session start keeps Career tools and Skill discovery inactive"],
};

const deferred = {
  6: "Restart and exact label restoration across the overlay are not covered by catalog-only tests.",
  7: "Unicode-equivalent distinct labels across restart and listing need an overlay integration test.",
  9: "Reading a v1-to-v2 chain does not test an approved append transition.",
  11: "Opening a legacy application through the overlay needs a no-write integration test.",
  12: "Migration preview cancellation and changed-byte race need a workflow test.",
  13: "Migration confirmation needs a no-clobber identity and byte-preservation test.",
  14: "Legacy overlay and migration without matching session need end-to-end evidence.",
  15: "Concurrent migration plans need a fault-injected no-clobber test.",
  16: "Pure 0/3 derivation does not test creation or absence of automatic attachment.",
  24: "Pure readiness omits lifecycle; applied/closed incomplete state needs a validated state-to-readiness integration test.",
  26: "Catalog read alone does not exercise unattached overlay browsing.",
  27: "An unattached overlay highlight/open needs session append and authority spies.",
  32: "Local browse/mutation paths need provider/model boundary spies.",
  33: "Pure projection privacy does not establish absence of persisted sentinels across all actions.",
  34: "Catalog projection alone does not prove rendered list path/body privacy.",
  35: "Authorized bounded local detail/preview requires a dedicated UI integration test.",
  36: "Print/JSON mode needs an early-failure test spying on all private reads.",
  37: "Adapter errors need injected sentinel failures and logging spies.",
  38: "Two concurrent creators need a deterministic no-clobber race test.",
  39: "Two concurrent revision plans need a deterministic no-fork race test.",
  40: "An orphan fixture is not a reconciliation/fault-settlement test.",
  41: "Exact committed-state settlement after ambiguous failure needs a fault-injected test.",
  42: "Crash-left lock needs an attempted mutation with no polling/removal assertion.",
  43: "Catalog drift detection alone does not test a mutation against edited referenced bytes.",
  44: "Read-time state/cover bounds alone do not cover each plan/commit bound or preview race.",
  46: "Session-only Not persisted overlay distinction needs a rendered UI test.",
  47: "Read-time v1 byte preservation is not a migration commit test.",
  48: "Ineligible assisted scan evidence does not test Analyze/Match original selection.",
  49: "Inactive model surface does not prove all five forbidden effects during browse/filter.",
  58: "Transient replay does not prove reload and process-shutdown handle loss.",
};

test("#60 evidence map assigns every P3 row exactly one behavioral witness or owned deferral", async () => {
  const markdown = await readFile(contractUrl, "utf8");
  const rows = markdown.split("\n").filter((line) => /^\| P3-/.test(line));
  assert.equal(rows.length, 58);
  for (const [index, row] of rows.entries()) {
    const number = index + 1;
    const id = `P3-${String(number).padStart(2, "0")}`;
    const witness = behavioral[number];
    const reason = deferred[number];
    assert.equal(Number(Boolean(witness)) + Number(Boolean(reason)), 1, `${id} needs exactly one disposition`);
    const owner = row.split("|").at(-2).trim();
    assert.match(owner, /^#\d+(?:\/#\d+)*$/, `${id} needs an owning issue`);
    if (reason) {
      assert.ok(reason.length >= 40, `${id} needs substantive deferred rationale (${owner})`);
      continue;
    }
    const [name, title] = witness;
    const source = await readFile(new URL(`./${name}.test.mjs`, import.meta.url), "utf8");
    assert.ok(source.split("\n").some((line) => line.startsWith('test("') &&
      line.includes(title)), `${id} witness must point to an existing behavioral test`);
  }
  assert.equal(Object.keys(behavioral).length + Object.keys(deferred).length, 58);
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
