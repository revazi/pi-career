// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionCommandContext, KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";

import {
  attachedApplicationSourcesForSession,
  listCatalogApplications,
  readApplicationCatalog,
} from "./application-workspace.ts";
import { loadConfig } from "./config.ts";
import { privacyDisplayPath, setupSummary } from "./renderers.ts";
import { scanLibrary } from "./scan.ts";
import type { ApplicationAttachmentPointer } from "./session-attachment.ts";

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
} as const;

export interface CareerUiItem {
  id: string;
  label: string;
  detail: string;
  pointer?: ApplicationAttachmentPointer;
}

export interface CareerUiPane {
  intro: string;
  items: CareerUiItem[];
}

export type CareerUiModel = Record<CareerUiView, CareerUiPane>;

export interface CareerUiActions {
  attach?: (pointer: ApplicationAttachmentPointer) => Promise<boolean>;
  addRoot?: () => Promise<boolean>;
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
    setup: { intro: "pi-career is not configured.", items: [] },
    library: { intro: "No resume library is configured.", items: [] },
    applications: { intro: "Application workspace is not configured.", items: [] },
    vacancy: { intro: "No persistent application is attached.", items: [] },
    match: { intro: "No persistent application is attached.", items: [] },
    analyze: { intro: "No persistent application is attached.", items: [] },
    workbench: { intro: "Workbench/assistance is never submitted from overlay navigation.", items: [] },
    workspace: { intro: "Workspace administration stays local. Opening this view does not mutate files.", items: [] },
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
        ? "No indexed resumes."
        : `${scan.records.length} indexed resume${scan.records.length === 1 ? "" : "s"}. Assisted variants are not originals.`,
      items: scan.records.map((record) => {
        const badges = [
          record.format,
          ...(record.kind === "assisted_variant" ? ["assisted variant"] : []),
          ...(record.too_large_for_core_input === true ? ["too large"] : []),
        ].join(" • ");
        return item(
          record.id,
          `${record.label} — ${badges}`,
          `${record.label}\n${badges}\nOverlay browse does not analyze or attach this resume.`,
        );
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
          ? "No persistent applications. Opening this view does not attach or activate assistance."
          : "Browse applications without attaching. Enter opens local detail. a attaches the selected valid application.",
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
      empty.vacancy = {
        intro: heading,
        items: attached.vacancy === undefined
          ? []
          : [item("vacancy", attached.vacancy.vacancy_label, `${heading}\nCurrent job description: ${attached.vacancy.vacancy_label}\nBrowse does not replace workspace files.`)],
      };
      if (attached.vacancy === undefined) empty.vacancy.intro = `${heading}\nNo current job description in the workspace.`;
      empty.match = {
        intro: heading,
        items: attached.effective_resume === undefined
          ? []
          : [item("effective", attached.effective_resume.label, `${heading}\nEffective Resume: ${attached.effective_resume.label}\nMatch is not run by opening this view.`)],
      };
      if (attached.effective_resume === undefined) empty.match.intro = `${heading}\nNo effective Resume is available.`;
      empty.analyze = {
        intro: heading,
        items: attached.selected_original === undefined
          ? []
          : [item("original", attached.selected_original.label, `${heading}\nSelected original: ${attached.selected_original.label}\nAnalyze is not run by opening this view.`)],
      };
      if (attached.selected_original === undefined) empty.analyze.intro = `${heading}\nNo selected original Resume is available.`;
      empty.workbench = {
        intro: `${heading}\nAssistance is not submitted from this overlay.`,
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

  return empty;
}

export class CareerUiSession {
  private current: CareerUiView;
  private readonly cursors: Record<CareerUiView, number>;
  private detail = false;
  private busyFlag = false;
  private model: CareerUiModel;

  constructor(
    view: CareerUiView,
    model: CareerUiModel,
    private readonly actions: CareerUiActions = {},
    private readonly reloadModel?: () => Promise<CareerUiModel>,
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

  switchView(view: CareerUiView): void {
    this.current = view;
    this.detail = false;
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
    return true;
  }

  openItem(entry: CareerUiItem): boolean {
    const index = this.pane.items.indexOf(entry);
    if (index < 0) return false;
    this.cursors[this.current] = index;
    return this.open();
  }

  back(): "list" | "close" {
    if (this.detail) {
      this.detail = false;
      return "list";
    }
    return "close";
  }

  async attach(): Promise<boolean> {
    const pointer = this.selected?.pointer;
    if (pointer === undefined || this.actions.attach === undefined || this.busyFlag) return false;
    this.busyFlag = true;
    try {
      const attached = await this.actions.attach(pointer);
      if (attached === true && this.reloadModel !== undefined) this.model = await this.reloadModel();
      return attached === true;
    } catch {
      return false;
    } finally {
      this.busyFlag = false;
    }
  }

  async addRoot(): Promise<boolean> {
    if (!this.canAddRoot || this.actions.addRoot === undefined) return false;
    this.busyFlag = true;
    try {
      const added = await this.actions.addRoot();
      if (added === true && this.reloadModel !== undefined) this.model = await this.reloadModel();
      return added === true;
    } catch {
      return false;
    } finally {
      this.busyFlag = false;
    }
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
          ...(session.canAddRoot ? [CAREER_UI_RPC_ACTIONS.addRoot] : []),
          CAREER_UI_RPC_ACTIONS.switchView,
          CAREER_UI_RPC_ACTIONS.close,
        ],
      );
      if (choice === undefined || choice === CAREER_UI_RPC_ACTIONS.close) return;
      if (choice === CAREER_UI_RPC_ACTIONS.addRoot) {
        await session.addRoot();
        continue;
      }
      if (choice === CAREER_UI_RPC_ACTIONS.switchView) {
        await switchViewRpc(ctx, session);
        continue;
      }
      const entry = options.get(choice);
      if (entry === undefined) return;
      session.openItem(entry);
      continue;
    }
    const selected = session.selected;
    const choice = await ctx.ui.select(selected?.detail ?? session.pane.intro, [
      CAREER_UI_RPC_ACTIONS.back,
      ...(session.canAttach ? [CAREER_UI_RPC_ACTIONS.attach] : []),
      CAREER_UI_RPC_ACTIONS.switchView,
      CAREER_UI_RPC_ACTIONS.close,
    ]);
    if (choice === undefined || choice === CAREER_UI_RPC_ACTIONS.close) return;
    if (choice === CAREER_UI_RPC_ACTIONS.back) {
      session.back();
      continue;
    }
    if (choice === CAREER_UI_RPC_ACTIONS.attach) {
      await session.attach();
      continue;
    }
    if (choice === CAREER_UI_RPC_ACTIONS.switchView) await switchViewRpc(ctx, session);
  }
}

function rule(theme: Theme, width: number): string {
  return theme.fg("border", "─".repeat(Math.max(1, width)));
}

function styledLines(text: string, width: number, style: (value: string) => string): string[] {
  if (text.length === 0) return [];
  return wrapTextWithAnsi(style(text), Math.max(1, width)).map((line) => truncateToWidth(line, width));
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
        this.requestRender();
        return;
      }
      this.close();
      return;
    }
    if (this.session.busy) return;
    const index = Number.parseInt(data, 10);
    const next = CAREER_UI_VIEWS[index - 1];
    if (next !== undefined) {
      this.session.switchView(next);
      this.requestRender();
      return;
    }
    if ((data === "a" || data === "A") && this.session.canAttach) {
      void this.session.attach().finally(() => this.requestRender());
      return;
    }
    if ((data === "n" || data === "N") && this.session.canAddRoot) {
      void this.session.addRoot().finally(() => this.requestRender());
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
    const addRootHint = this.session.canAddRoot ? "   n add root" : "";
    const footer = this.session.showingDetail
      ? `esc back   a attach${addRootHint}   1-8 view   no model or Core call`
      : `↑↓ move   enter open   a attach${addRootHint}   esc close   1-8 view   no model or Core call`;
    const body = this.session.showingDetail && selected !== undefined
      ? [
        "",
        ...styledLines(selected.label, renderWidth, (text) => theme.bold(theme.fg("accent", text))),
        ...selected.detail.split("\n").flatMap((line) => styledLines(line, renderWidth, (text) => theme.fg("text", text))),
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
  const session = new CareerUiSession(view, await reload(), actions, reload);
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
