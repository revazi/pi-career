#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { collectTokenBenchmark } from "./token-benchmark.mjs";
import { writeJsonOutput } from "./lib/json-output.mjs";
import { parseStrictJson } from "./lib/strict-json.mjs";

const PHASE_MANIFEST_URL = new URL(
  "../benchmarks/phases/token-optimization-v1.json",
  import.meta.url,
);
const SNAPSHOT_PATH = /^\.\.\/baselines\/[a-z0-9-]+\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const FROZEN_BEFORE_SNAPSHOT = "../baselines/token-optimization-v1-before.json";
const FROZEN_BEFORE_SNAPSHOT_SHA256 = "198d395fd1b81d3abd824e4d1f91ee986c196f87f10a7aaca8edccc37b2601e2";
const FROZEN_BEFORE_MANIFEST_SHA256 = "1614cae6efc7ee4fdfc74e06b01ae0dab9907ab5404790117b569b5c3d041359";
const FROZEN_BEFORE_SOURCE_COMMIT = "c7d76344ccdfd8a370c8c69467d2022d9aea5d2e";
const FROZEN_SOURCE_TREES = {
  src: "ac249864e443b81c18e5e4d69ccab06dc5ff7a20",
  skills: "c8707aee42ad08f2ea606dd73d667c9e34e6df44",
};
const PROJECT_ROOT_URL = new URL("..", import.meta.url);
const FROZEN_TARGETS = {
  minimum_aggregate_workflow_reduction_percent: 10,
  maximum_workflow_token_regression: 0,
  maximum_active_tool_contract_tokens: 400,
  maximum_common_tool_result_tokens: 1500,
  maximum_common_detail_tokens: 1500,
};

function gitOutput(args, label, encoding = "utf8") {
  try {
    return execFileSync("git", args, {
      cwd: PROJECT_ROOT_URL,
      encoding,
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(`Git history check failed for ${label}`);
  }
}

function gitText(args, label) {
  return gitOutput(args, label).trim();
}

function gitTree(commit, treePath) {
  const value = gitText(["rev-parse", `${commit}:${treePath}`], `${commit} ${treePath}`);
  assert.match(value, COMMIT);
  return value;
}

function assertGitAncestor(ancestor, descendant, label) {
  gitOutput(["merge-base", "--is-ancestor", ancestor, descendant], label);
}

async function readStrictJson(url, label) {
  const text = await readFile(url, "utf8");
  return {
    text,
    value: parseStrictJson(text, { label, maximumBytes: 512 * 1024 }),
  };
}

function snapshotUrl(relativePath, manifestUrl) {
  assert.equal(typeof relativePath, "string");
  assert.match(relativePath, SNAPSHOT_PATH);
  return new URL(relativePath, manifestUrl);
}

function assertExactKeys(value, required, optional = []) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  const actual = Object.keys(value).sort();
  const allowed = [...required, ...optional].sort();
  assert.ok(required.every((key) => Object.hasOwn(value, key)));
  assert.ok(actual.every((key) => allowed.includes(key)));
}

function assertPositiveIntegerRecord(value, label) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  for (const [name, count] of Object.entries(value)) {
    assert.match(name, /^[a-z0-9-]+\/[a-z0-9-]+$/);
    assert.ok(Number.isSafeInteger(count) && count >= 0, `${label}.${name} must be a non-negative integer`);
  }
}

function workflowShape(workflow) {
  const { model_visible_tokens: _tokens, components, ...metadata } = workflow;
  return {
    components: components.map(({ measurement, occurrences }) => ({ measurement, occurrences })),
    metadata,
  };
}

