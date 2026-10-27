// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createAgentSession,
  DefaultResourceLoader,
  ExtensionRunner,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

function syntheticExtension(name, handlers = {}) {
  return {
    path: `/synthetic/${name}.mjs`,
    handlers: new Map(Object.entries(handlers).map(([event, values]) => [event, values])),
    tools: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
    commands: new Map(),
    messageRenderers: new Map(),
    entryRenderers: new Map(),
  };
}

function runnerFor(extensions) {
  const runtime = { getThinkingLevel: () => "off" };
  return new ExtensionRunner(extensions, runtime, "/synthetic", {}, {});
}

function tool(name, exposure) {
  return {
    name,
    label: name,
    description: `Synthetic ${name}`,
    parameters: Type.Object({}),
    exposure,
    defaultActive: false,
    async execute() {
      return { content: [{ type: "text", text: "synthetic" }], details: {} };
    },
  };
}

test("#66 probe: later input handlers can alter already-validated protected text", async () => {
  const observed = [];
  const runner = runnerFor([
    syntheticExtension("validator", {
      input: [async (event) => {
        observed.push(event.text);
        assert.equal(event.source, "rpc");
        assert.equal(event.images, undefined);
        return { action: "continue" };
      }],
    }),
    syntheticExtension("later-transform", {
      input: [async (event) => ({ action: "transform", text: `${event.text}\nLATER_MUTATION` })],
    }),
  ]);

  const result = await runner.emitInput("PROTECTED_SYNTHETIC_HANDOFF", undefined, "rpc");
  assert.deepEqual(observed, ["PROTECTED_SYNTHETIC_HANDOFF"]);
  assert.deepEqual(result, {
    action: "transform",
    text: "PROTECTED_SYNTHETIC_HANDOFF\nLATER_MUTATION",
    images: undefined,
  });
});

test("#66 probe: input and request-hook exceptions are reported but processing continues", async () => {
  const inputErrors = [];
  const inputRunner = runnerFor([
    syntheticExtension("throwing-input", { input: [async () => { throw new Error("synthetic input failure"); }] }),
    syntheticExtension("following-input", {
      input: [async () => ({ action: "transform", text: "FOLLOWING_INPUT_RAN" })],
    }),
  ]);
  inputRunner.onError((error) => inputErrors.push(error));

  assert.deepEqual(await inputRunner.emitInput("ORIGINAL", undefined, "interactive"), {
    action: "transform",
    text: "FOLLOWING_INPUT_RAN",
    images: undefined,
  });
  assert.equal(inputErrors.length, 1);
  assert.equal(inputErrors[0].event, "input");

  const requestErrors = [];
  const requestRunner = runnerFor([
    syntheticExtension("throwing-request-guard", {
      before_provider_request: [async () => { throw new Error("synthetic request guard failure"); }],
    }),
    syntheticExtension("following-request-replacement", {
      before_provider_request: [async () => ({ marker: "FOLLOWING_REQUEST_RAN" })],
    }),
  ]);
  requestRunner.onError((error) => requestErrors.push(error));

  assert.deepEqual(await requestRunner.emitBeforeProviderRequest({ marker: "ORIGINAL" }), {
    marker: "FOLLOWING_REQUEST_RAN",
  });
  assert.equal(requestErrors.length, 1);
  assert.equal(requestErrors[0].event, "before_provider_request");
});

test("#66 probe: later request handlers can replace a payload accepted by an earlier guard", async () => {
  const seen = [];
  const runner = runnerFor([
    syntheticExtension("request-guard", {
      before_provider_request: [async (event) => {
        seen.push(structuredClone(event.payload));
        return event.payload;
      }],
    }),
    syntheticExtension("later-request-transform", {
      before_provider_request: [async () => ({ protected: "CHANGED_AFTER_GUARD" })],
    }),
  ]);

  const payload = { protected: "EXPECTED_SYNTHETIC_BYTES", images: [] };
  assert.deepEqual(await runner.emitBeforeProviderRequest(payload), {
    protected: "CHANGED_AFTER_GUARD",
  });
  assert.deepEqual(seen, [payload]);
});

test("#66 probe: empty active declarations do not imply an empty callable tool set", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-issue-66-tools-"));
  try {
    const agentDir = path.join(temporaryRoot, "agent");
    const settingsManager = SettingsManager.inMemory({ defaultTools: [] });
    const resourceLoader = new DefaultResourceLoader({
      cwd: temporaryRoot,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: temporaryRoot,
      agentDir,
      settingsManager,
      sessionManager: SessionManager.inMemory(temporaryRoot),
      resourceLoader,
      customTools: [
        tool("synthetic_direct", "direct"),
        tool("synthetic_codemode", "codemode"),
        tool("synthetic_deferred", "deferred"),
        tool("synthetic_hidden", "hidden"),
      ],
    });
    try {
      assert.deepEqual(session.getActiveToolNames(), []);
      assert.deepEqual(session.getCallableToolNames().sort(), ["synthetic_codemode", "synthetic_deferred"]);
      session.setActiveToolsByName([]);
      assert.deepEqual(session.getActiveToolNames(), []);
      assert.deepEqual(session.getCallableToolNames().sort(), ["synthetic_codemode", "synthetic_deferred"]);
    } finally {
      await session.dispose();
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("#66 probe: the all-tools denylist removes synthetic registered and callable tools", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pi-career-issue-66-no-tools-"));
  try {
    const agentDir = path.join(temporaryRoot, "agent");
    const settingsManager = SettingsManager.inMemory({ defaultTools: [] });
    const resourceLoader = new DefaultResourceLoader({
      cwd: temporaryRoot,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: temporaryRoot,
      agentDir,
      settingsManager,
      sessionManager: SessionManager.inMemory(temporaryRoot),
      resourceLoader,
      noTools: "all",
      customTools: [tool("synthetic_direct", "direct"), tool("synthetic_deferred", "deferred")],
    });
    try {
      assert.deepEqual(session.getActiveToolNames(), []);
      assert.deepEqual(session.getCallableToolNames(), []);
      assert.deepEqual(session.getAllTools(), []);
    } finally {
      await session.dispose();
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("#66 probe: ordinary appends advance the leaf without a tree-navigation event", () => {
  const session = SessionManager.inMemory("/synthetic");
  const anchor = session.getLeafId();
  assert.equal(anchor, null);

  const userId = session.appendMessage({
    role: "user",
    content: [{ type: "text", text: "SYNTHETIC_USER_PROMPT" }],
    timestamp: 1,
  });
  const metadataId = session.appendCustomEntry("synthetic.issue66.metadata", { value: "SYNTHETIC" });
  const assistantId = session.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "SYNTHETIC_ASSISTANT_RESPONSE" }],
    provider: "synthetic",
    model: "synthetic",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 2,
  });

  assert.equal(session.getLeafId(), assistantId);
  assert.deepEqual(session.getBranch().map(({ id, parentId }) => ({ id, parentId })), [
    { id: userId, parentId: null },
    { id: metadataId, parentId: userId },
    { id: assistantId, parentId: metadataId },
  ]);
});
