// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadAttachedApplicationSources, readApplicationCatalog } from "../../src/workflow/application-workspace.ts";
import { prepareConfigDirectory } from "./helpers.mjs";

const ROOT_ID = "00000000-0000-4000-8000-000000000099";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-08-12T00:00:00.000Z";
const ORIGINAL_ONE = Buffer.from("# Synthetic original one\n\nBuilt reliable systems.\n");
const ORIGINAL_TWO = Buffer.from("# Synthetic original two\n\nBuilt accessible systems.\n");
const VACANCY_ONE = Buffer.from("Synthetic platform engineering vacancy.\n");
const VACANCY_TWO = Buffer.from("Synthetic accessibility engineering vacancy.\n");
const COVER = Buffer.from("Synthetic user-authored cover letter fixture.\n");
const canonical = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stateName = (sequence) => `.pi-career-state-${String(sequence).padStart(6, "0")}.json`;

async function privateFile(file, bytes) {
  await writeFile(file, bytes, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function tree(directory) {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    result[entry.name] = entry.isDirectory() ? await tree(target) : (await readFile(target)).toString("hex");
  }
  return result;
}

function state(version, sequence, parentSha256, values) {
  const shared = {
    schema_version: `pi.career.application_state.v${version}`,
    kind: "application_state_revision",
    application_id: APPLICATION_ID,
    sequence,
    parent_sha256: parentSha256,
    status: values.status ?? "preparing",
    vacancy: values.vacancy,
    selected_original: values.selectedOriginal,
    resume_artifact: null,
  };
  return version === 1
    ? { ...shared, updated_at: `2026-08-12T00:00:0${sequence}.000Z` }
    : {
      ...shared,
      cover_letter_artifact: values.coverLetter,
      updated_at: `2026-08-12T00:00:0${sequence}.000Z`,
    };
}

async function fixture(t, transition) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-readiness-integration-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const agentDir = path.join(temp, "agent");
  const library = path.join(temp, "library");
  const root = path.join(temp, "applications");
  await prepareConfigDirectory(agentDir);
  await mkdir(library, { mode: 0o700 });
  await mkdir(root, { mode: 0o700 });
  await chmod(library, 0o700);
  await chmod(root, 0o700);
  await privateFile(path.join(library, "original-one.md"), ORIGINAL_ONE);
  await privateFile(path.join(library, "original-two.md"), ORIGINAL_TWO);
  const libraryPath = await realpath(library);
  const libraryRootId = digest(Buffer.from(libraryPath));
  const selected = async (name, bytes) => ({
    document_id: digest(Buffer.from(await realpath(path.join(library, name)))),
    library_root_id: libraryRootId,
    text_sha256: digest(bytes),
    format: "markdown",
  });
  const selectedOne = await selected("original-one.md", ORIGINAL_ONE);
  const selectedTwo = await selected("original-two.md", ORIGINAL_TWO);
  const vacancyOne = {
    relative_path: "vacancy.md",
    content_sha256: digest(VACANCY_ONE),
    utf8_bytes: VACANCY_ONE.length,
    source_state_id: "00000000-0000-4000-8000-000000000080",
  };
  const vacancyTwo = {
    relative_path: "vacancy-000003.md",
    content_sha256: digest(VACANCY_TWO),
    utf8_bytes: VACANCY_TWO.length,
    source_state_id: "00000000-0000-4000-8000-000000000081",
  };
  const coverLetter = {
    relative_path: "cover-letter.md",
    artifact_sha256: digest(COVER),
    utf8_bytes: COVER.length,
    format: "markdown",
    authority: "user_authored",
    job_description_sha256: digest(VACANCY_ONE),
    effective_resume_sha256: digest(ORIGINAL_ONE),
  };
  const marker = {
    schema_version: "pi.career.application_root.v1", kind: "application_workspace_root",
    root_id: ROOT_ID, created_at: CREATED_AT,
  };
  const manifest = {
    schema_version: "pi.career.application_manifest.v1", kind: "career_application",
    application_id: APPLICATION_ID, root_id: ROOT_ID,
    application_created_at: CREATED_AT, workspace_created_at: CREATED_AT,
  };
  const identity = {
    schema_version: "pi.career.application_identity.v1", kind: "application_identity",
    application_id: APPLICATION_ID, company_label: "Synthetic Company",
    role_label: "Synthetic Engineer", created_at: CREATED_AT,
  };
  const manifestBytes = canonical(manifest);
  const first = canonical(state(1, 1, digest(manifestBytes), {
    vacancy: vacancyOne, selectedOriginal: selectedOne,
  }));
  const second = canonical(state(2, 2, digest(first), {
    vacancy: vacancyOne, selectedOriginal: selectedOne, coverLetter,
  }));
  const transitionValues = transition === "job"
    ? { status: "applied", vacancy: vacancyTwo, selectedOriginal: selectedOne, coverLetter }
    : transition === "resume"
      ? { status: "closed", vacancy: vacancyOne, selectedOriginal: selectedTwo, coverLetter }
      : {
        status: transition,
        vacancy: vacancyOne,
        selectedOriginal: selectedOne,
        coverLetter: null,
      };
  const third = canonical(state(2, 3, digest(second), transitionValues));
  const decodedThird = JSON.parse(third);
  assert.equal(decodedThird.parent_sha256, digest(second));
  assert.deepEqual(Object.keys(decodedThird), [
    "schema_version", "kind", "application_id", "sequence", "parent_sha256", "status",
    "vacancy", "selected_original", "resume_artifact", "cover_letter_artifact", "updated_at",
  ]);
  if (transition === "applied" || transition === "closed") {
    assert.equal(decodedThird.cover_letter_artifact, null);
  }

  await privateFile(path.join(agentDir, "career", "config.v1.json"), canonical({
    schema_version: "pi.career.config.v2",
    library_roots: [{ id: libraryRootId, path: libraryPath, label: "Synthetic library" }],
    generated_variants_root: null,
    application_workspace: { root_id: ROOT_ID, root_path: root },
  }));
  await privateFile(path.join(root, ".pi-career-applications.json"), canonical(marker));
  const application = path.join(root, `synthetic-company--synthetic-engineer--${APPLICATION_ID}`);
  await mkdir(application, { mode: 0o700 });
  await chmod(application, 0o700);
  for (const [name, bytes] of [
    ["application.json", manifestBytes], [".pi-career-identity.json", canonical(identity)],
    [stateName(1), first], [stateName(2), second], ["vacancy.md", VACANCY_ONE],
    ["cover-letter.md", COVER],
  ]) await privateFile(path.join(application, name), bytes);

  return {
    agentDir, library, root, application, third, vacancyTwo,
    attachment: {
      schema_version: "pi.career.application_attachment.v1", kind: "application_attachment",
      attachment_id: "00000000-0000-4000-8000-000000000090",
      application_id: APPLICATION_ID, root_id: ROOT_ID, root_created_at: CREATED_AT,
      application_created_at: CREATED_AT, workspace_created_at: CREATED_AT,
    },
  };
}

