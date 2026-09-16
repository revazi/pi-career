// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplicationWorkspaceWorkflow, readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import { configPath, emptyConfig, encodeConfig, setApplicationWorkspace } from "../../src/workflow/config.ts";
import { createApplicationEntry } from "../../src/workflow/session-state.ts";
import { makeContext, makeFakePi, prepareConfigDirectory } from "./helpers.mjs";
import {
  SYNTHETIC,
  buildChain,
  canonicalJson,
  canonicalStateFixtures,
  completeApplicationFixture,
  coverLetterReferenceFixtures,
  historicalReferenceFixtures,
  makeAssistedSidecar,
  makeCoverLetter,
  makeResumeArtifact,
  makeSelectedOriginal,
  makeVacancyBinding,
  materializeApplicationFixture,
  mixedChainFixtures,
  stateBoundaryFixtures,
} from "./fixtures/persistence-v2.mjs";

async function snapshot(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    result[entry.name] = entry.isDirectory() ? await snapshot(file) : (await readFile(file)).toString("hex");
  }
  return result;
}

async function materialize(t, chain, files = new Map(), { omit = [], change = [] } = {}) {
  const additional = new Map(files);
  for (const name of omit) additional.delete(name);
  for (const name of change) additional.set(name, Buffer.from("Synthetic changed managed bytes."));
  const value = await materializeApplicationFixture(completeApplicationFixture(chain, additional));
  t.after(() => rm(value.root, { recursive: true, force: true }));
  return value;
}

function onlyClassification(catalog) {
  assert.deepEqual(catalog.applications, []);
  const nonzero = Object.entries(catalog.reconciliation).filter(([, count]) => count !== 0);
  assert.equal(nonzero.length, 1);
  assert.equal(nonzero[0][1], 1);
  return nonzero[0][0];
}

test("P3-08/P3-09: catalog reads all-v1, all-v2, and one v1-to-v2 transition without mutation", async (t) => {
  const fixtures = [
    ...mixedChainFixtures().filter((fixture) => ["all-v1", "all-v2", "v1-to-v2"].includes(fixture.id)),
    ...canonicalStateFixtures(),
  ];
  for (const fixture of fixtures) {
    const value = await materialize(t, fixture.chain, fixture.files);
    const before = await snapshot(value.root);
    const catalog = await readApplicationCatalog(value.root, SYNTHETIC.rootId);
    assert.equal(catalog.applications.length, 1, fixture.id);
    assert.equal(catalog.applications[0].application_id, SYNTHETIC.applicationId);
    assert.deepEqual(catalog.reconciliation, {
      interrupted: 0, drifted: 0, duplicate_id: 0, unsupported: 0, over_limit: 0,
    });
    assert.deepEqual(await snapshot(value.root), before, fixture.id);
  }
});

test("P3-04/P3-10: complete-chain validation rejects downgrade, gap, mismatch, fork, and future schema", async (t) => {
  for (const fixture of mixedChainFixtures().filter((candidate) => candidate.expected !== "valid")) {
    const value = await materialize(t, fixture.chain);
    const before = await snapshot(value.root);
    const catalog = await readApplicationCatalog(value.root, SYNTHETIC.rootId);
    assert.equal(onlyClassification(catalog), fixture.expected, fixture.id);
    assert.deepEqual(await snapshot(value.root), before, fixture.id);
  }
});

test("P3-04/P3-09/P3-44: state metadata and revision limits classify without trusting a prefix", async (t) => {
  for (const fixture of stateBoundaryFixtures()) {
    const value = await materialize(t, fixture.chain);
    const before = await snapshot(value.root);
    const catalog = await readApplicationCatalog(value.root, SYNTHETIC.rootId);
    if (fixture.expected === "valid") assert.equal(catalog.applications.length, 1, fixture.id);
    else assert.equal(onlyClassification(catalog), fixture.expected, fixture.id);
    assert.deepEqual(await snapshot(value.root), before, fixture.id);
  }
});

