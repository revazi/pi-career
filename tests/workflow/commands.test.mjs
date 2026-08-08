// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { adapterError } from "../../src/errors.ts";
import { addLibraryRoot, emptyConfig, writeConfig } from "../../src/workflow/config.ts";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import {
  createConsentEntry,
  createVacancyEntry,
  reconstructWorkflowState,
} from "../../src/workflow/session-state.ts";
import { CORE_MAX_CHARACTERS } from "../../src/workflow/text-limit.ts";
import {
  makeContext,
  makeFakePi,
  matchResult,
  normalizationResult,
  resumeResult,
  syntheticTextPdf,
  uuidSequence,
} from "./helpers.mjs";

const now = () => new Date("2026-08-04T17:56:06.000Z");

async function configuredAgent(temp, files = ["resume.md"]) {
  const root = path.join(temp, "library");
  const agentDir = path.join(temp, "agent");
  await mkdir(root);
  for (const file of files) await writeFile(path.join(root, file), `# ${file}\nSynthetic resume content\n`);
  const config = await addLibraryRoot(emptyConfig(), root, "Synthetic library");
  await writeConfig(agentDir, config, uuidSequence());
  return { agentDir, root };
}

test("registers the approved deterministic commands and reviewable workbench handoff", () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, { agentDir: "/synthetic/agent" });
  assert.deepEqual([...fake.commands.keys()].sort(), [
    "career-analyze", "career-application", "career-library", "career-match", "career-setup", "career-vacancy", "career-workbench",
  ]);
});

test("print/JSON modes fail closed except pure vacancy clear", async () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, { agentDir: "/synthetic/agent", uuid: uuidSequence(), now });
  const nonUi = makeContext(fake, { mode: "print", hasUI: false });
  await assert.rejects(fake.commands.get("career-setup").handler("status", nonUi.ctx), /interactive_mode_required/);
  await assert.rejects(fake.commands.get("career-workbench").handler("", nonUi.ctx), /interactive_mode_required/);

  const vacancy = createVacancyEntry("Synthetic vacancy", "paste", { uuid: uuidSequence(), now });
  fake.entries.push({ type: "custom", customType: "career.workflow", data: vacancy, id: "seed", parentId: null, timestamp: now().toISOString() });
  await fake.commands.get("career-vacancy").handler("clear", nonUi.ctx);
  assert.equal(fake.entries.at(-1).data.kind, "vacancy_clear");
});

