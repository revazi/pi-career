// SPDX-License-Identifier: MIT OR Apache-2.0

const SECTIONS = new Set([
  "contact", "summary", "experience", "education", "skills", "projects", "certifications", "other",
]);

export interface VariantChange {
  section: string;
  start_line: number;
  end_line: number;
  original_text: string;
  proposed_text: string;
  resume_evidence: string[];
  vacancy_evidence: string[];
}

export interface AnalysisSuggestion {
  basis_check_id: string;
  start_line: number;
  end_line: number;
  source_target: string;
  source_evidence: string[];
  suggestion: string;
}

export interface AnalysisReplacement {
  basis_check_id: string;
  start_line: number;
  end_line: number;
  source_target: string;
  source_evidence: string[];
  proposed_replacement: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function boundedString(value: unknown, minimum: number, maximum: number): value is string {
  if (typeof value !== "string") return false;
  const length = [...value].length;
  return length >= minimum && length <= maximum;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function stringList(value: unknown, minimum: number, maximum: number, itemMaximum: number): string[] | undefined {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return undefined;
  if (!value.every((item) => boundedString(item, 1, itemMaximum))) return undefined;
  const strings = value as string[];
  return new Set(strings).size === strings.length ? [...strings] : undefined;
}

function parseVariantChange(value: unknown): VariantChange | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    "section", "start_line", "end_line", "original_text", "proposed_text",
    "resume_evidence", "vacancy_evidence",
  ])) return undefined;
  const resumeEvidence = stringList(value.resume_evidence, 1, 5, 300);
  const vacancyEvidence = stringList(value.vacancy_evidence, 1, 5, 300);
  if (
    typeof value.section !== "string" || !SECTIONS.has(value.section) ||
    !boundedInteger(value.start_line, 1, 2_000) ||
    !boundedInteger(value.end_line, 1, 2_000) ||
    !boundedString(value.original_text, 1, 10_000) ||
    !boundedString(value.proposed_text, 0, 10_000) ||
    resumeEvidence === undefined || vacancyEvidence === undefined
  ) return undefined;
  return {
    section: value.section,
    start_line: value.start_line,
    end_line: value.end_line,
    original_text: value.original_text,
    proposed_text: value.proposed_text,
    resume_evidence: resumeEvidence,
    vacancy_evidence: vacancyEvidence,
  };
}

function parseAnalysisSuggestion(value: unknown): AnalysisSuggestion | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    "basis_check_id", "start_line", "end_line", "source_target", "source_evidence", "suggestion",
  ])) return undefined;
  const evidence = stringList(value.source_evidence, 1, 2, 240);
  if (
    !boundedString(value.basis_check_id, 1, 100) || !/^[a-z0-9_]+$/.test(value.basis_check_id) ||
    !boundedInteger(value.start_line, 1, 2_000) ||
    !boundedInteger(value.end_line, 1, 2_000) ||
    !boundedString(value.source_target, 1, 500) ||
    evidence === undefined ||
    !boundedString(value.suggestion, 1, 600)
  ) return undefined;
  return {
    basis_check_id: value.basis_check_id,
    start_line: value.start_line,
    end_line: value.end_line,
    source_target: value.source_target,
    source_evidence: evidence,
    suggestion: value.suggestion,
  };
}

function parseAnalysisReplacement(value: unknown): AnalysisReplacement | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    "basis_check_id", "start_line", "end_line", "source_target", "source_evidence",
    "proposed_replacement",
  ])) return undefined;
  const evidence = stringList(value.source_evidence, 1, 2, 240);
  if (
    !boundedString(value.basis_check_id, 1, 100) || !/^[a-z0-9_]+$/.test(value.basis_check_id) ||
    !boundedInteger(value.start_line, 1, 2_000) ||
    !boundedInteger(value.end_line, 1, 2_000) ||
    !boundedString(value.source_target, 1, 500) ||
    evidence === undefined ||
    !boundedString(value.proposed_replacement, 0, 600)
  ) return undefined;
  return {
    basis_check_id: value.basis_check_id,
    start_line: value.start_line,
    end_line: value.end_line,
    source_target: value.source_target,
    source_evidence: evidence,
    proposed_replacement: value.proposed_replacement,
  };
}

export function parseVariantChanges(payload: unknown): VariantChange[] {
  if (!isRecord(payload) || !hasExactKeys(payload, ["changes"]) ||
    !Array.isArray(payload.changes) || payload.changes.length > 50) {
    throw new Error("managed_payload_invalid");
  }
  const changes = payload.changes.map(parseVariantChange);
  if (changes.some((change) => change === undefined)) throw new Error("managed_payload_invalid");
  return changes as VariantChange[];
}

export function parseAnalysisSuggestions(payload: unknown): AnalysisSuggestion[] {
  if (!isRecord(payload) || !hasExactKeys(payload, ["suggestions"]) ||
    !Array.isArray(payload.suggestions) || payload.suggestions.length > 3) {
    throw new Error("managed_payload_invalid");
  }
  const suggestions = payload.suggestions.map(parseAnalysisSuggestion);
  if (suggestions.some((suggestion) => suggestion === undefined)) {
    throw new Error("managed_payload_invalid");
  }
  return suggestions as AnalysisSuggestion[];
}

export function parseAnalysisReplacements(payload: unknown): AnalysisReplacement[] {
  if (!isRecord(payload) || !hasExactKeys(payload, ["replacements"]) ||
    !Array.isArray(payload.replacements) || payload.replacements.length > 3) {
    throw new Error("managed_payload_invalid");
  }
  const replacements = payload.replacements.map(parseAnalysisReplacement);
  if (replacements.some((replacement) => replacement === undefined)) {
    throw new Error("managed_payload_invalid");
  }
  return replacements as AnalysisReplacement[];
}

export function parseSelectedChangeIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50 ||
    !value.every((item) => typeof item === "string" && /^change-[0-9]{4}$/.test(item)) ||
    new Set(value).size !== value.length) throw new Error("managed_payload_invalid");
  return [...value] as string[];
}
