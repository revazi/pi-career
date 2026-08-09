// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { collectTokenBenchmark } from "../../scripts/token-benchmark.mjs";

const baseline = JSON.parse(await readFile(
  new URL("../../benchmarks/baselines/career-run-v1.json", import.meta.url),
  "utf8",
));

test("career_run synthetic token baseline is reproducible and within budgets", () => {
  const current = collectTokenBenchmark();
  assert.equal(current.encoding, baseline.encoding);
  assert.deepEqual(current.tokenizer, baseline.tokenizer);
  assert.deepEqual(current.measurements, baseline.candidate);
  assert.ok(
    current.measurements["tool-contract/career-run-active"] <=
      baseline.goals.maximum_active_tool_contract_tokens,
  );
  assert.ok(
    current.measurements["tool-result/synthetic-analyze"] <=
      baseline.goals.maximum_common_tool_result_tokens,
  );
  assert.ok(
    current.measurements["tool-result/synthetic-variant-review"] <=
      baseline.goals.maximum_common_tool_result_tokens,
  );
  assert.equal(baseline.goals.model_visible_schema_discovery_calls, 0);
  assert.equal(baseline.goals.nested_input_json, false);
});
