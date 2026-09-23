// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionCommandContext, KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";

import {
  attachedApplicationSourcesForSession,
  listCatalogApplications,
  readApplicationCatalog,
} from "./application-workspace.ts";
import { loadConfig } from "./config.ts";
import { plainResultCard, privacyDisplayPath, setupSummary } from "./renderers.ts";
import { scanLibrary } from "./scan.ts";
import type { ResumeRecord } from "./types.ts";
import { replayApplicationSessionRecords, type ApplicationAttachmentPointer } from "./session-attachment.ts";
import { reconstructWorkflowState, workspaceApplicationIdentity } from "./session-state.ts";

export const CAREER_UI_VIEWS = [
  "setup",
  "library",
  "applications",
  "vacancy",
  "match",
  "analyze",
  "workbench",
  "workspace",
] as const;

export type CareerUiView = typeof CAREER_UI_VIEWS[number];

export const CAREER_UI_COMMAND_VIEWS = {
  career: "applications",
  "career-setup": "setup",
  "career-library": "library",
  "career-application": "applications",
  "career-vacancy": "vacancy",
  "career-match": "match",
  "career-analyze": "analyze",
  "career-workbench": "workbench",
  "career-workspace": "workspace",
} as const satisfies Record<string, CareerUiView>;

export const CAREER_UI_VIEW_LABELS: Record<CareerUiView, string> = {
  setup: "Setup",
  library: "Library",
  applications: "Applications",
  vacancy: "Job description",
  match: "Match",
  analyze: "Analyze",
  workbench: "Workbench",
  workspace: "Workspace",
};

const VIEW_MARKS: Record<CareerUiView, string> = {
  setup: "◆",
  library: "▤",
  applications: "●",
  vacancy: "✎",
  match: "◎",
  analyze: "▦",
  workbench: "✦",
  workspace: "▣",
};

export const CAREER_UI_RPC_ACTIONS = {
  switchView: "Switch view",
  close: "Close",
  back: "Back",
  attach: "Attach",
  addRoot: "Add root",
  removeRoot: "Remove root",
  rescan: "Rescan",
  create: "Create application",
  analyze: "Run analyze",
  match: "Run match",
  editVacancy: "Edit job description",
  updateStatus: "Update status",
  workspace: "Manage workspace",
  askPi: "Ask Pi",
  detach: "Detach",
  clearVacancy: "Clear job description",
  selectOriginal: "Select original resume",
  preview: "Preview document (local only)",
} as const;

export interface CareerUiItem {
  id: string;
  label: string;
  detail: string;
  pointer?: ApplicationAttachmentPointer;
  /** In-memory identity only; never rendered in list/detail or persisted. */
  preview?: { source: "library" | "vacancy" | "original" | "effective"; digest: string; id: string; rootId?: string; format?: string };
}

export interface CareerUiPane {
  intro: string;
  items: CareerUiItem[];
  canSelectOriginal?: boolean;
}

export type CareerUiModel = Record<CareerUiView, CareerUiPane>;

export interface CareerUiActions {
  attach?: (pointer: ApplicationAttachmentPointer) => Promise<boolean>;
  addRoot?: () => Promise<boolean>;
  removeRoot?: (rootId: string) => Promise<boolean>;
  rescan?: () => Promise<boolean>;
  createApplication?: () => Promise<boolean>;
  analyze?: () => Promise<boolean>;
  match?: () => Promise<boolean>;
  editVacancy?: () => Promise<boolean>;
  updateStatus?: () => Promise<boolean>;
  workspace?: () => Promise<boolean>;
  askPi?: () => Promise<boolean>;
  detach?: () => Promise<boolean>;
  clearVacancy?: () => Promise<boolean>;
  selectOriginal?: () => Promise<boolean>;
}

function unavailablePane(): CareerUiPane {
  return { intro: "Local career data is unavailable.", items: [] };
}

function item(
  id: string,
  label: string,
  detail: string,
  pointer?: ApplicationAttachmentPointer,
): CareerUiItem {
  return pointer === undefined ? { id, label, detail } : { id, label, detail, pointer };
}

function resumePreview(source: "library" | "original" | "effective", record: ResumeRecord): NonNullable<CareerUiItem["preview"]> {
  return { source, digest: record.text_sha256, id: record.id, rootId: record.root_id, format: record.format };
}

// The RPC select title is also a UI surface: reject instead of silently clipping exact text.
const PREVIEW_MAX_BYTES = 12_000;
function previewText(text: string): boolean {
  return Buffer.byteLength(text, "utf8") <= PREVIEW_MAX_BYTES &&
    !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(text);
}

