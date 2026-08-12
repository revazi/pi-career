#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseStrictJson } from "./lib/strict-json.mjs";

const API = "https://api.github.com";
const REPOSITORY = "revazi/pi-career";
const VERSION_PATTERN = /^0\.[0-9]+\.[0-9]+$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function requiredEnvironment(name, pattern) {
  const value = process.env[name];
  assert.equal(typeof value, "string", `${name} must be set`);
  assert.match(value, pattern, `${name} has an invalid value`);
  return value;
}

const version = requiredEnvironment("RELEASE_VERSION", VERSION_PATTERN);
const tag = requiredEnvironment("RELEASE_TAG", new RegExp(`^v${version.replaceAll(".", "\\.")}$`));
const sha = requiredEnvironment("RELEASE_SHA", SHA_PATTERN);
const integrity = requiredEnvironment("RELEASE_INTEGRITY", /^sha512-[A-Za-z0-9+/]{86}==$/);
const shasum = requiredEnvironment("RELEASE_SHASUM", /^[0-9a-f]{40}$/);
const token = requiredEnvironment("GITHUB_TOKEN", /^.+$/s);
assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY, "release repository");

async function github(path, { method = "GET", body } = {}) {
  assert.ok(path.startsWith(`/repos/${REPOSITORY}/`), "GitHub API path escaped the release repository");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "pi-career-release/0.2.0",
      "x-github-api-version": "2022-11-28",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  assert.ok(Buffer.byteLength(text) <= 2 * 1024 * 1024, "GitHub API response exceeded its size bound");
  const document = text.length === 0
    ? undefined
    : parseStrictJson(text, { label: "GitHub API response", maximumBytes: 2 * 1024 * 1024 });
  return { status: response.status, document };
}

function changelogSection(changelog) {
  const heading = `## ${version} - `;
  const start = changelog.indexOf(heading);
  assert.ok(start >= 0, `CHANGELOG.md must contain ${heading}`);
  assert.ok(start === 0 || changelog[start - 1] === "\n", "release changelog heading boundary");
  const next = changelog.indexOf("\n## ", start + heading.length);
  const section = changelog.slice(start, next < 0 ? changelog.length : next).trim();
  assert.match(section, new RegExp(`^## ${version.replaceAll(".", "\\.")} - [0-9]{4}-[0-9]{2}-[0-9]{2}$`, "m"));
  return section.replace(/^##[^\n]+\n+/, "");
}

const existing = await github(`/repos/${REPOSITORY}/releases/tags/${tag}`);
assert.equal(existing.status, 404, `GitHub Release ${tag} already exists or its state is ambiguous`);

const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const notes = [
  `Published commit: [\`${sha}\`](${`https://github.com/${REPOSITORY}/commit/${sha}`})`,
  `npm: [\`${REPOSITORY.split("/")[1]}@${version}\`](https://www.npmjs.com/package/pi-career/v/${version})`,
  `npm integrity: \`${integrity}\``,
  `npm shasum: \`${shasum}\``,
  "",
  "This native-free pi-career package supports `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-arm64-gnu`, `linux-x64-musl`, and `linux-arm64-musl` through exact external `@revazi/career@0.1.1`. The pinned launcher's two Windows package entries remain upstream contract metadata and do not make pi-career available on Windows.",
  "",
  "Production and complete development/host-Pi audits passed at `--audit-level=low`. No crate was published, no signing or notarization claim is made, and this release has no custom asset.",
  "",
  "## Changelog",
  "",
  changelogSection(changelog),
].join("\n");

const created = await github(`/repos/${REPOSITORY}/releases`, {
  method: "POST",
  body: {
    tag_name: tag,
    target_commitish: sha,
    name: `pi-career ${tag}`,
    body: notes,
    draft: false,
    prerelease: false,
    generate_release_notes: false,
  },
});
assert.equal(created.status, 201, "GitHub Release creation failed");
assert.equal(created.document?.tag_name, tag);
assert.equal(created.document?.draft, false);
assert.equal(created.document?.prerelease, false);
assert.deepEqual(created.document?.assets, []);
assert.match(created.document?.html_url, new RegExp(`^https://github\\.com/${REPOSITORY}/releases/tag/${tag}$`));

const reference = await github(`/repos/${REPOSITORY}/git/ref/tags/${tag}`);
assert.equal(reference.status, 200, "release tag lookup");
assert.equal(reference.document?.object?.type, "tag", "release tag must be annotated");
const tagObjectSha = reference.document?.object?.sha;
assert.match(tagObjectSha, SHA_PATTERN);
const tagObject = await github(`/repos/${REPOSITORY}/git/tags/${tagObjectSha}`);
assert.equal(tagObject.status, 200, "annotated release tag lookup");
assert.equal(tagObject.document?.tag, tag);
assert.deepEqual(tagObject.document?.object, {
  sha,
  type: "commit",
  url: `${API}/repos/${REPOSITORY}/git/commits/${sha}`,
});
assert.equal(tagObject.document?.verification?.verified, false);
assert.equal(tagObject.document?.verification?.reason, "unsigned");
process.stdout.write(`Created and verified ${created.document.html_url} without custom assets\n`);
