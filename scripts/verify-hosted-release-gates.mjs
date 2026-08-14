#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { parseStrictJson } from "./lib/strict-json.mjs";

const API = "https://api.github.com";
const REPOSITORY = "revazi/pi-career";
const sha = process.env.RELEASE_SHA;
const token = process.env.GITHUB_TOKEN;
assert.match(sha, /^[0-9a-f]{40}$/, "RELEASE_SHA");
assert.ok(typeof token === "string" && token.length > 0, "GITHUB_TOKEN must be set");
assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY, "release repository");

async function github(path) {
  assert.ok(path.startsWith(`/repos/${REPOSITORY}/`), "GitHub gate path escaped the release repository");
  const response = await fetch(`${API}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "pi-career-release/0.3.0",
      "x-github-api-version": "2022-11-28",
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, `GitHub gate query failed for ${path}`);
  const text = await response.text();
  return parseStrictJson(text, { label: "GitHub gate response", maximumBytes: 2 * 1024 * 1024 });
}

const checks = await github(`/repos/${REPOSITORY}/commits/${sha}/check-runs?per_page=100`);
assert.ok(
  checks.check_runs.some(
    ({ name, status, conclusion }) =>
      name === "Adapter checks" && status === "completed" && conclusion === "success",
  ),
  "same-commit Adapter checks must pass",
);
const runs = await github(
  `/repos/${REPOSITORY}/actions/workflows/external-career.yml/runs?event=workflow_dispatch&status=success&head_sha=${sha}&per_page=20`,
);
assert.ok(
  runs.workflow_runs.some(
    ({ head_sha: runSha, event, status, conclusion }) =>
      runSha === sha && event === "workflow_dispatch" && status === "completed" && conclusion === "success",
  ),
  "same-commit External Career Compatibility must pass",
);
process.stdout.write("Verified same-commit Adapter checks and six-target External Career Compatibility\n");
