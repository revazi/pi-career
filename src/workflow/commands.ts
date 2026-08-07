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
import { addLibraryRoot, loadConfig, removeLibraryRoot, writeConfig } from "./config.ts";
import { buildJobInput, buildJobMatchInput, buildResumeInput, serializeCoreInput } from "./core-input.ts";
import {
  analyzeDetailSections,
  deriveMatchTieStateIds,
  detailText,
  libraryIndexPreview,
  librarySummary,
  libraryWarningPreview,
  matchDetailSections,
  oversizeResultMessage,
  plainResultCard,
  privacyDisplayPath,
  rankedRows,
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

const CONSENT_COPY =
  "Pi may save private vacancy/resume text and result cards in the current session JSONL. `pi-career` does not write documents outside the files you chose. Use `pi --no-session` for an ephemeral run. This is not secure erasure.";
const TRANSIENT_NOTICE = "Transient session: pi-career workflow entries are not written to a session JSONL.";
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

function safeAdapterCode(error: unknown): string | undefined {
  return error instanceof CareerInvocationError ? error.payload.code : undefined;
}

function isOversizeCode(code: string | undefined): code is "result_too_large" | "result_too_many_lines" {
  return code === "result_too_large" || code === "result_too_many_lines";
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

function filteredResumes(records: ResumeRecord[], filter: string): ResumeRecord[] {
  if (!filter) return records;
  return records.filter((record) =>
    `${record.label}\n${record.relative_path}\n${record.id}`.toLowerCase().includes(filter),
  );
}

function recordBadges(record: ResumeRecord): string {
  return [
    ...(record.format === "pdf" ? ["PDF"] : []),
    ...(record.kind === "assisted_variant" ? ["assisted variant"] : []),
    ...(record.too_large_for_core_input === true ? ["too large"] : []),
  ].join(", ");
}

function recordOption(record: ResumeRecord): string {
  const badges = recordBadges(record);
  return `${record.label}${badges ? ` — ${badges}` : ""} — ${record.id.slice(0, 12)}`;
}

function rootOption(root: CareerConfig["library_roots"][number]): string {
  return `${root.label} — ${privacyDisplayPath(root.path)} — ${root.id.slice(0, 12)}`;
}

async function loadLibrary(dependencies: WorkflowDependencies): Promise<{
  config: CareerConfig;
  scan: LibraryScan;
}> {
  const config = await loadConfig(dependencies.agentDir);
  return { config, scan: await scanLibrary(config) };
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

async function normalizeVacancy(
  dependencies: WorkflowDependencies,
  vacancy: VacancyEntry,
  signal: AbortSignal,
): Promise<void> {
  const normalized = await dependencies.invoke(
    { kind: "job", operation: "normalize", inputJson: serializeCoreInput(buildJobInput(vacancy)) },
    signal,
  );
  if (parseCoreJson(normalized.json).schema_version !== "career.job_normalization.v1") {
    throw workflowError("core_result_invalid");
  }
}

async function analyzeMatchResumes(
  dependencies: WorkflowDependencies,
  resumes: ResumeRecord[],
  signal: AbortSignal,
  unavailable: MatchQueueResult["unavailable"],
): Promise<void> {
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
}

async function matchResumes(
  dependencies: WorkflowDependencies,
  resumes: ResumeRecord[],
  vacancy: VacancyEntry,
  signal: AbortSignal,
  unavailable: MatchQueueResult["unavailable"],
): Promise<MatchQueueResult["matches"]> {
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
  return matches;
}

async function executeMatchQueue(
  dependencies: WorkflowDependencies,
  resumes: ResumeRecord[],
  vacancy: VacancyEntry,
  signal: AbortSignal,
): Promise<MatchQueueResult> {
  const unavailable: MatchQueueResult["unavailable"] = new Map();
  await normalizeVacancy(dependencies, vacancy, signal);
  await analyzeMatchResumes(dependencies, resumes, signal, unavailable);
  const matches = await matchResumes(dependencies, resumes, vacancy, signal, unavailable);
  return { matches, unavailable };
}

function matchBatchSummary(
  cards: ResultCardEntry[],
  ranked: ReturnType<typeof rankMatches>,
  unavailable: MatchQueueResult["unavailable"],
  runId: string,
): string {
  const visibleCards = cards.slice(0, 20).map((card, index) =>
    `${index + 1}. ${plainResultCard(card, ranked[index]?.tie === true)}`,
  );
  const unavailableRows = [...unavailable.values()].map((item) =>
    unavailableMatchResultMessage(runId, item.resume.label, item.code),
  );
  const sections = [
    ...(visibleCards.length === 0 ? [] : [visibleCards.join("\n\n")]),
    ...(ranked.length > visibleCards.length
      ? [`Showing ${visibleCards.length} of ${ranked.length} ranked rows.`]
      : []),
    ...(unavailableRows.length === 0 ? [] : ["Unranked result-unavailable rows:", ...unavailableRows]),
  ];
  return sections.join("\n\n");
}

async function showDetail(
  ctx: ExtensionCommandContext,
  sections: ReturnType<typeof analyzeDetailSections>,
): Promise<void> {
  const choice = await ctx.ui.select("Career detail", [...sections.map((section) => section.label), "Close"]);
  const section = sections.find((candidate) => candidate.label === choice);
  if (section !== undefined) ctx.ui.notify(detailText(section), "info");
}

export function registerCareerCommands(pi: ExtensionAPI, options: CommandRuntimeOptions = {}): void {
  const dependencies: WorkflowDependencies = {
    agentDir: options.agentDir ?? getAgentDir(),
    invoke: options.invoke ?? invokeCareerCli,
    now: options.now ?? (() => new Date()),
    uuid: options.uuid ?? randomUUID,
  };
  const owner = new RunOwner(dependencies.uuid);
  let transientNoticeSession: string | undefined;
  const renderedData = new Map<string, WorkflowEntryData>();
  const renderedTieStateIds = new Set<string>();

  const refreshState = async (ctx: ExtensionContext): Promise<{ config: CareerConfig; scan: LibraryScan }> => {
    const library = await loadLibrary(dependencies);
    const branch = ctx.sessionManager.getBranch();
    const state = withCurrentStaleness(reconstructWorkflowState(branch), library.scan);
    renderedData.clear();
    for (const entry of [
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

  pi.registerCommand("career-setup", {
    description: "Configure deterministic resume-library roots",
    getArgumentCompletions: (prefix) => "status".startsWith(prefix) ? [{ value: "status", label: "status" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      const mode = parseStatusArgument(args);
      const run = owner.start(ctx);
      const { config, scan } = await refreshState(ctx);
      owner.assert(run, ctx);
      const summary = setupSummary(config, scan, persisted(ctx));
      const notices = libraryWarningPreview(config, scan);
      if (mode === "status") {
        ctx.ui.notify([summary, notices].filter(Boolean).join("\n"), "info");
        return;
      }
      ctx.ui.notify([summary, notices].filter(Boolean).join("\n"), "info");
      if (config.library_roots.length === 0) ctx.ui.notify(SETUP_BANNER, "warning");
      else if (scan.records.length === 0) ctx.ui.notify(EMPTY_LIBRARY_BANNER, "warning");
      const action = await ctx.ui.select("Career setup", ["Add root", "Rescan", "Status", "Close"]);
      owner.assert(run, ctx);
      if (action === "Add root") {
        const rootPath = await ctx.ui.input("Resume root", "Absolute path");
        if (rootPath === undefined) return;
        const updated = await addLibraryRoot(config, rootPath);
        owner.assert(run, ctx);
        await writeConfig(dependencies.agentDir, updated, dependencies.uuid);
        owner.assert(run, ctx);
        const rescanned = await scanLibrary(updated);
        ctx.ui.notify([
          setupSummary(updated, rescanned, persisted(ctx)),
          libraryWarningPreview(updated, rescanned),
        ].filter(Boolean).join("\n"), "info");
        if (rescanned.records.length === 0) ctx.ui.notify(EMPTY_LIBRARY_BANNER, "warning");
      } else if (action === "Rescan") {
        const rescanned = await scanLibrary(config);
        owner.assert(run, ctx);
        ctx.ui.notify([
          setupSummary(config, rescanned, persisted(ctx)),
          libraryWarningPreview(config, rescanned),
        ].filter(Boolean).join("\n"), "info");
      } else if (action === "Status") {
        ctx.ui.notify([summary, notices].filter(Boolean).join("\n"), "info");
      }
    }),
  });

  pi.registerCommand("career-library", {
    description: "Browse deterministic resume-library entries",
    getArgumentCompletions: (prefix) => "status".startsWith(prefix) ? [{ value: "status", label: "status" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      const mode = parseStatusArgument(args);
      const run = owner.start(ctx);
      const { config, scan } = await refreshState(ctx);
      owner.assert(run, ctx);
      const summary = librarySummary(config, scan, persisted(ctx));
      const notices = libraryWarningPreview(config, scan);
      if (mode === "status") {
        ctx.ui.notify([summary, notices].filter(Boolean).join("\n"), "info");
        return;
      }
      const roots = config.library_roots.map(rootOption).join("\n") || "No configured roots";
      ctx.ui.notify([roots, libraryIndexPreview(config, scan), summary, notices].filter(Boolean).join("\n"), "info");
      if (config.library_roots.length > 0 && scan.records.length === 0) ctx.ui.notify(EMPTY_LIBRARY_BANNER, "warning");
      const action = await ctx.ui.select("Career library", [
        "Browse", "Add root", "Remove root", "Rescan", "Status", "Close",
      ]);
      owner.assert(run, ctx);
      if (action === "Browse") {
        if (scan.records.length === 0) {
          ctx.ui.notify(config.library_roots.length === 0 ? SETUP_BANNER : EMPTY_LIBRARY_BANNER, "warning");
          return;
        }
        const optionsByLabel = new Map(scan.records.map((record) => [recordOption(record), record]));
        const selected = await ctx.ui.select("Indexed resumes", [...optionsByLabel.keys()]);
        const record = selected === undefined ? undefined : optionsByLabel.get(selected);
        if (record !== undefined) ctx.ui.notify(recordOption(record), "info");
      } else if (action === "Add root") {
        const rootPath = await ctx.ui.input("Resume root", "Absolute path");
        if (rootPath === undefined) return;
        const updated = await addLibraryRoot(config, rootPath);
        owner.assert(run, ctx);
        await writeConfig(dependencies.agentDir, updated, dependencies.uuid);
        owner.assert(run, ctx);
        const rescanned = await scanLibrary(updated);
        ctx.ui.notify([
          "Resume root added.",
          libraryIndexPreview(updated, rescanned),
          librarySummary(updated, rescanned, persisted(ctx)),
          libraryWarningPreview(updated, rescanned),
        ].filter(Boolean).join("\n"), "info");
        if (rescanned.records.length === 0) ctx.ui.notify(EMPTY_LIBRARY_BANNER, "warning");
      } else if (action === "Remove root") {
        const byOption = new Map(config.library_roots.map((root) => [rootOption(root), root]));
        const selected = await ctx.ui.select("Remove root from config", [...byOption.keys()]);
        const root = selected === undefined ? undefined : byOption.get(selected);
        if (root === undefined) return;
        const updated = removeLibraryRoot(config, root.id);
        owner.assert(run, ctx);
        await writeConfig(dependencies.agentDir, updated, dependencies.uuid);
        ctx.ui.notify("Resume root removed from config; no files were changed.", "info");
      } else if (action === "Rescan") {
        const rescanned = await scanLibrary(config);
        owner.assert(run, ctx);
        ctx.ui.notify([
          libraryIndexPreview(config, rescanned),
          librarySummary(config, rescanned, persisted(ctx)),
          libraryWarningPreview(config, rescanned),
        ].filter(Boolean).join("\n"), "info");
      } else if (action === "Status") {
        ctx.ui.notify([summary, notices].filter(Boolean).join("\n"), "info");
      }
    }),
  });

  pi.registerCommand("career-vacancy", {
    description: "Set, view, replace, or clear the current vacancy",
    getArgumentCompletions: (prefix) => "clear".startsWith(prefix) ? [{ value: "clear", label: "clear" }] : null,
    handler: async (args, ctx) => handle(ctx, async () => {
      const argument = args.trim();
      if (argument !== "" && argument !== "clear") throw workflowError("invalid_command_arguments");
      const run = owner.start(ctx);
      const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
      if (argument === "clear") {
        if (state.vacancy !== undefined) {
          appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies));
          if (ctx.hasUI) ctx.ui.notify("Current career vacancy cleared.", "info");
        }
        return;
      }
      requireInteractive(ctx);

      let source: "paste" | "replace" = "paste";
      let prefill = "";
      if (state.vacancy !== undefined) {
        const action = await ctx.ui.select("Current career vacancy", ["Replace", "View", "Clear", "Cancel"]);
        owner.assert(run, ctx);
        if (action === "View") {
          ctx.ui.notify(`Current vacancy: ${state.vacancy.vacancy_label}`, "info");
          return;
        }
        if (action === "Clear") {
          appendData(pi, owner, run, ctx, createVacancyClearEntry(state.vacancy, dependencies));
          ctx.ui.notify("Current career vacancy cleared.", "info");
          return;
        }
        if (action !== "Replace") return;
        source = "replace";
        prefill = state.vacancy.vacancy_text;
      }

      const edited = await ctx.ui.editor(source === "replace" ? "Replace career vacancy" : "Paste career vacancy", prefill);
      if (edited === undefined) return;
      const text = edited.replace(/\r\n?/g, "\n");
      if (text.trim().length === 0 || !isWithinCoreCharacterLimit(text)) {
        throw workflowError("invalid_command_arguments");
      }
      await ensureConsent(ctx, run);
      const vacancy = createVacancyEntry(text, source, dependencies);
      await runOperation(ctx, owner, run, "Validating vacancy with Career Core…", async (signal) => {
        const result = await dependencies.invoke(
          { kind: "job", operation: "normalize", inputJson: serializeCoreInput(buildJobInput(vacancy)) },
          signal,
        );
        const parsed = parseCoreJson(result.json);
        if (parsed.schema_version !== "career.job_normalization.v1") throw workflowError("core_result_invalid");
      });
      appendData(pi, owner, run, ctx, vacancy);
      ctx.ui.notify(`Current vacancy: ${vacancy.vacancy_label}`, "info");
    }),
  });

  pi.registerCommand("career-analyze", {
    description: "Run deterministic readiness analysis for one original resume",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      const filter = parseFilter(args);
      const run = owner.start(ctx);
      const { scan } = await refreshState(ctx);
      const candidates = filteredResumes(eligibleOriginals(scan), filter);
      if (candidates.length === 0) throw workflowError("library_empty");
      const byOption = new Map(candidates.map((record) => [recordOption(record), record]));
      const selected = await ctx.ui.select("Choose an original resume", [...byOption.keys()]);
      const resume = selected === undefined ? undefined : byOption.get(selected);
      if (resume === undefined) return;
      owner.assert(run, ctx);
      await ensureConsent(ctx, run);

      let result: CoreResult;
      try {
        result = await runOperation(ctx, owner, run, "Running deterministic resume analysis…", async (signal) => {
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
          return;
        }
        throw error;
      }
      const projection = projectResumeAnalysis(result);
      const card = createResultCard({
        workflow: "analyze", runId: run.runId, resume, projection,
        uuid: dependencies.uuid, now: dependencies.now,
      });
      appendData(pi, owner, run, ctx, card);
      renderedData.set(card.state_id, card);
      ctx.ui.notify(plainResultCard(card), "info");
      const currentState = reconstructWorkflowState(ctx.sessionManager.getBranch());
      const actions = [
        "View detail",
        ...(currentState.vacancy === undefined ? [] : ["Career match this resume"]),
        "Close",
      ];
      const action = await ctx.ui.select("Career analyze result", actions);
      if (action === "View detail") {
        await showDetail(ctx, analyzeDetailSections(result));
      } else if (action === "Career match this resume") {
        ctx.ui.setEditorText(`/career-match ${resume.id}`);
        ctx.ui.notify("Prepared a deterministic single-resume career match command.", "info");
      }
    }),
  });

  pi.registerCommand("career-match", {
    description: "Deterministically rank original resumes against the current vacancy",
    handler: async (args, ctx) => handle(ctx, async () => {
      requireInteractive(ctx);
      const filter = parseFilter(args);
      const run = owner.start(ctx);
      const { scan } = await refreshState(ctx);
      const state = reconstructWorkflowState(ctx.sessionManager.getBranch());
      const vacancy = state.vacancy;
      if (vacancy === undefined) throw workflowError("vacancy_required");
      const candidates = filteredResumes(eligibleOriginals(scan), filter);
      if (candidates.length === 0) throw workflowError("library_empty");
      const scope = await ctx.ui.select("Career match", ["All original resumes", "Select subset", "Cancel"]);
      if (scope === undefined || scope === "Cancel") return;
      let selected = candidates;
      if (scope === "Select subset") {
        const remaining = new Map(candidates.map((record) => [recordOption(record), record]));
        selected = [];
        while (remaining.size > 0) {
          const choice = await ctx.ui.select("Select resumes", ["Done", ...remaining.keys()]);
          if (choice === undefined || choice === "Done") break;
          const record = remaining.get(choice);
          if (record !== undefined) {
            selected.push(record);
            remaining.delete(choice);
          }
        }
        if (selected.length === 0) return;
      }
      owner.assert(run, ctx);
      await ensureConsent(ctx, run);

      const queue = await runOperation(
        ctx,
        owner,
        run,
        "Running deterministic career match queue…",
        (signal) => executeMatchQueue(dependencies, selected, vacancy, signal),
      );

      owner.assert(run, ctx);
      const ranked = rankMatches(queue.matches);
      const cards: ResultCardEntry[] = ranked.map((item) => createResultCard({
        workflow: "match", runId: run.runId, resume: item.resume, vacancy,
        projection: item.projection, uuid: dependencies.uuid, now: dependencies.now,
      }));
      for (const card of cards) appendData(pi, owner, run, ctx, card);
      for (const card of cards) renderedData.set(card.state_id, card);
      for (const stateId of deriveMatchTieStateIds(cards)) renderedTieStateIds.add(stateId);
      ctx.ui.notify(
        matchBatchSummary(cards, ranked, queue.unavailable, run.runId),
        ranked.length === 0 ? "error" : "info",
      );
      if (ranked.length === 0) return;
      const rows = rankedRows(ranked);
      const byRow = new Map(ranked.map((item, index) => [rows[index]!, item]));
      const chosen = await ctx.ui.select("Career match detail", [...byRow.keys(), "Close"]);
      const item = chosen === undefined ? undefined : byRow.get(chosen);
      if (item !== undefined) await showDetail(ctx, matchDetailSections(item.result, vacancy.vacancy_text));
    }),
  });

  pi.on("session_start", async (_event, ctx) => {
    owner.invalidate();
    transientNoticeSession = undefined;
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
    transientNoticeSession = undefined;
    if (ctx.hasUI) ctx.ui.setWidget("pi-career-setup", undefined);
  });
}
