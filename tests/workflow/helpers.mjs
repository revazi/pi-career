// SPDX-License-Identifier: MIT OR Apache-2.0

export const UUIDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
  "00000000-0000-4000-8000-000000000007",
  "00000000-0000-4000-8000-000000000008",
  "00000000-0000-4000-8000-000000000009",
  "00000000-0000-4000-8000-00000000000a",
];

export function uuidSequence() {
  let index = 0;
  return () => UUIDS[index++] ?? `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function syntheticTextPdf(lines) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const escaped = lines.map((line) => line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const stream = ["BT", "/F1 14 Tf", "72 720 Td", ...escaped.flatMap((line, index) => [
    ...(index === 0 ? [] : ["0 -24 Td"]),
    `(${line}) Tj`,
  ]), "ET", ""].join("\n");
  objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`);

  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export function resumeResult(score = 82, adjusted = false) {
  return {
    schema_version: "career.resume_analysis.v1",
    overall_score: score,
    category_scores: { completeness: score },
    checks: [{
      check_id: "synthetic_check",
      raw_score: adjusted ? score + 5 : score,
      score,
      score_adjusted: adjusted,
      passed: true,
      outcome: "passed",
      detection_status: "detected",
      explanation: "Synthetic deterministic explanation.",
      evidence: [],
    }],
    confidence_context: {
      score_source: "deterministic_normalization_baseline",
      parse_confidence: { label: "high", score: 95, signals: [] },
      field_statuses: [],
      uncertain_fields: [],
      likely_missing_fields: [],
      fallbacks_applied: [],
      uncertain_score_floor: 50,
      adjusted_check_ids: adjusted ? ["synthetic_check"] : [],
      adjustment_applied: adjusted,
    },
    top_strengths: [{ area: "content", title: "Synthetic strength", status: "confirmed" }],
    top_weaknesses: [{ area: "impact", title: "Synthetic weakness", status: "confirmed" }],
    improvement_actions: [{ priority: 1, area: "impact", action: "Add grounded detail.", basis_check_id: "synthetic_check", status: "confirmed" }],
    warnings: [{ code: "synthetic_warning", message: "Synthetic warning.", related_fields: [] }],
  };
}

export function matchResult(score = 80, recommendation = "apply_after_small_edits", uncertain = false, adjusted = false) {
  return {
    schema_version: "career.job_match.v1",
    overall_score: score,
    category_scores: { skills_match: score },
    category_results: [{
      category: "skills_match", weight: 30, raw_score: adjusted ? score + 5 : score,
      score, score_adjusted: adjusted, explanation: "Synthetic match.", items: [], metrics: [],
    }],
    confidence_context: {
      resume_parse_confidence: { label: "high", score: 94 },
      job_parse_confidence: { label: "high", score: 93 },
      resume_normalization_truncated: false,
      job_normalization_truncated: false,
      is_uncertain: uncertain,
      uncertainty_sources: uncertain ? ["synthetic"] : [],
      score_floor: 50,
      score_ceiling: 90,
      adjusted_categories: adjusted ? ["skills_match"] : [],
      adjustment_applied: adjusted,
      missing_claims_status: "unverified",
    },
    top_strengths: [{ category: "skills_match", item: "Testing", status: "confirmed", match_type: "normalized_exact" }],
    top_gaps: [{ category: "skills_match", item: "Operations", status: "unverified" }],
    recommendation: { label: recommendation, status: uncertain ? "provisional" : "deterministic" },
    warnings: [{ code: "synthetic_warning", message: "Synthetic warning.", related_categories: [] }],
  };
}

export function normalizationResult() {
  return { schema_version: "career.job_normalization.v1", warnings: [] };
}

export function makeFakePi() {
  const commands = new Map();
  const events = new Map();
  const entries = [];
  const renderers = new Map();
  const tools = new Map();
  let activeTools = [];
  let sessionName;
  return {
    commands,
    events,
    entries,
    renderers,
    tools,
    get activeTools() { return [...activeTools]; },
    api: {
      registerTool(definition) {
        tools.set(definition.name, definition);
        if (!activeTools.includes(definition.name)) activeTools.push(definition.name);
      },
      getActiveTools() { return [...activeTools]; },
      getAllTools() { return [...tools].map(([name, definition]) => ({ name, description: definition.description })); },
      setActiveTools(names) { activeTools = names.filter((name) => tools.has(name)); },
      registerCommand(name, definition) { commands.set(name, definition); },
      registerEntryRenderer(name, renderer) { renderers.set(name, renderer); },
      getSessionName() { return sessionName; },
      setSessionName(value) { sessionName = value; },
      appendEntry(customType, data) {
        entries.push({
          type: "custom", customType, data, id: `e${entries.length + 1}`,
          parentId: entries.at(-1)?.id ?? null, timestamp: new Date(0).toISOString(),
        });
      },
      on(name, handler) {
        const handlers = events.get(name) ?? [];
        handlers.push(handler);
        events.set(name, handlers);
      },
    },
  };
}

export function makeContext(fake, options = {}) {
  const selects = [...(options.selects ?? [])];
  const inputs = [...(options.inputs ?? [])];
  const editors = [...(options.editors ?? [])];
  const notifications = [];
  const widgets = [];
  let customCalls = 0;
  const sessionId = options.sessionId ?? "synthetic-session";
  const sessionFile = options.persisted === false ? undefined : "/synthetic/session.jsonl";
  const theme = {
    fg(_color, text) { return text; },
    bg(_color, text) { return text; },
    bold(text) { return text; },
    italic(text) { return text; },
    strikethrough(text) { return text; },
  };
  const ctx = {
    mode: options.mode ?? "rpc",
    hasUI: options.hasUI ?? true,
    cwd: "/synthetic/cwd",
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionFile: () => sessionFile,
      getBranch: () => [...fake.entries],
      getEntries: () => [...fake.entries],
    },
    ui: {
      theme,
      async select() { return selects.shift(); },
      async input() { return inputs.shift(); },
      async editor() { return editors.shift(); },
      notify(message, type = "info") { notifications.push({ message, type }); },
      setWidget(key, value) { widgets.push({ key, value }); },
      setEditorText(value) { options.editorText?.push(value); },
      async custom(factory) {
        customCalls += 1;
        return new Promise((resolve) => {
          const component = factory({
            requestRender() {},
            terminal: options.terminal ?? { rows: 24, columns: 80 },
          }, theme, options.keybindings ?? { matches() { return false; } }, (value) => {
            component?.dispose?.();
            resolve(value);
          });
          options.components?.push(component);
        });
      },
    },
    isIdle: () => true,
    isProjectTrusted: () => true,
    signal: undefined,
    abort() {},
    hasPendingMessages: () => false,
    shutdown() {},
    getContextUsage: () => undefined,
    compact() {},
    getSystemPrompt: () => "",
    getSystemPromptOptions: () => ({}),
    waitForIdle: async () => {},
  };
  return { ctx, notifications, widgets, get customCalls() { return customCalls; } };
}
