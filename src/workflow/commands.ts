// SPDX-License-Identifier: MIT OR Apache-2.0

import { randomUUID } from "node:crypto";

import {
  BorderedLoader,
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { CareerInvocationError, invokeCareerCli } from "../process.ts";
import {
  ApplicationWorkspaceWorkflow,
  attachedApplicationSourcesForSession,
  selectedOriginalOptions,
} from "./application-workspace.ts";
import { openCareerUi, type CareerUiView } from "./career-ui.ts";
import { addLibraryRoot, loadConfig, removeLibraryRoot, writeConfig } from "./config.ts";
import { buildJobInput, buildJobMatchInput, buildResumeInput, serializeCoreInput } from "./core-input.ts";
import {
  deriveMatchTieStateIds,
  librarySummary,
  libraryWarningPreview,
  oversizeResultMessage,
  plainResultCard,
  registerWorkflowEntryRenderer,
  setupSummary,
  unavailableMatchResultMessage,
} from "./renderers.ts";
import {
  createResultCard,
  parseCoreJson,
  projectResumeAnalysis,
  rankMatches,
  type CoreResult,
} from "./result-projection.ts";
import { eligibleOriginals, scanLibrary } from "./scan.ts";
import {
  createApplicationClearEntry,
  createApplicationEntry,
  createConsentEntry,
  createVacancyClearEntry,
  createVacancyEntry,
  reconstructWorkflowState,
  withCurrentStaleness,
  workflowResultCards,
} from "./session-state.ts";
import { isWithinCoreCharacterLimit } from "./text-limit.ts";
import {
  CareerWorkflowError,
  type ApplicationEntry,
  type ApplicationStatus,
  type CareerConfig,
  type LibraryScan,
  type OwnedRun,
  type ResultCardEntry,
  type ResumeRecord,
  type VacancyEntry,
  type WorkflowDependencies,
  type WorkflowEntryData,
  WORKFLOW_CUSTOM_TYPE,
  workflowError,
  workflowErrorMessage,
} from "./types.ts";

const SETUP_BANNER = "pi-career not configured — run /career-setup";
const EMPTY_LIBRARY_BANNER = "No resumes found — add a searchable PDF, Markdown, or text file to a configured root, then run /career-library.";
const CONSENT_COPY =
  "Pi may save private vacancy/resume text and result cards in the current session JSONL. `pi-career` does not write documents outside the files you chose. Use `pi --no-session` for an ephemeral run. This is not secure erasure.";
const TRANSIENT_NOTICE = "Transient session: pi-career workflow entries are not written to a session JSONL.";
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

function validApplicationLabel(value: string | undefined): value is string {
  return value !== undefined &&
    value.trim().length > 0 &&
    [...value.trim()].length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function applicationSummary(application: ApplicationEntry): string {
  return `${application.company_label} — ${application.role_label} — ${application.status}`;
}

function safeAdapterCode(error: unknown): string | undefined {
  return error instanceof CareerInvocationError ? error.payload.code : undefined;
}

function isOversizeCode(code: string | undefined): code is "result_too_large" | "result_too_many_lines" {
  return code === "result_too_large" || code === "result_too_many_lines";
}

interface LoaderSuccess<T> { ok: true; value: T }
interface LoaderFailure { ok: false; error: unknown }
type LoaderResult<T> = LoaderSuccess<T> | LoaderFailure | null;

async function runOperation<T>(
  ctx: ExtensionCommandContext,
  owner: RunOwner,
  run: OwnedRun,
  label: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  owner.assert(run, ctx);
  if (ctx.mode !== "tui") {
    ctx.ui.notify(label, "info");
    const value = await operation(run.controller.signal);
    owner.assert(run, ctx);
    return value;
  }
  const result = await ctx.ui.custom<LoaderResult<T>>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(tui, theme, label);
    let settled = false;
    const finish = (value: LoaderResult<T>) => {
      if (settled) return;
      settled = true;
      done(value);
    };
    loader.onAbort = () => {
      run.controller.abort();
      finish(null);
    };
    operation(run.controller.signal)
      .then((value) => finish({ ok: true, value }))
      .catch((error: unknown) => finish({ ok: false, error }));
    return loader;
  });
  if (result === null) throw workflowError("workflow_cancelled");
  if (!result.ok) throw result.error;
  owner.assert(run, ctx);
  return result.value;
}

