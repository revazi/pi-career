// SPDX-License-Identifier: MIT OR Apache-2.0

import { randomUUID } from "node:crypto";

import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { CareerInvocationError, invokeCareerCli } from "../process.ts";
import {
  ApplicationWorkspaceWorkflow,
  attachedApplicationSourcesForSession,
} from "./application-workspace.ts";
import { openCareerUi, type CareerUiView } from "./career-ui.ts";
import { addLibraryRoot, loadConfig, writeConfig } from "./config.ts";
import {
  deriveMatchTieStateIds,
  librarySummary,
  libraryWarningPreview,
  registerWorkflowEntryRenderer,
  setupSummary,
} from "./renderers.ts";
import { scanLibrary } from "./scan.ts";
import {
  createApplicationClearEntry,
  createVacancyClearEntry,
  reconstructWorkflowState,
  withCurrentStaleness,
  workflowResultCards,
} from "./session-state.ts";
import {
  CareerWorkflowError,
  type ApplicationEntry,
  type CareerConfig,
  type LibraryScan,
  type OwnedRun,
  type WorkflowDependencies,
  type WorkflowEntryData,
  WORKFLOW_CUSTOM_TYPE,
  workflowError,
  workflowErrorMessage,
} from "./types.ts";

const SETUP_BANNER = "pi-career not configured — run /career-setup";
const EMPTY_LIBRARY_BANNER = "No resumes found — add a searchable PDF, Markdown, or text file to a configured root, then run /career-library.";
const MAX_FILTER_CHARACTERS = 200;

interface CommandRuntimeOptions {
  agentDir?: string;
  invoke?: WorkflowDependencies["invoke"];
  now?: () => Date;
  uuid?: () => string;
}

class RunOwner {
  private sequence = 0;
  private current: OwnedRun | undefined;

  constructor(private readonly uuid: () => string) {}

  start(ctx: ExtensionContext): OwnedRun {
    this.current?.controller.abort();
    const run: OwnedRun = {
      sequence: ++this.sequence,
      runId: this.uuid(),
      sessionId: ctx.sessionManager.getSessionId(),
      controller: new AbortController(),
    };
    this.current = run;
    return run;
  }

  assert(run: OwnedRun, ctx: ExtensionContext): void {
    if (
      this.current !== run ||
      run.controller.signal.aborted ||
      ctx.sessionManager.getSessionId() !== run.sessionId
    ) throw workflowError("workflow_stale");
  }

  invalidate(): void {
    this.sequence += 1;
    this.current?.controller.abort();
    this.current = undefined;
  }
}

function persisted(ctx: ExtensionContext): boolean {
  return ctx.sessionManager.getSessionFile() !== undefined;
}

function requireInteractive(ctx: ExtensionContext): void {
  if (!ctx.hasUI) throw workflowError("interactive_mode_required");
}

function parseStatusArgument(args: string): "default" | "status" {
  const value = args.trim();
  if (value === "") return "default";
  if (value === "status") return "status";
  throw workflowError("invalid_command_arguments");
}

function parseFilter(args: string): string {
  const value = args.trim();
  if (value.length > MAX_FILTER_CHARACTERS || /[\u0000-\u001f\u007f]/.test(value)) {
    throw workflowError("invalid_command_arguments");
  }
  return value.toLowerCase();
}

function applicationSummary(application: ApplicationEntry): string {
  return `${application.company_label} — ${application.role_label} — ${application.status}`;
}

async function loadLibrary(dependencies: WorkflowDependencies): Promise<{
  config: CareerConfig;
  scan: LibraryScan;
}> {
  const config = await loadConfig(dependencies.agentDir);
  return { config, scan: await scanLibrary(config) };
}

function appendData(
  pi: ExtensionAPI,
  owner: RunOwner,
  run: OwnedRun,
  ctx: ExtensionContext,
  data: WorkflowEntryData,
): void {
  owner.assert(run, ctx);
  pi.appendEntry(WORKFLOW_CUSTOM_TYPE, data);
}

