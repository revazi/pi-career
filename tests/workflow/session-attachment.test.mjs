// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_ASSISTANCE_CUSTOM_TYPE,
  APPLICATION_ATTACHMENT_CUSTOM_TYPE,
  createApplicationAssistanceActivationEntry,
  createApplicationAttachmentEntry,
  createApplicationDetachmentEntry,
  parseApplicationAssistanceEntryData,
  parseApplicationAttachmentEntryData,
  replayApplicationSessionRecords,
} from "../../src/workflow/session-attachment.ts";
import { createApplicationClearEntry, createApplicationEntry } from "../../src/workflow/session-state.ts";
import { uuidSequence } from "./helpers.mjs";

const APP_ID = "00000000-0000-4000-8000-0000000000aa";
const OTHER_APP_ID = "00000000-0000-4000-8000-0000000000ab";
const ROOT_ID = "00000000-0000-4000-8000-000000000012";
const ROOT_CREATED_AT = "2026-08-01T00:00:00.000Z";
const APPLICATION_CREATED_AT = "2026-08-02T00:00:00.000Z";
const WORKSPACE_CREATED_AT = "2026-08-03T00:00:00.000Z";
const now = () => new Date(APPLICATION_CREATED_AT);

function pointer(applicationId = APP_ID) {
  return {
    applicationId,
    rootId: ROOT_ID,
    rootCreatedAt: ROOT_CREATED_AT,
    applicationCreatedAt: APPLICATION_CREATED_AT,
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
  };
}

function customEntry(customType, data, index) {
  return {
    type: "custom", customType, data, id: `entry-${index}`,
    parentId: index === 1 ? null : `entry-${index - 1}`, timestamp: WORKSPACE_CREATED_AT,
  };
}

function attachmentRecords() {
  const uuid = uuidSequence();
  const attachment = createApplicationAttachmentEntry(pointer(), { uuid });
  const activation = createApplicationAssistanceActivationEntry(attachment, { uuid });
  const detachment = createApplicationDetachmentEntry(attachment, { uuid });
  return { uuid, attachment, activation, detachment };
}

test("#64 factories and parsers preserve exact ordered attachment bytes", () => {
  const { attachment, activation, detachment } = attachmentRecords();
  assert.deepEqual(Object.keys(attachment), [
    "schema_version", "kind", "attachment_id", "application_id", "root_id",
    "root_created_at", "application_created_at", "workspace_created_at",
  ]);
  assert.deepEqual(Object.keys(detachment), [
    "schema_version", "kind", "detachment_id", "attachment_id",
  ]);
  assert.deepEqual(Object.keys(activation), [
    "schema_version", "kind", "activation_id", "attachment_id", "application_id",
  ]);
  assert.deepEqual(parseApplicationAttachmentEntryData(attachment), attachment);
  assert.deepEqual(parseApplicationAttachmentEntryData(detachment), detachment);
  assert.deepEqual(parseApplicationAssistanceEntryData(activation), activation);

  const { kind, schema_version, ...rest } = attachment;
  assert.equal(parseApplicationAttachmentEntryData({ kind, schema_version, ...rest }), undefined);
  assert.equal(parseApplicationAttachmentEntryData({ ...attachment, extra: true }), undefined);
  assert.equal(parseApplicationAttachmentEntryData({
    ...attachment, application_id: attachment.application_id.toUpperCase(),
  }), undefined);
  assert.equal(parseApplicationAttachmentEntryData({
    ...attachment, workspace_created_at: "2026-02-30T00:00:00.000Z",
  }), undefined);
  assert.equal(parseApplicationAssistanceEntryData({ ...activation, extra: true }), undefined);
  assert.throws(
    () => createApplicationAttachmentEntry({ ...pointer(), rootId: "not-a-uuid" }, { uuid: uuidSequence() }),
    /invalid application attachment record/,
  );
});

test("P3-28/P3-50/P3-51 replay distinguishes unattached, attached-local, and activated branches", () => {
  const { attachment, activation } = attachmentRecords();
  const attachEntry = customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1);
  const activationEntry = customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2);

  assert.deepEqual(replayApplicationSessionRecords([], []), { integrity: "valid" });
  assert.deepEqual(replayApplicationSessionRecords([], [attachEntry]), {
    integrity: "valid", used_application_id: APP_ID,
  });
  assert.deepEqual(replayApplicationSessionRecords([attachEntry]), {
    integrity: "valid", used_application_id: APP_ID, attachment,
  });
  assert.deepEqual(replayApplicationSessionRecords([attachEntry, activationEntry]), {
    integrity: "valid", used_application_id: APP_ID, attachment, activation,
  });
});

