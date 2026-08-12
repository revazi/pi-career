// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { writeJsonOutput } from "../../scripts/lib/json-output.mjs";
import { collectTokenBenchmark } from "../../scripts/token-benchmark.mjs";
import {
  assertMinimumReduction,
  assertOptimizationDeltas,
  verifyTokenOptimizationPhase,
} from "../../scripts/token-benchmark-compare.mjs";

const historicalText = await readFile(
  new URL("../../benchmarks/baselines/career-run-v1.json", import.meta.url),
  "utf8",
);
const historical = JSON.parse(historicalText);
const beforeSnapshotText = await readFile(
  new URL("../../benchmarks/baselines/token-optimization-v1-before.json", import.meta.url),
  "utf8",
);
const beforeSnapshot = JSON.parse(beforeSnapshotText);
const phaseManifestText = await readFile(
  new URL("../../benchmarks/phases/token-optimization-v1.json", import.meta.url),
  "utf8",
);
const phaseManifest = JSON.parse(phaseManifestText);

function frozenBeforeManifestBytes() {
  if (phaseManifest.status === "before_frozen") return Buffer.from(phaseManifestText, "utf8");
  assert.match(phaseManifest.baseline_history_commit, /^[a-f0-9]{40}$/);
  try {
    return execFileSync(
      "git",
      ["show", `${phaseManifest.baseline_history_commit}:benchmarks/phases/token-optimization-v1.json`],
      {
        cwd: new URL("../..", import.meta.url),
        encoding: null,
        maxBuffer: 512 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    assert.fail("frozen before phase manifest is unavailable from baseline Git history");
  }
}

test("historical managed-adapter token evidence remains immutable", () => {
  assert.equal(historical.schema_version, "pi.career.token_benchmark_baseline.v1");
  assert.deepEqual(historical.before, {
    "tool-contract/raw-three-active": 1041,
    "tool-result/synthetic-analysis-replacement-review": 4744,
    "editor-prompt/synthetic-workbench": 706,
  });
  assert.equal(historical.candidate["tool-contract/career-run-active"], 386);
  assert.equal(historical.goals.model_visible_schema_discovery_calls, 0);
  assert.equal(historical.goals.nested_input_json, false);
  assert.equal(
    createHash("sha256").update(historicalText).digest("hex"),
    "66822793a5360cf5b46931fce36da8fdcdbb8e3dd79bb046b0b0fca108f88f54",
  );
});

test("token-optimization phase reproduces its frozen current snapshot", async () => {
  const current = collectTokenBenchmark();
  const comparison = await verifyTokenOptimizationPhase();

  assert.equal(current.schema_version, "pi.career.token_benchmark.v2");
  assert.equal(current.corpus_version, "pi.career.synthetic_model_surfaces.v2");
  assert.equal(comparison.phase_status, phaseManifest.status);
  assert.equal(comparison.before_source_commit, "c7d76344ccdfd8a370c8c69467d2022d9aea5d2e");
  assert.equal(
    createHash("sha256").update(beforeSnapshotText).digest("hex"),
    "198d395fd1b81d3abd824e4d1f91ee986c196f87f10a7aaca8edccc37b2601e2",
  );
  assert.equal(phaseManifest.before_snapshot_sha256, "198d395fd1b81d3abd824e4d1f91ee986c196f87f10a7aaca8edccc37b2601e2");
  assert.equal(
    createHash("sha256").update(frozenBeforeManifestBytes()).digest("hex"),
    "1614cae6efc7ee4fdfc74e06b01ae0dab9907ab5404790117b569b5c3d041359",
  );
  assert.deepEqual(beforeSnapshot.source_trees, {
    src: "ac249864e443b81c18e5e4d69ccab06dc5ff7a20",
    skills: "c8707aee42ad08f2ea606dd73d667c9e34e6df44",
  });
  assert.equal(comparison.aggregate_workflows.before, 25652);
  if (phaseManifest.status === "before_frozen") {
    assert.deepEqual(comparison.aggregate_workflows, {
      before: 25652,
      current: 25652,
      delta: 0,
      reduction_percent: 0,
    });
  } else {
    assert.ok(comparison.aggregate_workflows.reduction_percent >= 10);
  }
  assert.equal(comparison.gates.current_snapshot_reproduced, phaseManifest.status !== "optimizing");
  assert.equal(comparison.gates.immutable_baseline_history_verified, phaseManifest.status !== "before_frozen");
  assert.equal(comparison.gates.baseline_source_trees_verified, true);
  assert.equal(comparison.gates.semantic_invariants_preserved, true);
  assert.equal(comparison.gates.context_budgets_met, true);
  assert.equal(comparison.gates.optimization_targets_enforced, phaseManifest.status !== "before_frozen");
  assert.equal(comparison.gates.aggregate_reduction_target_percent, 10);
  assert.equal(comparison.gates.maximum_workflow_token_regression, 0);
  assert.deepEqual(
    Object.fromEntries(Object.entries(beforeSnapshot.benchmark.workflows).map(([name, value]) => [
      name, value.model_visible_tokens,
    ])),
    {
      "managed-analysis-with-evidence": 4341,
      "managed-match": 4169,
      "reviewed-suggestion-plan": 5362,
      "reviewed-replacements": 5188,
      "tailored-variant-materialization": 6592,
    },
  );
  assert.equal(current.invariants.complete_private_source_occurrences_in_tailored_workflow, 1);
  assert.equal(current.invariants.repeated_complete_private_source_bytes_in_tailored_workflow, 0);
  assert.equal(current.invariants.all_workbench_prompts_include_complete_private_source_once, true);
  assert.equal(current.invariants.assisted_authority_retained, true);
  assert.equal(current.invariants.required_warning_codes_retained, true);
  assert.equal(current.invariants.confidence_uncertainty_and_evidence_retained, true);
  assert.equal(current.invariants.skill_discovery_metadata_always_visible, true);
  assert.equal(current.invariants.full_skill_content_loaded_for_matching_tasks, true);
  assert.equal(current.invariants.skill_reference_content_excluded_until_requested, true);
  assert.equal(beforeSnapshot.benchmark.measurements["skill-discovery/career-core-metadata"], 87);
  assert.equal(beforeSnapshot.benchmark.measurements["skill-content/career-core-full"], 3363);
  for (const workflow of Object.values(current.workflows)) {
    assert.equal(workflow.skill_discovery_metadata_occurrences, 1);
    assert.equal(workflow.matching_skill_full_content_occurrences, 1);
    assert.equal(workflow.skill_reference_content_occurrences, 0);
  }
});

test("optimizing phase refuses a self-declared commit without immutable baseline bytes", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-token-history-"));
  try {
    await mkdir(path.join(temp, "phases"));
    await mkdir(path.join(temp, "baselines"));
    await writeFile(
      path.join(temp, "baselines", "token-optimization-v1-before.json"),
      beforeSnapshotText,
    );
    const candidateManifest = {
      ...phaseManifest,
      status: "optimizing",
      baseline_history_commit: "c7d76344ccdfd8a370c8c69467d2022d9aea5d2e",
    };
    const manifestPath = path.join(temp, "phases", "token-optimization-v1.json");
    await writeFile(manifestPath, `${JSON.stringify(candidateManifest, null, 2)}\n`);
    await assert.rejects(
      verifyTokenOptimizationPhase({ manifestUrl: pathToFileURL(manifestPath) }),
      /Git history check failed for frozen before snapshot bytes/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function benchmarkWithScale(scale) {
  const benchmark = structuredClone(beforeSnapshot.benchmark);
  benchmark.surface_sha256 = "a".repeat(64);
  benchmark.measurements = Object.fromEntries(Object.entries(benchmark.measurements)
    .map(([name, tokens]) => [name, Math.floor(tokens * scale)]));
  for (const workflow of Object.values(benchmark.workflows)) {
    workflow.model_visible_tokens = 0;
    for (const component of workflow.components) {
      component.tokens = benchmark.measurements[component.measurement] * component.occurrences;
      workflow.model_visible_tokens += component.tokens;
    }
  }
  return benchmark;
}

test("optimizing deltas require stable shape, exact aggregate savings, and no workflow regression", () => {
  const optimized = benchmarkWithScale(0.8);
  assert.doesNotThrow(() => assertOptimizationDeltas(beforeSnapshot.benchmark, optimized));

  const regressed = benchmarkWithScale(0.5);
  regressed.measurements["tool-call/match"] = 3000;
  for (const workflow of Object.values(regressed.workflows)) {
    workflow.model_visible_tokens = 0;
    for (const component of workflow.components) {
      component.tokens = regressed.measurements[component.measurement] * component.occurrences;
      workflow.model_visible_tokens += component.tokens;
    }
  }
  assert.throws(
    () => assertOptimizationDeltas(beforeSnapshot.benchmark, regressed),
    /managed-match exceeds the workflow regression allowance/,
  );

  optimized.measurements["tool-call/unreviewed-extra"] = 1;
  assert.throws(
    () => assertOptimizationDeltas(beforeSnapshot.benchmark, optimized),
    /Expected values to be strictly deep-equal/,
  );
});

test("optimization reduction uses the exact ratio instead of rounded display output", () => {
  assert.throws(
    () => assertMinimumReduction(8622, 7760, 10),
    /aggregate workflow reduction target was not met/,
  );
  assert.doesNotThrow(() => assertMinimumReduction(8622, 7759, 10));
});

test("JSON benchmark output rejects repository, relative, duplicate, and symlink targets", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-json-output-"));
  try {
    const output = path.join(temp, "result.json");
    await writeJsonOutput({ synthetic: true }, ["node", "script", "--output", output]);
    assert.equal(await readFile(output, "utf8"), '{\n  "synthetic": true\n}\n');

    await assert.rejects(
      writeJsonOutput({}, ["node", "script", "--output", "relative.json"]),
      /absolute path outside the repository/,
    );
    await assert.rejects(
      writeJsonOutput({}, ["node", "script", "--output", path.join(process.cwd(), "benchmark.json")]),
      /must not modify the repository/,
    );
    await assert.rejects(
      writeJsonOutput({}, ["node", "script", "--output", output, "--output", `${output}.other`]),
      /only once/,
    );
    const link = path.join(temp, "link.json");
    await symlink(output, link);
    await assert.rejects(
      writeJsonOutput({}, ["node", "script", "--output", link]),
      /regular non-symlink file/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
