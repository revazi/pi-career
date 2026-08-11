// SPDX-License-Identifier: MIT OR Apache-2.0

import { randomUUID } from "node:crypto";

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { invokeCareerCli } from "../process.ts";
import type { ManagedInvoke } from "./catalog.ts";
import { CareerRunEngine } from "./engine.ts";
import { CareerRunError, careerRunErrorMessage } from "./errors.ts";
import { materializeEditorText, selectVariantChanges } from "./review-selector.ts";
import { VariantSaveWorkflow } from "../workflow/variant-save.ts";
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

const REVIEW_HANDLE_PATTERN = /^review:[a-f0-9-]{8,64}$/;
const VARIANT_HANDLE_PATTERN = /^variant:[a-f0-9-]{8,64}$/;

function managedToolActive(pi: ExtensionAPI, includeRaw: boolean): void {
  const current = pi.getActiveTools();
  const retained = current.filter((name) => !RAW_TOOL_NAMES.includes(name as typeof RAW_TOOL_NAMES[number]));
  const next = includeRaw ? [...retained, ...RAW_TOOL_NAMES] : retained;
  if (!next.includes(MANAGED_TOOL_NAME)) next.push(MANAGED_TOOL_NAME);
  pi.setActiveTools([...new Set(next)]);
}

export function registerCareerRun(pi: ExtensionAPI, options: ManagedToolOptions = {}): void {
  const agentDir = options.agentDir ?? getAgentDir();
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? randomUUID;
  const engine = new CareerRunEngine({
    pi,
    agentDir,
    invoke: options.invoke ?? invokeCareerCli,
    now,
    uuid,
  });
  const variantSave = new VariantSaveWorkflow({ agentDir, now, uuid });

  pi.registerTool({
    name: MANAGED_TOOL_NAME,
    label: "Career",
    description: "Run managed local Career Core workflows with ephemeral handles and native payload objects instead of nested JSON strings.",
    promptGuidelines: [
      "Start with context. If consent is required, ask first; consent payload is `approve` or `decline`. Use returned handles; match/variant-review use the current vacancy implicitly.",
      "Proposal payloads use Core fields. Materialize payload is {selected_change_ids:[...]}; detail payload is {section,item?}. Preserve warnings/uncertainty/authority, and never select changes automatically.",
      "career_run variant-review must end its turn. For non-PDF originals in TUI, direct the user to /career-review with the returned review handle; only a later user-submitted turn may materialize explicitly selected IDs. PDF changes remain manual guidance only.",
      "After materialization, never initiate persistence. The user alone may run /career-save with the returned variant handle for exact local preview and confirmation.",
    ],
    parameters: careerRunParameters,
    async execute(_toolCallId, params: CareerRunParams, signal, onUpdate, ctx) {
      onUpdate?.({
        content: [{ type: "text", text: `Running career ${params.command}…` }],
        details: { schema_version: "pi.career.run_details.v1", command: params.command },
      });
      const result = await engine.run(params, signal, ctx);
      if (params.command === "consent" && params.payload === "decline") {
        variantSave.clearReceipts();
      }
      return params.command === "variant-review" ? { ...result, terminate: true } : result;
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
        ...(details.action === "review_select" && details.handle !== undefined
          ? [theme.fg("accent", `Run /career-review ${details.handle}`)]
          : []),
        ...(details.action === "save_available" && details.handle !== undefined
          ? [theme.fg("accent", `User may run /career-save ${details.handle}`)]
          : []),
        ...(expanded && details.handle !== undefined &&
          details.action !== "review_select" && details.action !== "save_available"
          ? [theme.fg("dim", details.handle)]
          : []),
      ];
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  pi.registerCommand("career-review", {
    description: "Review and explicitly select retained variant changes in TUI",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/career-review requires TUI mode.", "error");
        return;
      }
      const handle = args.trim();
      if (!REVIEW_HANDLE_PATTERN.test(handle)) {
        ctx.ui.notify("Usage: /career-review review:<ephemeral-handle>", "warning");
        return;
      }
      try {
        await ctx.waitForIdle();
        const review = engine.variantSelectionReview(handle, ctx);
        if (review.changes.length === 0) {
          ctx.ui.notify("This review has no retained changes to select.", "warning");
          return;
        }
        const selected = await selectVariantChanges(ctx, review);
        if (selected === undefined) return;
        ctx.ui.setEditorText(materializeEditorText(review.handle, selected));
        ctx.ui.notify(
          `${selected.length} reviewed change ID${selected.length === 1 ? "" : "s"} prepared in the editor. Review and submit manually; nothing was materialized, sent, saved, or written.`,
          "info",
        );
      } catch (error) {
        if (error instanceof CareerRunError) {
          ctx.ui.notify(careerRunErrorMessage(error.code), "error");
          return;
        }
        ctx.ui.notify("The reviewed-change selector failed without persisting a selection.", "error");
      }
    },
  });

  pi.registerCommand("career-save", {
    description: "Preview and explicitly save one current assisted Markdown/text materialization",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
        ctx.ui.notify("/career-save requires TUI or RPC mode.", "error");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current agent run to settle before saving.", "warning");
        return;
      }
      const handle = args.trim();
      if (!VARIANT_HANDLE_PATTERN.test(handle)) {
        ctx.ui.notify("Usage: /career-save variant:<ephemeral-handle>", "warning");
        return;
      }
      try {
        const outcome = await variantSave.run(
          handle,
          ctx,
          () => engine.materializedVariantForSave(handle, ctx),
        );
        if (outcome.status === "cancelled") {
          ctx.ui.notify("Assisted-variant save cancelled; no file was written.", "info");
          return;
        }
        ctx.ui.notify(
          `${outcome.status === "existing" ? "Verified existing" : "Saved"} assisted variant: ${outcome.artifactPath}\nSidecar: ${outcome.sidecarPath}`,
          "info",
        );
      } catch (error) {
        if (error instanceof CareerRunError) {
          ctx.ui.notify(careerRunErrorMessage(error.code), "error");
          return;
        }
        ctx.ui.notify("The assisted variant could not be saved or verified.", "error");
      }
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
    variantSave.clearReceipts();
    engine.enterSession(ctx.sessionManager.getSessionId());
    managedToolActive(pi, false);
  });
  pi.on("session_tree", (_event, ctx) => {
    variantSave.clearReceipts();
    engine.resetSession(ctx.sessionManager.getSessionId());
  });
  pi.on("session_shutdown", () => {
    variantSave.clearReceipts();
    engine.shutdown();
  });
}