test("P3-30/P3-53 detach clears activation and same-application reattach gets fresh scope", () => {
  const { uuid, attachment, activation, detachment } = attachmentRecords();
  const replacement = createApplicationAttachmentEntry(pointer(), { uuid });
  const entries = [
    customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1),
    customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2),
    customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, detachment, 3),
    customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, replacement, 4),
  ];
  assert.deepEqual(replayApplicationSessionRecords(entries), {
    integrity: "valid", used_application_id: APP_ID, attachment: replacement,
  });

  assert.deepEqual(replayApplicationSessionRecords(entries.slice(0, 3)), {
    integrity: "valid", used_application_id: APP_ID,
  });
});

test("P3-56 malformed records and invalid branch transitions fail closed", () => {
  const { uuid, attachment, activation } = attachmentRecords();
  const second = createApplicationAttachmentEntry(pointer(), { uuid });
  const attach = customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1);
  const activate = customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2);

  const cases = [
    [customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, { ...attachment, extra: true }, 1)],
    [attach, customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, second, 2)],
    [customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 1)],
    [attach, activate, { ...activate, id: "entry-3", parentId: "entry-2" }],
    [attach, customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, {
      schema_version: "pi.career.application_attachment.v1",
      kind: "application_detachment",
      detachment_id: uuid(),
      attachment_id: second.attachment_id,
    }, 2)],
  ];
  for (const entries of cases) {
    assert.deepEqual(replayApplicationSessionRecords(entries), { integrity: "invalid" });
  }
});

test("P3-29/P3-54 all session branches retain one application claim", () => {
  const uuid = uuidSequence();
  const attachment = createApplicationAttachmentEntry(pointer(), { uuid });
  const attach = customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1);
  const legacy = createApplicationEntry("Synthetic Company", "Synthetic Role", "preparing", {
    uuid, now,
  }, APP_ID);
  const clear = createApplicationClearEntry(legacy, { uuid, now });
  const workflowEntries = [
    customEntry("career.workflow", legacy, 2),
    customEntry("career.workflow", clear, 3),
  ];
  assert.equal(
    replayApplicationSessionRecords([], [attach, ...workflowEntries]).used_application_id,
    APP_ID,
  );

  const other = createApplicationAttachmentEntry(pointer(OTHER_APP_ID), { uuid });
  assert.deepEqual(replayApplicationSessionRecords([attach], [
    attach, ...workflowEntries, customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, other, 4),
  ]), { integrity: "invalid" });
});

test("record IDs are session-wide unique while unrelated custom entries are ignored", () => {
  const { attachment, activation } = attachmentRecords();
  const duplicateActivationId = {
    ...activation,
    activation_id: attachment.attachment_id,
  };
  const attach = customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1);
  assert.deepEqual(replayApplicationSessionRecords([attach], [
    customEntry("synthetic.unrelated", { private_path: "/not-read" }, 1),
    attach,
  ]), { integrity: "valid", used_application_id: APP_ID, attachment });
  assert.deepEqual(replayApplicationSessionRecords([attach], [
    attach, customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, duplicateActivationId, 2),
  ]), { integrity: "invalid" });
});

test("replay is deterministic, mutation-free, and projects no path or label", () => {
  const { attachment, activation } = attachmentRecords();
  const entries = [
    customEntry(APPLICATION_ATTACHMENT_CUSTOM_TYPE, attachment, 1),
    customEntry(APPLICATION_ASSISTANCE_CUSTOM_TYPE, activation, 2),
  ];
  const before = structuredClone(entries);
  const first = replayApplicationSessionRecords(entries);
  const second = replayApplicationSessionRecords(entries);
  assert.deepEqual(first, second);
  assert.deepEqual(entries, before);
  const encoded = JSON.stringify(first);
  assert.equal(encoded.includes("/"), false);
  assert.equal(encoded.includes("Synthetic Company"), false);
});