export function careerPreviewLoader(agentDir: string, ctx: ExtensionCommandContext) {
  return async (view: CareerUiView, reference: NonNullable<CareerUiItem["preview"]>): Promise<string | undefined> => {
    try {
      let text: string | undefined;
      if (view === "library" && reference.source === "library") {
        const scan = await scanLibrary(await loadConfig(agentDir));
        const root = scan.roots.find((entry) => entry.root_id === reference.rootId);
        if (scan.total_capped || root === undefined || root.capped || root.stale) return undefined;
        const matches = scan.records.filter((record) => record.kind === "original" &&
          record.id === reference.id && record.root_id === reference.rootId && record.format === reference.format &&
          record.text_sha256 === reference.digest && record.too_large_for_core_input !== true);
        if (matches.length !== 1) return undefined;
        text = matches[0]?.text;
      } else if ((view === "vacancy" && reference.source === "vacancy") ||
        (view === "analyze" && reference.source === "original") ||
        (view === "match" && reference.source === "effective")) {
        const attached = await attachedApplicationSourcesForSession(
          agentDir, ctx.sessionManager.getBranch(), ctx.sessionManager.getEntries(),
        );
        const record = reference.source === "original" ? attached?.selected_original : attached?.effective_resume;
        if (reference.source === "vacancy") {
          if (attached?.vacancy?.vacancy_text_sha256 !== reference.digest ||
            attached.application_id !== reference.id) return undefined;
          text = attached.vacancy.vacancy_text;
        } else {
          if (record === undefined || record.id !== reference.id || record.root_id !== reference.rootId ||
            record.format !== reference.format || record.text_sha256 !== reference.digest ||
            record.too_large_for_core_input === true ||
            (reference.source === "original" && record.kind !== "original") ||
            (reference.source === "effective" && record.kind !== "original" && record.kind !== "assisted_variant")) return undefined;
          text = record.text;
        }
      }
      return text !== undefined && previewText(text) ? text : undefined;
    } catch {
      return undefined;
    }
  };
}

function emptyCursors(): Record<CareerUiView, number> {
  return {
    setup: 0, library: 0, applications: 0, vacancy: 0, match: 0, analyze: 0, workbench: 0, workspace: 0,
  };
}

export function viewTitle(view: CareerUiView): string {
  return `Career • ${CAREER_UI_VIEW_LABELS[view]}`;
}