function assertBenchmark(value, label) {
  assert.equal(value.schema_version, "pi.career.token_benchmark.v2", `${label} schema`);
  assert.equal(value.corpus_version, "pi.career.synthetic_model_surfaces.v2", `${label} corpus`);
  assert.match(value.surface_sha256, SHA256, `${label} surface digest`);
  assert.equal(value.encoding, "o200k_base", `${label} encoding`);
  assert.deepEqual(value.tokenizer, { implementation: "js-tiktoken", version: "1.0.21" });
  assertPositiveIntegerRecord(value.measurements, `${label}.measurements`);
  assert.ok(value.workflows !== null && typeof value.workflows === "object" && !Array.isArray(value.workflows));
  for (const [name, workflow] of Object.entries(value.workflows)) {
    assert.match(name, /^[a-z0-9-]+$/);
    assert.ok(Number.isSafeInteger(workflow.model_visible_tokens) && workflow.model_visible_tokens >= 0);
    assert.ok(Array.isArray(workflow.components) && workflow.components.length > 0);
    let total = 0;
    for (const component of workflow.components) {
      assert.equal(typeof component.measurement, "string");
      assert.ok(Number.isSafeInteger(component.occurrences) && component.occurrences > 0);
      assert.ok(Number.isSafeInteger(component.tokens) && component.tokens >= 0);
      assert.equal(
        component.tokens,
        value.measurements[component.measurement] * component.occurrences,
        `${label}.${name} component total`,
      );
      total += component.tokens;
    }
    assert.equal(workflow.model_visible_tokens, total, `${label}.${name} workflow total`);
  }
  assert.ok(value.invariants !== null && typeof value.invariants === "object" && !Array.isArray(value.invariants));
}

async function loadSnapshot(relativePath, expectedHash, expectedPhase, phaseId, manifestUrl) {
  assert.match(expectedHash, SHA256);
  const { text, value } = await readStrictJson(
    snapshotUrl(relativePath, manifestUrl),
    `${expectedPhase} token snapshot`,
  );
  assert.equal(createHash("sha256").update(text).digest("hex"), expectedHash);
  assertExactKeys(value, [
    "schema_version", "phase", "phase_id", "source_commit", "source_trees", "benchmark",
  ]);
  assert.equal(value.schema_version, "pi.career.token_benchmark_snapshot.v1");
  assert.equal(value.phase, expectedPhase);
  assert.equal(value.phase_id, phaseId);
  assert.match(value.source_commit, COMMIT);
  assert.deepEqual(value.source_trees, {
    src: gitTree(value.source_commit, "src"),
    skills: gitTree(value.source_commit, "skills"),
  });
  assertBenchmark(value.benchmark, `${expectedPhase} snapshot`);
  return value;
}

function roundedPercent(value) {
  return Math.round(value * 100) / 100;
}

function tokenComparison(before, current) {
  const delta = current - before;
  return {
    before,
    current,
    delta,
    reduction_percent: before === 0 ? 0 : roundedPercent(((before - current) / before) * 100),
  };
}

function keyedComparisons(before, current, selector) {
  assert.deepEqual(Object.keys(current).sort(), Object.keys(before).sort());
  return Object.fromEntries(Object.keys(before).sort().map((name) => [
    name,
    tokenComparison(selector(before[name]), selector(current[name])),
  ]));
}

function totalWorkflowTokens(benchmark) {
  return Object.values(benchmark.workflows)
    .reduce((sum, workflow) => sum + workflow.model_visible_tokens, 0);
}

function assertBudgets(benchmark, targets) {
  assert.ok(
    benchmark.measurements["tool-contract/career-run-active"] <= targets.maximum_active_tool_contract_tokens,
    "active managed contract exceeds its budget",
  );
  for (const [name, tokens] of Object.entries(benchmark.measurements)) {
    if (name.startsWith("tool-result/")) {
      assert.ok(tokens <= targets.maximum_common_tool_result_tokens, `${name} exceeds result budget`);
    }
    if (name.startsWith("tool-detail/")) {
      assert.ok(tokens <= targets.maximum_common_detail_tokens, `${name} exceeds detail budget`);
    }
  }
}

function assertComparable(before, current) {
  assert.equal(current.schema_version, before.schema_version);
  assert.equal(current.corpus_version, before.corpus_version);
  assert.equal(current.encoding, before.encoding);
  assert.deepEqual(current.tokenizer, before.tokenizer);
  assert.deepEqual(Object.keys(current.measurements).sort(), Object.keys(before.measurements).sort());
  assert.deepEqual(Object.keys(current.workflows).sort(), Object.keys(before.workflows).sort());
  for (const name of Object.keys(before.workflows)) {
    assert.deepEqual(workflowShape(current.workflows[name]), workflowShape(before.workflows[name]));
  }
}

