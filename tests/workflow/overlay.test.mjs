// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_OVERLAY_COMMAND_VIEWS, CareerOverlay } from "../../src/workflow/overlay.ts";
import { makeContext, makeFakePi, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

async function register(temp) {
  const agentDir = path.join(temp, "agent");
  await prepareConfigDirectory(agentDir);
  const fake = makeFakePi();
  const calls = [];
  registerCareerCommands(fake.api, {
    agentDir,
    uuid: uuidSequence(),
    now: () => new Date("2026-08-12T00:00:00.000Z"),
    invoke: async (invocation) => {
      calls.push(invocation);
      throw new Error("overlay navigation must not invoke Career Core");
    },
  });
  return { fake, calls };
}

async function openAndClose(fake, command, view) {
  const components = [];
  const before = fake.entries.length;
  const context = makeContext(fake, {
    mode: "tui", persisted: false, components,
    keybindings: { matches(_data, action) { return action === "tui.select.cancel"; } },
  });
  const pending = fake.commands.get(command).handler("", context.ctx);
  const deadline = Date.now() + 2_000;
  while (components.length === 0 && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(components.length, 1);
  assert.equal(components[0].constructor.name, CareerOverlay.name);
  assert.equal(components[0].currentView, view);
  const rendered = components[0].render(80).join("\n");
  assert.doesNotMatch(rendered, /agent|applications[/\\]|resume\.md|Built reliable/);
  components[0].handleInput("esc");
  await pending;
  assert.equal(fake.entries.length, before);
  return { context, rendered };
}

test("TUI career commands open overlay views without Core, provider, or session append", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-")));
  try {
    const { fake, calls } = await register(temp);
    for (const [command, view] of Object.entries(CAREER_OVERLAY_COMMAND_VIEWS)) {
      await openAndClose(fake, command, view);
    }
    assert.equal(calls.length, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("RPC career commands keep dialog fallbacks instead of the overlay", async () => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-overlay-rpc-")));
  try {
    const { fake } = await register(temp);
    const rpc = makeContext(fake, { mode: "rpc", persisted: false, selects: ["Close"] });
    await fake.commands.get("career-setup").handler("", rpc.ctx);
    assert.equal(rpc.customCalls, 0);
    assert.ok(rpc.notifications.some(({ message }) => message.includes("pi-career")));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
