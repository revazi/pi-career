// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { registerCareerCommands } from "../../src/workflow/commands.ts";
import { CAREER_UI_RPC_ACTIONS } from "../../src/workflow/career-ui.ts";
import { selectedOriginalOptions } from "../../src/workflow/application-workspace.ts";
import { loadConfig } from "../../src/workflow/config.ts";
import { eligibleOriginals, scanLibrary } from "../../src/workflow/scan.ts";
import { makeContext, makeFakePi, normalizationResult, prepareConfigDirectory, uuidSequence } from "./helpers.mjs";

for (const command of ["analyze", "match"]) {
  test(`unattached RPC ${command} rejects a selected original changed after confirmation`, async () => {
    const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "pi-career-revalidate-")));
    try {
      const agentDir = path.join(temp, "agent");
      const library = path.join(temp, "library");
      await prepareConfigDirectory(agentDir);
      await mkdir(library);
      const original = path.join(library, "alpha.md");
      await writeFile(original, "# Synthetic Alpha\nOriginal content\n");
      await writeFile(path.join(library, "beta.txt"), "Synthetic Beta\n");
      const fake = makeFakePi();
      const calls = [];
      registerCareerCommands(fake.api, {
        agentDir, uuid: uuidSequence(), now: () => new Date("2026-08-12T00:00:00.000Z"),
        invoke: async (invocation) => {
          calls.push(invocation.operation);
          if (invocation.operation === "normalize") return { operation: "job.normalize", json: JSON.stringify(normalizationResult()) };
          throw new Error("changed original must not reach Core");
        },
      });
      await fake.commands.get("career-setup").handler("", makeContext(fake, {
        mode: "rpc", persisted: false,
        selects: [CAREER_UI_RPC_ACTIONS.addRoot, CAREER_UI_RPC_ACTIONS.close],
        inputs: [library], confirms: [true],
      }).ctx);
      if (command === "match") {
        await fake.commands.get("career-vacancy").handler("", makeContext(fake, {
          mode: "rpc", persisted: false,
          selects: [CAREER_UI_RPC_ACTIONS.editVacancy, CAREER_UI_RPC_ACTIONS.close],
          editors: ["Synthetic vacancy with requirements"],
        }).ctx);
      }
      calls.length = 0;
      const originals = eligibleOriginals(await scanLibrary(await loadConfig(agentDir)));
      const option = selectedOriginalOptions(originals).find(({ record }) => record.label === "Synthetic Alpha").option;
      const request = makeContext(fake, {
        mode: "rpc", persisted: false,
        selects: [CAREER_UI_RPC_ACTIONS[command], CAREER_UI_RPC_ACTIONS.close], confirms: [true],
      });
      let picked = false;
      const select = request.ctx.ui.select;
      request.ctx.ui.select = async (title, options) => {
        if (title === "Choose an original resume") {
          assert.ok(options.includes(option));
          picked = true;
          await writeFile(original, "# Synthetic Alpha\nChanged content\n");
          return option;
        }
        return select(title, options);
      };
      const before = fake.entries.length;
      await fake.commands.get(`career-${command}`).handler("", request.ctx);
      assert.equal(picked, true);
      assert.deepEqual(calls, []);
      assert.equal(fake.entries.length, before);
      assert.doesNotMatch(JSON.stringify(request.notifications), /Original content|Changed content|Synthetic vacancy with requirements/);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
}
