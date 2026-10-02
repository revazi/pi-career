// SPDX-License-Identifier: MIT OR Apache-2.0

import type { ExtensionCommandContext, KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";

import { CareerInvocationError, payloadFreeAdapterError, publicAdapterMessage } from "../errors.ts";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";

import {
  attachedApplicationSourcesForSession,
  readOverlayApplications,
  validateApplicationAttachment,
} from "./application-workspace.ts";
import { loadConfig } from "./config.ts";
import { plainResultCard, privacyDisplayPath, setupSummary } from "./renderers.ts";
import { scanLibrary } from "./scan.ts";
import type { ApplicationStatus, LibraryScan, ResultCardEntry, ResumeRecord } from "./types.ts";
import { replayApplicationSessionRecords, type ApplicationAttachmentPointer } from "./session-attachment.ts";
import { reconstructWorkflowState, workflowResultCards, workspaceApplicationIdentity } from "./session-state.ts";
import { CareerWorkflowError, workflowErrorMessage } from "./types.ts";

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

/** The only peer destinations in the Career application. Other views are contextual routes. */
export const CAREER_UI_DESTINATIONS = ["applications", "library"] as const satisfies readonly CareerUiView[];
export type CareerUiDestination = typeof CAREER_UI_DESTINATIONS[number];

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
  library: "Resumes",
  applications: "Applications",
  vacancy: "Job description",
  match: "Match",
  analyze: "Analyze",
  workbench: "Ask Pi",
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
  migrate: "Finish migration",
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
  filterApplications: "Filter applications",
  filterApplicationLifecycle: "Filter by lifecycle",
  clearApplicationFilter: "Clear application filter",
} as const;

export interface CareerUiItem {
  id: string;
  label: string;
  detail: string;
  pointer?: ApplicationAttachmentPointer;
  legacyMigration?: boolean;
  applicationStatus?: ApplicationStatus;
  attachedApplication?: boolean;
  canUpdateApplication?: boolean;
  /** In-memory root identity only; never rendered or persisted. */
  libraryRootId?: string;
  /** In-memory identity only; never rendered in list/detail or persisted. */
  preview?: { source: "library" | "vacancy" | "original" | "effective"; digest: string; id: string; rootId?: string; format?: string };
}

export type CareerUiPreviewReference = NonNullable<CareerUiItem["preview"]>;

export interface CareerUiPane {
  intro: string;
  items: CareerUiItem[];
  canSelectOriginal?: boolean;
}

export type CareerUiModel = Record<CareerUiView, CareerUiPane>;

