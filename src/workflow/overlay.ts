// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionCommandContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import { attachedApplicationSourcesForSession, readApplicationCatalog } from "./application-workspace.ts";
import { loadConfig } from "./config.ts";
import { libraryIndexPreview, librarySummary, setupSummary } from "./renderers.ts";
import { scanLibrary } from "./scan.ts";

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

export type CareerOverlayPages = Record<CareerOverlayView, string>;

function localLine(_error: unknown): string {
  return "Local career data is unavailable.";
}

export async function buildCareerOverlayPages(
  agentDir: string,
  ctx: ExtensionCommandContext,
): Promise<CareerOverlayPages> {
  const persisted = ctx.sessionManager.getSessionFile() !== undefined;
  let setup = "pi-career is not configured.";
  let library = "No resume library is configured.";
  try {
    const config = await loadConfig(agentDir);
    const scan = await scanLibrary(config);
    setup = setupSummary(config, scan, persisted);
    library = [librarySummary(config, scan, persisted), libraryIndexPreview(config, scan, 20)]
      .filter(Boolean).join("\n");
  } catch (error) {
    setup = localLine(error);
    library = localLine(error);
  }

  let applications = "Application workspace is not configured.";
  try {
    const config = await loadConfig(agentDir);
    const workspace = config.application_workspace;
    if (workspace !== null) {
      const catalog = await readApplicationCatalog(workspace.root_path, workspace.root_id);
      const rows = catalog.applications.map((application) => {
        const label = application.identity === undefined
          ? "Legacy application"
          : `${application.identity.company_label} — ${application.identity.role_label}`;
        return `- ${label} — ${application.status}`;
      });
      applications = [
        rows.length === 0 ? "No persistent applications." : rows.join("\n"),
        "Opening this view does not attach an application or activate Career assistance.",
      ].join("\n");
    }
  } catch (error) {
    applications = localLine(error);
  }

  let vacancy = "No persistent application is attached.";
  let match = vacancy;
  let analyze = vacancy;
  let workbench = "Workbench/assistance is never submitted from overlay navigation.";
  let workspace = "Workspace administration stays local. Opening this view does not mutate files.";
  try {
    const attached = await attachedApplicationSourcesForSession(
      agentDir,
      ctx.sessionManager.getBranch(),
      ctx.sessionManager.getEntries(),
    );
    if (attached !== undefined) {
      const heading = `${attached.company_label} — ${attached.role_label} — ${attached.status}`;
      vacancy = attached.vacancy === undefined
        ? `${heading}\nNo current job description in the workspace.`
        : `${heading}\nCurrent job description: ${attached.vacancy.vacancy_label}`;
      match = attached.effective_resume === undefined
        ? `${heading}\nNo effective Resume is available.`
        : `${heading}\nEffective Resume: ${attached.effective_resume.label}`;
      analyze = attached.selected_original === undefined
        ? `${heading}\nNo selected original Resume is available.`
        : `${heading}\nSelected original: ${attached.selected_original.label}`;
      workbench = `${heading}\nAssistance is not submitted from this overlay. Explicit activation remains a separate action.`;
      workspace = `${heading}\nWorkspace files are the current application authority.`;
    }
  } catch (error) {
    vacancy = localLine(error);
    match = vacancy;
    analyze = vacancy;
  }

  return { setup, library, applications, vacancy, match, analyze, workbench, workspace };
}

export class CareerOverlay implements Component {
  constructor(
    readonly view: CareerOverlayView,
    private pages: CareerOverlayPages,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly requestRender: () => void,
    private readonly close: () => void,
    private current: CareerOverlayView = view,
  ) {}

  get currentView(): CareerOverlayView {
    return this.current;
  }

  handleInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.cancel") || matchesKey(data, Key.escape)) {
      this.close();
      return;
    }
    const index = Number.parseInt(data, 10);
    const next = CAREER_OVERLAY_VIEWS[index - 1];
    if (next !== undefined && next !== this.current) {
      this.current = next;
      this.requestRender();
    }
  }

  render(width: number): string[] {
    const renderWidth = Math.max(1, width);
    const nav = CAREER_OVERLAY_VIEWS.map((view, index) => {
      const label = `${index + 1}:${VIEW_LABELS[view]}`;
      return view === this.current ? this.theme.bold(this.theme.fg("accent", label)) : this.theme.fg("dim", label);
    }).join("  ");
    const body = this.pages[this.current].split("\n");
    return [
      this.theme.fg("accent", this.theme.bold(`Career • ${VIEW_LABELS[this.current]}`)),
      nav,
      ...body,
      this.theme.fg("dim", "1-8 view • Esc close • no model or Core call"),
    ].map((line) => truncateToWidth(line, renderWidth));
  }

  invalidate(): void {}
}

export async function openCareerOverlay(
  ctx: ExtensionCommandContext,
  view: CareerOverlayView,
  agentDir: string,
): Promise<void> {
  if (ctx.mode !== "tui") return;
  const pages = await buildCareerOverlayPages(agentDir, ctx);
  await ctx.ui.custom<void>((tui, theme, keybindings, done) => new CareerOverlay(
    view,
    pages,
    theme,
    keybindings,
    () => tui.requestRender(),
    () => done(undefined),
  ), {
    overlay: true,
    overlayOptions: { width: "90%", maxHeight: "80%", anchor: "center", margin: 1 },
  });
}