export async function buildCareerUiModel(
  agentDir: string,
  ctx: ExtensionCommandContext,
): Promise<CareerUiModel> {
  const persisted = ctx.sessionManager.getSessionFile() !== undefined;
  const empty: CareerUiModel = {
    setup: { intro: "pi-career is not configured. Press n to add a resume root.", items: [] },
    library: { intro: "No resume library is configured. Press n to add a root, r to rescan.", items: [] },
    applications: { intro: "Application workspace is not configured. Open Workspace and press m to configure, then c to create.", items: [] },
    vacancy: { intro: "No application is attached. Attach one, then press e to paste a job description.", items: [] },
    match: { intro: "No application is attached. Attach one or press g to match library originals against the current vacancy.", items: [] },
    analyze: { intro: "No application is attached. Press g to analyze an original resume.", items: [] },
    workbench: { intro: "Press p to prepare Ask Pi. Nothing is submitted from this view.", items: [] },
    workspace: { intro: "Press m to manage the application workspace. Opening this view does not mutate files.", items: [] },
  };

  try {
    const config = await loadConfig(agentDir);
    const scan = await scanLibrary(config);
    empty.setup = {
      intro: setupSummary(config, scan, persisted),
      items: config.library_roots.map((root) => item(
        root.id,
        root.label,
        `${root.label}\n${privacyDisplayPath(root.path)}\nIndexed resumes stay local. Opening a root does not call Core.`,
      )),
    };
    empty.library = {
      intro: scan.records.length === 0
        ? "No indexed resumes. Press n to add a root, r to rescan."
        : `${scan.records.length} indexed resume${scan.records.length === 1 ? "" : "s"}. Assisted variants are not originals.`,
      items: scan.records.map((record) => {
        const badges = [
          record.format,
          ...(record.kind === "assisted_variant" ? ["assisted variant"] : []),
          ...(record.too_large_for_core_input === true ? ["too large"] : []),
        ].join(" • ");
        const row = item(record.id, `${record.label} — ${badges}`,
          `${record.label}\n${badges}\nOverlay browse does not analyze or attach this resume.`);
        if (record.kind === "original" && record.too_large_for_core_input !== true) row.preview = resumePreview("library", record);
        return row;
      }),
    };
    const workspace = config.application_workspace;
    if (workspace !== null) {
      const catalog = await readApplicationCatalog(workspace.root_path, workspace.root_id);
      const pointers = new Map(
        (await listCatalogApplications(agentDir)).map((entry) => [entry.pointer.applicationId, entry.pointer]),
      );
      empty.applications = {
        intro: catalog.applications.length === 0
          ? "No persistent applications. Press c to create one. Creating does not attach."
          : "Browse applications without attaching. Enter opens local detail. a attaches, c creates, s updates status, d detaches.",
        items: catalog.applications.map((application) => {
          const pointer = pointers.get(application.application_id);
          const label = application.identity === undefined
            ? `Legacy application — ${application.status}`
            : `${application.identity.company_label} — ${application.identity.role_label} — ${application.status}`;
          const detail = application.identity === undefined
            ? `Legacy application\nStatus: ${application.status}\nClassification: ${application.classification}\nOpening does not attach this application.`
            : `${application.identity.company_label} — ${application.identity.role_label}\nStatus: ${application.status}\nClassification: ${application.classification}\nOpening does not attach. Press a to attach this application without activating assistance.`;
          return item(application.application_id, label, detail, pointer);
        }),
      };
    }
  } catch {
    empty.setup = unavailablePane();
    empty.library = unavailablePane();
    empty.applications = unavailablePane();
  }

  try {
    const attached = await attachedApplicationSourcesForSession(
      agentDir,
      ctx.sessionManager.getBranch(),
      ctx.sessionManager.getEntries(),
    );
    if (attached !== undefined) {
      const heading = `${attached.company_label} — ${attached.role_label} — ${attached.status}`;
      const pack = `Job description: ${attached.vacancy === undefined ? "missing" : "ready"} · Selected original: ${attached.selected_original === undefined ? "missing" : "ready"} · Effective resume: ${attached.effective_resume === undefined ? "missing" : "ready"}`;
      empty.library.canSelectOriginal = attached.can_select_original;
      empty.vacancy = {
        intro: `${heading}\n${pack}`,
        items: attached.vacancy === undefined
          ? []
          : [{ ...item("vacancy", "Current job description", `${heading}\nCurrent job description is ready. Browse does not replace workspace files.`),
            preview: { source: "vacancy", id: attached.application_id, digest: attached.vacancy.vacancy_text_sha256 } }],
      };
      if (attached.vacancy === undefined) empty.vacancy.intro = `${heading}\n${pack}\nNo current job description. Press e to paste one.`;
      empty.match = {
        intro: `${heading}\n${pack}`,
        canSelectOriginal: attached.can_select_original,
        items: attached.effective_resume === undefined
          ? []
          : [{ ...item("effective", `Effective Resume (${attached.effective_resume.kind === "assisted_variant" ? "tailored assisted" : "original"}): ${attached.effective_resume.label}`, `${heading}\nEffective Resume (${attached.effective_resume.kind === "assisted_variant" ? "tailored assisted" : "original"}): ${attached.effective_resume.label}\nMatch is not run by opening this view.`),
            preview: resumePreview("effective", attached.effective_resume) }],
      };
      if (attached.effective_resume === undefined) empty.match.intro = `${heading}\n${pack}\nNo effective Resume is available.`;
      empty.analyze = {
        intro: `${heading}\n${pack}`,
        canSelectOriginal: attached.can_select_original,
        items: attached.selected_original === undefined
          ? []
          : [{ ...item("original", attached.selected_original.label, `${heading}\nSelected original: ${attached.selected_original.label}\nAnalyze is not run by opening this view.`),
            preview: resumePreview("original", attached.selected_original) }],
      };
      if (attached.selected_original === undefined) empty.analyze.intro = `${heading}\n${pack}\nNo selected original Resume is available.`;
      empty.workbench = {
        intro: `${heading}\n${pack}\nPress p to prepare Ask Pi. Nothing is submitted.`,
        items: [item("workbench", "Career assistance", `${heading}\nExplicit activation remains a separate action. Overlay browse does not submit a message.`)],
      };
      empty.workspace = {
        intro: `${heading}\nWorkspace files are the current application authority.`,
        items: [item("workspace", "Workspace", `${heading}\nOpening this view does not mutate files or attach another application.`)],
      };
    }
  } catch {
    empty.vacancy = unavailablePane();
    empty.match = unavailablePane();
    empty.analyze = unavailablePane();
  }

  const branch = ctx.sessionManager.getBranch();
  const state = reconstructWorkflowState(branch);
  // A session row is presentation only: never infer a workspace pointer from its labels.
  // Reject conflicted/legacy identity and attachment replay rather than inventing authority.
  let sessionIdentity: ReturnType<typeof workspaceApplicationIdentity>;
  try {
    sessionIdentity = workspaceApplicationIdentity(branch);
  } catch {
    // Invalid session identity cannot be presented as a valid application.
  }
  const records = replayApplicationSessionRecords(branch, ctx.sessionManager.getEntries());
  if (sessionIdentity !== undefined && records.integrity === "valid" && records.attachment === undefined &&
    !empty.applications.items.some((entry) => entry.id === sessionIdentity.identity.application_id)) {
    const application = sessionIdentity.current;
    const sessionRow = item(
      application.application_id,
      `Current session · Not persisted — ${application.company_label} — ${application.role_label} — ${application.status}`,
      `${application.company_label} — ${application.role_label}\nStatus: ${application.status}\nCurrent session · Not persisted. Opening does not attach this application.`,
    );
    if (empty.applications.items.length === 0) {
      empty.applications.intro = "Session application is not in the workspace catalog. Press m on Workspace to persist it. Opening does not attach.";
    }
    empty.applications.items = [sessionRow, ...empty.applications.items];
  }
  const analyzeCards = state.result_cards.filter((card) => card.workflow === "analyze").slice(-5);
  const matchCards = state.result_cards.filter((card) => card.workflow === "match").slice(-5);
  if (analyzeCards.length > 0) {
    empty.analyze.items = [
      ...empty.analyze.items,
      ...analyzeCards.map((card) => item(`analyze:${card.state_id}`, plainResultCard(card).split("\n")[0] ?? card.resume_label, plainResultCard(card))),
    ];
  }
  if (matchCards.length > 0) {
    empty.match.items = [
      ...empty.match.items,
      ...matchCards.map((card) => item(`match:${card.state_id}`, plainResultCard(card).split("\n")[0] ?? card.resume_label, plainResultCard(card))),
    ];
  }

  return empty;
}

