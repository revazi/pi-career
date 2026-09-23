// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { registerCareerRun } from "../../src/managed/tool.ts";
import careerCoreExtension from "../../src/index.ts";
import { payloadFreeAdapterError, publicAdapterError } from "../../src/errors.ts";
import { addLibraryRoot, emptyConfig, writeConfig } from "../../src/workflow/config.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { prepareConfigDirectory, uuidSequence } from "./helpers.mjs";
import { CareerInvocationError } from "../../src/errors.ts";
import { makeContext, makeFakePi } from "./helpers.mjs";

const marker = "SYNTHETIC_PRIVATE_STACK_ENV_PATH_728";
const poison = () => { throw new Error(marker); };

for (const mode of ["print", "json"]) {
  test(`P3-36 /career ${mode} rejects before observable private boundaries`, async () => {
    const fake = makeFakePi();
    let invocations = 0;
    let appends = 0;
    let sends = 0;
    let loads = 0;
    fake.api.appendEntry = () => { appends++; poison(); };
    registerCareerCommands(fake.api, {
      agentDir: `/synthetic/${marker}`,
      loadLibrary: async () => { loads++; poison(); },
      invoke: async () => { invocations++; poison(); },
    });
    registerCareerRun(fake.api, {
      agentDir: `/synthetic/${marker}`,
      invoke: async () => { invocations++; poison(); },
    });
    const ctx = {
      mode, hasUI: true, // Inconsistent host flags must not bypass the mode guard.
      get sessionManager() { return poison(); },
      get ui() { return poison(); },
      sendUserMessage() { sends++; poison(); },
    };
    for (const event of ["session_start", "session_tree"]) {
      for (const handler of fake.events.get(event)) await handler({}, ctx);
    }
    await assert.rejects(fake.commands.get("career").handler("", ctx), (error) => {
      assert.equal(error.code, "interactive_mode_required");
      assert.doesNotMatch(String(error), /SYNTHETIC_PRIVATE|at .*\.ts/);
      return true;
    });
    assert.equal(invocations, 0);
    assert.equal(loads, 0);
    assert.equal(appends, 0);
    assert.equal(sends, 0);
    assert.deepEqual(fake.entries, []);
    assert.deepEqual(fake.activeTools, []);
  });
}

test("P3-36 installed extension lifecycle rejects private session getters in print/JSON", async () => {
  const fake = makeFakePi();
  careerCoreExtension(fake.api);
  for (const mode of ["print", "json"]) {
    const ctx = {
      mode, hasUI: true,
      get sessionManager() { return poison(); },
      get ui() { return poison(); },
      sendUserMessage: poison,
    };
    for (const event of ["session_start", "session_tree"]) {
      for (const handler of fake.events.get(event) ?? []) await handler({}, ctx);
    }
    await assert.rejects(fake.commands.get("career").handler("", ctx), (error) => {
      assert.equal(error.code, "interactive_mode_required");
      return true;
    });
    assert.deepEqual(fake.entries, []);
    assert.deepEqual(fake.activeTools, []);
  }
});

test("public raw tool throws a payload-free structured error on invalid request", async () => {
  const fake = makeFakePi();
  careerCoreExtension(fake.api);
  await assert.rejects(fake.tools.get("career_core_resume").execute("call", {
    operation: "analyze", input_json: marker,
  }), (error) => {
    assert.equal(error.payload.code, "invalid_request");
    assert.equal(error.payload.career_error, undefined);
    assert.doesNotMatch(String(error.stack), /SYNTHETIC_PRIVATE|KEY=secret|at stack/);
    return true;
  });
  assert.deepEqual(fake.entries, []);
});

test("P3-37 public raw tool adapter errors omit validated Core text and foreign stacks", () => {
  const raw = new CareerInvocationError({
    schema_version: "career.pi_error.v1", code: "career_cli_error", message: marker,
    career_error: { schema_version: "career.error.v1", code: marker,
      message: `${marker} /synthetic/private KEY=secret at stack`, field_path: marker },
  });
  const safe = payloadFreeAdapterError(publicAdapterError(raw));
  assert.equal(safe.payload.code, "career_cli_error");
  assert.equal(safe.payload.career_error, undefined);
  assert.doesNotMatch(String(safe.stack), /SYNTHETIC_PRIVATE|KEY=secret|at stack/);
});