test("RPC vacancy flow uses supported dialogs, explicit consent, and direct Core invocation", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-vacancy-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    const calls = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async (invocation, signal) => {
        assert.equal(signal.aborted, false);
        calls.push(invocation);
        return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
      },
    });
    const rpc = makeContext(fake, {
      mode: "rpc", persisted: true,
      editors: ["Synthetic Backend Engineer\nRequirements\n- Testing"],
      selects: ["Continue in this session"],
    });
    await fake.commands.get("career-vacancy").handler("", rpc.ctx);
    assert.equal(rpc.customCalls, 0, "RPC must never call custom()");
    assert.deepEqual(fake.entries.map((entry) => entry.data.kind), ["consent", "vacancy"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "job");
    assert.equal(calls[0].operation, "normalize");
    assert.equal(JSON.parse(calls[0].inputJson).schema_version, "career.job_input.v1");
    assert.ok(rpc.notifications.every(({ message }) => !message.includes("Requirements\n- Testing")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("vacancy validation counts Unicode code points and preserves exact untrimmed text", async () => {
  const accepted = ` ${"😀".repeat(CORE_MAX_CHARACTERS - 2)} `;
  const acceptedFake = makeFakePi();
  let acceptedCalls = 0;
  registerCareerCommands(acceptedFake.api, {
    agentDir: "/synthetic/agent", uuid: uuidSequence(), now,
    invoke: async () => {
      acceptedCalls += 1;
      return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
    },
  });
  const acceptedRpc = makeContext(acceptedFake, {
    mode: "rpc", persisted: false, editors: [accepted],
  });
  await acceptedFake.commands.get("career-vacancy").handler("", acceptedRpc.ctx);
  assert.equal(acceptedCalls, 1);
  assert.equal(acceptedFake.entries.at(-1).data.vacancy_text, accepted);

  const rejectedFake = makeFakePi();
  let rejectedCalls = 0;
  registerCareerCommands(rejectedFake.api, {
    agentDir: "/synthetic/agent", uuid: uuidSequence(), now,
    invoke: async () => {
      rejectedCalls += 1;
      return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
    },
  });
  const rejectedRpc = makeContext(rejectedFake, {
    mode: "rpc", persisted: false, editors: [`${accepted}😀`],
  });
  await rejectedFake.commands.get("career-vacancy").handler("", rejectedRpc.ctx);
  assert.equal(rejectedCalls, 0);
  assert.equal(rejectedFake.entries.some((entry) => entry.data.kind === "vacancy"), false);
  assert.ok(rejectedRpc.notifications.some(({ message }) => message.includes("arguments are invalid")));
});

test("application context scopes a new vacancy and names an unnamed session", async () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, {
    agentDir: "/synthetic/agent", uuid: uuidSequence(), now,
    invoke: async () => ({ operation: "job.normalize", json: JSON.stringify(normalizationResult()) }),
  });
  const applicationRpc = makeContext(fake, {
    mode: "rpc", persisted: false,
    selects: ["Create application"], inputs: ["Synthetic Company", "Senior Engineer"],
  });
  await fake.commands.get("career-application").handler("", applicationRpc.ctx);
  const application = reconstructWorkflowState(fake.entries).application;
  assert.ok(application);
  assert.equal(application.company_label, "Synthetic Company");
  assert.equal(application.role_label, "Senior Engineer");
  assert.equal(fake.api.getSessionName(), "Synthetic Company — Senior Engineer");

  const vacancyRpc = makeContext(fake, {
    mode: "rpc", persisted: false, editors: ["Synthetic vacancy\nTesting required"],
  });
  await fake.commands.get("career-vacancy").handler("", vacancyRpc.ctx);
  const state = reconstructWorkflowState(fake.entries);
  assert.equal(state.vacancy.application_id, application.application_id);
  assert.equal(state.application.application_id, application.application_id);

  const clearRpc = makeContext(fake, { mode: "rpc", persisted: false });
  await fake.commands.get("career-application").handler("clear", clearRpc.ctx);
  const cleared = reconstructWorkflowState(fake.entries);
  assert.equal(cleared.application, undefined);
  assert.equal(cleared.vacancy, undefined);
  assert.equal(cleared.application_context_seen, true);

  const retryRpc = makeContext(fake, {
    mode: "rpc", persisted: false,
    selects: ["Create application"], inputs: ["Other Company", "Platform Engineer"],
  });
  await fake.commands.get("career-application").handler("", retryRpc.ctx);
  assert.equal(reconstructWorkflowState(fake.entries).application, undefined);
  assert.ok(retryRpc.notifications.some(({ message }) => message.includes("Run /new")));
  assert.equal(fake.api.getSessionName(), "Synthetic Company — Senior Engineer");
});

test("library status explains why an unusable PDF was not indexed", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-pdf-notice-"));
  try {
    const root = path.join(temp, "library");
    const agentDir = path.join(temp, "agent");
    await mkdir(root);
    await writeFile(path.join(root, "scanned-resume.pdf"), "%PDF-1.4\nnot searchable\n");
    await writeConfig(agentDir, await addLibraryRoot(emptyConfig(), root, "Synthetic library"), uuidSequence());

    const fake = makeFakePi();
    registerCareerCommands(fake.api, { agentDir, uuid: uuidSequence(), now });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false });
    await fake.commands.get("career-library").handler("status", rpc.ctx);
    assert.ok(rpc.notifications.some(({ message }) =>
      message.includes("scanned-resume.pdf") &&
      message.includes("searchable, unencrypted PDF") &&
      message.includes("OCR is not supported")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("searchable PDF resumes reach deterministic analysis without manual conversion", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-pdf-analyze-"));
  try {
    const root = path.join(temp, "library");
    const agentDir = path.join(temp, "agent");
    await mkdir(root);
    await writeFile(path.join(root, "synthetic-resume.pdf"), syntheticTextPdf([
      "Synthetic Resume",
      "TypeScript testing experience",
    ]));
    await writeConfig(agentDir, await addLibraryRoot(emptyConfig(), root, "Synthetic library"), uuidSequence());

    const fake = makeFakePi();
    let analyzedText;
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async (invocation) => {
        analyzedText = JSON.parse(invocation.inputJson).text;
        return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
      },
    });
    const rpc = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: ["Close"],
    });
    const recordSelection = rpc.ctx.ui.select;
    rpc.ctx.ui.select = async (title, options) => title === "Choose an original resume"
      ? options[0]
      : recordSelection(title, options);

    await fake.commands.get("career-analyze").handler("", rpc.ctx);
    assert.match(analyzedText, /Synthetic Resume/);
    assert.match(analyzedText, /TypeScript testing experience/);
    assert.equal(fake.entries.filter((entry) => entry.data.kind === "result_card").length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("workbench prepares a reviewable private prompt without calling a model or Core", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-workbench-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    const seedUuid = uuidSequence();
    fake.entries.push({
      type: "custom", customType: "career.workflow",
      data: createVacancyEntry("Synthetic Backend Vacancy\nTypeScript required", "paste", { uuid: seedUuid, now }),
      id: "seed", parentId: null, timestamp: now().toISOString(),
    });
    let calls = 0;
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async () => { calls += 1; throw new Error("must not run"); },
    });
    const editorText = [];
    const rpc = makeContext(fake, {
      mode: "rpc", persisted: false,
      selects: ["Tailor to current vacancy", "Prepare in editor"],
      editors: ["Show me the safest targeted changes."],
      editorText,
    });
    const select = rpc.ctx.ui.select;
    rpc.ctx.ui.select = async (title, options) => title === "Choose an original resume"
      ? options[0]
      : select(title, options);

    await fake.commands.get("career-workbench").handler("", rpc.ctx);
    assert.equal(calls, 0);
    assert.equal(editorText.length, 1);
    assert.match(editorText[0], /Show me the safest targeted changes/);
    assert.match(editorText[0], /Synthetic resume content/);
    assert.match(editorText[0], /Synthetic Backend Vacancy/);
    assert.match(editorText[0], /original resume is immutable/);
    assert.match(editorText[0], /career_core_discover, career_core_resume, and career_core_job/);
    assert.ok(rpc.notifications.some(({ message }) => message.includes("Nothing was sent automatically")));
    assert.ok(rpc.notifications.every(({ message }) => !message.includes("Synthetic resume content")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("match runs normalize, all analyses, then all matches sequentially with no model or network", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-match-"));
  const previousFetch = globalThis.fetch;
  let network = false;
  globalThis.fetch = async () => { network = true; throw new Error("forbidden"); };
  try {
    const { agentDir } = await configuredAgent(temp, ["a.md", "b.md"]);
    const fake = makeFakePi();
    const seedUuid = uuidSequence();
    const consent = createConsentEntry(true, { uuid: seedUuid, now });
    const vacancy = createVacancyEntry("Synthetic Backend Engineer", "paste", { uuid: seedUuid, now });
    fake.entries.push(
      { type: "custom", customType: "career.workflow", data: consent, id: "seed1", parentId: null, timestamp: now().toISOString() },
      { type: "custom", customType: "career.workflow", data: vacancy, id: "seed2", parentId: "seed1", timestamp: now().toISOString() },
    );
    const operations = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async (invocation) => {
        operations.push(`${invocation.kind}.${invocation.operation}`);
        if (invocation.kind === "job" && invocation.operation === "normalize") {
          return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        }
        if (invocation.kind === "resume") {
          return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
        }
        return { operation: "job.match", json: JSON.stringify(matchResult()) };
      },
    });
    const rpc = makeContext(fake, { mode: "rpc", selects: ["All original resumes", "Close"] });
    await fake.commands.get("career-match").handler("", rpc.ctx);
    assert.deepEqual(operations, [
      "job.normalize", "resume.analyze", "resume.analyze", "job.match", "job.match",
    ]);
    const cards = fake.entries.filter((entry) => entry.data.kind === "result_card");
    assert.equal(cards.length, 2);
    assert.ok(cards.every((entry) => entry.data.workflow === "match"));
    const theme = { fg(_color, text) { return text; }, bold(text) { return text; } };
    const rendered = fake.renderers.get("career.workflow")(
      { data: cards[0].data }, { expanded: false }, theme,
    ).render(80).join("\n");
    assert.match(rendered, /tie/, "current-run durable cards must derive tie status in memory");
    assert.equal(network, false);
    assert.equal(rpc.customCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    await rm(temp, { recursive: true, force: true });
  }
});

test("match keeps every oversized resume visible as an unavailable row and continues", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-match-unavailable-"));
  try {
    const { agentDir } = await configuredAgent(temp, ["a.md", "b.md", "c.md"]);
    const fake = makeFakePi();
    const seedUuid = uuidSequence();
    const consent = createConsentEntry(true, { uuid: seedUuid, now });
    const vacancy = createVacancyEntry("Synthetic Backend Engineer", "paste", { uuid: seedUuid, now });
    fake.entries.push(
      { type: "custom", customType: "career.workflow", data: consent, id: "seed1", parentId: null, timestamp: now().toISOString() },
      { type: "custom", customType: "career.workflow", data: vacancy, id: "seed2", parentId: "seed1", timestamp: now().toISOString() },
    );
    const operations = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async (invocation) => {
        operations.push(`${invocation.kind}.${invocation.operation}`);
        if (invocation.kind === "job" && invocation.operation === "normalize") {
          return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        }
        if (invocation.kind === "resume") {
          const text = JSON.parse(invocation.inputJson).text;
          if (text.includes("# a.md")) throw adapterError("result_too_large");
          if (text.includes("# b.md")) throw adapterError("result_too_many_lines");
          return { operation: "resume.analyze", json: JSON.stringify(resumeResult()) };
        }
        return { operation: "job.match", json: JSON.stringify(matchResult()) };
      },
    });
    const rpc = makeContext(fake, { mode: "rpc", selects: ["All original resumes", "Close"] });
    await fake.commands.get("career-match").handler("", rpc.ctx);

    assert.deepEqual(operations, [
      "job.normalize",
      "resume.analyze", "resume.analyze", "resume.analyze",
      "job.match", "job.match", "job.match",
    ]);
    const cards = fake.entries.filter((entry) => entry.data.kind === "result_card");
    assert.equal(cards.length, 1);
    assert.equal(cards[0].data.resume_label, "c.md");
    for (const [label, code] of [["a.md", "result_too_large"], ["b.md", "result_too_many_lines"]]) {
      assert.ok(rpc.notifications.some(({ message }) =>
        message.includes(label) &&
        message.includes(code) &&
        message.includes("result unavailable") &&
        message.includes("No partial output exists and the result was not stored.")));
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("match validates every batch resume-analysis schema before job matching", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-command-match-analysis-schema-"));
  try {
    const { agentDir } = await configuredAgent(temp);
    const fake = makeFakePi();
    const seedUuid = uuidSequence();
    fake.entries.push(
      { type: "custom", customType: "career.workflow", data: createConsentEntry(true, { uuid: seedUuid, now }), id: "seed1", parentId: null, timestamp: now().toISOString() },
      { type: "custom", customType: "career.workflow", data: createVacancyEntry("Synthetic vacancy", "paste", { uuid: seedUuid, now }), id: "seed2", parentId: "seed1", timestamp: now().toISOString() },
    );
    const operations = [];
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(), now,
      invoke: async (invocation) => {
        operations.push(`${invocation.kind}.${invocation.operation}`);
        if (invocation.kind === "job" && invocation.operation === "normalize") {
          return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
        }
        return { operation: "resume.analyze", json: JSON.stringify({ schema_version: "unexpected.v1" }) };
      },
    });
    const rpc = makeContext(fake, { mode: "rpc", selects: ["All original resumes"] });
    await fake.commands.get("career-match").handler("", rpc.ctx);
    assert.deepEqual(operations, ["job.normalize", "resume.analyze"]);
    assert.equal(fake.entries.some((entry) => entry.data.kind === "result_card"), false);
    assert.ok(rpc.notifications.some(({ message }) => message.includes("unexpected result shape")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