export class CareerUiSession {
  private current: CareerUiView;
  private readonly cursors: Record<CareerUiView, number>;
  private detail = false;
  private previewBody: string | undefined;
  private previewFailed = false;
  private previewGeneration = 0;
  private busyFlag = false;
  private model: CareerUiModel;

  constructor(
    view: CareerUiView,
    model: CareerUiModel,
    private readonly actions: CareerUiActions = {},
    private readonly reloadModel?: () => Promise<CareerUiModel>,
    private readonly loadPreview?: (view: CareerUiView, reference: NonNullable<CareerUiItem["preview"]>) => Promise<string | undefined>,
  ) {
    this.current = view;
    this.model = model;
    this.cursors = emptyCursors();
  }

  get view(): CareerUiView {
    return this.current;
  }

  get showingDetail(): boolean {
    return this.detail;
  }

  get preview(): string | undefined {
    return this.previewBody;
  }

  get previewError(): string | undefined {
    return this.previewFailed ? "Document preview unavailable or changed. Refresh and try again." : undefined;
  }

  cancelPreview(): void {
    this.previewGeneration++;
    this.previewBody = undefined;
    this.previewFailed = false;
  }

  get canPreview(): boolean {
    return this.detail && this.previewBody === undefined && this.selected?.preview !== undefined &&
      this.loadPreview !== undefined && !this.busyFlag;
  }

  get cursor(): number {
    return this.cursors[this.current];
  }

  get pane(): CareerUiPane {
    return this.model[this.current];
  }

  get selected(): CareerUiItem | undefined {
    return this.pane.items[this.cursor];
  }

  get busy(): boolean {
    return this.busyFlag;
  }

  get canAttach(): boolean {
    return this.selected?.pointer !== undefined && this.actions.attach !== undefined && !this.busyFlag;
  }

  get canAddRoot(): boolean {
    return (this.current === "setup" || this.current === "library") && this.actions.addRoot !== undefined && !this.busyFlag;
  }

  get canRemoveRoot(): boolean {
    return this.current === "setup" && this.selected !== undefined && this.actions.removeRoot !== undefined && !this.busyFlag;
  }

  get canRescan(): boolean {
    return (this.current === "setup" || this.current === "library") && this.actions.rescan !== undefined && !this.busyFlag;
  }

  get canCreate(): boolean {
    return this.current === "applications" && this.actions.createApplication !== undefined && !this.busyFlag;
  }

  get canAnalyze(): boolean {
    return this.current === "analyze" && this.actions.analyze !== undefined && !this.busyFlag;
  }

  get canMatch(): boolean {
    return this.current === "match" && this.actions.match !== undefined && !this.busyFlag;
  }

  get canEditVacancy(): boolean {
    return this.current === "vacancy" && this.actions.editVacancy !== undefined && !this.busyFlag;
  }

  get canUpdateStatus(): boolean {
    return this.current === "applications" && this.actions.updateStatus !== undefined && !this.busyFlag;
  }

  get canWorkspace(): boolean {
    return this.current === "workspace" && this.actions.workspace !== undefined && !this.busyFlag;
  }

  get canAskPi(): boolean {
    return this.current === "workbench" && this.actions.askPi !== undefined && !this.busyFlag;
  }

  get canDetach(): boolean {
    return this.current === "applications" && this.actions.detach !== undefined && !this.busyFlag;
  }

  get canClearVacancy(): boolean {
    return this.current === "vacancy" && this.actions.clearVacancy !== undefined && !this.busyFlag;
  }

  get canSelectOriginal(): boolean {
    return this.pane.canSelectOriginal === true && this.actions.selectOriginal !== undefined && !this.busyFlag;
  }

  rpcActions(): string[] {
    return [
      ...(this.canAttach ? [CAREER_UI_RPC_ACTIONS.attach] : []),
      ...(this.canCreate ? [CAREER_UI_RPC_ACTIONS.create] : []),
      ...(this.canAddRoot ? [CAREER_UI_RPC_ACTIONS.addRoot] : []),
      ...(this.canRemoveRoot ? [CAREER_UI_RPC_ACTIONS.removeRoot] : []),
      ...(this.canRescan ? [CAREER_UI_RPC_ACTIONS.rescan] : []),
      ...(this.canAnalyze ? [CAREER_UI_RPC_ACTIONS.analyze] : []),
      ...(this.canMatch ? [CAREER_UI_RPC_ACTIONS.match] : []),
      ...(this.canEditVacancy ? [CAREER_UI_RPC_ACTIONS.editVacancy] : []),
      ...(this.canUpdateStatus ? [CAREER_UI_RPC_ACTIONS.updateStatus] : []),
      ...(this.canWorkspace ? [CAREER_UI_RPC_ACTIONS.workspace] : []),
      ...(this.canAskPi ? [CAREER_UI_RPC_ACTIONS.askPi] : []),
      ...(this.canDetach ? [CAREER_UI_RPC_ACTIONS.detach] : []),
      ...(this.canClearVacancy ? [CAREER_UI_RPC_ACTIONS.clearVacancy] : []),
      ...(this.canSelectOriginal ? [CAREER_UI_RPC_ACTIONS.selectOriginal] : []),
      ...(this.canPreview ? [CAREER_UI_RPC_ACTIONS.preview] : []),
    ];
  }