test("P3-04: v2 state bytes reject reordered, missing, extra, and duplicate decoded keys", async (t) => {
  const base = buildChain([{ version: 2 }]);
  const value = base.revisions[0].value;
  const { cover_letter_artifact: coverLetterArtifact, updated_at: updatedAt, ...prefix } = value;
  const reordered = canonicalJson({ ...prefix, updated_at: updatedAt, cover_letter_artifact: coverLetterArtifact });
  const { status: _status, ...missingStatus } = value;
  const cases = [
    { id: "reordered", bytes: reordered },
    { id: "missing", bytes: canonicalJson(missingStatus) },
    { id: "extra", bytes: canonicalJson({ ...value, unexpected: null }) },
    {
      id: "duplicate",
      bytes: Buffer.from(base.revisions[0].bytes.toString("utf8").replace(
        '  "kind": "application_state_revision",',
        '  "kind": "application_state_revision",\n  "kind": "application_state_revision",',
      )),
    },
  ];
  for (const candidate of cases) {
    const chain = {
      ...base,
      revisions: [{ ...base.revisions[0], bytes: candidate.bytes }],
    };
    const materialized = await materialize(t, chain);
    const catalog = await readApplicationCatalog(materialized.root, SYNTHETIC.rootId);
    assert.equal(onlyClassification(catalog), "drifted", candidate.id);
  }
});

test("P3-09: the first v2 transition cannot combine unrelated state changes", async (t) => {
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const base = { version: 1, vacancy, selectedOriginal };
  const changes = [
    { id: "status", next: { version: 2, vacancy, selectedOriginal, status: "applied" } },
    { id: "vacancy", next: { version: 2, selectedOriginal } },
    { id: "selected-original", next: { version: 2, vacancy } },
  ];
  for (const change of changes) {
    const chain = buildChain([base, change.next]);
    const value = await materialize(t, chain, new Map([["vacancy.md", SYNTHETIC.vacancyBytes]]));
    const catalog = await readApplicationCatalog(value.root, SYNTHETIC.rootId);
    assert.equal(onlyClassification(catalog), "drifted", change.id);
  }
});

test("P3-04/P3-43/P3-47: historical managed references remain immutable after the head clears them", async (t) => {
  for (const fixture of historicalReferenceFixtures()) {
    const value = await materialize(t, fixture.chain, fixture.files, fixture);
    const before = await snapshot(value.root);
    const catalog = await readApplicationCatalog(value.root, SYNTHETIC.rootId);
    if (fixture.expected === "valid") assert.equal(catalog.applications.length, 1, fixture.id);
    else assert.equal(onlyClassification(catalog), "drifted", fixture.id);
    assert.deepEqual(await snapshot(value.root), before, fixture.id);
  }
});

test("P3-19/P3-44: exact cover-letter references validate path, authority, bytes, and bounds", async (t) => {
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const cases = coverLetterReferenceFixtures().filter((fixture) => !fixture.id.startsWith("stale-"));
  for (const fixture of cases) {
    const numbered = fixture.id === "markdown-numbered";
    const first = makeCoverLetter();
    const chain = buildChain(numbered
      ? [
        { version: 2, vacancy, selectedOriginal },
        { version: 2, vacancy, selectedOriginal, coverLetterArtifact: first },
        { version: 2, vacancy, selectedOriginal, coverLetterArtifact: fixture.binding },
      ]
      : [
        { version: 2, vacancy, selectedOriginal },
        { version: 2, vacancy, selectedOriginal, coverLetterArtifact: fixture.binding },
      ]);
    const files = new Map([
      ["vacancy.md", SYNTHETIC.vacancyBytes],
      ...(numbered ? [["cover-letter.md", SYNTHETIC.coverBytes]] : []),
      ...(path.basename(fixture.binding.relative_path) === fixture.binding.relative_path
        ? [[fixture.binding.relative_path, fixture.bytes]]
        : []),
    ]);
    const value = await materialize(t, chain, files);
    const catalog = await readApplicationCatalog(value.root, SYNTHETIC.rootId);
    if (fixture.expected === "valid") assert.equal(catalog.applications.length, 1, fixture.id);
    else assert.equal(onlyClassification(catalog), fixture.expected === "over_limit" ? "over_limit" : "drifted", fixture.id);
  }
});