test("P3-37 non-UI public throws replace raw adapter messages and stacks", async () => {
  const fake = makeFakePi();
  registerCareerCommands(fake.api, { agentDir: "/synthetic/absent" });
  const ctx = makeContext(fake, { mode: "rpc", persisted: false });
  ctx.ctx.hasUI = false;
  ctx.ctx.sessionManager.getBranch = () => { throw new Error(`${marker} /synthetic/private KEY=secret at stack`); };
  await assert.rejects(fake.commands.get("career-vacancy").handler("clear", ctx.ctx), (error) => {
    assert.equal(error.code, "workflow_failed");
    assert.doesNotMatch(String(error.stack), /SYNTHETIC_PRIVATE|KEY=secret|at stack/);
    return true;
  });
  ctx.ctx.sessionManager.getBranch = () => { throw new CareerInvocationError({
    schema_version: "career.pi_error.v1", code: "career_cli_error",
    message: marker, career_error: { schema_version: "career.error.v1", code: marker,
      message: `${marker} /synthetic/private KEY=secret at stack`, field_path: marker },
  }); };
  await assert.rejects(fake.commands.get("career-vacancy").handler("clear", ctx.ctx), (error) => {
    assert.equal(error.payload.code, "career_cli_error");
    assert.equal(error.payload.career_error, undefined);
    assert.doesNotMatch(String(error.stack), /SYNTHETIC_PRIVATE|KEY=secret|at stack/);
    return true;
  });
  assert.deepEqual(fake.entries, []);
  assert.deepEqual(ctx.notifications, []);
});

test("P3-37 scoped session loader and UI failures render fixed payload-free messages", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pi-career-errors-"));
  try {
    const fake = makeFakePi();
    let calls = 0;
    registerCareerCommands(fake.api, {
      agentDir: path.join(temp, "absent-agent"),
      invoke: async () => { calls++; poison(); },
    });
    const command = fake.commands.get("career");
    const session = makeContext(fake, { mode: "rpc", persisted: false });
    session.ctx.sessionManager.getBranch = poison;
    await command.handler("", session.ctx);
    assert.deepEqual(session.notifications, [{ message: "The career workflow failed.", type: "error" }]);

    const ui = makeContext(fake, { mode: "rpc", persisted: false });
    ui.ctx.ui.select = poison;
    await command.handler("", ui.ctx);
    assert.deepEqual(ui.notifications, [{ message: "The career workflow failed.", type: "error" }]);

    const forged = makeContext(fake, { mode: "rpc", persisted: false });
    forged.ctx.ui.select = () => { throw new CareerInvocationError({
      schema_version: "career.pi_error.v1", code: `invalid_request_${marker}`,
      message: `${marker} /synthetic/private KEY=secret at stack`,
    }); };
    await command.handler("", forged.ctx);
    assert.deepEqual(forged.notifications, [{ message: "internal_error: The Career Core Pi adapter failed unexpectedly.", type: "error" }]);
    assert.equal(calls, 0);
    assert.deepEqual(fake.entries, []);
    for (const context of [session, ui, forged]) {
      assert.doesNotMatch(JSON.stringify(context.notifications), /SYNTHETIC_PRIVATE|KEY=secret|at stack/);
      assert.equal(context.customCalls, 0);
    }
    await assert.rejects(readFile(path.join(temp, "absent-agent", "career", "config.json")), { code: "ENOENT" });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("P3-37 injected Core failure never renders its raw error or appends a result card", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-invoke-error-")));
  try {
    const root = path.join(temp, "library");
    const agentDir = path.join(temp, "agent");
    await mkdir(root);
    await writeFile(path.join(root, "original.md"), "# Synthetic resume\nSynthetic experience\n");
    await prepareConfigDirectory(agentDir);
    await writeConfig(agentDir, await addLibraryRoot(emptyConfig(), root, "Synthetic"), uuidSequence());
    const originalBytes = await readFile(path.join(root, "original.md"));
    const fake = makeFakePi();
    let invoked = 0;
    let sends = 0;
    registerCareerCommands(fake.api, {
      agentDir, uuid: uuidSequence(),
      invoke: async () => { invoked++; throw new Error(`${marker} /synthetic/private TOKEN=secret at stack`); },
    });
    const rpc = makeContext(fake, { mode: "rpc", persisted: false, confirms: [true] });
    let pickedAction = false;
    const uiTitles = [];
    rpc.ctx.ui.select = async (title, options) => {
      uiTitles.push(title);
      if (title === "Choose an original resume") return options[0];
      if (!pickedAction && options.includes(CAREER_UI_RPC_ACTIONS.analyze)) {
        pickedAction = true;
        return CAREER_UI_RPC_ACTIONS.analyze;
      }
      return CAREER_UI_RPC_ACTIONS.close;
    };
    rpc.ctx.sendUserMessage = () => { sends++; poison(); };
    await fake.commands.get("career-analyze").handler("", rpc.ctx);
    assert.equal(invoked, 1);
    assert.equal(sends, 0);
    assert.deepEqual(fake.entries, []);
    assert.doesNotMatch(JSON.stringify([rpc.notifications, uiTitles]), /SYNTHETIC_PRIVATE|TOKEN=secret|at stack/);
    assert.deepEqual(await readFile(path.join(root, "original.md")), originalBytes);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