  switchView(view: CareerUiView): void {
    if (this.busyFlag) return;
    this.current = view;
    this.detail = false;
    this.cancelPreview();
  }

  move(delta: number): void {
    const items = this.pane.items;
    if (items.length === 0) return;
    this.cursors[this.current] = (this.cursor + delta + items.length) % items.length;
  }

  highlight(index: number): void {
    if (this.pane.items[index] === undefined) return;
    this.cursors[this.current] = index;
  }

  open(): boolean {
    if (this.busyFlag || this.detail || this.selected === undefined) return false;
    this.detail = true;
    this.cancelPreview();
    return true;
  }

  openItem(entry: CareerUiItem): boolean {
    const index = this.pane.items.indexOf(entry);
    if (index < 0) return false;
    this.cursors[this.current] = index;
    return this.open();
  }

  back(): "list" | "close" {
    if (this.previewBody !== undefined) {
      this.cancelPreview();
      return "list";
    }
    if (this.detail) {
      this.detail = false;
      this.cancelPreview();
      return "list";
    }
    return "close";
  }

  private async runBound(enabled: boolean, operation: () => Promise<boolean>): Promise<boolean> {
    if (!enabled || this.busyFlag) return false;
    this.busyFlag = true;
    try {
      const ok = await operation();
      if (ok === true && this.reloadModel !== undefined) this.model = await this.reloadModel();
      return ok === true;
    } catch {
      return false;
    } finally {
      this.busyFlag = false;
    }
  }

  async openPreview(): Promise<boolean> {
    if (!this.canPreview || this.loadPreview === undefined) return false;
    const reference = this.selected?.preview;
    if (reference === undefined) return false;
    const view = this.current;
    const generation = ++this.previewGeneration;
    this.previewFailed = false;
    this.busyFlag = true;
    try {
      const text = await this.loadPreview(view, reference);
      if (generation !== this.previewGeneration) return false;
      if (text === undefined || !previewText(text) || this.current !== view ||
        this.selected?.preview !== reference || !this.detail) {
        this.previewFailed = true;
        return false;
      }
      this.previewBody = text;
      return true;
    } catch {
      if (generation === this.previewGeneration) this.previewFailed = true;
      return false;
    } finally {
      this.busyFlag = false;
    }
  }

  async attach(): Promise<boolean> {
    const pointer = this.selected?.pointer;
    const action = this.actions.attach;
    if (pointer === undefined || action === undefined) return false;
    return this.runBound(true, () => action(pointer));
  }

  async addRoot(): Promise<boolean> {
    const action = this.actions.addRoot;
    if (action === undefined) return false;
    return this.runBound(this.canAddRoot, action);
  }

  async removeRoot(): Promise<boolean> {
    const action = this.actions.removeRoot;
    const id = this.selected?.id;
    if (action === undefined || id === undefined) return false;
    return this.runBound(this.canRemoveRoot, () => action(id));
  }

  async rescan(): Promise<boolean> {
    const action = this.actions.rescan;
    if (action === undefined) return false;
    return this.runBound(this.canRescan, action);
  }

  async createApplication(): Promise<boolean> {
    const action = this.actions.createApplication;
    if (action === undefined) return false;
    return this.runBound(this.canCreate, action);
  }

  async analyze(): Promise<boolean> {
    const action = this.actions.analyze;
    if (action === undefined) return false;
    return this.runBound(this.canAnalyze, action);
  }

  async match(): Promise<boolean> {
    const action = this.actions.match;
    if (action === undefined) return false;
    return this.runBound(this.canMatch, action);
  }

  async editVacancy(): Promise<boolean> {
    const action = this.actions.editVacancy;
    if (action === undefined) return false;
    return this.runBound(this.canEditVacancy, action);
  }

  async updateStatus(): Promise<boolean> {
    const action = this.actions.updateStatus;
    if (action === undefined) return false;
    return this.runBound(this.canUpdateStatus, action);
  }

  async workspace(): Promise<boolean> {
    const action = this.actions.workspace;
    if (action === undefined) return false;
    return this.runBound(this.canWorkspace, action);
  }

  async askPi(): Promise<boolean> {
    const action = this.actions.askPi;
    if (action === undefined) return false;
    return this.runBound(this.canAskPi, action);
  }

  async detach(): Promise<boolean> {
    const action = this.actions.detach;
    if (action === undefined) return false;
    return this.runBound(this.canDetach, action);
  }

