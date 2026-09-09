// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { decodeApplicationIdentity } from "../../src/workflow/application-workspace.ts";

const identity = {
  schema_version: "pi.career.application_identity.v1",
  kind: "application_identity",
  application_id: "00000000-0000-4000-8000-000000000001",
  company_label: "Synthetic Company",
  role_label: "Synthetic Engineer",
  created_at: "2026-08-12T00:00:00.000Z",
};
const manifest = {
  application_id: identity.application_id,
  application_created_at: identity.created_at,
};
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const decode = (bytes) => decodeApplicationIdentity(bytes, manifest);
const rejected = (bytes) => assert.throws(() => decode(bytes), (error) => {
  assert.match(error.message, /workspace_drift/);
  assert.doesNotMatch(error.message, /Synthetic|00000000|2026-08-12/);
  return true;
});

test("identity preserves exact labels and binds to manifest UUID and creation time", () => {
  assert.deepEqual(decode(encode(identity)), identity);
  for (const company_label of ["é", "e\u0301", "界".repeat(120)]) {
    const value = { ...identity, company_label };
    assert.deepEqual(decode(encode(value)), value, "labels are validated, never normalized");
  }
  rejected(encode({ ...identity, application_id: "00000000-0000-4000-8000-000000000002" }));
  rejected(encode({ ...identity, created_at: "2026-08-12T00:00:01.000Z" }));
});

test("identity rejects missing, extra, reordered, invalid, and over-limit fields", () => {
  for (const field of Object.keys(identity)) {
    const value = { ...identity };
    delete value[field];
    rejected(encode(value));
  }
  rejected(encode({ ...identity, extra: "Synthetic private value" }));
  rejected(encode(Object.fromEntries(Object.entries(identity).reverse())));
  for (const schema_version of [null, "pi.career.application_identity.v2"]) rejected(encode({ ...identity, schema_version }));
  rejected(encode({ ...identity, kind: "career_application" }));
  for (const field of ["company_label", "role_label"]) {
    for (const value of [null, 1, "", "界".repeat(121), "Synthetic\nlabel", "Synthetic\u007flabel"]) {
      rejected(encode({ ...identity, [field]: value }));
    }
  }
});

test("identity inherits canonical byte, strict JSON, UTF-8, and metadata size checks", () => {
  const canonical = encode(identity);
  for (const bytes of [
    Buffer.alloc(0), Buffer.alloc(16_385, 32), Buffer.from([0xff]),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical]),
    Buffer.from(JSON.stringify(identity)),
    Buffer.from(canonical.toString().replace(/\n/g, "\r\n")),
    Buffer.concat([canonical, Buffer.from("{}")]),
    Buffer.from(canonical.toString().replace('"company_label":', '"company_label": "Synthetic", "company_label":')),
    encode(null), encode([]),
  ]) rejected(bytes);
});