function assertPhaseManifest(manifest) {
  assertExactKeys(manifest, [
    "schema_version", "phase_id", "status", "baseline_source",
    "baseline_history_commit", "before_snapshot", "before_snapshot_sha256",
    "after_snapshot", "tokenizer", "targets", "required_invariants",
  ], ["after_snapshot_sha256"]);
  assert.equal(manifest.schema_version, "pi.career.token_optimization_phase.v1");
  assert.equal(manifest.phase_id, "career-run-token-optimization-v1");
  assert.ok(["before_frozen", "optimizing", "after_frozen"].includes(manifest.status));
  assert.deepEqual(manifest.baseline_source, {
    commit: FROZEN_BEFORE_SOURCE_COMMIT,
    trees: FROZEN_SOURCE_TREES,
  });
  assert.equal(manifest.before_snapshot, FROZEN_BEFORE_SNAPSHOT);
  assert.equal(manifest.before_snapshot_sha256, FROZEN_BEFORE_SNAPSHOT_SHA256);
  assert.deepEqual(manifest.tokenizer, {
    implementation: "js-tiktoken", version: "1.0.21", encoding: "o200k_base",
  });
  assert.deepEqual(manifest.targets, FROZEN_TARGETS);
  if (manifest.status === "before_frozen") {
    assert.equal(manifest.baseline_history_commit, null);
  } else {
    assert.match(manifest.baseline_history_commit, COMMIT);
  }
}

function assertImmutableBaselineHistory(manifest) {
  const baselineCommit = manifest.baseline_history_commit;
  assert.match(baselineCommit, COMMIT);
  assertGitAncestor(FROZEN_BEFORE_SOURCE_COMMIT, baselineCommit, "baseline source ancestry");
  assertGitAncestor(baselineCommit, "HEAD", "baseline candidate ancestry");
  assert.deepEqual({
    src: gitTree(baselineCommit, "src"),
    skills: gitTree(baselineCommit, "skills"),
  }, FROZEN_SOURCE_TREES);

  const snapshotBytes = gitOutput(
    ["show", `${baselineCommit}:benchmarks/baselines/token-optimization-v1-before.json`],
    "frozen before snapshot bytes",
    null,
  );
  assert.equal(
    createHash("sha256").update(snapshotBytes).digest("hex"),
    FROZEN_BEFORE_SNAPSHOT_SHA256,
  );
  const historicalManifestBytes = gitOutput(
    ["show", `${baselineCommit}:benchmarks/phases/token-optimization-v1.json`],
    "frozen before phase manifest",
    null,
  );
  assert.equal(
    createHash("sha256").update(historicalManifestBytes).digest("hex"),
    FROZEN_BEFORE_MANIFEST_SHA256,
  );
  const historicalManifest = parseStrictJson(historicalManifestBytes.toString("utf8"), {
    label: "frozen before phase manifest",
    maximumBytes: 512 * 1024,
  });
  assert.equal(historicalManifest.status, "before_frozen");
  assert.equal(historicalManifest.baseline_history_commit, null);
  assert.equal(historicalManifest.before_snapshot, FROZEN_BEFORE_SNAPSHOT);
  assert.equal(historicalManifest.before_snapshot_sha256, FROZEN_BEFORE_SNAPSHOT_SHA256);
  assert.deepEqual(historicalManifest.baseline_source, manifest.baseline_source);
}

export function assertMinimumReduction(before, current, minimumPercent) {
  assert.ok(
    (before - current) * 100 >= before * minimumPercent,
    "aggregate workflow reduction target was not met",
  );
}

export function assertOptimizationDeltas(before, current, targets = FROZEN_TARGETS) {
  assertComparable(before, current);
  const workflows = keyedComparisons(
    before.workflows,
    current.workflows,
    (value) => value.model_visible_tokens,
  );
  const aggregate = tokenComparison(totalWorkflowTokens(before), totalWorkflowTokens(current));
  assertMinimumReduction(
    aggregate.before,
    aggregate.current,
    targets.minimum_aggregate_workflow_reduction_percent,
  );
  for (const [name, comparison] of Object.entries(workflows)) {
    assert.ok(
      comparison.delta <= targets.maximum_workflow_token_regression,
      `${name} exceeds the workflow regression allowance`,
    );
  }
  return { workflows, aggregate };
}

