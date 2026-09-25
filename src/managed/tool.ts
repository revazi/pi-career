// SPDX-License-Identifier: MIT OR Apache-2.0

import { randomUUID } from "node:crypto";

import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { careerSkillsDirectory } from "../career-paths.ts";
import { payloadFreeAdapterError, publicAdapterError } from "../errors.ts";
import { invokeCareerCli } from "../process.ts";
import type { ManagedInvoke } from "./catalog.ts";
import { CareerRunEngine } from "./engine.ts";
import { CareerRunError, careerRunError, careerRunErrorMessage } from "./errors.ts";
import { materializeEditorText, selectVariantChanges } from "./review-selector.ts";
import { validateApplicationAttachment } from "../workflow/application-workspace.ts";
import {
  applyCareerToolSurface,
  INACTIVE_CAREER_MODEL_SURFACE,
  resolveCareerModelSurface,
  type CareerModelSurface,
} from "../workflow/session-model-surface.ts";
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

function setCareerToolSurface(pi: ExtensionAPI, surface: CareerModelSurface, includeRaw = false): void {
  applyCareerToolSurface(() => pi.getActiveTools(), (names) => pi.setActiveTools(names), surface, includeRaw);
}

export function registerCareerRun(pi: ExtensionAPI, options: ManagedToolOptions = {}): void {
  const agentDir = options.agentDir ?? getAgentDir();
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? randomUUID;
  let surfaceState: CareerModelSurface = INACTIVE_CAREER_MODEL_SURFACE;
  let rawRequested = false;
  const deactivateSurface = () => {
    surfaceState = INACTIVE_CAREER_MODEL_SURFACE;
    rawRequested = false;
    setCareerToolSurface(pi, surfaceState);
  };
  const engine = new CareerRunEngine({
    pi,
    agentDir,
    invoke: options.invoke ?? invokeCareerCli,
    now,
    uuid,
    onUnavailable: deactivateSurface,
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
      try {
        onUpdate?.({
          content: [{ type: "text", text: `Running career ${params.command}…` }],
          details: { schema_version: "pi.career.run_details.v1", command: params.command },
        });
        const result = await engine.run(params, signal, ctx);
        if (params.command === "consent" && params.payload === "decline") {
          variantSave.clearReceipts();
        }
        return params.command === "variant-review" ? { ...result, terminate: true } : result;
      } catch (error) {
        // Public tool throws keep stable codes and drop foreign payloads, stacks, and Core text.
        if (error instanceof CareerRunError) throw careerRunError(error.code);
        throw payloadFreeAdapterError(publicAdapterError(error));
      }
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
        const message = error instanceof CareerRunError
          ? careerRunErrorMessage(error.code)
          : "The reviewed-change selector failed without persisting a selection.";
        try {
          ctx.ui.notify(message, "error");
        } catch {
          throw error instanceof CareerRunError
            ? careerRunError(error.code)
            : new Error("The reviewed-change selector failed without persisting a selection.");
        }
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
        const message = error instanceof CareerRunError
          ? careerRunErrorMessage(error.code)
          : "The assisted variant could not be saved or verified.";
        try {
          ctx.ui.notify(message, "error");
        } catch {
          throw error instanceof CareerRunError
            ? careerRunError(error.code)
            : new Error("The assisted variant could not be saved or verified.");
        }
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
      if (mode === "raw" && !surfaceState.careerRunActive) {
        ctx.ui.notify(careerRunErrorMessage("assistance_required"), "warning");
        return;
      }
      if (mode === "managed") {
        rawRequested = false;
        setCareerToolSurface(pi, surfaceState, false);
      } else if (mode === "raw") {
        rawRequested = true;
        setCareerToolSurface(pi, surfaceState, true);
      } else if (mode !== "status" && mode !== "") {
        ctx.ui.notify("Usage: /career-tools managed|raw|status", "warning");
        return;
      }
      const active = pi.getActiveTools();
      const activeRaw = RAW_TOOL_NAMES.filter((name) => active.includes(name));
      ctx.ui.notify(
        surfaceState.careerRunActive
          ? `Career tools: career_run active; raw Career Core tools ${activeRaw.length === 0 ? "inactive" : "active"}.`
          : "Career tools inactive.",
        "info",
      );
    },
  });

  const refreshSurface = async (ctx: ExtensionContext) => {
    surfaceState = await resolveCareerModelSurface(
      ctx.sessionManager.getBranch(),
      ctx.sessionManager.getEntries(),
      (attachment) => validateApplicationAttachment(agentDir, attachment),
    );
    if (!surfaceState.careerRunActive) rawRequested = false;
    setCareerToolSurface(pi, surfaceState, rawRequested);
    return surfaceState;
  };

  pi.on("session_start", async (_event, ctx) => {
    variantSave.clearReceipts();
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
      engine.shutdown();
      surfaceState = INACTIVE_CAREER_MODEL_SURFACE;
      rawRequested = false;
      setCareerToolSurface(pi, surfaceState);
      return;
    }
    engine.enterSession(ctx.sessionManager.getSessionId());
    rawRequested = false;
    await refreshSurface(ctx);
  });
  pi.on("session_tree", async (_event, ctx) => {
    variantSave.clearReceipts();
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
      engine.shutdown();
      surfaceState = INACTIVE_CAREER_MODEL_SURFACE;
      rawRequested = false;
      setCareerToolSurface(pi, surfaceState);
      return;
    }
    engine.resetSession(ctx.sessionManager.getSessionId());
    rawRequested = false;
    await refreshSurface(ctx);
  });
  pi.on("resources_discover", () => surfaceState.skillDiscoverable
    ? { skillPaths: [careerSkillsDirectory()] }
    : {});
  pi.on("input", async (event, ctx) => {
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") return { action: "continue" as const };
    const skillCommand = event.text.startsWith("/skill:career-core");
    if (!surfaceState.skillDiscoverable && !skillCommand) return { action: "continue" as const };
    const previous = surfaceState.skillDiscoverable;
    await refreshSurface(ctx);
    if (surfaceState.skillDiscoverable) return { action: "continue" as const };
    if (skillCommand || previous) {
      ctx.ui.notify(careerRunErrorMessage("assistance_required"), "warning");
      return { action: "handled" as const };
    }
    return { action: "continue" as const };
  });
  pi.on("session_shutdown", () => {
    variantSave.clearReceipts();
    engine.shutdown();
    rawRequested = false;
    surfaceState = INACTIVE_CAREER_MODEL_SURFACE;
  });
}
