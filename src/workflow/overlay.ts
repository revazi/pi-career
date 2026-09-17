// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionCommandContext, KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import {
  attachedApplicationSourcesForSession,
  listCatalogApplications,
  readApplicationCatalog,
} from "./application-workspace.ts";
import { loadConfig } from "./config.ts";
import { privacyDisplayPath, setupSummary } from "./renderers.ts";
import { scanLibrary } from "./scan.ts";
import type { ApplicationAttachmentPointer } from "./session-attachment.ts";

export const CAREER_OVERLAY_VIEWS = [
  "setup",
  "library",
  "applications",
  "vacancy",
  "match",
  "analyze",
  "workbench",
  "workspace",
] as const;

export type CareerOverlayView = typeof CAREER_OVERLAY_VIEWS[number];

export const CAREER_OVERLAY_COMMAND_VIEWS = {
  career: "applications",
  "career-setup": "setup",
  "career-library": "library",
  "career-application": "applications",
  "career-vacancy": "vacancy",
  "career-match": "match",
  "career-analyze": "analyze",
  "career-workbench": "workbench",
  "career-workspace": "workspace",
} as const satisfies Record<string, CareerOverlayView>;

const VIEW_LABELS: Record<CareerOverlayView, string> = {
  setup: "Setup",
  library: "Library",
  applications: "Applications",
  vacancy: "Job description",
  match: "Match",
  analyze: "Analyze",
  workbench: "Workbench",
  workspace: "Workspace",
};

export interface CareerOverlayItem {
  id: string;
  label: string;
  detail: string;
  pointer?: ApplicationAttachmentPointer;
}

export interface CareerOverlayPane {
  intro: string;
  items: CareerOverlayItem[];
}

export type CareerOverlayModel = Record<CareerOverlayView, CareerOverlayPane>;

function unavailablePane(): CareerOverlayPane {
  return { intro: "Local career data is unavailable.", items: [] };
}

function item(
  id: string,
  label: string,
  detail: string,
  pointer?: ApplicationAttachmentPointer,
): CareerOverlayItem {
  return pointer === undefined ? { id, label, detail } : { id, label, detail, pointer };
}

export interface CareerOverlayActions {
  attach?: (pointer: ApplicationAttachmentPointer) => Promise<boolean>;
}

export async function buildCareerOverlayModel(
  agentDir: string,
  ctx: ExtensionCommandContext,
): Promise<CareerOverlayModel> {
  const persisted = ctx.sessionManager.getSessionFile() !== undefined;
  const empty: CareerOverlayModel = {
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

export class CareerOverlay implements Component {
  private current: CareerOverlayView;
  private readonly cursors: Record<CareerOverlayView, number>;
  private detail = false;
  private busy = false;
  private model: CareerOverlayModel;

  constructor(
    readonly view: CareerOverlayView,
    model: CareerOverlayModel,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly requestRender: () => void,
    private readonly close: () => void,
    private readonly actions: CareerOverlayActions = {},
    private readonly reload?: () => Promise<CareerOverlayModel>,
  ) {
    this.current = view;
    this.model = model;
    this.cursors = {
      setup: 0, library: 0, applications: 0, vacancy: 0, match: 0, analyze: 0, workbench: 0, workspace: 0,
    };
  }

  get currentView(): CareerOverlayView {
    return this.current;
  }

  get showingDetail(): boolean {
    return this.detail;
  }

  get cursor(): number {
    return this.cursors[this.current];
  }

  get currentItem(): CareerOverlayItem | undefined {
    return this.model[this.current].items[this.cursor];
  }

  private pane(): CareerOverlayPane {
    return this.model[this.current];
  }

  private move(delta: number): void {
    const items = this.pane().items;
    if (items.length === 0) return;
    this.cursors[this.current] = (this.cursor + delta + items.length) % items.length;
    this.requestRender();
  }

  private async attachSelected(): Promise<void> {
    const pointer = this.currentItem?.pointer;
    if (pointer === undefined || this.actions.attach === undefined || this.busy) return;
    this.busy = true;
    try {
      const attached = await this.actions.attach(pointer);
      if (attached === true && this.reload !== undefined) this.model = await this.reload();
    } catch {
      // Payload-free overlay: attachment failure stays in-view without leaking paths.
    } finally {
      this.busy = false;
      this.requestRender();
    }
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.cancel") || matchesKey(data, Key.escape)) {
      if (this.detail && !this.busy) {
        this.detail = false;
        this.requestRender();
        return;
      }
      this.close();
      return;
    }
    if (this.busy) return;
    const index = Number.parseInt(data, 10);
    const next = CAREER_OVERLAY_VIEWS[index - 1];
    if (next !== undefined) {
      this.current = next;
      this.detail = false;
      this.requestRender();
      return;
    }
    if ((data === "a" || data === "A") && this.currentItem?.pointer !== undefined && this.actions.attach !== undefined) {
      void this.attachSelected();
      return;
    }
    if (this.detail) return;
    if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.up)) {
      this.move(-1);
      return;
    }
    if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.down)) {
      this.move(1);
      return;
    }
    if (this.keybindings.matches(data, "tui.select.confirm") || matchesKey(data, Key.return) || matchesKey(data, Key.enter)) {
      if (this.currentItem !== undefined) {
        this.detail = true;
        this.requestRender();
      }
    }
  }

  render(width: number): string[] {
    const renderWidth = Math.max(1, width);
    const nav = CAREER_OVERLAY_VIEWS.map((view, index) => {
      const label = `${index + 1}:${VIEW_LABELS[view]}`;
      return view === this.current ? this.theme.bold(this.theme.fg("accent", label)) : this.theme.fg("dim", label);
    }).join("  ");
    const pane = this.pane();
    const selected = this.currentItem;
    const body = this.detail && selected !== undefined
      ? selected.detail.split("\n")
      : [
        pane.intro,
        ...pane.items.map((entry, index) => index === this.cursor ? `> ${entry.label}` : `  ${entry.label}`),
      ];
    const footer = this.detail
      ? "Esc back • a attach • 1-8 view • no model or Core call"
      : "↑↓ move • Enter open • a attach • Esc close • 1-8 view • no model or Core call";
    return [
      this.theme.fg("accent", this.theme.bold(`Career • ${VIEW_LABELS[this.current]}`)),
      nav,
      ...body,
      this.theme.fg("dim", footer),
    ].map((line) => truncateToWidth(line, renderWidth));
  }

  invalidate(): void {}
}

export async function openCareerOverlay(
  ctx: ExtensionCommandContext,
  view: CareerOverlayView,
  agentDir: string,
  actions: CareerOverlayActions = {},
): Promise<void> {
  if (ctx.mode !== "tui") return;
  const reload = () => buildCareerOverlayModel(agentDir, ctx);
  const model = await reload();
  await ctx.ui.custom<void>((tui, theme, keybindings, done) => new CareerOverlay(
    view,
    model,
    theme,
    keybindings,
    () => tui.requestRender(),
    () => done(undefined),
    actions,
    reload,
  ), {
    overlay: true,
    overlayOptions: { width: "90%", maxHeight: "80%", anchor: "center", margin: 1 },
  });
}
