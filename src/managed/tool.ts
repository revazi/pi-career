// SPDX-License-Identifier: MIT OR Apache-2.0

import { randomUUID } from "node:crypto";

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { invokeCareerCli } from "../process.ts";
import type { ManagedInvoke } from "./catalog.ts";
import { CareerRunEngine } from "./engine.ts";
import {
  careerRunParameters,
  MANAGED_TOOL_NAME,
  RAW_TOOL_NAMES,
  type CareerRunDetails,
  type CareerRunParams,
} from "./schema.ts";

interface ManagedToolOptions {
  agentDir?: string;
  invoke?: ManagedInvoke;
  now?: () => Date;
  uuid?: () => string;
}

function managedToolActive(pi: ExtensionAPI, includeRaw: boolean): void {
  const current = pi.getActiveTools();
  const retained = current.filter((name) => !RAW_TOOL_NAMES.includes(name as typeof RAW_TOOL_NAMES[number]));
  const next = includeRaw ? [...retained, ...RAW_TOOL_NAMES] : retained;
  if (!next.includes(MANAGED_TOOL_NAME)) next.push(MANAGED_TOOL_NAME);
  pi.setActiveTools([...new Set(next)]);
}

export function registerCareerRun(pi: ExtensionAPI, options: ManagedToolOptions = {}): void {
  const engine = new CareerRunEngine({
    pi,
    agentDir: options.agentDir ?? getAgentDir(),
    invoke: options.invoke ?? invokeCareerCli,
    now: options.now ?? (() => new Date()),
    uuid: options.uuid ?? randomUUID,
  });

  pi.registerTool({
    name: MANAGED_TOOL_NAME,
    label: "Career",
    description: "Run managed local Career Core workflows with ephemeral handles and native payload objects instead of nested JSON strings.",
    promptGuidelines: [
      "Start with context. If consent is required, ask first; consent payload is `approve` or `decline`. Use returned handles; match/variant-review use the current vacancy implicitly.",
      "Proposal payloads use Core fields. Materialize payload is {selected_change_ids:[...]}; detail payload is {section,item?}. Preserve warnings/uncertainty/authority, and never select changes automatically.",
    ],
    parameters: careerRunParameters,
    async execute(_toolCallId, params: CareerRunParams, signal, onUpdate, ctx) {
      onUpdate?.({
        content: [{ type: "text", text: `Running career ${params.command}…` }],
        details: { schema_version: "pi.career.run_details.v1", command: params.command },
      });
      return engine.run(params, signal, ctx);
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("career ")) + theme.fg("accent", args.command ?? "run"),
        0,
        0,
      );
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Running Career Core…"), 0, 0);
      const details = result.details as CareerRunDetails | undefined;
      if (details === undefined) return new Text(theme.fg("dim", "Career result unavailable"), 0, 0);
      const lines = [
        theme.fg(details.status === "consent_required" ? "warning" : "success", details.summary),
        ...(expanded && details.handle !== undefined ? [theme.fg("dim", details.handle)] : []),
      ];
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  pi.registerCommand("career-tools", {
    description: "Choose managed or advanced raw Career Core tools",
    getArgumentCompletions: (prefix) => ["managed", "raw", "status"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      const mode = args.trim();
      if (mode === "managed") managedToolActive(pi, false);
      else if (mode === "raw") managedToolActive(pi, true);
      else if (mode !== "status" && mode !== "") {
        ctx.ui.notify("Usage: /career-tools managed|raw|status", "warning");
        return;
      }
      const activeRaw = RAW_TOOL_NAMES.filter((name) => pi.getActiveTools().includes(name));
      ctx.ui.notify(
        `Career tools: career_run active; raw Career Core tools ${activeRaw.length === 0 ? "inactive" : "active"}.`,
        "info",
      );
    },
  });

  pi.on("session_start", (_event, ctx) => {
    engine.enterSession(ctx.sessionManager.getSessionId());
    managedToolActive(pi, false);
  });
  pi.on("session_tree", (_event, ctx) => {
    engine.resetSession(ctx.sessionManager.getSessionId());
  });
  pi.on("session_shutdown", () => {
    engine.shutdown();
  });
}