  async clearVacancy(): Promise<boolean> {
    const action = this.actions.clearVacancy;
    if (action === undefined) return false;
    return this.runBound(this.canClearVacancy, action);
  }

  async selectOriginal(): Promise<boolean> {
    const action = this.actions.selectOriginal;
    if (action === undefined) return false;
    return this.runBound(this.canSelectOriginal, action);
  }

  async runRpcAction(choice: string): Promise<boolean> {
    if (choice === CAREER_UI_RPC_ACTIONS.preview) return this.openPreview();
    if (choice === CAREER_UI_RPC_ACTIONS.attach) return this.attach();
    if (choice === CAREER_UI_RPC_ACTIONS.addRoot) return this.addRoot();
    if (choice === CAREER_UI_RPC_ACTIONS.removeRoot) return this.removeRoot();
    if (choice === CAREER_UI_RPC_ACTIONS.rescan) return this.rescan();
    if (choice === CAREER_UI_RPC_ACTIONS.create) return this.createApplication();
    if (choice === CAREER_UI_RPC_ACTIONS.analyze) return this.analyze();
    if (choice === CAREER_UI_RPC_ACTIONS.match) return this.match();
    if (choice === CAREER_UI_RPC_ACTIONS.editVacancy) return this.editVacancy();
    if (choice === CAREER_UI_RPC_ACTIONS.updateStatus) return this.updateStatus();
    if (choice === CAREER_UI_RPC_ACTIONS.workspace) return this.workspace();
    if (choice === CAREER_UI_RPC_ACTIONS.askPi) return this.askPi();
    if (choice === CAREER_UI_RPC_ACTIONS.detach) return this.detach();
    if (choice === CAREER_UI_RPC_ACTIONS.clearVacancy) return this.clearVacancy();
    if (choice === CAREER_UI_RPC_ACTIONS.selectOriginal) return this.selectOriginal();
    return false;
  }
}

function uniqueItemOptions(items: CareerUiItem[]): Map<string, CareerUiItem> {
  const counts = new Map<string, number>();
  for (const entry of items) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  const options = new Map<string, CareerUiItem>();
  for (const entry of items) {
    const total = counts.get(entry.label) ?? 1;
    const next = (seen.get(entry.label) ?? 0) + 1;
    seen.set(entry.label, next);
    options.set(total === 1 ? entry.label : `${entry.label} · ${next}`, entry);
  }
  return options;
}

async function switchViewRpc(ctx: ExtensionCommandContext, session: CareerUiSession): Promise<void> {
  const labels = CAREER_UI_VIEWS.map((view) => CAREER_UI_VIEW_LABELS[view]);
  const chosen = await ctx.ui.select(CAREER_UI_RPC_ACTIONS.switchView, labels);
  const index = chosen === undefined ? -1 : labels.indexOf(chosen);
  const view = index < 0 ? undefined : CAREER_UI_VIEWS[index];
  if (view !== undefined) session.switchView(view);
}

export async function runCareerUiRpc(
  ctx: ExtensionCommandContext,
  session: CareerUiSession,
): Promise<void> {
  while (true) {
    if (!session.showingDetail) {
      const options = uniqueItemOptions(session.pane.items);
      const choice = await ctx.ui.select(
        `${viewTitle(session.view)}\n${session.pane.intro}`,
        [
          ...options.keys(),
          ...session.rpcActions(),
          CAREER_UI_RPC_ACTIONS.switchView,
          CAREER_UI_RPC_ACTIONS.close,
        ],
      );
      if (choice === undefined || choice === CAREER_UI_RPC_ACTIONS.close) {
        session.cancelPreview();
        return;
      }
      if (choice === CAREER_UI_RPC_ACTIONS.switchView) {
        await switchViewRpc(ctx, session);
        continue;
      }
      if (session.rpcActions().includes(choice)) {
        await session.runRpcAction(choice);
        continue;
      }
      const entry = options.get(choice);
      if (entry === undefined) return;
      session.openItem(entry);
      continue;
    }
    const selected = session.selected;
    const choice = await ctx.ui.select(session.preview === undefined
      ? `${selected?.detail ?? session.pane.intro}${session.previewError === undefined ? "" : `\n${session.previewError}`}`
      : `Local document preview (exact text; close with Back)\n${session.preview}`, [
      CAREER_UI_RPC_ACTIONS.back,
      ...(session.preview === undefined ? session.rpcActions() : []),
      CAREER_UI_RPC_ACTIONS.switchView,
      CAREER_UI_RPC_ACTIONS.close,
    ]);
    if (choice === undefined || choice === CAREER_UI_RPC_ACTIONS.close) {
      session.cancelPreview();
      return;
    }
    if (choice === CAREER_UI_RPC_ACTIONS.back) {
      session.back();
      continue;
    }
    if (choice === CAREER_UI_RPC_ACTIONS.switchView) {
      await switchViewRpc(ctx, session);
      continue;
    }
    if (session.preview === undefined && session.rpcActions().includes(choice)) await session.runRpcAction(choice);
  }
}

