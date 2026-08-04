// SPDX-License-Identifier: MIT OR Apache-2.0
// Adapted from career-core commit 100774ed8bb3b39c019d64ce105af1e3f209144f.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import {
  COMPOSITE_INPUT_MAX_BYTES,
  invokeCareerCli,
  publicAdapterError,
  type DiscoveryOperation,
  type JobOperation,
  type ResumeOperation,
} from "./process.ts";

const DISCOVERY_OPERATIONS = ["capabilities", "schema-list", "schema-export"] as const;
const RESUME_OPERATIONS = [
  "evaluate",
  "analyze",
  "analysis-suggestions-review",
  "analysis-replacements-review",
  "normalize",
  "enrich",
  "variant-review",
  "variant-materialize",
] as const;
const JOB_OPERATIONS = ["normalize", "match"] as const;

const discoveryParameters = Type.Object(
  {
    operation: StringEnum(DISCOVERY_OPERATIONS, {
      description: "Discover capabilities, list embedded schemas, or export one embedded schema.",
    }),
    schema_id: Type.Optional(
      Type.String({
        description: "Required only for schema-export; use an exact ID returned by schema-list.",
        minLength: 1,
        maxLength: 100,
        pattern: "^career\\.[a-z0-9_.-]+\\.v[0-9]+$",
      }),
    ),
  },
  { additionalProperties: false },
);

const resumeParameters = Type.Object(
  {
    operation: StringEnum(RESUME_OPERATIONS, {
      description: "One available deterministic resume CLI operation.",
    }),
    input_json: Type.String({
      description:
        "Exactly one versioned JSON input object as a string. Discover the operation schema first. Private arguments may be stored by Pi unless the session is transient.",
      minLength: 2,
      maxLength: COMPOSITE_INPUT_MAX_BYTES,
    }),
  },
  { additionalProperties: false },
);

const jobParameters = Type.Object(
  {
    operation: StringEnum(JOB_OPERATIONS, {
      description: "Normalize a caller-supplied job description or match original resume/job inputs.",
    }),
    input_json: Type.String({
      description:
        "Exactly one versioned JSON input object as a string. Discover the operation schema first. Private arguments may be stored by Pi unless the session is transient.",
      minLength: 2,
      maxLength: COMPOSITE_INPUT_MAX_BYTES,
    }),
  },
  { additionalProperties: false },
);

const privacyGuideline =
  "Before using career_core_resume or career_core_job with private career content, require an explicit user decision about Pi session persistence and recommend starting a new `pi --no-session` transient run; do not claim secure erasure.";

function resultContent(json: string, operation: string) {
  return {
    content: [{ type: "text" as const, text: json }],
    details: {
      schema_version: "career.pi_tool_details.v1",
      operation,
    },
  };
}

export default function careerCoreExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "career_core_discover",
    label: "Career Core Discovery",
    description:
      "Discover the installed deterministic career CLI capabilities and embedded JSON schemas. Makes no network or model request.",
    promptSnippet: "Discover installed Career Core capabilities and exact embedded schemas before document operations",
    promptGuidelines: [
      "Use career_core_discover before career_core_resume or career_core_job; invoke only capabilities reported as available and do not infer contract shapes.",
    ],
    parameters: discoveryParameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await invokeCareerCli(
          {
            kind: "discovery",
            operation: params.operation as DiscoveryOperation,
            ...(params.schema_id === undefined ? {} : { schemaId: params.schema_id }),
          },
          signal,
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw publicAdapterError(error);
      }
    },
  });

  pi.registerTool({
    name: "career_core_resume",
    label: "Career Core Resume",
    description:
      "Run one bounded installed Career Core resume operation with JSON over stdin. Returns the complete authoritative CLI JSON or fails without truncation. Never invokes Cargo, a provider, or the network.",
    promptSnippet: "Evaluate, analyze, normalize, or review bounded resume inputs through the installed deterministic CLI",
    promptGuidelines: [
      privacyGuideline,
      "Use career_core_resume only with an exact schema discovered through career_core_discover; preserve every warning, evidence item, uncertainty status, baseline boundary, and assisted/non-authoritative label returned by the tool.",
      "If career_core_resume reports result_too_large or result_too_many_lines, do not request a truncated result; fall back to the installed career CLI in a user-approved local workflow that can consume the complete JSON.",
    ],
    parameters: resumeParameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await invokeCareerCli(
          {
            kind: "resume",
            operation: params.operation as ResumeOperation,
            inputJson: params.input_json,
          },
          signal,
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw publicAdapterError(error);
      }
    },
  });

  pi.registerTool({
    name: "career_core_job",
    label: "Career Core Job",
    description:
      "Run installed Career Core job normalization or conservative matching with JSON over stdin. Returns complete authoritative CLI JSON or fails without truncation. Never fetches URLs, invokes Cargo, a provider, or the network.",
    promptSnippet: "Normalize job text or conservatively match original resume and job inputs through the installed deterministic CLI",
    promptGuidelines: [
      privacyGuideline,
      "Use career_core_job only with an exact schema discovered through career_core_discover; preserve source spans, confidence, warnings, uncertainty, conservative equivalence, and recommendation limitations exactly.",
      "If career_core_job reports result_too_large or result_too_many_lines, do not request a truncated result; fall back to the installed career CLI in a user-approved local workflow that can consume the complete JSON.",
    ],
    parameters: jobParameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await invokeCareerCli(
          {
            kind: "job",
            operation: params.operation as JobOperation,
            inputJson: params.input_json,
          },
          signal,
        );
        return resultContent(result.json, result.operation);
      } catch (error) {
        throw publicAdapterError(error);
      }
    },
  });
}
