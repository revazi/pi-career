// SPDX-License-Identifier: MIT OR Apache-2.0

import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import type { CoreResult, RankedMatch } from "./result-projection.ts";
import { parseWorkflowEntryData } from "./session-state.ts";
import type {
  CareerConfig,
  LibraryScan,
  ResultCardEntry,
  ResultProjection,
  WorkflowEntryData,
} from "./types.ts";

const UI_TEXT_MAX = 8_000;

export function privacyDisplayPath(absolutePath: string): string {
  const home = os.homedir();
  const relative = path.relative(home, absolutePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `~${path.sep}${relative}`;
  }
  return path.basename(absolutePath) || "resume root";
}

export function setupSummary(config: CareerConfig, scan: LibraryScan, persisted: boolean): string {
  const resumes = scan.records.length;
  const roots = config.library_roots.length;
  return `pi-career • ${roots} root${roots === 1 ? "" : "s"} • ${resumes} resume${resumes === 1 ? "" : "s"} • session ${persisted ? "persisted" : "transient"}`;
}

export function libraryIndexPreview(config: CareerConfig, scan: LibraryScan, maximum = 50): string {
  const lines: string[] = [];
  let remaining = maximum;
  for (const root of config.library_roots) {
    lines.push(`[${root.label}]`);
    const records = scan.records.filter((record) => record.root_id === root.id);
    for (const record of records.slice(0, remaining)) {
      const labels = [
        ...(record.kind === "assisted_variant" ? ["assisted variant"] : []),
        ...(record.too_large_for_core_input === true ? ["too large"] : []),
      ];
      lines.push(`- ${record.label}${labels.length > 0 ? ` — ${labels.join(", ")}` : ""}`);
    }
    remaining -= Math.min(records.length, remaining);
    if (remaining === 0) break;
  }
  if (scan.records.length > maximum) lines.push(`Showing ${maximum} of ${scan.records.length} indexed resumes.`);
  return lines.join("\n") || "No indexed resumes";
}

export function librarySummary(config: CareerConfig, scan: LibraryScan, persisted: boolean): string {
  const originals = scan.records.filter((record) => record.kind === "original").length;
  const assisted = scan.records.filter((record) => record.kind === "assisted_variant").length;
  const tooLarge = scan.records.filter((record) => record.too_large_for_core_input === true).length;
  const staleRoots = scan.roots.filter((root) => root.stale).length;
  return [
    `${config.library_roots.length} roots`,
    `${originals} original resumes`,
    `${assisted} assisted variants`,
    `${tooLarge} too large`,
    `${staleRoots} stale roots`,
    `${persisted ? "persisted" : "transient"} session`,
  ].join(" • ");
}

function summaryRecord(card: ResultCardEntry): Record<string, unknown> {
  return card.projection.summary;
}

function recommendationLabel(card: ResultCardEntry): string | undefined {
  const recommendation = summaryRecord(card).recommendation;
  if (recommendation !== null && typeof recommendation === "object" && !Array.isArray(recommendation)) {
    const label = (recommendation as Record<string, unknown>).label;
    return typeof label === "string" ? label : undefined;
  }
  return undefined;
}

function scoreValue(card: ResultCardEntry): number | undefined {
  const value = summaryRecord(card).overall_score;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function score(card: ResultCardEntry): string {
  return String(scoreValue(card) ?? "unavailable");
}

function badges(card: ResultCardEntry, tie = false): string[] {
  const flags = card.projection.ui_flags;
  return [
    ...(tie ? ["tie"] : []),
    ...(flags.adjusted ? ["adjusted"] : []),
    ...(flags.provisional ? ["provisional"] : []),
    ...(flags.close_cluster ? ["close cluster"] : []),
    ...(flags.stale ? ["stale"] : []),
  ];
}

function objectField(value: unknown, field: string): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[field]
    : undefined;
}

function previewItems(summary: Record<string, unknown>, field: string): string {
  const values = summary[field];
  if (!Array.isArray(values)) return "none";
  const items = values.slice(0, 2).flatMap((value) => {
    const item = objectField(value, "item") ?? objectField(value, "title");
    return typeof item === "string" ? [item.slice(0, 80)] : [];
  });
  return items.length > 0 ? items.join(", ") : "none";
}

function matchProjectionDetails(projection: ResultProjection): string[] {
  const summary = projection.summary;
  const confidence = summary.confidence_context;
  const resumeConfidence = objectField(confidence, "resume_parse_confidence");
  const jobConfidence = objectField(confidence, "job_parse_confidence");
  const resumeLabel = objectField(resumeConfidence, "label");
  const resumeScore = objectField(resumeConfidence, "score");
  const jobLabel = objectField(jobConfidence, "label");
  const jobScore = objectField(jobConfidence, "score");
  const warnings = summary.warnings;
  const warningCount = Array.isArray(warnings) ? warnings.length : 0;
  return [
    `confidence resume ${String(resumeLabel ?? "unavailable")} ${String(resumeScore ?? "-")} • job ${String(jobLabel ?? "unavailable")} ${String(jobScore ?? "-")}`,
    `strengths ${previewItems(summary, "top_strengths")}`,
    `gaps ${previewItems(summary, "top_gaps")} • warnings ${warningCount}`,
  ];
}

export function plainResultCard(card: ResultCardEntry, tie = false): string {
  const labels = badges(card, tie);
  const recommendation = recommendationLabel(card);
  return [
    `${card.workflow === "match" ? "Career match" : "Career analyze"}: ${card.resume_label}`,
    `score ${score(card)}${recommendation ? ` • ${recommendation}` : ""}`,
    ...(labels.length > 0 ? [labels.join(" • ")] : []),
    ...(card.workflow === "match" ? matchProjectionDetails(card.projection) : []),
  ].join("\n");
}