test("P3-19/P3-44: cover-letter bytes reject BOM, NUL, carriage return, and invalid UTF-8", async (t) => {
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const cases = [
    ["bom", Buffer.from([0xef, 0xbb, 0xbf, 0x78])],
    ["nul", Buffer.from("x\0y")],
    ["carriage-return", Buffer.from("x\ry")],
    ["invalid-utf8", Buffer.from([0xc3, 0x28])],
  ];
  for (const [id, bytes] of cases) {
    const binding = makeCoverLetter(bytes);
    const chain = buildChain([
      { version: 2, vacancy, selectedOriginal },
      { version: 2, vacancy, selectedOriginal, coverLetterArtifact: binding },
    ]);
    const value = await materialize(t, chain, new Map([
      ["vacancy.md", SYNTHETIC.vacancyBytes],
      ["cover-letter.md", bytes],
    ]));
    assert.equal(onlyClassification(await readApplicationCatalog(value.root, SYNTHETIC.rootId)), "drifted", id);
  }
});

test("P3-21/P3-23: tailored artifacts require exact v2 sidecar authority and source binding", async (t) => {
  const selectedOriginal = makeSelectedOriginal();
  const sidecarBytes = canonicalJson(makeAssistedSidecar(SYNTHETIC.resumeBytes, selectedOriginal));
  const artifact = makeResumeArtifact(SYNTHETIC.resumeBytes, sidecarBytes);
  const validChain = buildChain([{ version: 2, selectedOriginal, resumeArtifact: artifact }]);
  const validFiles = new Map([
    ["resume.md", SYNTHETIC.resumeBytes],
    ["resume.pi-career.json", sidecarBytes],
  ]);
  const valid = await materialize(t, validChain, validFiles);
  assert.equal((await readApplicationCatalog(valid.root, SYNTHETIC.rootId)).applications.length, 1);

  const otherOriginal = makeSelectedOriginal(Buffer.from("Synthetic other original."));
  const mismatchedSidecar = canonicalJson(makeAssistedSidecar(SYNTHETIC.resumeBytes, otherOriginal));
  const mismatchedArtifact = makeResumeArtifact(SYNTHETIC.resumeBytes, mismatchedSidecar);
  const mismatched = await materialize(t,
    buildChain([{ version: 2, selectedOriginal, resumeArtifact: mismatchedArtifact }]),
    new Map([["resume.md", SYNTHETIC.resumeBytes], ["resume.pi-career.json", mismatchedSidecar]]),
  );
  assert.equal(onlyClassification(await readApplicationCatalog(mismatched.root, SYNTHETIC.rootId)), "drifted");

  const noSource = await materialize(t,
    buildChain([{ version: 2, resumeArtifact: artifact }]),
    validFiles,
  );
  assert.equal(onlyClassification(await readApplicationCatalog(noSource.root, SYNTHETIC.rootId)), "drifted");

  const changedWhileCarried = await materialize(t,
    buildChain([
      { version: 2, selectedOriginal, resumeArtifact: artifact },
      { version: 2, selectedOriginal: otherOriginal, resumeArtifact: artifact },
    ]),
    validFiles,
  );
  assert.equal(onlyClassification(await readApplicationCatalog(changedWhileCarried.root, SYNTHETIC.rootId)), "drifted");

  const changedAndCleared = await materialize(t,
    buildChain([
      { version: 2, selectedOriginal, resumeArtifact: artifact },
      { version: 2, selectedOriginal: otherOriginal },
    ]),
    validFiles,
  );
  assert.equal((await readApplicationCatalog(changedAndCleared.root, SYNTHETIC.rootId)).applications.length, 1);
});

