// SPDX-License-Identifier: MIT OR Apache-2.0

import type {
  CareerInvocation,
  CareerInvocationResult,
  InvokeOptions,
} from "../process.ts";

export const MANAGED_OUTPUT_MAX_BYTES = 33_554_432;
const MANAGED_STDOUT_CAPTURE_MAX_BYTES = MANAGED_OUTPUT_MAX_BYTES + 1;
const MANAGED_RESULT_MAX_LINES = 2;

export const MANAGED_INVOKE_OPTIONS: InvokeOptions = {
  stdoutCaptureMaxBytes: MANAGED_STDOUT_CAPTURE_MAX_BYTES,
  toolResultMaxBytes: MANAGED_OUTPUT_MAX_BYTES,
  toolResultMaxLines: MANAGED_RESULT_MAX_LINES,
};

export type ManagedInvoke = (
  invocation: CareerInvocation,
  signal?: AbortSignal,
  options?: InvokeOptions,
) => Promise<CareerInvocationResult>;

interface OperationDescriptor {
  operation_id: string;
  capability_id: string | null;
  availability: "available";
  cli_path: string[];
  input_transport: "none" | "cli_arguments" | "json_file_or_stdin";
  input_schema_id: string | null;
  output_schema_id: string;
  maximum_input_bytes: number | null;
  maximum_successful_machine_output_bytes: number;
}

export interface ManagedContracts {
  coreVersion: string;
  operations: ReadonlyMap<string, OperationDescriptor>;
}

interface ExpectedOperation {
  capability: string | null;
  path: string[];
  input: string | null;
  output: string;
  inputBytes: number | null;
}

const EXPECTED_CORE_VERSION = "0.1.1";
const EXPECTED_OPERATIONS: Readonly<Record<string, ExpectedOperation>> = {
  "core.capabilities": {
    capability: "core.capabilities", path: ["capabilities"], input: null,
    output: "career.capabilities.v1", inputBytes: null,
  },
  "core.operations": {
    capability: null, path: ["operations"], input: null,
    output: "career.operation_catalog.v1", inputBytes: null,
  },
  "schema.list": {
    capability: null, path: ["schema", "list"], input: null,
    output: "career.schema_catalog.v1", inputBytes: null,
  },
  "schema.export": {
    capability: null, path: ["schema", "export"], input: null,
    output: "https://json-schema.org/draft/2020-12/schema", inputBytes: null,
  },
  "schema.bundle": {
    capability: null, path: ["schema", "bundle"], input: null,
    output: "https://json-schema.org/draft/2020-12/schema", inputBytes: null,
  },
  "resume.evaluate": {
    capability: "resume.evaluate", path: ["resume", "evaluate"], input: "career.resume_input.v1",
    output: "career.resume_evaluation.v1", inputBytes: 262_144,
  },
  "resume.analyze": {
    capability: "resume.analyze", path: ["resume", "analyze"], input: "career.resume_input.v1",
    output: "career.resume_analysis.v1", inputBytes: 262_144,
  },
  "resume.normalize": {
    capability: "resume.normalize", path: ["resume", "normalize"], input: "career.resume_input.v1",
    output: "career.resume_normalization.v1", inputBytes: 262_144,
  },
  "resume.enrich": {
    capability: "resume.enrich", path: ["resume", "enrich"], input: "career.resume_enrichment_input.v1",
    output: "career.resume_enrichment_result.v1", inputBytes: 262_144,
  },
  "resume.analysis-suggestions.review": {
    capability: "resume.analysis-suggestions.review", path: ["resume", "analysis-suggestions-review"],
    input: "career.resume_analysis_suggestion_review_input.v1",
    output: "career.resume_analysis_suggestion_review.v1", inputBytes: 262_144,
  },
  "resume.analysis-replacements.review": {
    capability: "resume.analysis-replacements.review", path: ["resume", "analysis-replacements-review"],
    input: "career.resume_analysis_replacement_review_input.v1",
    output: "career.resume_analysis_replacement_review.v1", inputBytes: 262_144,
  },
  "resume.variant.review": {
    capability: "resume.variant.review", path: ["resume", "variant-review"],
    input: "career.resume_variant_review_input.v1",
    output: "career.resume_variant_review.v1", inputBytes: 1_048_576,
  },
  "resume.variant.materialize": {
    capability: "resume.variant.materialize", path: ["resume", "variant-materialize"],
    input: "career.resume_variant_materialization_input.v1",
    output: "career.resume_variant.v1", inputBytes: 1_048_576,
  },
  "job.normalize": {
    capability: "job.normalize", path: ["job", "normalize"], input: "career.job_input.v1",
    output: "career.job_normalization.v1", inputBytes: 262_144,
  },
  "job.match": {
    capability: "job.match", path: ["job", "match"], input: "career.job_match_input.v1",
    output: "career.job_match.v1", inputBytes: 1_048_576,
  },
};