function stateEntryText(data: Exclude<WorkflowEntryData, ResultCardEntry>): string {
  switch (data.kind) {
    case "vacancy": return `Career vacancy: ${data.vacancy_label}`;
    case "vacancy_clear": return "Career vacancy cleared";
    case "consent": return `Career session-persistence consent: ${data.granted ? "granted" : "declined"}`;
    case "consent_clear": return "Career session-persistence consent cleared";
  }
}

function resultCardLines(card: ResultCardEntry, theme: Theme, width: number, tie: boolean): string[] {
  const label = theme.fg("accent", theme.bold(card.resume_label));
  const flags = badges(card, tie);
  const recommendation = recommendationLabel(card);
  const recommendationText = recommendation ? ` • ${recommendation}` : "";
  const flagText = flags.length > 0 ? flags.join(" • ") : undefined;
  const matchDetails = card.workflow === "match" ? matchProjectionDetails(card.projection) : [];
  if (width >= 100) {
    return [
      `${label} • score ${score(card)}${recommendationText}${flagText ? ` • ${flagText}` : ""}`,
      ...matchDetails,
    ];
  }
  if (width >= 80) {
    return [label, `score ${score(card)}${recommendationText}`, ...(flagText ? [flagText] : []), ...matchDetails];
  }
  return [label, `score ${score(card)}`, ...(flagText ? [flagText] : []), ...matchDetails];
}

class ResponsiveCard implements Component {
  constructor(
    private readonly data: WorkflowEntryData,
    private readonly theme: Theme,
    private readonly tie: boolean,
  ) {}

  render(width: number): string[] {
    if (this.data.kind !== "result_card") {
      return [truncateToWidth(this.theme.fg("muted", stateEntryText(this.data)), width)];
    }
    return resultCardLines(this.data, this.theme, width, this.tie)
      .map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {}
}

export function registerWorkflowEntryRenderer(
  pi: ExtensionAPI,
  currentData?: (stateId: string) => WorkflowEntryData | undefined,
  currentTie?: (stateId: string) => boolean,
): void {
  pi.registerEntryRenderer(WORKFLOW_RENDERER_TYPE, (entry, _options, theme) => {
    const parsed = parseWorkflowEntryData(entry.data);
    if (parsed === undefined) return undefined;
    const data = currentData?.(parsed.state_id) ?? parsed;
    const tie = data.kind === "result_card" && currentTie?.(data.state_id) === true;
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("borderMuted", text)));
    container.addChild(new ResponsiveCard(data, theme, tie));
    container.addChild(new DynamicBorder((text: string) => theme.fg("borderMuted", text)));
    return container;
  });
}

const WORKFLOW_RENDERER_TYPE = "career.workflow";

export function oversizeResultMessage(command: "career-analyze" | "career-match", runId: string, code: string): string {
  return `${command} • run ${runId} • ${code}\nNo partial output exists and the result was not stored.`;
}

export function unavailableMatchResultMessage(runId: string, resumeLabel: string, code: string): string {
  return `career-match • run ${runId} • ${code}\n${resumeLabel} • result unavailable\nNo partial output exists and the result was not stored.`;
}

export function deriveMatchTieStateIds(cards: readonly ResultCardEntry[]): Set<string> {
  const byRun = new Map<string, ResultCardEntry[]>();
  for (const card of cards) {
    if (card.workflow !== "match" || scoreValue(card) === undefined) continue;
    const runCards = byRun.get(card.run_id) ?? [];
    runCards.push(card);
    byRun.set(card.run_id, runCards);
  }

  const tied = new Set<string>();
  for (const runCards of byRun.values()) {
    const topScore = Math.max(...runCards.map((card) => scoreValue(card)!));
    const topCards = runCards.filter((card) => scoreValue(card) === topScore);
    if (topCards.length < 2) continue;
    for (const card of topCards) tied.add(card.state_id);
  }
  return tied;
}

export function rankedRows(ranked: RankedMatch[]): string[] {
  return ranked.map((item, index) => {
    const labels = [
      ...(item.tie ? ["tie"] : []),
      ...(item.closeCluster ? ["close cluster"] : []),
      ...(item.projection.ui_flags.provisional ? ["provisional"] : []),
    ];
    return `${index + 1}. ${item.resume.label} — ${item.overallScore} — ${item.recommendation}${labels.length ? ` — ${labels.join(", ")}` : ""}`;
  });
}

export interface DetailSection {
  label: string;
  value: unknown;
}

export function analyzeDetailSections(result: CoreResult): DetailSection[] {
  return [
    { label: "checks", value: result.checks },
    { label: "confidence_context", value: result.confidence_context },
    { label: "top_strengths", value: result.top_strengths },
    { label: "top_weaknesses", value: result.top_weaknesses },
    { label: "improvement_actions", value: result.improvement_actions },
    { label: "warnings", value: result.warnings },
  ];
}

export function matchDetailSections(result: CoreResult, vacancyText: string): DetailSection[] {
  return [
    { label: "category_results", value: result.category_results },
    { label: "confidence_context", value: result.confidence_context },
    { label: "top_strengths", value: result.top_strengths },
    { label: "top_gaps", value: result.top_gaps },
    { label: "recommendation", value: result.recommendation },
    { label: "warnings", value: result.warnings },
    { label: "current vacancy preview", value: vacancyText.slice(0, 1_000) },
  ];
}

export function detailText(section: DetailSection): string {
  const text = JSON.stringify({ [section.label]: section.value }, null, 2);
  if (Buffer.byteLength(text, "utf8") > UI_TEXT_MAX) {
    return `${section.label}: detail is too large for the bounded pane; no partial detail is shown.`;
  }
  return text;
}