export function registerCareerCommands(pi: ExtensionAPI, options: CommandRuntimeOptions = {}): void {
  const dependencies: WorkflowDependencies = {
    agentDir: options.agentDir ?? getAgentDir(),
    invoke: options.invoke ?? invokeCareerCli,
    now: options.now ?? (() => new Date()),
    uuid: options.uuid ?? randomUUID,
  };
  const owner = new RunOwner(dependencies.uuid);
  const applicationWorkspace = new ApplicationWorkspaceWorkflow({
    agentDir: dependencies.agentDir,
    now: dependencies.now,
    uuid: dependencies.uuid,
    appendEntry: (customType, data) => pi.appendEntry(customType, data),
  });
  const renderedData = new Map<string, WorkflowEntryData>();
  const renderedTieStateIds = new Set<string>();

  const attachedSources = (ctx: ExtensionContext) => attachedApplicationSourcesForSession(
    dependencies.agentDir,
    ctx.sessionManager.getBranch(),
    ctx.sessionManager.getEntries(),
  );

  const openUi = async (ctx: ExtensionCommandContext, view: CareerUiView): Promise<void> => {
    await openCareerUi(ctx, view, dependencies.agentDir, {
      attach: (pointer) => applicationWorkspace.attachCatalogPointer(ctx, pointer),
      addRoot: async () => {
        const rootPath = await ctx.ui.input("Resume root", "Absolute path");
        if (rootPath === undefined) return false;
        const confirmed = await ctx.ui.confirm(
          "Add resume root",
          "Add this resume library root to config? Indexed resumes stay local. No directory is created and Core is not called.",
        );
        if (confirmed !== true) return false;
        const config = await loadConfig(dependencies.agentDir);
        const updated = await addLibraryRoot(config, rootPath);
        await writeConfig(dependencies.agentDir, updated, dependencies.uuid);
        ctx.ui.notify("Resume root added. No files were created.", "info");
        return true;
      },
    });
  };

  const refreshState = async (ctx: ExtensionContext): Promise<{ config: CareerConfig; scan: LibraryScan }> => {
    const library = await loadLibrary(dependencies);
    const branch = ctx.sessionManager.getBranch();
    const attached = await attachedSources(ctx);
    const state = withCurrentStaleness(
      reconstructWorkflowState(branch),
      library.scan,
      attached === undefined ? undefined : attached.vacancy?.vacancy_text_sha256 ?? null,
      [
        ...(attached?.selected_original === undefined ? [] : [attached.selected_original]),
        ...(attached?.effective_resume === undefined ? [] : [attached.effective_resume]),
      ],
    );
    renderedData.clear();
    for (const entry of [
      ...(state.application === undefined ? [] : [state.application]),
      ...(state.vacancy === undefined ? [] : [state.vacancy]),
      ...(state.consent === undefined ? [] : [state.consent]),
      ...state.result_cards,
    ]) renderedData.set(entry.state_id, entry);
    renderedTieStateIds.clear();
    for (const stateId of deriveMatchTieStateIds(workflowResultCards(branch))) {
      renderedTieStateIds.add(stateId);
    }
    return library;
  };

  registerWorkflowEntryRenderer(
    pi,
    (stateId) => renderedData.get(stateId),
    (stateId) => renderedTieStateIds.has(stateId),
  );

  const handle = async (
    ctx: ExtensionCommandContext,
    action: () => Promise<void>,
  ): Promise<void> => {
    try {
      await action();
    } catch (error) {
      if (!ctx.hasUI) throw error;
      if (error instanceof CareerWorkflowError) {
        const type = error.code === "workflow_cancelled" || error.code === "workflow_stale" ? "info" : "error";
        ctx.ui.notify(workflowErrorMessage(error.code), type);
        return;
      }
      if (error instanceof CareerInvocationError) {
        ctx.ui.notify(`${error.payload.code}: ${error.payload.message}`, "error");
        return;
      }
      ctx.ui.notify(workflowErrorMessage("workflow_failed"), "error");
    }
  };

  pi.registerCommand("career", {
    description: "Open Career",
    handler: async (args, ctx) => handle(ctx, async () => {
      if (args.trim() !== "") throw workflowError("invalid_command_arguments");
      requireInteractive(ctx);
      await openUi(ctx, "applications");
    }),
  });

  pi.registerCommand("career-workspace", {
    description: "Open the Career workspace view",
    handler: async (args, ctx) => handle(ctx, async () => {
      if (args.trim() !== "") throw workflowError("invalid_command_arguments");
      requireInteractive(ctx);
      await openUi(ctx, "workspace");
    }),
  });

  pi.registerCommand("career-setup", {
    description: "Open Career setup or show configuration status",
    getArgumentCompletions: (prefix) => "status".startsWith(prefix) ? [{ value: "status", label: "status" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      const mode = parseStatusArgument(args);
      if (mode === "default") {
        await openUi(ctx, "setup");
        return;
      }
      const run = owner.start(ctx);
      const { config, scan } = await refreshState(ctx);
      owner.assert(run, ctx);
      ctx.ui.notify([setupSummary(config, scan, persisted(ctx)), libraryWarningPreview(config, scan)].filter(Boolean).join("\n"), "info");
    }),
  });

  pi.registerCommand("career-library", {
    description: "Open the Career library or show library status",
    getArgumentCompletions: (prefix) => "status".startsWith(prefix) ? [{ value: "status", label: "status" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      const mode = parseStatusArgument(args);
      if (mode === "default") {
        await openUi(ctx, "library");
        return;
      }
      const run = owner.start(ctx);
      const { config, scan } = await refreshState(ctx);
      owner.assert(run, ctx);
      ctx.ui.notify([librarySummary(config, scan, persisted(ctx)), libraryWarningPreview(config, scan)].filter(Boolean).join("\n"), "info");
    }),
  });

  pi.registerCommand("career-application", {
    description: "Open Career applications, or show or clear application context",
    getArgumentCompletions: (prefix) => ["status", "clear"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      const argument = args.trim();
      if (argument !== "" && argument !== "status" && argument !== "clear") {
        throw workflowError("invalid_command_arguments");
      }
      if (argument === "") {
        await openUi(ctx, "applications");
        return;
      }
      const run = owner.start(ctx);
      const attached = await attachedSources(ctx);
      owner.assert(run, ctx);
      if (attached !== undefined) {
        const summary = `${attached.company_label} — ${attached.role_label} — ${attached.status}`;
        if (argument === "status") {
          ctx.ui.notify(summary, "info");
          return;
        }
        const outcome = await applicationWorkspace.detachAttachedApplication(ctx);
        owner.assert(run, ctx);
        if (outcome === "cancelled") {
          ctx.ui.notify("Detach cancelled; workspace and session application files were not changed.", "info");
        }
        return;
      }
      const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
      const application = state.application;
      if (argument === "status") {
        ctx.ui.notify(
          application === undefined ? "No active career application." : applicationSummary(application),
          "info",
        );
        return;
      }
      if (application === undefined) return;
      if (state.vacancy !== undefined) {
        appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies));
      }
      appendData(pi, owner, run, ctx, createApplicationClearEntry(application, dependencies));
      ctx.ui.notify("Active application and its current vacancy were cleared; no files were changed. Use /new before creating another application.", "info");
    }),
  });

  pi.registerCommand("career-vacancy", {
    description: "Open the Career job description view, or clear the current vacancy",
    getArgumentCompletions: (prefix) => "clear".startsWith(prefix) ? [{ value: "clear", label: "clear" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      const argument = args.trim();
      if (argument !== "" && argument !== "clear") throw workflowError("invalid_command_arguments");
      if (argument === "") {
        requireInteractive(ctx);
        await openUi(ctx, "vacancy");
        return;
      }
      const run = owner.start(ctx);
      const attached = await attachedSources(ctx);
      owner.assert(run, ctx);
      if (attached !== undefined) {
        requireInteractive(ctx);
        if (attached.vacancy !== undefined) {
          const outcome = await applicationWorkspace.writeAttachedVacancy(ctx, null);
          owner.assert(run, ctx);
          if (outcome === "cancelled") {
            ctx.ui.notify("Vacancy change cancelled; workspace and session were not changed.", "info");
          }
        }
        return;
      }
      const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
      if (state.vacancy !== undefined) {
        appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies));
        if (ctx.hasUI) ctx.ui.notify("Current career vacancy cleared.", "info");
      }
    }),
  });

  pi.registerCommand("career-workbench", {
    description: "Open the Career workbench view",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      parseFilter(args);
      await openUi(ctx, "workbench");
    }),
  });

  pi.registerCommand("career-analyze", {
    description: "Open the Career analyze view",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      parseFilter(args);
      await openUi(ctx, "analyze");
    }),
  });

  pi.registerCommand("career-match", {
    description: "Open the Career match view",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      parseFilter(args);
      await openUi(ctx, "match");
    }),
  });

  pi.on("session_start", async (_event, ctx) => {
    owner.invalidate();
    try {
      const { config, scan } = await refreshState(ctx);
      if (ctx.hasUI && config.library_roots.length === 0) {
        ctx.ui.setWidget("pi-career-setup", [SETUP_BANNER]);
      } else if (ctx.hasUI && scan.records.length === 0) {
        ctx.ui.setWidget("pi-career-setup", [EMPTY_LIBRARY_BANNER]);
      } else if (ctx.hasUI) {
        ctx.ui.setWidget("pi-career-setup", undefined);
      }
    } catch {
      if (ctx.hasUI) ctx.ui.setWidget("pi-career-setup", [SETUP_BANNER]);
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    owner.invalidate();
    try {
      await refreshState(ctx);
    } catch {
      renderedData.clear();
      renderedTieStateIds.clear();
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    owner.invalidate();
    renderedData.clear();
    renderedTieStateIds.clear();
    if (ctx.hasUI) ctx.ui.setWidget("pi-career-setup", undefined);
  });
}