const REQUIRED_BUNDLES = [
  ["career.resume_analysis_suggestion_review_input.v1", "resume-analysis-suggestion-review-input-v1.schema.json"],
  ["career.resume_analysis_replacement_review_input.v1", "resume-analysis-replacement-review-input-v1.schema.json"],
  ["career.resume_variant_review_input.v1", "resume-variant-review-input-v1.schema.json"],
  ["career.resume_variant_materialization_input.v1", "resume-variant-materialization-input-v1.schema.json"],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseObject(json: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value)) throw new Error("managed_contract_invalid");
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function parseDescriptor(value: unknown): OperationDescriptor {
  if (!isRecord(value) || !exactKeys(value, [
    "operation_id", "capability_id", "availability", "cli_path", "input_transport",
    "input_schema_id", "output_schema_id", "maximum_input_bytes",
    "maximum_successful_machine_output_bytes",
  ])) throw new Error("managed_contract_invalid");
  if (
    typeof value.operation_id !== "string" ||
    (value.capability_id !== null && typeof value.capability_id !== "string") ||
    value.availability !== "available" ||
    !Array.isArray(value.cli_path) ||
    value.cli_path.length === 0 ||
    !value.cli_path.every((part) => typeof part === "string" && /^[a-z-]+$/.test(part)) ||
    (value.input_transport !== "none" &&
      value.input_transport !== "cli_arguments" &&
      value.input_transport !== "json_file_or_stdin") ||
    (value.input_schema_id !== null && typeof value.input_schema_id !== "string") ||
    typeof value.output_schema_id !== "string" ||
    (value.maximum_input_bytes !== null && !Number.isSafeInteger(value.maximum_input_bytes)) ||
    value.maximum_successful_machine_output_bytes !== MANAGED_OUTPUT_MAX_BYTES
  ) throw new Error("managed_contract_invalid");
  return value as unknown as OperationDescriptor;
}

function verifyDescriptor(descriptor: OperationDescriptor, expected: ExpectedOperation): void {
  const documentOperation = expected.input !== null;
  if (
    descriptor.capability_id !== expected.capability ||
    descriptor.cli_path.join("\0") !== expected.path.join("\0") ||
    descriptor.input_schema_id !== expected.input ||
    descriptor.output_schema_id !== expected.output ||
    descriptor.maximum_input_bytes !== expected.inputBytes ||
    descriptor.input_transport !== (documentOperation ? "json_file_or_stdin" :
      descriptor.operation_id.startsWith("schema.") && descriptor.operation_id !== "schema.list"
        ? "cli_arguments"
        : "none")
  ) throw new Error("managed_contract_invalid");
}

function inspectReferences(value: unknown, root: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) inspectReferences(item, root);
    return;
  }
  if (!isRecord(value)) return;
  const reference = value.$ref;
  if (reference !== undefined) {
    if (typeof reference !== "string" || !reference.startsWith("#/")) {
      throw new Error("managed_contract_invalid");
    }
    let current: unknown = root;
    for (const rawPart of reference.slice(2).split("/")) {
      const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!isRecord(current) || !Object.hasOwn(current, part)) {
        throw new Error("managed_contract_invalid");
      }
      current = current[part];
    }
  }
  for (const nested of Object.values(value)) inspectReferences(nested, root);
}

function verifyBundle(json: string, fileName: string): void {
  const bundle = parseObject(json);
  if (
    bundle.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
    typeof bundle.$id !== "string" ||
    !bundle.$id.endsWith(`/${fileName}`)
  ) throw new Error("managed_contract_invalid");
  inspectReferences(bundle, bundle);
}

export class ManagedContractCache {
  private cached: ManagedContracts | undefined;
  private loading: Promise<ManagedContracts> | undefined;

  async load(invoke: ManagedInvoke, signal?: AbortSignal): Promise<ManagedContracts> {
    if (this.cached !== undefined) return this.cached;
    if (this.loading !== undefined) return this.loading;
    this.loading = this.discover(invoke, signal);
    try {
      const contracts = await this.loading;
      if (!signal?.aborted) this.cached = contracts;
      return contracts;
    } finally {
      this.loading = undefined;
    }
  }

  private async discover(invoke: ManagedInvoke, signal?: AbortSignal): Promise<ManagedContracts> {
    const catalogResult = await invoke(
      { kind: "discovery", operation: "operations" }, signal, MANAGED_INVOKE_OPTIONS,
    );
    const catalog = parseObject(catalogResult.json);
    if (!exactKeys(catalog, ["schema_version", "core_version", "operations"]) ||
      catalog.schema_version !== "career.operation_catalog.v1" ||
      catalog.core_version !== EXPECTED_CORE_VERSION ||
      !Array.isArray(catalog.operations)) throw new Error("managed_contract_invalid");

    const operations = new Map<string, OperationDescriptor>();
    for (const value of catalog.operations) {
      const descriptor = parseDescriptor(value);
      if (operations.has(descriptor.operation_id)) throw new Error("managed_contract_invalid");
      operations.set(descriptor.operation_id, descriptor);
    }
    if (operations.size !== Object.keys(EXPECTED_OPERATIONS).length) {
      throw new Error("managed_contract_invalid");
    }
    for (const [operationId, expected] of Object.entries(EXPECTED_OPERATIONS)) {
      const descriptor = operations.get(operationId);
      if (descriptor === undefined) throw new Error("managed_contract_invalid");
      verifyDescriptor(descriptor, expected);
    }

    const bundles = await Promise.all(REQUIRED_BUNDLES.map(async ([schemaId, fileName]) => ({
      fileName,
      result: await invoke(
        { kind: "discovery", operation: "schema-bundle", schemaId },
        signal,
        MANAGED_INVOKE_OPTIONS,
      ),
    })));
    for (const bundle of bundles) verifyBundle(bundle.result.json, bundle.fileName);

    return { coreVersion: catalog.core_version, operations };
  }
}