export interface CareerUiActions {
  cancelOperation?: () => void;
  /** Returns a transient, exact-text application filter; never persisted. */
  filterApplications?: () => Promise<string | undefined>;
  filterApplicationLifecycle?: () => Promise<"all" | ApplicationStatus | undefined>;
  attach?: (pointer: ApplicationAttachmentPointer) => Promise<boolean>;
  migrate?: (applicationId: string) => Promise<boolean>;
  addRoot?: () => Promise<boolean>;
  removeRoot?: (rootId: string) => Promise<boolean>;
  rescan?: () => Promise<boolean>;
  createApplication?: () => Promise<boolean>;
  analyze?: (reference?: CareerUiPreviewReference) => Promise<boolean>;
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

function applicationStatusLabel(status: ApplicationStatus): string {
  switch (status) {
    case "preparing": return "Preparing";
    case "applied": return "Applied";
    case "interviewing": return "Interviewing";
    case "closed": return "Closed";
  }
}

function packageChecklist(vacancy: boolean, original: boolean): string {
  return `Package checklist\nJob description: ${vacancy ? "Ready" : "Incomplete"}\nSelected original: ${original ? "Ready" : "Incomplete"}`;
}

export function applicationNextAction(
  components: { job_description: string; resume: string; cover_letter: string },
  analyzed: boolean,
  matched: boolean,
): string {
  if (components.job_description !== "Available") return "Next action: add or refresh the job description (e).";
  if (components.resume === "Missing") return "Next action: select an eligible Original (o), or inspect Resumes.";
  if (components.resume !== "Available") return "Next action: review the selected source in Resumes and the application workspace (m).";
  if (!analyzed) return "Next action: analyze the selected Original (g).";
  if (!matched) return "Next action: analyze match for the effective Resume (t).";
  if (components.cover_letter !== "Available") return "Next action: review the application workspace (m) to refresh or add the user-authored cover letter; tailored Resume materialization is optional.";
  return "Next action: review the complete package in Applications; Ready is derived, not a status.";
}

function applicationPackageChecklist(
  components: { job_description: string; resume: string; cover_letter: string },
  effectiveResume: "original" | "tailored" | null,
): string {
  const effective = effectiveResume === null ? "none" : effectiveResume === "original" ? "Original" : "Assisted variant (non-authoritative)";
  return [
    "Package checklist",
    `Job description: ${components.job_description === "Available" ? "Ready" : components.job_description}`,
    `Selected original: ${components.resume === "Available" ? "Ready" : components.resume}`,
    `Cover letter: ${components.cover_letter}`,
    `Effective Resume: ${components.resume} • ${effective}`,
  ].join("\n");
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

type PreviewReference = CareerUiPreviewReference;

function eligiblePreview(text: string | undefined): string | undefined {
  return text !== undefined && previewText(text) ? text : undefined;
}

async function freshLibraryPreview(agentDir: string, reference: PreviewReference): Promise<string | undefined> {
  const scan = await scanLibrary(await loadConfig(agentDir));
  const root = scan.roots.find((entry) => entry.root_id === reference.rootId);
  if (scan.total_capped || root === undefined || root.capped || root.stale) return undefined;
  const matches = scan.records.filter((record) => record.kind === "original" &&
    record.id === reference.id && record.root_id === reference.rootId && record.format === reference.format &&
    record.text_sha256 === reference.digest && record.too_large_for_core_input !== true);
  return matches.length === 1 ? matches[0]?.text : undefined;
}

async function freshAttachedPreview(agentDir: string, ctx: ExtensionCommandContext, reference: PreviewReference): Promise<string | undefined> {
  const attached = await attachedApplicationSourcesForSession(
    agentDir, ctx.sessionManager.getBranch(), ctx.sessionManager.getEntries(),
  );
  if (reference.source === "vacancy") {
    if (attached?.vacancy?.vacancy_text_sha256 !== reference.digest ||
      attached.application_id !== reference.id) return undefined;
    return attached.vacancy.vacancy_text;
  }
  const record = reference.source === "original" ? attached?.selected_original : attached?.effective_resume;
  return freshResumeText(record, reference);
}

function samePreviewRecord(record: ResumeRecord, reference: PreviewReference): boolean {
  return record.id === reference.id && record.root_id === reference.rootId &&
    record.format === reference.format && record.text_sha256 === reference.digest;
}

function freshResumeText(record: ResumeRecord | undefined, reference: PreviewReference): string | undefined {
  if (record === undefined || record.too_large_for_core_input === true || !samePreviewRecord(record, reference)) return undefined;
  if (reference.source === "original") return record.kind === "original" ? record.text : undefined;
  if (reference.source === "effective" && record.kind !== "original" && record.kind !== "assisted_variant") return undefined;
  return record.text;
}

async function freshPreviewForView(agentDir: string, ctx: ExtensionCommandContext, view: CareerUiView, reference: PreviewReference): Promise<string | undefined> {
  if (view === "library" && reference.source === "library") return freshLibraryPreview(agentDir, reference);
  const attachedView = (view === "vacancy" && reference.source === "vacancy") ||
    (view === "analyze" && reference.source === "original") ||
    (view === "match" && reference.source === "effective");
  return attachedView ? freshAttachedPreview(agentDir, ctx, reference) : undefined;
}

export function careerPreviewLoader(agentDir: string, ctx: ExtensionCommandContext) {
  return async (view: CareerUiView, reference: PreviewReference): Promise<string | undefined> => {
    try {
      return eligiblePreview(await freshPreviewForView(agentDir, ctx, view, reference));
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

export function careerUiDestination(view: CareerUiView): CareerUiDestination {
  return view === "setup" || view === "library" ? "library" : "applications";
}

export function viewTitle(view: CareerUiView): string {
  const destination = careerUiDestination(view);
  const trail = view === destination
    ? CAREER_UI_VIEW_LABELS[destination]
    : `${CAREER_UI_VIEW_LABELS[destination]} › ${CAREER_UI_VIEW_LABELS[view]}`;
  return `Career › ${trail}`;
}

const LIBRARY_NOTICE_LABELS: Record<LibraryScan["warnings"][number]["code"], string> = {
  root_stale: "root unavailable or changed",
  root_file_cap_reached: "root scan capped",
  total_file_cap_reached: "library scan capped",
  raw_file_too_large: "file exceeds scan limit",
  pdf_text_unavailable: "PDF text unavailable",
  invalid_utf8: "text encoding unreadable",
  invalid_assisted_sidecar: "assisted metadata quarantined",
  scan_entry_unavailable: "entry unavailable",
};

export function currentApplicationResults(
  cards: readonly ResultCardEntry[],
  application: NonNullable<Awaited<ReturnType<typeof attachedApplicationSourcesForSession>>>,
): { analyzed: boolean; matched: boolean } {
  const selected = application.selected_original;
  const effective = application.effective_resume;
  const vacancyDigest = application.vacancy?.vacancy_text_sha256;
  const current = cards.filter((card) => card.application_id === application.application_id);
  return {
    analyzed: selected !== undefined && current.some((card) => card.workflow === "analyze" &&
      card.resume_id === selected.id && card.input_digests.resume_text_sha256 === selected.text_sha256),
    matched: effective !== undefined && vacancyDigest !== undefined && current.some((card) => card.workflow === "match" &&
      card.resume_id === effective.id && card.input_digests.resume_text_sha256 === effective.text_sha256 &&
      card.input_digests.vacancy_text_sha256 === vacancyDigest),
  };
}

function currentAnalysis(record: ResumeRecord, cards: readonly ResultCardEntry[]): string {
  const card = [...cards].reverse().find((entry) => entry.workflow === "analyze" &&
    entry.resume_id === record.id && entry.input_digests.resume_text_sha256 === record.text_sha256);
  return card === undefined ? "Analysis: Not analyzed in this session." : `Analysis:\n${plainResultCard(card)}`;
}

export function buildCareerLibraryPane(
  scan: LibraryScan,
  cards: readonly ResultCardEntry[] = [],
): CareerUiPane {
  const rootById = new Map(scan.roots.map((root) => [root.root_id, root]));
  const records = scan.records.map((record) => {
    const authority = record.kind === "original" ? "Original" : "Assisted variant";
    const badges = [
      record.kind === "original" ? "Original" : "assisted variant",
      record.format,
      ...(record.kind === "assisted_variant" ? ["non-authoritative"] : []),
      ...(record.too_large_for_core_input === true ? ["too large"] : []),
    ].join(" • ");
    const root = rootById.get(record.root_id);
    const notices = [...new Set(scan.warnings
      .filter((warning) => warning.root_id === record.root_id &&
        (warning.relative_path === undefined || warning.relative_path === record.relative_path))
      .map((warning) => LIBRARY_NOTICE_LABELS[warning.code]))];
    const availability = record.too_large_for_core_input === true
      ? "Unavailable — too large for deterministic analysis"
      : root === undefined ? "Unavailable — root status missing"
      : root.stale ? "Unavailable — root changed or missing"
      : root.capped ? "Unavailable — root scan capped"
      : scan.total_capped ? "Unavailable — library scan capped"
      : "Available — indexed locally";
    const row = item(record.id, `${record.label} — ${badges}`,
      `${record.label}\nAuthority: ${authority}${record.kind === "assisted_variant" ? " (non-authoritative; cannot be analyzed as an original)" : " (eligible only while available and within limits)"}\nFormat: ${record.format}\nAvailability: ${availability}\n${currentAnalysis(record, cards)}\n${notices.length ? `Scan notices: ${notices.join(", ")}\n` : ""}Overlay browse does not analyze or attach this resume.`);
    row.libraryRootId = record.root_id;
    if (record.kind === "original" && record.too_large_for_core_input !== true &&
      root !== undefined && !root.stale && !root.capped && !scan.total_capped) {
      row.preview = resumePreview("library", record);
      row.detail += "\nActions: g run deterministic Analyze; x remove this resume root (confirmation required).";
    } else {
      row.detail += "\nThis resume is unavailable for Analyze; choose an available, within-limit Original.";
    }
    return row;
  });
  const notices = scan.warnings.map((warning, index) => {
    const label = LIBRARY_NOTICE_LABELS[warning.code];
    const row = item(
      `notice:${index}`,
      `Library notice — ${label}`,
      `Library scan notice\nAuthority: Quarantined or unavailable; never an Original.\nAvailability: Unavailable\nReason: ${label}\nRecovery: inspect the configured root, then run an explicit rescan.`,
    );
    row.libraryRootId = warning.root_id;
    return row;
  });
  return {
    intro: scan.records.length === 0
      ? `No indexed resumes. Press n to add a root, r to rescan.${scan.total_capped ? " Library scan capped." : ""}${scan.warnings.length > 0 ? ` ${scan.warnings.length} scan notice(s) available below.` : ""}`
      : `${scan.records.length} indexed resume${scan.records.length === 1 ? "" : "s"}. Originals and assisted variants are explicitly labeled.${scan.total_capped ? " Library scan capped." : ""}${scan.warnings.length > 0 ? ` ${scan.warnings.length} scan notice(s) available below.` : ""}`,
    items: [...records, ...notices],
  };
}

export async function buildCareerUiModel(
  agentDir: string,
  ctx: ExtensionCommandContext,
): Promise<CareerUiModel> {
  const persisted = ctx.sessionManager.getSessionFile() !== undefined;
  const branch = ctx.sessionManager.getBranch();
  const state = reconstructWorkflowState(branch);
  const attachedApplicationId = replayApplicationSessionRecords(branch, ctx.sessionManager.getEntries()).attachment?.application_id;
  const visibleResultCards = attachedApplicationId === undefined
    ? state.result_cards
    : workflowResultCards(branch).filter((card) => card.application_id === attachedApplicationId);
  const empty: CareerUiModel = {
    setup: { intro: "pi-career is not configured. Press n to add a resume root.", items: [] },
    library: { intro: "No resume library is configured. Press n to add a root, r to rescan.", items: [] },
    applications: { intro: "No application workspace is configured. Recommended next action: press m to set one up. Safe alternative: switch to Resumes; browsing stays local and makes no changes.", items: [] },
    vacancy: { intro: "No application is attached. Recommended next action: return to Applications and attach one. Safe alternative: review Resumes; no job description is changed by browsing.", items: [] },
    match: { intro: "No application is attached. Recommended next action: return to Applications and attach one. Safe alternative: use the direct route only after reviewing its prerequisites.", items: [] },
    analyze: { intro: "No application is attached. Recommended next action: choose an available Original in Resumes. Safe alternative: return to Applications; Analyze never runs while browsing.", items: [] },
    workbench: { intro: "Recommended next action: attach an application, then press p to prepare Ask Pi. Safe alternative: return to Applications. Nothing is submitted from this route.", items: [] },
    workspace: { intro: "Recommended next action: press m to manage the application workspace. Safe alternative: return to Applications. Opening this route does not mutate files.", items: [] },
  };

  try {
    const config = await loadConfig(agentDir);
    const scan = await scanLibrary(config);
    empty.setup = {
      intro: config.library_roots.length === 0
        ? `${setupSummary(config, scan, persisted)}\nPress n to add a resume root.`
        : setupSummary(config, scan, persisted),
      items: config.library_roots.map((root) => item(
        root.id,
        root.label,
        `${root.label}\n${privacyDisplayPath(root.path)}\nIndexed resumes stay local. Opening a root does not call Core.`,
      )),
    };
    empty.library = buildCareerLibraryPane(scan, visibleResultCards);
    const workspace = config.application_workspace;
    if (workspace !== null) {
      const catalog = await readOverlayApplications(agentDir, scan);
      empty.applications = {
        intro: catalog.length === 0
          ? "No applications yet. Recommended next action: press c to create one; creating does not attach. Safe alternative: manage workspace setup (m) or switch to Resumes."
          : `Browse applications without attaching. ${(() => {
            const attached = catalog.find((application) => application.application_id === attachedApplicationId);
            return attached === undefined
              ? "Next action: open an application and attach it (a) to continue."
              : "Next action: open package review (Enter) to inspect current source bindings and component state.";
          })()} Enter opens local package review. a attaches, c creates, s updates status, d detaches.`,
        items: catalog.map((application) => {
          const status = applicationStatusLabel(application.status);
          const label = application.company_label === undefined
            ? `Legacy application — ${application.status}`
            : `${application.company_label} — ${application.role_label} — ${status} — ${application.readiness}`;
          const matchState = visibleResultCards.some((card) => card.workflow === "match" &&
            card.application_id === application.application_id)
            ? "Reviewed in this session"
            : "Not analyzed in this session";
          const detail = application.company_label === undefined
            ? `Legacy application\nStatus: ${application.status}\nClassification: ${application.classification}\nRecommended next action: finish identity migration (i).\nSafe alternative: review only or return to Applications. Opening does not attach.`
            : `${application.company_label} — ${application.role_label}\nStatus: ${status}\nReadiness: ${application.readiness}\n${applicationPackageChecklist(application.components, application.effective_resume)}\nMatch: ${matchState}\nLast updated: ${application.updated_at}\nClassification: ${application.classification}\nRecommended next action: attach this application (a) to use package actions.\nSafe alternatives: review only or return to Applications. Opening does not attach.`;
          const row = item(application.application_id, label, detail, application.pointer);
          row.applicationStatus = application.status;
          if (application.classification === "legacy") row.legacyMigration = true;
          return row;
        }),
      };
    }
  } catch {
    empty.setup = unavailablePane();
    empty.library = unavailablePane();
    empty.applications = unavailablePane();
  }

  try {
    const attachedRecords = replayApplicationSessionRecords(ctx.sessionManager.getBranch(), ctx.sessionManager.getEntries());
    const attachment = attachedRecords.integrity === "valid" ? attachedRecords.attachment : undefined;
    if (attachment !== undefined) {
      const attachedRow = empty.applications.items.find((entry) => {
        const pointer = entry.pointer;
        return entry.id === attachment.application_id && pointer !== undefined &&
          pointer.applicationId === attachment.application_id && pointer.rootId === attachment.root_id &&
          pointer.rootCreatedAt === attachment.root_created_at &&
          pointer.applicationCreatedAt === attachment.application_created_at &&
          pointer.workspaceCreatedAt === attachment.workspace_created_at;
      });
      if (attachedRow !== undefined) {
        attachedRow.attachedApplication = true;
        attachedRow.canUpdateApplication = true;
        attachedRow.label += " — Attached";
        attachedRow.detail += "\nAttached to this Pi session. Lifecycle and package actions apply only to this exact application. Press m to manage its local application workspace, including user-authored cover-letter revisions.";
      }
    }
    const metadata = attachment === undefined ? undefined : await validateApplicationAttachment(agentDir, attachment);
    const attached = attachment === undefined ? undefined : await attachedApplicationSourcesForSession(
      agentDir, ctx.sessionManager.getBranch(), ctx.sessionManager.getEntries(),
    );
    if (attached !== undefined && metadata !== undefined) {
      const heading = `${metadata.company_label} — ${metadata.role_label} — ${metadata.status}`;
      const pack = packageChecklist(metadata.vacancy_bound, metadata.original_bound);
      const resultEvidence = currentApplicationResults(visibleResultCards, attached);
      const nextAction = applicationNextAction(
        attached.readiness.components,
        resultEvidence.analyzed,
        resultEvidence.matched,
      );
      empty.library.canSelectOriginal = attached.can_select_original;
      empty.applications.canSelectOriginal = attached.can_select_original;
      const attachedApplicationRow = empty.applications.items.find((entry) => entry.attachedApplication === true);
      if (attachedApplicationRow !== undefined) {
        attachedApplicationRow.detail = attachedApplicationRow.detail
          .replace(/\nRecommended next action: attach this application \(a\) to use package actions\.\nSafe alternatives: review only or return to Applications\./, "") +
          `\n${nextAction}\nSafe alternatives: update status (s), manage workspace (m), Ask Pi (p), detach (d), or return to Applications.`;
      }
      empty.vacancy = {
        intro: `${heading}\n${pack}\n${nextAction}`,
        items: attached.vacancy === undefined
          ? []
          : [{ ...item("vacancy", "Current job description", `${heading}\nCurrent job description is ready. Browse does not replace workspace files.`),
            preview: { source: "vacancy", id: attached.application_id, digest: attached.vacancy.vacancy_text_sha256 } }],
      };
      if (attached.vacancy === undefined) empty.vacancy.intro = `${heading}\n${pack}\nNo current job description. Press e to paste one.`;
      const originalBinding = attached.selected_original === undefined
        ? "Selected original source: unavailable"
        : `Selected original source: ${attached.selected_original.label}`;
      empty.match = {
        intro: `${heading}\n${pack}\n${originalBinding}\n${nextAction}`,
        canSelectOriginal: attached.can_select_original,
        items: attached.effective_resume === undefined
          ? []
          : [{ ...item("effective", `Effective Resume (${attached.effective_resume.kind === "assisted_variant" ? "tailored assisted" : "original"}): ${attached.effective_resume.label}`, `${heading}\n${originalBinding}\nEffective Resume (${attached.effective_resume.kind === "assisted_variant" ? "tailored assisted" : "original"}): ${attached.effective_resume.label}\nMatch is not run by opening this view.`),
            preview: resumePreview("effective", attached.effective_resume) }],
      };
      if (attached.effective_resume === undefined) empty.match.intro = `${heading}\n${pack}\nNo effective Resume is available.\n${nextAction}`;
      empty.analyze = {
        intro: `${heading}\n${pack}\n${nextAction}`,
        canSelectOriginal: attached.can_select_original,
        items: attached.selected_original === undefined
          ? []
          : [{ ...item("original", attached.selected_original.label, `${heading}\nSelected original: ${attached.selected_original.label}\nAnalyze is not run by opening this view.`),
            preview: resumePreview("original", attached.selected_original) }],
      };
      if (attached.selected_original === undefined) empty.analyze.intro = `${heading}\n${pack}\nNo selected original Resume is available.\n${nextAction}`;
      empty.workbench = {
        intro: `${heading}\n${pack}\n${nextAction}\nPress p to prepare Ask Pi. Nothing is submitted.`,
        items: [item("workbench", "Career assistance", `${heading}\nExplicit activation remains a separate action. Overlay browse does not submit a message.`)],
      };
      empty.workspace = {
        intro: `${heading}\n${pack}\n${nextAction}\nWorkspace files are the current application authority.`,
        items: [item("workspace", "Workspace", `${heading}\nOpening this view does not mutate files or attach another application.`)],
      };
    }
  } catch {
    empty.vacancy = unavailablePane();
    empty.match = unavailablePane();
    empty.analyze = unavailablePane();
  }

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
      `${application.company_label} — ${application.role_label}\nStatus: ${application.status}\nCurrent session · Not persisted.\nRecommended next action: manage the application workspace (m).\nSafe alternatives: update status (s) or return to Applications. Opening does not attach.`,
    );
    sessionRow.applicationStatus = application.status;
    sessionRow.canUpdateApplication = true;
    if (empty.applications.items.length === 0) {
      empty.applications.intro = "Session application is not in the workspace catalog. Press m on Workspace to persist it. Opening does not attach.";
    }
    empty.applications.items = [sessionRow, ...empty.applications.items];
  }
  const analyzeCards = visibleResultCards.filter((card) => card.workflow === "analyze").slice(-5);
  const matchCards = visibleResultCards.filter((card) => card.workflow === "match").slice(-5);
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

const MAX_APPLICATION_FILTER_CHARACTERS = 200;

/** Match only safe, rendered application projection text; no normalization or identity conflation. */
export function filterApplicationItems(
  items: CareerUiItem[],
  filter: string,
  lifecycle: "all" | ApplicationStatus = "all",
): CareerUiItem[] {
  return items.filter((entry) =>
    (lifecycle === "all" || entry.applicationStatus === lifecycle) &&
    (filter.length === 0 || `${entry.label}\n${entry.detail}`.includes(filter)),
  );
}

function validApplicationFilter(value: string): boolean {
  return value.length <= MAX_APPLICATION_FILTER_CHARACTERS && !/[\u0000-\u001f\u007f]/.test(value);
}

export class CareerUiSession {
  private current: CareerUiView;
  private readonly cursors: Record<CareerUiView, number>;
  private detail = false;
  private detailApplicationId: string | undefined;
  private previewBody: string | undefined;
  private previewFailed = false;
  private previewGeneration = 0;
  private busyFlag = false;
  private activity: "core" | "library" | undefined;
  private cancellationRequested = false;
  private filterText = "";
  private lifecycleFilter: "all" | ApplicationStatus = "all";
  private applicationCatalog: CareerUiItem[];
  private applicationIntro: string;
  private model: CareerUiModel;

  constructor(
    view: CareerUiView,
    model: CareerUiModel,
    private readonly actions: CareerUiActions = {},
    private readonly reloadModel?: () => Promise<CareerUiModel>,
    private readonly loadPreview?: (view: CareerUiView, reference: NonNullable<CareerUiItem["preview"]>) => Promise<string | undefined>,
    private readonly onFailure?: (error: unknown) => void,
  ) {
    this.current = view;
    this.model = model;
    this.applicationCatalog = [...model.applications.items];
    this.applicationIntro = model.applications.intro;
    this.cursors = emptyCursors();
    if (view === "applications") {
      const attachedIndex = this.applicationCatalog.findIndex((entry) => entry.attachedApplication === true);
      if (attachedIndex >= 0) {
        this.cursors.applications = attachedIndex;
        this.detail = true;
        this.detailApplicationId = this.applicationCatalog[attachedIndex]?.id;
      }
    }
  }

  get view(): CareerUiView {
    return this.current;
  }

  get destination(): CareerUiDestination {
    return careerUiDestination(this.current);
  }

  get canGoBack(): boolean {
    return this.detail || this.previewBody !== undefined || this.current !== this.destination;
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
    if (this.detail && this.current === "applications" && this.detailApplicationId !== undefined) {
      return this.applicationCatalog.find((entry) => entry.id === this.detailApplicationId);
    }
    return this.pane.items[this.cursor];
  }

  get busy(): boolean {
    return this.busyFlag;
  }

  get operationActive(): boolean {
    return this.busyFlag && this.activity !== undefined;
  }

  get operationLabel(): string | undefined {
    if (!this.operationActive) return undefined;
    if (this.activity === "library") return this.cancellationRequested
      ? "Cancelling Resume library rescan…"
      : "Rescanning Resume library locally…";
    return this.cancellationRequested
      ? "Cancelling deterministic Career Core action…"
      : "Running deterministic Career Core action…";
  }

  get operationCancelling(): boolean {
    return this.operationActive && this.cancellationRequested;
  }

  cancelOperation(): void {
    if (!this.operationActive || this.cancellationRequested) return;
    this.cancellationRequested = true;
    this.actions.cancelOperation?.();
  }

  get applicationFilter(): string { return this.filterText; }
  get applicationLifecycleFilter(): "all" | ApplicationStatus { return this.lifecycleFilter; }

  get canFilterApplications(): boolean {
    return this.current === "applications" && !this.detail &&
      this.actions.filterApplications !== undefined && !this.busyFlag;
  }

  get canFilterApplicationLifecycle(): boolean {
    return this.current === "applications" && !this.detail &&
      this.actions.filterApplicationLifecycle !== undefined && !this.busyFlag;
  }

  get canClearApplicationFilter(): boolean {
    return this.current === "applications" && !this.detail &&
      (this.filterText.length > 0 || this.lifecycleFilter !== "all") && !this.busyFlag;
  }

  private applyApplicationFilter(): void {
    if (this.current !== "applications") return;
    const pane = this.model.applications;
    this.model = { ...this.model, applications: {
      ...pane,
      intro: this.applicationIntro +
        (this.lifecycleFilter === "all" ? "" : ` Lifecycle: ${applicationStatusLabel(this.lifecycleFilter)}.`) +
        (this.filterText.length === 0 ? "" : ` Filter: ${this.filterText} (case-sensitive; transient).`),
      items: filterApplicationItems(this.applicationCatalog, this.filterText, this.lifecycleFilter),
    } };
    if (this.pane.items.length === 0) this.cursors.applications = 0;
    else {
      const detailIndex = this.detailApplicationId === undefined ? -1 : this.pane.items.findIndex((entry) => entry.id === this.detailApplicationId);
      this.cursors.applications = detailIndex >= 0 ? detailIndex : Math.min(this.cursors.applications, this.pane.items.length - 1);
    }
  }

  get canAttach(): boolean {
    return this.selected?.pointer !== undefined && this.selected.attachedApplication !== true &&
      this.actions.attach !== undefined && !this.busyFlag;
  }

  get canMigrate(): boolean {
    return this.current === "applications" && this.selected?.legacyMigration === true &&
      this.actions.migrate !== undefined && !this.busyFlag;
  }

  get canAddRoot(): boolean {
    return (this.current === "setup" || this.current === "library") && this.actions.addRoot !== undefined && !this.busyFlag;
  }

  get canRemoveRoot(): boolean {
    return (this.current === "setup" || this.current === "library") && this.selected !== undefined &&
      (this.current !== "library" || this.selected.libraryRootId !== undefined) &&
      this.actions.removeRoot !== undefined && !this.busyFlag;
  }

  get canRescan(): boolean {
    return (this.current === "setup" || this.current === "library") && this.actions.rescan !== undefined && !this.busyFlag;
  }

  get canCreate(): boolean {
    return this.current === "applications" && !this.detail &&
      this.actions.createApplication !== undefined && !this.busyFlag;
  }

  private get attachedApplicationDetail(): boolean {
    return this.current === "applications" && this.detail && this.selected?.attachedApplication === true;
  }

  get canAnalyze(): boolean {
    const libraryOriginal = this.current === "library" && this.selected?.preview?.source === "library";
    return (this.current === "analyze" || libraryOriginal || this.attachedApplicationDetail) &&
      this.actions.analyze !== undefined && !this.busyFlag;
  }

  get canMatch(): boolean {
    return (this.current === "match" || this.attachedApplicationDetail) &&
      this.actions.match !== undefined && !this.busyFlag;
  }

  get canEditVacancy(): boolean {
    return (this.current === "vacancy" || this.attachedApplicationDetail) &&
      this.actions.editVacancy !== undefined && !this.busyFlag;
  }

  get canUpdateStatus(): boolean {
    return this.current === "applications" && this.selected?.canUpdateApplication === true &&
      this.actions.updateStatus !== undefined && !this.busyFlag;
  }

  get canWorkspace(): boolean {
    const applicationContext = this.current === "applications" &&
      (this.pane.items.length === 0 || (this.detail && this.selected?.canUpdateApplication === true));
    return (this.current === "workspace" || applicationContext) &&
      this.actions.workspace !== undefined && !this.busyFlag;
  }

  get canAskPi(): boolean {
    return (this.current === "workbench" || this.attachedApplicationDetail) &&
      this.actions.askPi !== undefined && !this.busyFlag;
  }

  get canDetach(): boolean {
    return this.current === "applications" && this.selected?.attachedApplication === true &&
      this.actions.detach !== undefined && !this.busyFlag;
  }

  get canClearVacancy(): boolean {
    return this.current === "vacancy" && this.actions.clearVacancy !== undefined && !this.busyFlag;
  }

  get canSelectOriginal(): boolean {
    const visibleHere = this.current !== "applications" || this.attachedApplicationDetail;
    return visibleHere && this.pane.canSelectOriginal === true &&
      this.actions.selectOriginal !== undefined && !this.busyFlag;
  }

  private actionEntries(): Array<[string, boolean, () => Promise<boolean>]> {
    return [
      [CAREER_UI_RPC_ACTIONS.filterApplications, this.canFilterApplications, () => this.filterApplications()],
      [CAREER_UI_RPC_ACTIONS.filterApplicationLifecycle, this.canFilterApplicationLifecycle, () => this.filterApplicationLifecycle()],
      [CAREER_UI_RPC_ACTIONS.clearApplicationFilter, this.canClearApplicationFilter, async () => { this.clearApplicationFilter(); return true; }],
      [CAREER_UI_RPC_ACTIONS.attach, this.canAttach, () => this.attach()],
      [CAREER_UI_RPC_ACTIONS.migrate, this.canMigrate, () => this.migrate()],
      [CAREER_UI_RPC_ACTIONS.create, this.canCreate, () => this.createApplication()],
      [CAREER_UI_RPC_ACTIONS.addRoot, this.canAddRoot, () => this.addRoot()],
      [CAREER_UI_RPC_ACTIONS.removeRoot, this.canRemoveRoot, () => this.removeRoot()],
      [CAREER_UI_RPC_ACTIONS.rescan, this.canRescan, () => this.rescan()],
      [CAREER_UI_RPC_ACTIONS.analyze, this.canAnalyze, () => this.analyze()],
      [CAREER_UI_RPC_ACTIONS.match, this.canMatch, () => this.match()],
      [CAREER_UI_RPC_ACTIONS.editVacancy, this.canEditVacancy, () => this.editVacancy()],
      [CAREER_UI_RPC_ACTIONS.updateStatus, this.canUpdateStatus, () => this.updateStatus()],
      [CAREER_UI_RPC_ACTIONS.workspace, this.canWorkspace, () => this.workspace()],
      [CAREER_UI_RPC_ACTIONS.askPi, this.canAskPi, () => this.askPi()],
      [CAREER_UI_RPC_ACTIONS.detach, this.canDetach, () => this.detach()],
      [CAREER_UI_RPC_ACTIONS.clearVacancy, this.canClearVacancy, () => this.clearVacancy()],
      [CAREER_UI_RPC_ACTIONS.selectOriginal, this.canSelectOriginal, () => this.selectOriginal()],
      [CAREER_UI_RPC_ACTIONS.preview, this.canPreview, () => this.openPreview()],
    ];
  }

  rpcActions(): string[] {
    return this.actionEntries().filter(([, enabled]) => enabled).map(([label]) => label);
  }

  switchView(view: CareerUiView): void {
    if (this.busyFlag) return;
    this.current = view;
    this.detail = false;
    this.detailApplicationId = undefined;
    this.cancelPreview();
  }

  switchDestination(delta: -1 | 1): void {
    if (this.busyFlag) return;
    const index = CAREER_UI_DESTINATIONS.indexOf(this.destination);
    const next = CAREER_UI_DESTINATIONS[(index + delta + CAREER_UI_DESTINATIONS.length) % CAREER_UI_DESTINATIONS.length];
    if (next !== undefined) this.switchView(next);
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
    const selected = this.selected;
    if (this.busyFlag || this.detail || selected === undefined) return false;
    this.detail = true;
    this.detailApplicationId = this.current === "applications" ? selected.id : undefined;
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
      this.detailApplicationId = undefined;
      this.cancelPreview();
      return "list";
    }
    if (this.current !== this.destination) {
      this.switchView(this.destination);
      return "list";
    }
    return "close";
  }

  private async runBound(
    enabled: boolean,
    operation: () => Promise<boolean>,
    activity?: "core" | "library",
  ): Promise<boolean> {
    if (!enabled || this.busyFlag) return false;
    this.busyFlag = true;
    this.activity = activity;
    this.cancellationRequested = false;
    try {
      const ok = await operation();
      if (ok === true && this.reloadModel !== undefined) {
        const model = await this.reloadModel();
        if (this.activity === "library" && this.cancellationRequested) return false;
        this.model = model;
        this.applicationCatalog = [...this.model.applications.items];
        this.applicationIntro = this.model.applications.intro;
        this.applyApplicationFilter();
      }
      return ok === true && (this.activity !== "library" || !this.cancellationRequested);
    } catch (error) {
      // Workflow errors stay fail-closed without a second notice. Foreign and Core
      // failures still need a stable payload-free message before the overlay continues.
      if (!(error instanceof CareerWorkflowError)) this.onFailure?.(error);
      return false;
    } finally {
      this.busyFlag = false;
      this.activity = undefined;
      this.cancellationRequested = false;
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

  async filterApplications(): Promise<boolean> {
    const action = this.actions.filterApplications;
    if (!this.canFilterApplications || action === undefined) return false;
    const value = await action();
    if (value === undefined || !validApplicationFilter(value)) return false;
    this.filterText = value;
    this.applyApplicationFilter();
    return true;
  }

  async filterApplicationLifecycle(): Promise<boolean> {
    const action = this.actions.filterApplicationLifecycle;
    if (!this.canFilterApplicationLifecycle || action === undefined) return false;
    const value = await action();
    if (value === undefined) return false;
    this.lifecycleFilter = value;
    this.applyApplicationFilter();
    return true;
  }

  clearApplicationFilter(): void {
    this.filterText = "";
    this.lifecycleFilter = "all";
    this.applyApplicationFilter();
  }

  async attach(): Promise<boolean> {
    const pointer = this.selected?.pointer;
    const action = this.actions.attach;
    if (pointer === undefined || action === undefined) return false;
    const attached = await this.runBound(true, () => action(pointer));
    if (attached) {
      const index = this.model.applications.items.findIndex((entry) => entry.attachedApplication === true);
      if (index >= 0) {
        this.current = "applications";
        this.cursors.applications = index;
        this.detail = true;
        this.detailApplicationId = this.model.applications.items[index]?.id;
      }
    }
    return attached;
  }

  async migrate(): Promise<boolean> {
    const action = this.actions.migrate;
    const applicationId = this.selected?.id;
    if (action === undefined || applicationId === undefined) return false;
    return this.runBound(this.canMigrate, () => action(applicationId));
  }

  async addRoot(): Promise<boolean> {
    const action = this.actions.addRoot;
    if (action === undefined) return false;
    return this.runBound(this.canAddRoot, action);
  }

  async removeRoot(): Promise<boolean> {
    const action = this.actions.removeRoot;
    const selected = this.selected;
    const id = this.current === "library" ? selected?.libraryRootId : selected?.id;
    if (action === undefined || id === undefined) return false;
    return this.runBound(this.canRemoveRoot, () => action(id));
  }

  async rescan(): Promise<boolean> {
    const action = this.actions.rescan;
    if (action === undefined) return false;
    return this.runBound(this.canRescan, action, "library");
  }

  async createApplication(): Promise<boolean> {
    const action = this.actions.createApplication;
    if (action === undefined) return false;
    return this.runBound(this.canCreate, action);
  }

  async analyze(): Promise<boolean> {
    const action = this.actions.analyze;
    if (action === undefined) return false;
    const reference = this.current === "library" ? this.selected?.preview : undefined;
    return this.runBound(this.canAnalyze, () => action(reference), "core");
  }

  async match(): Promise<boolean> {
    const action = this.actions.match;
    if (action === undefined) return false;
    return this.runBound(this.canMatch, action, "core");
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
    const action = this.actionEntries().find(([label]) => label === choice);
    // Retain direct-call semantics: the individual methods enforce their own gates.
    return action === undefined ? false : action[2]();
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
  const labels = CAREER_UI_DESTINATIONS.map((view) => CAREER_UI_VIEW_LABELS[view]);
  const chosen = await ctx.ui.select(CAREER_UI_RPC_ACTIONS.switchView, labels);
  const index = chosen === undefined ? -1 : labels.indexOf(chosen);
  const view = index < 0 ? undefined : CAREER_UI_DESTINATIONS[index];
  if (view !== undefined) session.switchView(view);
}

async function rpcListStep(ctx: ExtensionCommandContext, session: CareerUiSession): Promise<boolean> {
  const options = uniqueItemOptions(session.pane.items);
  const choice = await ctx.ui.select(`${viewTitle(session.view)}\n${session.pane.intro}`, [
    ...options.keys(), ...session.rpcActions(),
    ...(session.canGoBack ? [CAREER_UI_RPC_ACTIONS.back] : []),
    CAREER_UI_RPC_ACTIONS.switchView, CAREER_UI_RPC_ACTIONS.close,
  ]);
  if (choice === undefined || choice === CAREER_UI_RPC_ACTIONS.close) {
    session.cancelPreview();
    return false;
  }
  if (choice === CAREER_UI_RPC_ACTIONS.back) {
    session.back();
  } else if (choice === CAREER_UI_RPC_ACTIONS.switchView) {
    await switchViewRpc(ctx, session);
  } else if (session.rpcActions().includes(choice)) {
    await session.runRpcAction(choice);
  } else {
    const entry = options.get(choice);
    if (entry === undefined) return false;
    session.openItem(entry);
  }
  return true;
}

function rpcDetailTitle(session: CareerUiSession): string {
  const route = viewTitle(session.view);
  const preview = session.preview;
  if (preview !== undefined) return `${route}\nLocal document preview (exact text; close with Back)\n${preview}`;
  return `${route}\nCurrent state · Detail\n${session.selected?.detail ?? session.pane.intro}${session.previewError === undefined ? "" : `\n${session.previewError}`}`;
}

async function rpcDetailStep(ctx: ExtensionCommandContext, session: CareerUiSession): Promise<boolean> {
  const preview = session.preview;
  const choice = await ctx.ui.select(rpcDetailTitle(session), [
    CAREER_UI_RPC_ACTIONS.back,
    ...(preview === undefined ? session.rpcActions() : []),
    CAREER_UI_RPC_ACTIONS.switchView,
    CAREER_UI_RPC_ACTIONS.close,
  ]);
  if (choice === undefined || choice === CAREER_UI_RPC_ACTIONS.close) {
    session.cancelPreview();
    return false;
  }
  if (choice === CAREER_UI_RPC_ACTIONS.back) session.back();
  else if (choice === CAREER_UI_RPC_ACTIONS.switchView) await switchViewRpc(ctx, session);
  else if (session.preview === undefined && session.rpcActions().includes(choice)) await session.runRpcAction(choice);
  return true;
}

export async function runCareerUiRpc(
  ctx: ExtensionCommandContext,
  session: CareerUiSession,
): Promise<void> {
  while (await (session.showingDetail ? rpcDetailStep(ctx, session) : rpcListStep(ctx, session))) {
    // A single step owns its UI selection and transition; no private body escapes to the list.
  }
}

function styledLines(text: string, width: number, style: (value: string) => string): string[] {
  if (text.length === 0) return [];
  return wrapTextWithAnsi(style(text), Math.max(1, width)).map((line) => truncateToWidth(line, width));
}

// Unlike wrapTextWithAnsi, this path must not trim spaces at soft breaks.
// Style only after wrapping so ANSI codes cannot change source segmentation.
function exactPreviewLines(text: string, width: number, style: (value: string) => string): string[] | undefined {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const lines: string[] = [];
  for (const sourceLine of text.split("\n")) {
    let current = "";
    for (const { segment } of segmenter.segment(sourceLine)) {
      // A grapheme wider than the terminal cannot be displayed exactly within
      // its columns. Do not expose a partial preview or claim exact display.
      if (visibleWidth(segment) > width) return undefined;
      if (current && visibleWidth(current + segment) > width) {
        lines.push(style(current));
        current = "";
      }
      current += segment;
    }
    lines.push(current ? style(current) : "");
  }
  return lines;
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

const MIN_FRAME_WIDTH = 60;
const MIN_FRAME_HEIGHT = 18;
const FRAME_PADDING = 1;

function frameBorder(theme: Theme, width: number, left: string, right: string): string {
  return theme.fg("border", `${left}${"─".repeat(Math.max(0, width - 2))}${right}`);
}

function frameLine(theme: Theme, width: number, content: string): string {
  const contentWidth = Math.max(0, width - 2 - FRAME_PADDING * 2);
  const clipped = truncateToWidth(content, contentWidth);
  const fill = " ".repeat(Math.max(0, contentWidth - visibleWidth(clipped)));
  const side = (value: string) => theme.fg("border", value);
  return `${side("│")}${" ".repeat(FRAME_PADDING)}${clipped}${fill}${" ".repeat(FRAME_PADDING)}${side("│")}`;
}

function detailLines(
  selected: CareerUiItem,
  width: number,
  theme: Theme,
): string[] {
  const lines = selected.detail.split("\n");
  if (lines[0] !== undefined && selected.label.startsWith(lines[0])) lines.shift();
  return lines.flatMap((line) => {
    if (line.length === 0) return [""];
    if (/^(?:Recommended n|N)ext action:/u.test(line)) {
      return ["", ...styledLines(line, width, (text) => theme.bold(theme.fg("accent", text)))];
    }
    if (/^(?:Safe alternatives|Opening does not attach|Current session)/u.test(line)) {
      return styledLines(line, width, (text) => theme.fg("muted", text));
    }
    if (/^(?:Package checklist|Documents|Match)$/u.test(line)) {
      return ["", ...styledLines(line, width, (text) => theme.bold(theme.fg("text", text)))];
    }
    return styledLines(line, width, (text) => theme.fg("text", text));
  });
}

function listBodyLines(
  pane: CareerUiPane,
  view: CareerUiView,
  cursor: number,
  operationLabel: string | undefined,
  width: number,
  theme: Theme,
): { lines: string[]; focusLine: number } {
  const lines = [
    ...styledLines("Current state", width, (text) => theme.bold(theme.fg("muted", text))),
    ...(operationLabel === undefined ? [] : styledLines(operationLabel, width, (text) => theme.fg("accent", text))),
    "",
    ...pane.intro.split("\n").flatMap((line) => line.length === 0
      ? [""]
      : styledLines(line, width, (text) => theme.fg("muted", text))),
    "",
  ];
  let focusLine = lines.length;
  if (pane.items.length === 0) {
    lines.push(...styledLines("·  nothing here yet", width, (text) => theme.fg("dim", text)));
    return { lines, focusLine };
  }
  for (const [index, entry] of pane.items.entries()) {
    const selectedRow = index === cursor;
    if (selectedRow) focusLine = lines.length;
    const fullPrefix = `${selectedRow ? "▸" : " "} ${itemMark(view, entry)}  `;
    const prefix = width >= visibleWidth(fullPrefix) ? fullPrefix : selectedRow ? "> " : "  ";
    const available = Math.max(1, width - visibleWidth(prefix));
    const labelLines = styledLines(entry.label, available, (text) =>
      selectedRow ? theme.bold(theme.fg("accent", text)) : theme.fg("text", text));
    lines.push(...labelLines.map((label, lineIndex) => truncateToWidth(
      `${lineIndex === 0 ? prefix : " ".repeat(Math.min(visibleWidth(prefix), width))}${label}`,
      width,
    )));
  }
  return { lines, focusLine };
}

export class CareerOverlay implements Component {
  private previewPage = 0;
  private contentOffset = 0;
  private helpVisible = false;
  private fallbackActive = false;

  constructor(
    private readonly session: CareerUiSession,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly requestRender: () => void,
    private readonly close: () => void,
    private readonly maximumHeight: () => number = () => Number.MAX_SAFE_INTEGER,
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

  private handlePreviewInput(data: string): void {
    if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.up)) {
      this.previewPage = Math.max(0, this.previewPage - 1);
      this.requestRender();
    } else if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.down)) {
      this.previewPage++;
      this.requestRender();
    }
  }

  private renderPreview(text: string, width: number): string[] {
    const lines = exactPreviewLines(text, width, (value) => this.theme.fg("text", value));
    const pages = Math.max(1, Math.ceil((lines?.length ?? 0) / 6));
    this.previewPage = Math.min(this.previewPage, pages - 1);
    if (lines === undefined) return ["", truncateToWidth(this.theme.fg("muted", "Preview unavailable at this width; widen terminal"), width)];
    return ["", truncateToWidth(this.theme.fg("muted", `Local preview · page ${this.previewPage + 1}/${pages} · exact text, soft-wrapped`), width),
      ...lines.slice(this.previewPage * 6, (this.previewPage + 1) * 6)];
  }

  private keyedAction(key: string): Promise<boolean> | undefined {
    const entries: Array<[string, boolean, () => Promise<boolean>]> = [
      ["/", this.session.canFilterApplications, () => this.session.filterApplications()],
      ["l", this.session.canFilterApplicationLifecycle, () => this.session.filterApplicationLifecycle()],
      ["k", this.session.canClearApplicationFilter, async () => { this.session.clearApplicationFilter(); return true; }],
      ["v", this.session.canPreview, () => this.session.openPreview()],
      ["a", this.session.canAttach, () => this.session.attach()],
      ["i", this.session.canMigrate, () => this.session.migrate()],
      ["n", this.session.canAddRoot, () => this.session.addRoot()],
      ["x", this.session.canRemoveRoot, () => this.session.removeRoot()],
      ["r", this.session.canRescan, () => this.session.rescan()],
      ["c", this.session.canCreate, () => this.session.createApplication()],
      ["g", this.session.canAnalyze, () => this.session.analyze()],
      ["g", this.session.canMatch && !this.session.canAnalyze, () => this.session.match()],
      ["t", this.session.canMatch, () => this.session.match()],
      ["e", this.session.canEditVacancy, () => this.session.editVacancy()],
      ["s", this.session.canUpdateStatus, () => this.session.updateStatus()],
      ["m", this.session.canWorkspace, () => this.session.workspace()],
      ["p", this.session.canAskPi, () => this.session.askPi()],
      ["d", this.session.canDetach, () => this.session.detach()],
      ["k", this.session.canClearVacancy, () => this.session.clearVacancy()],
      ["o", this.session.canSelectOriginal, () => this.session.selectOriginal()],
    ];
    return entries.find(([name, enabled]) => name === key && enabled)?.[2]();
  }

  private handleCancel(): void {
    if (this.helpVisible) {
      this.helpVisible = false;
      this.contentOffset = 0;
      this.requestRender();
      return;
    }
    if (this.session.operationActive) {
      this.session.cancelOperation();
      this.requestRender();
      return;
    }
    if (!this.session.busy && this.session.back() === "list") {
      this.previewPage = 0;
      this.contentOffset = 0;
      this.requestRender();
      return;
    }
    this.session.cancelPreview();
    this.close();
  }

  private listMovement(data: string): number | undefined {
    if (this.keybindings.matches(data, "tui.select.up") || matchesKey(data, Key.up)) return -1;
    if (this.keybindings.matches(data, "tui.select.down") || matchesKey(data, Key.down)) return 1;
    return undefined;
  }

  private handleListInput(data: string): void {
    if (this.session.showingDetail) return;
    const delta = this.listMovement(data);
    if (delta !== undefined) {
      this.session.move(delta);
      this.requestRender();
      return;
    }
    if (this.keybindings.matches(data, "tui.select.confirm") || matchesKey(data, Key.return) || matchesKey(data, Key.enter)) {
      if (this.session.open()) {
        this.contentOffset = 0;
        this.requestRender();
      }
    }
  }

  handleInput(data: string): void {
    const cancel = this.keybindings.matches(data, "tui.select.cancel") || matchesKey(data, Key.escape);
    if (this.fallbackActive) {
      // The fallback has no visible controls, so only safe Back/Close or
      // cancellation remains active until a supported viewport is rendered.
      if (cancel) this.handleCancel();
      return;
    }
    if (cancel) {
      this.handleCancel();
      return;
    }
    if (this.session.busy) return;
    if (this.session.preview !== undefined) {
      this.handlePreviewInput(data);
      return;
    }
    const key = data.length === 1 ? data.toLowerCase() : data;
    if (key === "h" || key === "?") {
      this.helpVisible = !this.helpVisible;
      this.contentOffset = 0;
      this.requestRender();
      return;
    }
    const contentDelta = this.listMovement(data);
    if ((this.helpVisible || this.session.showingDetail) && contentDelta !== undefined) {
      this.contentOffset = Math.max(0, this.contentOffset + contentDelta);
      this.requestRender();
      return;
    }
    if (this.helpVisible) return;
    if (matchesKey(data, Key.left) || matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
      this.session.switchDestination(matchesKey(data, Key.left) ? -1 : 1);
      this.previewPage = 0;
      this.contentOffset = 0;
      this.requestRender();
      return;
    }
    const keyed = this.keyedAction(key);
    if (keyed !== undefined) {
      this.requestRender();
      void keyed.finally(() => this.requestRender());
      return;
    }
    this.handleListInput(data);
  }

  private actionHints(): string[] {
    const actions: Array<[boolean, string]> = [
      [this.session.canAttach, "a attach"],
      [this.session.canMigrate, "i migrate"],
      [this.session.canCreate, "c create"],
      [this.session.canAddRoot, "n add root"],
      [this.session.canRemoveRoot, "x remove"],
      [this.session.canRescan, "r rescan"],
      [this.session.canAnalyze, "g analyze"],
      [this.session.canMatch, this.session.canAnalyze ? "t match" : "g match"],
      [this.session.canEditVacancy, "e job description"],
      [this.session.canUpdateStatus, "s status"],
      [this.session.canWorkspace, "m workspace"],
      [this.session.canAskPi, "p Ask Pi"],
      [this.session.canDetach, "d detach"],
      [this.session.canClearVacancy, "k clear job"],
      [this.session.canSelectOriginal, "o select original"],
      [this.session.canPreview, "v preview locally"],
      [this.session.canFilterApplications, "/ filter"],
      [this.session.canFilterApplicationLifecycle, "l lifecycle"],
      [this.session.canClearApplicationFilter, "k clear filter"],
    ];
    return actions.filter(([enabled]) => enabled).map(([, label]) => label);
  }

  private primaryActionHints(available: string[]): string[] {
    const nextAction = this.session.selected?.detail.match(/(?:recommended )?next action:[^\n]*\(([a-z])\)/i)?.[1];
    if (nextAction !== undefined) {
      const recommended = available.find((label) => label.startsWith(`${nextAction.toLowerCase()} `));
      if (recommended !== undefined) {
        const alternatives = available.filter((label) => label !== recommended).slice(0, 2);
        return [recommended, ...alternatives];
      }
    }

    const priorities: Partial<Record<CareerUiView, string[]>> = {
      applications: this.session.showingDetail
        ? ["s ", "e ", "o ", "g ", "t ", "m ", "p ", "a ", "i ", "d "]
        : ["c ", "/ ", "l "],
      library: this.session.showingDetail ? ["v ", "g "] : ["n ", "r "],
      setup: ["n ", "r "],
      vacancy: ["e ", "v "],
      analyze: ["g "],
      match: ["g "],
      workbench: ["p "],
      workspace: ["m "],
    };
    const preferred = (priorities[this.session.view] ?? [])
      .flatMap((prefix) => available.filter((label) => label.startsWith(prefix)));
    return (preferred.length > 0 ? preferred : available).slice(0, 3);
  }

  private footerHints(): string[] {
    if (this.helpVisible) return ["↑↓ scroll · esc close help"];
    if (this.session.preview !== undefined) return ["↑↓ pages · esc back"];
    const navigation = this.session.showingDetail
      ? "↑↓ scroll · esc back · tab switch · ? help"
      : `↑↓ select · enter open · tab switch · esc ${this.session.canGoBack ? "back" : "close"} · ? help`;
    const primary = this.primaryActionHints(this.actionHints());
    return primary.length === 0 ? [navigation] : [navigation, `Actions: ${primary.join(" · ")} · ? all`];
  }

  render(width: number): string[] {
    const renderWidth = Math.max(1, width);
    const renderHeight = Math.max(1, Math.floor(this.maximumHeight()));
    const theme = this.theme;
    this.fallbackActive = renderWidth < MIN_FRAME_WIDTH || renderHeight < MIN_FRAME_HEIGHT;
    if (this.fallbackActive) {
      const reason = renderWidth < MIN_FRAME_WIDTH
        ? "Career needs at least 60 columns."
        : "Career needs at least 18 available rows.";
      return [
        ...styledLines(reason, renderWidth, (text) => theme.fg("muted", text)),
        ...styledLines("Resize the terminal or use the existing career commands.", renderWidth, (text) => theme.fg("muted", text)),
        ...styledLines("Esc Back / Close", renderWidth, (text) => theme.fg("muted", text)),
      ].slice(0, renderHeight);
    }

    const contentWidth = renderWidth - 2 - FRAME_PADDING * 2;
    const view = this.session.view;
    const pane = this.session.pane;
    const selected = this.session.selected;
    const header = styledLines(`◆  ${viewTitle(view)}  ${VIEW_MARKS[view]}`, contentWidth,
      (text) => theme.bold(theme.fg("accent", text)));
    const destinationLabels = contentWidth >= 14
      ? ["Applications", "Resumes"]
      : contentWidth >= 7 ? ["Apps", "CVs"] : ["A", "R"];
    const destinationChips = CAREER_UI_DESTINATIONS.map((name, index) => {
      const active = name === this.session.destination;
      const chip = `${active ? "▸" : "·"} ${destinationLabels[index]}`;
      return active ? theme.bold(theme.fg("accent", chip)) : theme.fg("dim", chip);
    });
    const navLines = packChips(destinationChips, contentWidth);

    if (this.session.preview === undefined) this.previewPage = 0;
    const listBody = !this.helpVisible && this.session.preview === undefined && !this.session.showingDetail
      ? listBodyLines(
        pane,
        view,
        this.session.cursor,
        this.session.operationActive ? this.session.operationLabel ?? "Career operation in progress…" : undefined,
        contentWidth,
        theme,
      )
      : undefined;
    const body = this.helpVisible
      ? [
        ...styledLines("Help", contentWidth, (text) => theme.bold(theme.fg("accent", text))),
        "",
        ...styledLines("Applications and Resumes are the only destinations. Use ←/→ or Tab to switch.", contentWidth, (text) => theme.fg("text", text)),
        ...styledLines("Use ↑/↓ and Enter to browse. Esc returns through detail and contextual routes, then closes.", contentWidth, (text) => theme.fg("text", text)),
        ...styledLines("Only shown action keys can start work. Slash commands remain direct routes to Setup, job description, Analyze, Match, Ask Pi, and Workspace.", contentWidth, (text) => theme.fg("muted", text)),
        "",
        ...styledLines("Current route shortcuts (close Help first)", contentWidth, (text) => theme.bold(theme.fg("muted", text))),
        ...styledLines(this.actionHints().length === 0 ? "No actions available." : this.actionHints().join(" · "), contentWidth, (text) => theme.fg("text", text)),
      ]
      : this.session.preview !== undefined
      ? this.renderPreview(this.session.preview, contentWidth)
      : this.session.showingDetail && selected !== undefined
      ? [
        ...styledLines("Current state · Detail", contentWidth, (text) => theme.bold(theme.fg("muted", text))),
        "",
        ...styledLines(selected.label, contentWidth, (text) => theme.bold(theme.fg("accent", text))),
        ...detailLines(selected, contentWidth, theme),
        ...(this.session.previewError === undefined ? [] : styledLines(this.session.previewError, contentWidth, (text) => theme.fg("muted", text))),
      ]
      : listBody?.lines ?? [];
    const footerText = this.session.operationActive
      ? [`${this.session.operationLabel ?? "Career operation in progress…"} · esc cancel`]
      : this.footerHints();
    const footer = footerText.flatMap((line) => styledLines(line, contentWidth, (text) => theme.fg("dim", text)));
    const fixedRows = 1 + header.length + 1 + navLines.length + 1 + 1 + Math.max(1, footer.length) + 1;
    const bodyCapacity = Math.max(1, renderHeight - fixedRows);
    const maxOffset = Math.max(0, body.length - bodyCapacity);
    if (listBody !== undefined) {
      const focusLine = Math.min(body.length - 1, Math.max(0, listBody.focusLine));
      if (focusLine < this.contentOffset) this.contentOffset = focusLine;
      if (focusLine >= this.contentOffset + bodyCapacity) {
        this.contentOffset = focusLine - bodyCapacity + 1;
      }
    }
    this.contentOffset = Math.min(this.contentOffset, maxOffset);
    const visibleBody = body.slice(this.contentOffset, this.contentOffset + bodyCapacity);
    const framed = (lines: string[]) => lines.map((line) => frameLine(theme, renderWidth, line));
    return [
      frameBorder(theme, renderWidth, "╭", "╮"),
      ...framed(header),
      frameBorder(theme, renderWidth, "├", "┤"),
      ...framed(navLines),
      frameBorder(theme, renderWidth, "├", "┤"),
      ...framed(visibleBody.length === 0 ? [""] : visibleBody),
      frameBorder(theme, renderWidth, "├", "┤"),
      ...framed(footer.length === 0 ? [""] : footer),
      frameBorder(theme, renderWidth, "╰", "╯"),
    ];
  }

  invalidate(): void {}
}

function notifyCareerUiFailure(ctx: ExtensionCommandContext, error: unknown): void {
  try {
    if (error instanceof CareerWorkflowError) {
      const type = error.code === "workflow_cancelled" || error.code === "workflow_stale" ? "info" : "error";
      ctx.ui.notify(workflowErrorMessage(error.code), type);
      return;
    }
    if (error instanceof CareerInvocationError) {
      ctx.ui.notify(publicAdapterMessage(payloadFreeAdapterError(error)), "error");
      return;
    }
    ctx.ui.notify(workflowErrorMessage("workflow_failed"), "error");
  } catch {
    // A host notification failure must not republish the private cause.
  }
}

export async function openCareerUi(
  ctx: ExtensionCommandContext,
  view: CareerUiView,
  agentDir: string,
  actions: CareerUiActions = {},
): Promise<void> {
  const reload = () => buildCareerUiModel(agentDir, ctx);
  const session = new CareerUiSession(
    view,
    await reload(),
    {
      ...actions,
      filterApplications: actions.filterApplications ?? (async () => {
        const value = await ctx.ui.input("Application filter", "Case-sensitive text from company, role, status, readiness, or classification");
        return value;
      }),
      filterApplicationLifecycle: actions.filterApplicationLifecycle ?? (async () => {
        const choices = new Map<string, "all" | ApplicationStatus>([
          ["All", "all"], ["Preparing", "preparing"], ["Applied", "applied"],
          ["Interviewing", "interviewing"], ["Closed", "closed"],
        ]);
        const selected = await ctx.ui.select("Application lifecycle filter", [...choices.keys()]);
        return selected === undefined ? undefined : choices.get(selected);
      }),
    },
    reload,
    careerPreviewLoader(agentDir, ctx),
    (error) => notifyCareerUiFailure(ctx, error),
  );
  if (ctx.mode === "tui") {
    await ctx.ui.custom<void>((tui, theme, keybindings, done) => new CareerOverlay(
      session,
      theme,
      keybindings,
      () => tui.requestRender(),
      () => done(undefined),
      () => Math.max(1, Math.floor(tui.terminal.rows * 0.9)),
    ), {
      overlay: true,
      overlayOptions: {
        width: "90%",
        maxHeight: "90%",
        anchor: "center",
        margin: { top: 1, right: 2, bottom: 1, left: 2 },
      },
    });
    return;
  }
  await runCareerUiRpc(ctx, session);
}