export async function verifyTokenOptimizationPhase(options = {}) {
  const manifestUrl = options.manifestUrl ?? PHASE_MANIFEST_URL;
  const { value: manifest } = await readStrictJson(manifestUrl, "token optimization phase");
  assertPhaseManifest(manifest);

  const beforeSnapshot = await loadSnapshot(
    manifest.before_snapshot,
    manifest.before_snapshot_sha256,
    "before",
    manifest.phase_id,
    manifestUrl,
  );
  assert.equal(beforeSnapshot.source_commit, FROZEN_BEFORE_SOURCE_COMMIT);
  assert.deepEqual(beforeSnapshot.source_trees, FROZEN_SOURCE_TREES);
  if (manifest.status === "before_frozen") {
    assert.deepEqual({
      src: gitTree("HEAD", "src"),
      skills: gitTree("HEAD", "skills"),
    }, FROZEN_SOURCE_TREES);
    gitOutput(
      ["diff", "--quiet", FROZEN_BEFORE_SOURCE_COMMIT, "--", "src", "skills"],
      "baseline working source and skill trees",
    );
  } else {
    assertImmutableBaselineHistory(manifest);
  }
  const current = options.current ?? collectTokenBenchmark();
  assertBenchmark(current, "current benchmark");
  assertComparable(beforeSnapshot.benchmark, current);
  assert.deepEqual(
    manifest.required_invariants,
    beforeSnapshot.benchmark.invariants,
    "phase invariants must remain bound to the frozen before snapshot",
  );
  assert.deepEqual(current.invariants, manifest.required_invariants);
  assertBudgets(current, manifest.targets);

  let expectedSnapshot;
  if (manifest.status === "after_frozen") {
    expectedSnapshot = await loadSnapshot(
      manifest.after_snapshot,
      manifest.after_snapshot_sha256,
      "after",
      manifest.phase_id,
      manifestUrl,
    );
    assertComparable(beforeSnapshot.benchmark, expectedSnapshot.benchmark);
    assertGitAncestor(
      manifest.baseline_history_commit,
      expectedSnapshot.source_commit,
      "after snapshot source ancestry",
    );
    assertGitAncestor(expectedSnapshot.source_commit, "HEAD", "after snapshot checkout ancestry");
    assert.deepEqual({
      src: gitTree("HEAD", "src"),
      skills: gitTree("HEAD", "skills"),
    }, expectedSnapshot.source_trees, "after snapshot must retain its reviewed source trees");
    assert.deepEqual(
      current,
      expectedSnapshot.benchmark,
      "current source must reproduce the frozen after snapshot",
    );
  } else {
    assert.equal(manifest.after_snapshot, null);
    assert.equal(manifest.after_snapshot_sha256, undefined);
    if (manifest.status === "before_frozen") {
      expectedSnapshot = beforeSnapshot;
      assert.deepEqual(
        current,
        beforeSnapshot.benchmark,
        "current source must reproduce the frozen before snapshot",
      );
    }
  }

  const measurements = keyedComparisons(
    beforeSnapshot.benchmark.measurements,
    current.measurements,
    (value) => value,
  );
  const workflows = keyedComparisons(
    beforeSnapshot.benchmark.workflows,
    current.workflows,
    (value) => value.model_visible_tokens,
  );
  const aggregate = tokenComparison(
    totalWorkflowTokens(beforeSnapshot.benchmark),
    totalWorkflowTokens(current),
  );
  const optimizationTargetsEnforced = manifest.status !== "before_frozen";
  if (optimizationTargetsEnforced) {
    assertOptimizationDeltas(beforeSnapshot.benchmark, current, manifest.targets);
  }

  return {
    schema_version: "pi.career.token_benchmark_comparison.v1",
    phase_id: manifest.phase_id,
    phase_status: manifest.status,
    corpus_version: current.corpus_version,
    tokenizer: current.tokenizer,
    encoding: current.encoding,
    before_source_commit: beforeSnapshot.source_commit,
    ...(manifest.status === "after_frozen" ? { after_source_commit: expectedSnapshot.source_commit } : {}),
    measurements,
    workflows,
    aggregate_workflows: aggregate,
    gates: {
      current_snapshot_reproduced: manifest.status !== "optimizing",
      immutable_baseline_history_verified: manifest.status !== "before_frozen",
      baseline_source_trees_verified: true,
      semantic_invariants_preserved: true,
      context_budgets_met: true,
      optimization_targets_enforced: optimizationTargetsEnforced,
      aggregate_reduction_target_percent: manifest.targets.minimum_aggregate_workflow_reduction_percent,
      maximum_workflow_token_regression: manifest.targets.maximum_workflow_token_regression,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyTokenOptimizationPhase();
  await writeJsonOutput(result);
}