const READY = {
  components: { job_description: "Available", resume: "Available", cover_letter: "Available" },
  readiness: "Ready 3/3",
  effective_resume: "original",
};
const STALE = {
  components: { job_description: "Available", resume: "Available", cover_letter: "Stale" },
  readiness: "Incomplete 2/3",
  effective_resume: "original",
};
const MISSING_LETTER = {
  components: { job_description: "Available", resume: "Available", cover_letter: "Missing" },
  readiness: "Incomplete 2/3",
  effective_resume: "original",
};

test("P3-20/P3-21/P3-24: validated transitions stale a bound letter and lifecycle never bypasses completeness", async (t) => {
  for (const transition of ["job", "resume", "applied", "closed"]) {
    const value = await fixture(t, transition);
    const beforeRoot = await tree(value.root);
    const beforeApplication = await tree(value.application);
    const beforeLibrary = await tree(value.library);
    const beforeAgent = await tree(value.agentDir);
    const initialCatalog = await readApplicationCatalog(value.root, ROOT_ID);
    assert.equal(initialCatalog.applications.length, 1, `${transition}: ${JSON.stringify(initialCatalog.reconciliation)}`);
    const ready = await loadAttachedApplicationSources(value.agentDir, value.attachment);
    assert.equal(ready.status, "preparing");
    assert.deepEqual(ready.readiness, READY);
    assert.deepEqual(await tree(value.root), beforeRoot);
    assert.deepEqual(await tree(value.library), beforeLibrary);
    assert.deepEqual(await tree(value.agentDir), beforeAgent);

    // This is the approved transition under test: preserve every prior canonical byte and
    // append exactly one contiguous revision whose independently computed parent is state 2.
    if (transition === "job") {
      await privateFile(path.join(value.application, value.vacancyTwo.relative_path), VACANCY_TWO);
    }
    await privateFile(path.join(value.application, stateName(3)), value.third);
    const afterAppend = await tree(value.root);
    assert.equal(afterAppend[".pi-career-applications.json"], beforeRoot[".pi-career-applications.json"]);
    const applicationName = path.basename(value.application);
    for (const [name, bytes] of Object.entries(beforeApplication)) {
      assert.equal(afterAppend[applicationName][name], bytes, `${transition}: ${name} changed`);
    }
    const projected = await loadAttachedApplicationSources(value.agentDir, value.attachment);
    assert.equal(projected.status, transition === "job" ? "applied" : transition === "resume" ? "closed" : transition);
    assert.deepEqual(projected.readiness, transition === "job" || transition === "resume" ? STALE : MISSING_LETTER);
    if (transition === "job") {
      assert.equal(projected.vacancy?.vacancy_text, VACANCY_TWO.toString("utf8"));
      assert.equal(projected.effective_resume?.text, ORIGINAL_ONE.toString("utf8"));
    } else if (transition === "resume") {
      assert.equal(projected.vacancy?.vacancy_text, VACANCY_ONE.toString("utf8"));
      assert.equal(projected.selected_original?.text, ORIGINAL_TWO.toString("utf8"));
      assert.equal(projected.effective_resume?.text, ORIGINAL_TWO.toString("utf8"));
    } else {
      assert.equal(projected.vacancy?.vacancy_text, VACANCY_ONE.toString("utf8"));
      assert.equal(projected.selected_original?.text, ORIGINAL_ONE.toString("utf8"));
      assert.equal(projected.effective_resume?.text, ORIGINAL_ONE.toString("utf8"));
    }
    assert.deepEqual(await tree(value.root), afterAppend);
    assert.deepEqual(await tree(value.library), beforeLibrary);
    assert.deepEqual(await tree(value.agentDir), beforeAgent);
    for (const name of await readdir(value.application)) {
      assert.equal((await stat(path.join(value.application, name))).mode & 0o777, 0o600, name);
    }
    assert.equal((await stat(value.application)).mode & 0o777, 0o700);
    for (const name of await readdir(value.library)) {
      assert.equal((await stat(path.join(value.library, name))).mode & 0o777, 0o600, name);
    }
    assert.equal((await stat(value.library)).mode & 0o777, 0o700);
  }
});