interface MatchQueueResult {
  matches: Array<{ resume: ResumeRecord; result: CoreResult }>;
  unavailable: Map<string, { resume: ResumeRecord; code: string }>;
}

function retainOversizeFailure(
  error: unknown,
  resume: ResumeRecord,
  unavailable: MatchQueueResult["unavailable"],
): boolean {
  const code = safeAdapterCode(error);
  if (!isOversizeCode(code)) return false;
  unavailable.set(resume.id, { resume, code });
  return true;
}

async function executeMatchQueue(
  dependencies: WorkflowDependencies,
  resumes: ResumeRecord[],
  vacancy: VacancyEntry,
  signal: AbortSignal,
): Promise<MatchQueueResult> {
  const unavailable: MatchQueueResult["unavailable"] = new Map();
  const normalized = await dependencies.invoke(
    { kind: "job", operation: "normalize", inputJson: serializeCoreInput(buildJobInput(vacancy)) },
    signal,
  );
  if (parseCoreJson(normalized.json).schema_version !== "career.job_normalization.v1") {
    throw workflowError("core_result_invalid");
  }
  for (const resume of resumes) {
    if (signal.aborted) throw workflowError("workflow_cancelled");
    try {
      const invocation = await dependencies.invoke(
        { kind: "resume", operation: "analyze", inputJson: serializeCoreInput(buildResumeInput(resume)) },
        signal,
      );
      projectResumeAnalysis(parseCoreJson(invocation.json));
    } catch (error) {
      if (!retainOversizeFailure(error, resume, unavailable)) throw error;
    }
  }
  const matches: MatchQueueResult["matches"] = [];
  for (const resume of resumes) {
    if (signal.aborted) throw workflowError("workflow_cancelled");
    try {
      const invocation = await dependencies.invoke(
        { kind: "job", operation: "match", inputJson: serializeCoreInput(buildJobMatchInput(resume, vacancy)) },
        signal,
      );
      const result = parseCoreJson(invocation.json);
      if (!unavailable.has(resume.id)) matches.push({ resume, result });
    } catch (error) {
      if (!retainOversizeFailure(error, resume, unavailable)) throw error;
    }
  }
  return { matches, unavailable };
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
  let transientNoticeSession: string | undefined;
  const renderedData = new Map<string, WorkflowEntryData>();
  const renderedTieStateIds = new Set<string>();

  const attachedSources = (ctx: ExtensionContext) => attachedApplicationSourcesForSession(
    dependencies.agentDir,
    ctx.sessionManager.getBranch(),
    ctx.sessionManager.getEntries(),
  );

  const ensureConsent = async (ctx: ExtensionCommandContext, run: OwnedRun): Promise<void> => {
    if (!persisted(ctx)) {
      if (transientNoticeSession !== run.sessionId) {
        ctx.ui.notify(TRANSIENT_NOTICE, "info");
        transientNoticeSession = run.sessionId;
      }
      return;
    }
    const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
    if (state.consent?.granted === true) return;
    const choice = await ctx.ui.select(CONSENT_COPY, [
      "Continue in this session",
      "Cancel and restart with --no-session",
    ]);
    owner.assert(run, ctx);
    const granted = choice === "Continue in this session";
    appendData(pi, owner, run, ctx, createConsentEntry(granted, dependencies));
    if (!granted) throw workflowError("consent_required");
  };

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
      removeRoot: async (rootId) => {
        const confirmed = await ctx.ui.confirm(
          "Remove resume root",
          "Remove this resume root from config? No files are changed.",
        );
        if (confirmed !== true) return false;
        const config = await loadConfig(dependencies.agentDir);
        const updated = removeLibraryRoot(config, rootId);
        await writeConfig(dependencies.agentDir, updated, dependencies.uuid);
        ctx.ui.notify("Resume root removed from config; no files were changed.", "info");
        return true;
      },
      rescan: async () => true,
      createApplication: async () => {
        const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        if (state.application !== undefined) {
          ctx.ui.notify("This session already has an application. Use /new before creating another.", "warning");
          return false;
        }
        if (state.application_context_seen === true) {
          ctx.ui.notify("This session already contained an application. Run /new, then create another application, to keep company contexts separate.", "warning");
          return false;
        }
        const company = await ctx.ui.input("Company", "Company name");
        if (company === undefined) return false;
        if (!validApplicationLabel(company)) throw workflowError("invalid_command_arguments");
        const role = await ctx.ui.input("Role", "Role title");
        if (role === undefined) return false;
        if (!validApplicationLabel(role)) throw workflowError("invalid_command_arguments");
        const confirmed = await ctx.ui.confirm(
          "Create application",
          "Create this application? It is not attached until you confirm attach. Career assistance stays inactive.",
        );
        if (confirmed !== true) return false;
        const run = owner.start(ctx);
        await ensureConsent(ctx, run);
        const created = createApplicationEntry(company, role, "preparing", dependencies);
        appendData(pi, owner, run, ctx, created);
        if (pi.getSessionName() === undefined) pi.setSessionName(`${created.company_label} — ${created.role_label}`);
        const config = await loadConfig(dependencies.agentDir);
        if (config.application_workspace !== null) {
          await applicationWorkspace.initializeCurrentApplication(ctx);
        } else {
          ctx.ui.notify(
            `${applicationSummary(created)}\nApplication context is session-scoped; no workspace files were created.`,
            "info",
          );
        }
        return true;
      },
      updateStatus: async () => {
        const statuses = new Map<string, ApplicationStatus>([
          ["Preparing", "preparing"],
          ["Applied", "applied"],
          ["Interviewing", "interviewing"],
          ["Closed", "closed"],
        ]);
        const selected = await ctx.ui.select("Application status", [...statuses.keys()]);
        const status = selected === undefined ? undefined : statuses.get(selected);
        if (status === undefined) return false;
        const attached = await attachedSources(ctx);
        if (attached !== undefined) {
          const outcome = await applicationWorkspace.writeAttachedStatus(ctx, status);
          return outcome === "written";
        }
        const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        if (state.application === undefined) {
          ctx.ui.notify("No active career application.", "warning");
          return false;
        }
        const run = owner.start(ctx);
        await ensureConsent(ctx, run);
        const updated = createApplicationEntry(
          state.application.company_label,
          state.application.role_label,
          status,
          dependencies,
          state.application.application_id,
        );
        appendData(pi, owner, run, ctx, updated);
        ctx.ui.notify(applicationSummary(updated), "info");
        return true;
      },
      editVacancy: async () => {
        const attached = await attachedSources(ctx);
        const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        const current = attached?.vacancy ?? state.vacancy;
        const edited = await ctx.ui.editor(
          current === undefined ? "Paste career vacancy" : "Replace career vacancy",
          current?.vacancy_text ?? "",
        );
        if (edited === undefined) return false;
        const text = edited.replace(/\r\n?/g, "\n");
        if (text.trim().length === 0 || !isWithinCoreCharacterLimit(text)) {
          throw workflowError("invalid_command_arguments");
        }
        const run = owner.start(ctx);
        const applicationId = attached?.application_id ?? state.application?.application_id;
        const vacancy = createVacancyEntry(text, current === undefined ? "paste" : "replace", {
          ...dependencies,
          ...(applicationId === undefined ? {} : { applicationId }),
        });
        await runOperation(ctx, owner, run, "Validating vacancy with Career Core…", async (signal) => {
          const result = await dependencies.invoke(
            { kind: "job", operation: "normalize", inputJson: serializeCoreInput(buildJobInput(vacancy)) },
            signal,
          );
          const parsed = parseCoreJson(result.json);
          if (parsed.schema_version !== "career.job_normalization.v1") throw workflowError("core_result_invalid");
        });
        if (attached !== undefined) {
          const outcome = await applicationWorkspace.writeAttachedVacancy(ctx, text);
          return outcome === "written";
        }
        await ensureConsent(ctx, run);
        appendData(pi, owner, run, ctx, vacancy);
        ctx.ui.notify(`Current vacancy: ${vacancy.vacancy_label}`, "info");
        return true;
      },
      selectOriginal: async () => {
        const attached = await attachedSources(ctx);
        if (attached === undefined) {
          ctx.ui.notify("Attach an application before binding its selected original. No files were changed.", "warning");
          return false;
        }
        const outcome = await applicationWorkspace.selectAttachedOriginal(ctx);
        return outcome === "written" || outcome === "unchanged";
      },
      analyze: async () => {
        const attached = await attachedSources(ctx);
        if (attached !== undefined && attached.selected_original === undefined) {
          ctx.ui.notify("Select an original resume with o before analyzing this attached application.", "warning");
          return false;
        }
        const confirmed = await ctx.ui.confirm(
          "Run analyze",
          "Run deterministic resume analysis with Career Core? This does not call a model or attach an application.",
        );
        if (confirmed !== true) return false;
        const run = owner.start(ctx);
        const { scan } = await refreshState(ctx);
        let resume: ResumeRecord | undefined = attached?.selected_original;
        if (resume === undefined) {
          const originals = eligibleOriginals(scan);
          if (originals.length === 0) throw workflowError("library_empty");
          if (originals.length === 1) {
            resume = originals[0];
          } else {
            const byOption = new Map(selectedOriginalOptions(originals).map(({ option, record }) => [option, record]));
            const chosen = await ctx.ui.select("Choose an original resume", [...byOption.keys()]);
            resume = chosen === undefined ? undefined : byOption.get(chosen);
            if (resume === undefined) return false;
          }
        }
        if (resume === undefined) throw workflowError("library_empty");
        await ensureConsent(ctx, run);
        let result: CoreResult;
        try {
          result = await runOperation(ctx, owner, run, "Running deterministic resume analysis…", async (signal) => {
            if (attached !== undefined) {
              const fresh = await attachedSources(ctx);
              owner.assert(run, ctx);
              if (fresh?.application_id !== attached.application_id ||
                fresh.selected_original?.text_sha256 !== resume.text_sha256 ||
                fresh.selected_original?.id !== resume.id) throw workflowError("workspace_drift");
            }
            const invocation = await dependencies.invoke(
              { kind: "resume", operation: "analyze", inputJson: serializeCoreInput(buildResumeInput(resume)) },
              signal,
            );
            return parseCoreJson(invocation.json);
          });
        } catch (error) {
          const code = safeAdapterCode(error);
          if (isOversizeCode(code)) {
            ctx.ui.notify(oversizeResultMessage("career-analyze", run.runId, code), "error");
            return false;
          }
          throw error;
        }
        const projection = projectResumeAnalysis(result);
        const currentState = reconstructWorkflowState(ctx.sessionManager.getBranch());
        const applicationId = attached?.application_id ?? currentState.application?.application_id;
        const card = createResultCard({
          workflow: "analyze",
          ...(applicationId === undefined ? {} : { applicationId }),
          runId: run.runId, resume, projection,
          uuid: dependencies.uuid, now: dependencies.now,
        });
        appendData(pi, owner, run, ctx, card);
        renderedData.set(card.state_id, card);
        ctx.ui.notify(plainResultCard(card), "info");
        return true;
      },
      match: async () => {
        const attached = await attachedSources(ctx);
        if (attached !== undefined && attached.effective_resume === undefined) {
          ctx.ui.notify("Select an original resume with o before matching this attached application.", "warning");
          return false;
        }
        const confirmed = await ctx.ui.confirm(
          "Run match",
          "Run deterministic career match with Career Core? This does not call a model or attach an application.",
        );
        if (confirmed !== true) return false;
        const run = owner.start(ctx);
        const { scan } = await refreshState(ctx);
        const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        const vacancy = attached === undefined ? state.vacancy : attached.vacancy;
        if (vacancy === undefined) throw workflowError("vacancy_required");
        let selected = attached?.effective_resume === undefined ? eligibleOriginals(scan) : [attached.effective_resume];
        if (selected.length === 0) throw workflowError("library_empty");
        if (attached === undefined && selected.length > 1) {
          const options = selectedOriginalOptions(selected);
          const byOption = new Map(options.map(({ option, record }) => [option, record]));
          const chosen = await ctx.ui.select("Choose an original resume", [...byOption.keys()]);
          const resume = chosen === undefined ? undefined : byOption.get(chosen);
          if (resume === undefined) return false;
          selected = [resume];
        }
        await ensureConsent(ctx, run);
        const queue = await runOperation(
          ctx, owner, run, "Running deterministic career match queue…",
          async (signal) => {
            if (attached !== undefined) {
              const fresh = await attachedSources(ctx);
              owner.assert(run, ctx);
              if (fresh?.application_id !== attached.application_id ||
                fresh.effective_resume?.text_sha256 !== selected[0]?.text_sha256 ||
                fresh.effective_resume?.id !== selected[0]?.id ||
                fresh.vacancy?.vacancy_text_sha256 !== vacancy.vacancy_text_sha256) {
                throw workflowError("workspace_drift");
              }
            }
            return executeMatchQueue(dependencies, selected, vacancy, signal);
          },
        );
        const ranked = rankMatches(queue.matches);
        const applicationId = attached?.application_id ?? state.application?.application_id;
        const cards: ResultCardEntry[] = ranked.map((item) => createResultCard({
          workflow: "match",
          ...(applicationId === undefined ? {} : { applicationId }),
          runId: run.runId, resume: item.resume, vacancy,
          projection: item.projection, uuid: dependencies.uuid, now: dependencies.now,
        }));
        for (const card of cards) {
          appendData(pi, owner, run, ctx, card);
          renderedData.set(card.state_id, card);
        }
        const unavailableRows = [...queue.unavailable.values()].map((item) =>
          unavailableMatchResultMessage(run.runId, item.resume.label, item.code),
        );
        ctx.ui.notify(
          [
            ...cards.slice(0, 20).map((card, index) => `${index + 1}. ${plainResultCard(card, ranked[index]?.tie === true)}`),
            ...unavailableRows,
          ].join("\n\n"),
          ranked.length === 0 ? "error" : "info",
        );
        return ranked.length > 0;
      },
      workspace: async () => {
        await applicationWorkspace.run("", ctx);
        return true;
      },
      askPi: async () => {
        const attached = await attachedSources(ctx);
        if (attached === undefined) {
          ctx.ui.notify("Attach an application before Ask Pi. Nothing was submitted.", "warning");
          return false;
        }
        await applicationWorkspace.prepareAssistanceHandoff(ctx);
        return true;
      },
      detach: async () => {
        const outcome = await applicationWorkspace.detachAttachedApplication(ctx);
        if (outcome === "cancelled") {
          ctx.ui.notify("Detach cancelled; workspace and session application files were not changed.", "info");
          return false;
        }
        return outcome === "detached";
      },
      clearVacancy: async () => {
        const attached = await attachedSources(ctx);
        if (attached !== undefined) {
          if (attached.vacancy === undefined) return false;
          const outcome = await applicationWorkspace.writeAttachedVacancy(ctx, null);
          return outcome === "written";
        }
        const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
        if (state.vacancy === undefined) return false;
        const run = owner.start(ctx);
        appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies));
        ctx.ui.notify("Current career vacancy cleared.", "info");
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