test("P3-20/P3-21: a carried exact cover may survive dependency changes for later Stale derivation", async (t) => {
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const cover = makeCoverLetter();
  const changedVacancyBytes = Buffer.from("Synthetic replacement job description.");
  const changedVacancy = makeVacancyBinding(changedVacancyBytes, "vacancy-000003.md");
  const changedOriginal = makeSelectedOriginal(Buffer.from("Synthetic changed original resume."));
  const chains = [
    {
      id: "job-dependency",
      chain: buildChain([
        { version: 2, vacancy, selectedOriginal },
        { version: 2, vacancy, selectedOriginal, coverLetterArtifact: cover },
        { version: 2, vacancy: changedVacancy, selectedOriginal, coverLetterArtifact: cover },
      ]),
      files: new Map([
        ["vacancy.md", SYNTHETIC.vacancyBytes],
        ["vacancy-000003.md", changedVacancyBytes],
        ["cover-letter.md", SYNTHETIC.coverBytes],
      ]),
    },
    {
      id: "resume-dependency",
      chain: buildChain([
        { version: 2, vacancy, selectedOriginal },
        { version: 2, vacancy, selectedOriginal, coverLetterArtifact: cover },
        { version: 2, vacancy, selectedOriginal: changedOriginal, coverLetterArtifact: cover },
      ]),
      files: new Map([
        ["vacancy.md", SYNTHETIC.vacancyBytes],
        ["cover-letter.md", SYNTHETIC.coverBytes],
      ]),
    },
  ];
  for (const fixture of chains) {
    const value = await materialize(t, fixture.chain, fixture.files);
    const catalog = await readApplicationCatalog(value.root, SYNTHETIC.rootId);
    assert.equal(catalog.applications.length, 1, fixture.id);
  }
});

test("P3-09: current v1-only writers fail closed on a validated v2 head", async (t) => {
  const value = await materialize(t, buildChain([{ version: 2 }]));
  const agentDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-v2-writer-")));
  t.after(() => rm(agentDir, { recursive: true, force: true }));
  await prepareConfigDirectory(agentDir);
  const config = setApplicationWorkspace(emptyConfig(), {
    root_id: SYNTHETIC.rootId,
    root_path: value.root,
  });
  const file = configPath(agentDir);
  await writeFile(file, encodeConfig(config), { mode: 0o600 });
  await chmod(file, 0o600);

  const fake = makeFakePi();
  const application = createApplicationEntry(
    SYNTHETIC.companyLabel,
    SYNTHETIC.roleLabel,
    "preparing",
    { uuid: () => SYNTHETIC.applicationId, now: () => new Date(SYNTHETIC.createdAt) },
  );
  fake.entries.push({
    type: "custom", customType: "career.workflow", data: application,
    id: "synthetic-v2-session-entry", parentId: null, timestamp: SYNTHETIC.createdAt,
  });
  const context = makeContext(fake, { selects: ["Select original resume"] });
  const workflow = new ApplicationWorkspaceWorkflow({
    agentDir,
    now: () => new Date("2026-08-12T00:00:20.000Z"),
    uuid: () => "00000000-0000-4000-8000-000000000002",
  });
  const beforeRoot = await snapshot(value.root);
  const beforeConfig = await readFile(file);
  await assert.rejects(workflow.run("", context.ctx), (error) => {
    assert.equal(error.name, "CareerWorkflowError");
    assert.equal(error.code, "workspace_unavailable");
    assert.doesNotMatch(error.message, /Synthetic|pi-career-v2-writer-|00000000-/);
    return true;
  });
  assert.deepEqual(await snapshot(value.root), beforeRoot);
  assert.ok((await readFile(file)).equals(beforeConfig));
  assert.equal(fake.entries.length, 1);
});

test("P3-04: sequence-1 v2 cannot start with a cover-letter reference", async (t) => {
  const vacancy = makeVacancyBinding();
  const selectedOriginal = makeSelectedOriginal();
  const chain = buildChain([{
    version: 2,
    vacancy,
    selectedOriginal,
    coverLetterArtifact: makeCoverLetter(),
  }]);
  const value = await materialize(t, chain, new Map([
    ["vacancy.md", SYNTHETIC.vacancyBytes],
    ["cover-letter.md", SYNTHETIC.coverBytes],
  ]));
  assert.equal(onlyClassification(await readApplicationCatalog(value.root, SYNTHETIC.rootId)), "drifted");
});