function rule(theme: Theme, width: number): string {
  return theme.fg("border", "─".repeat(Math.max(1, width)));
}

function styledLines(text: string, width: number, style: (value: string) => string): string[] {
  if (text.length === 0) return [];
  return wrapTextWithAnsi(style(text), Math.max(1, width)).map((line) => truncateToWidth(line, width));
}

// Unlike wrapTextWithAnsi, this path must not trim spaces at soft breaks.
// Style only after wrapping so ANSI codes cannot change source segmentation.
function exactPreviewLines(text: string, width: number, style: (value: string) => string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return text.split("\n").flatMap((sourceLine) => {
    const lines: string[] = [];
    let current = "";
    for (const { segment } of segmenter.segment(sourceLine)) {
      if (current && visibleWidth(current + segment) > width) {
        lines.push(style(current));
        current = "";
      }
      // A width-one terminal cannot display a two-cell grapheme. Do not
      // silently drop it: retain the source rather than claiming truncation.
      current += segment;
    }
    lines.push(current ? style(current) : "");
    return lines;
  });
}

function packChips(chips: string[], width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const chip of chips) {
    const next = current.length === 0 ? chip : `${current}  ${chip}`;
    if (current.length > 0 && visibleWidth(next) > width) {
      lines.push(current);
      current = chip;
    } else {
      current = next;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length === 0 ? [""] : lines;
}

function itemMark(view: CareerUiView, entry: CareerUiItem): string {
  if (entry.pointer !== undefined) return "◎";
  if (view === "library") return "▤";
  if (view === "setup") return "◆";
  return "·";
}

export class CareerOverlay implements Component {
  private previewPage = 0;

  constructor(
    private readonly session: CareerUiSession,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly requestRender: () => void,
    private readonly close: () => void,
  ) {}

  get currentView(): CareerUiView {
    return this.session.view;
  }

  get showingDetail(): boolean {
    return this.session.showingDetail;
  }

  get cursor(): number {
    return this.session.cursor;
  }

  get currentItem(): CareerUiItem | undefined {
    return this.session.selected;
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.cancel") || matchesKey(data, Key.escape)) {
      if (this.session.showingDetail && !this.session.busy) {
        this.session.back();
        this.previewPage = 0;
        this.requestRender();
        return;
      }
      this.session.cancelPreview();
      this.close();
      return;
    }
    if (this.session.busy) return;
    if (this.session.preview !== undefined) {
      if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.up)) {
        this.previewPage = Math.max(0, this.previewPage - 1);
        this.requestRender();
      } else if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.down)) {
        this.previewPage++;
        this.requestRender();
      }
      return;
    }
    const index = Number.parseInt(data, 10);
    const next = CAREER_UI_VIEWS[index - 1];
    if (next !== undefined) {
      this.session.switchView(next);
      this.requestRender();
      return;
    }
    const key = data.length === 1 ? data.toLowerCase() : data;
    const keyed =
      key === "v" && this.session.canPreview ? this.session.openPreview() :
      key === "a" && this.session.canAttach ? this.session.attach() :
      key === "n" && this.session.canAddRoot ? this.session.addRoot() :
      key === "x" && this.session.canRemoveRoot ? this.session.removeRoot() :
      key === "r" && this.session.canRescan ? this.session.rescan() :
      key === "c" && this.session.canCreate ? this.session.createApplication() :
      key === "g" && this.session.canAnalyze ? this.session.analyze() :
      key === "g" && this.session.canMatch ? this.session.match() :
      key === "e" && this.session.canEditVacancy ? this.session.editVacancy() :
      key === "s" && this.session.canUpdateStatus ? this.session.updateStatus() :
      key === "m" && this.session.canWorkspace ? this.session.workspace() :
      key === "p" && this.session.canAskPi ? this.session.askPi() :
      key === "d" && this.session.canDetach ? this.session.detach() :
      key === "k" && this.session.canClearVacancy ? this.session.clearVacancy() :
      key === "o" && this.session.canSelectOriginal ? this.session.selectOriginal() :
      undefined;
    if (keyed !== undefined) {
      void keyed.finally(() => this.requestRender());
      return;
    }
    if (this.session.showingDetail) return;
    if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.up)) {
      this.session.move(-1);
      this.requestRender();
      return;
    }
    if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.down)) {
      this.session.move(1);
      this.requestRender();
      return;
    }
    if (this.keybindings.matches(data, "tui.select.confirm") || matchesKey(data, Key.return) || matchesKey(data, Key.enter)) {
      if (this.session.open()) this.requestRender();
    }
  }

  render(width: number): string[] {
    const renderWidth = Math.max(1, width);
    const theme = this.theme;
    const view = this.session.view;
    const pane = this.session.pane;
    const selected = this.session.selected;
    const header = `${theme.bold(theme.fg("accent", "◆  Career"))}${theme.fg("dim", "  ·  ")}${theme.bold(theme.fg("accent", CAREER_UI_VIEW_LABELS[view]))}${theme.fg("dim", `  ${VIEW_MARKS[view]}`)}`;
    const fullChips = CAREER_UI_VIEWS.map((name, index) => {
      const chip = `${index + 1} ${VIEW_MARKS[name]} ${CAREER_UI_VIEW_LABELS[name]}`;
      return name === view ? theme.bold(theme.fg("accent", chip)) : theme.fg("dim", chip);
    });
    const compactChips = CAREER_UI_VIEWS.map((name, index) => {
      const chip = `${index + 1}${VIEW_MARKS[name]}`;
      return name === view ? theme.bold(theme.fg("accent", chip)) : theme.fg("dim", chip);
    });
    const fullNav = packChips(fullChips, renderWidth);
    const navLines = fullNav.length > 2 ? packChips(compactChips, renderWidth) : fullNav;
    const hints = [
      ...(this.session.showingDetail ? ["esc back"] : ["↑↓ move", "enter open", "esc close"]),
      ...(this.session.canPreview ? ["v preview locally"] : []),
      ...(this.session.preview !== undefined ? ["↑↓ preview pages · soft-wrapped"] : []),
      ...(this.session.preview !== undefined ? [] : this.session.canAttach ? ["a attach"] : []),
      ...(this.session.canCreate ? ["c create"] : []),
      ...(this.session.canAddRoot ? ["n add root"] : []),
      ...(this.session.canRemoveRoot ? ["x remove"] : []),
      ...(this.session.canRescan ? ["r rescan"] : []),
      ...(this.session.canAnalyze ? ["g analyze"] : []),
      ...(this.session.canMatch ? ["g match"] : []),
      ...(this.session.canEditVacancy ? ["e edit"] : []),
      ...(this.session.canUpdateStatus ? ["s status"] : []),
      ...(this.session.canWorkspace ? ["m workspace"] : []),
      ...(this.session.canAskPi ? ["p ask Pi"] : []),
      ...(this.session.canDetach ? ["d detach"] : []),
      ...(this.session.canClearVacancy ? ["k clear"] : []),
      ...(this.session.canSelectOriginal ? ["o original"] : []),
      "1-8 view",
    ];
    const footer = hints.join("   ");
    const previewLines = this.session.preview === undefined ? undefined :
      exactPreviewLines(this.session.preview, renderWidth, (text) => theme.fg("text", text));
    const previewPages = Math.max(1, Math.ceil((previewLines?.length ?? 0) / 6));
    this.previewPage = Math.min(this.previewPage, previewPages - 1);
    const body = previewLines !== undefined
      ? ["", truncateToWidth(theme.fg("muted", `Local preview · page ${this.previewPage + 1}/${previewPages} · exact text, soft-wrapped`), renderWidth),
        ...previewLines.slice(this.previewPage * 6, (this.previewPage + 1) * 6)]
      : this.session.showingDetail && selected !== undefined
      ? [
        "",
        ...styledLines(selected.label, renderWidth, (text) => theme.bold(theme.fg("accent", text))),
        ...selected.detail.split("\n").flatMap((line) => styledLines(line, renderWidth, (text) => theme.fg("text", text))),
        ...(this.session.previewError === undefined ? [] : styledLines(this.session.previewError, renderWidth, (text) => theme.fg("muted", text))),
      ]
      : [
        "",
        ...pane.intro.split("\n").flatMap((line) => styledLines(line, renderWidth, (text) => theme.fg("muted", text))),
        "",
        ...(pane.items.length === 0
          ? styledLines("·  nothing here yet", renderWidth, (text) => theme.fg("dim", text))
          : pane.items.map((entry, index) => {
            const mark = itemMark(view, entry);
            const line = index === this.session.cursor ? `▸ ${mark}  ${entry.label}` : `  ${mark}  ${entry.label}`;
            return truncateToWidth(
              index === this.session.cursor ? theme.bold(theme.fg("accent", line)) : theme.fg("text", line),
              renderWidth,
            );
          })),
      ];
    return [
      truncateToWidth(header, renderWidth),
      truncateToWidth(rule(theme, renderWidth), renderWidth),
      ...navLines.map((line) => truncateToWidth(line, renderWidth)),
      truncateToWidth(rule(theme, renderWidth), renderWidth),
      ...body,
      "",
      truncateToWidth(rule(theme, renderWidth), renderWidth),
      ...styledLines(footer, renderWidth, (text) => theme.fg("dim", text)),
    ];
  }

  invalidate(): void {}
}

export async function openCareerUi(
  ctx: ExtensionCommandContext,
  view: CareerUiView,
  agentDir: string,
  actions: CareerUiActions = {},
): Promise<void> {
  const reload = () => buildCareerUiModel(agentDir, ctx);
  const session = new CareerUiSession(view, await reload(), actions, reload, careerPreviewLoader(agentDir, ctx));
  if (ctx.mode === "tui") {
    await ctx.ui.custom<void>((tui, theme, keybindings, done) => new CareerOverlay(
      session,
      theme,
      keybindings,
      () => tui.requestRender(),
      () => done(undefined),
    ), {
      overlay: true,
      overlayOptions: { width: "90%", maxHeight: "80%", anchor: "center", margin: 1 },
    });
    return;
  }
  await runCareerUiRpc(ctx, session);
}
