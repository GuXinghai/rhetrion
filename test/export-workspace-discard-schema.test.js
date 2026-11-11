import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import {
  assertValidExportWorkspaceDiscardCommitMarker,
  assertValidExportWorkspaceDiscardJournal,
  assertValidExportWorkspaceDiscardPreflight,
  assertValidExportWorkspaceDiscardReceipt,
  EXPORT_WORKSPACE_DISCARD_COMMIT_MARKER_SCHEMA_SHA256,
  EXPORT_WORKSPACE_DISCARD_JOURNAL_SCHEMA_SHA256,
  EXPORT_WORKSPACE_DISCARD_PREFLIGHT_SCHEMA_SHA256,
  EXPORT_WORKSPACE_DISCARD_RECEIPT_SCHEMA_SHA256,
  exportWorkspaceDiscardCommitMarkerSchema,
  exportWorkspaceDiscardJournalSchema,
  exportWorkspaceDiscardPreflightSchema,
  exportWorkspaceDiscardReceiptSchema,
  validateExportWorkspaceDiscardCommitMarker,
  validateExportWorkspaceDiscardJournal,
  validateExportWorkspaceDiscardPreflight,
  validateExportWorkspaceDiscardReceipt,
} from "../src/export-workspace-discard-schema.js";

function journal() {
  const firstEvidence = "B".repeat(52);
  const secondEvidence = "C".repeat(52);
  return {
    schemaVersion: "usage-export-workspace-discard-journal-v0.2",
    planVersion: "local-export-workspace-discard-plan-v0.2",
    discardOrderVersion: "sqlite-sidecars-then-database-v1",
    artifactClass: "incomplete_or_poisoned_export_workspace",
    state: "prepared",
    planToken: "A2BCDEFGHJKMNPQRSTUV",
    directoryIdentityToken: "A".repeat(52),
    eligibility: "scan_incomplete",
    inventoryCounts: { sqliteSidecars: 1, workspaceDatabase: 1, totalFiles: 2, totalBytes: 30 },
    inventory: [
      { ordinal: 0, role: "workspace_sqlite_journal", byteSize: 10, evidenceToken: firstEvidence },
      { ordinal: 1, role: "workspace_database", byteSize: 20, evidenceToken: secondEvidence },
    ],
    transportReady: false,
  };
}

function preflight() {
  return {
    schemaVersion: "usage-export-workspace-discard-preflight-v0.2",
    planVersion: "local-export-workspace-discard-plan-v0.2",
    artifactClass: "incomplete_or_poisoned_export_workspace",
    readiness: "ready",
    eligibility: "scan_incomplete",
    fileCounts: { sqliteSidecars: 1, workspaceDatabase: 1, totalFiles: 2 },
    byteCounts: { workspaceBytes: 30, totalBytes: 30 },
    confirmationRequired: true,
    confirmationToken: "A2BCDEFGHJKMNPQR",
    sourceLogsPreserved: true,
    independentOutputPreserved: true,
    networkActivity: "absent",
    secureErasureClaimed: false,
    transportReady: false,
  };
}

function marker() {
  return {
    schemaVersion: "usage-export-workspace-discard-commit-marker-v0.2",
    planVersion: "local-export-workspace-discard-plan-v0.2",
    discardOrderVersion: "sqlite-sidecars-then-database-v1",
    state: "committed",
    planToken: "A2BCDEFGHJKMNPQRSTUV",
    directoryIdentityToken: "A".repeat(52),
    journalToken: "D".repeat(52),
    transportReady: false,
  };
}

function receipt() {
  return {
    schemaVersion: "usage-export-workspace-discard-receipt-v0.2",
    planVersion: "local-export-workspace-discard-plan-v0.2",
    artifactClass: "incomplete_or_poisoned_export_workspace",
    state: "complete",
    logicalRemovalConfirmed: true,
    deletedFileCount: 2,
    deletedBytes: 30,
    sourceLogsPreserved: true,
    identityStatePreserved: true,
    independentOutputPreserved: true,
    workspaceDirectoryRetained: true,
    networkActivity: "absent",
    secureErasureClaimed: false,
    transportReady: false,
  };
}

test("workspace discard schemas are immutable closed contracts", async () => {
  const rows = [
    ["preflight-summary.schema.json", exportWorkspaceDiscardPreflightSchema, EXPORT_WORKSPACE_DISCARD_PREFLIGHT_SCHEMA_SHA256],
    ["journal.schema.json", exportWorkspaceDiscardJournalSchema, EXPORT_WORKSPACE_DISCARD_JOURNAL_SCHEMA_SHA256],
    ["commit-marker.schema.json", exportWorkspaceDiscardCommitMarkerSchema, EXPORT_WORKSPACE_DISCARD_COMMIT_MARKER_SCHEMA_SHA256],
    ["receipt.schema.json", exportWorkspaceDiscardReceiptSchema, EXPORT_WORKSPACE_DISCARD_RECEIPT_SCHEMA_SHA256],
  ];
  for (const [name, schema, digest] of rows) {
    const bytes = await readFile(new URL(`../schemas/export-workspace-discard-v0.2/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
    assert.equal(schema.additionalProperties, false);
  }
});

test("v0.1 discard schemas remain byte-identical and old readers reject new contracts", async () => {
  const hashes = {
    "commit-marker.schema.json": "907e57310b2a3bcfe3657bdaeea670bc62919fde4dde6c47827d04276f85a870",
    "journal.schema.json": "4eadd09f79d0c90355ea6e8b6a253e4a6776ad24616c9b04347700819d58ef20",
    "preflight-summary.schema.json": "9e53bda2ca5dccd068f20d2b0687071615ad610c34448e24c2373d2ac1f1d330",
    "receipt.schema.json": "eafd08f2d209f4412f944dcfb6ad865e376ac2cd251259b18758390162b90d31",
  };
  for (const [name, make, validate] of [
    ["preflight-summary.schema.json", preflight, validateExportWorkspaceDiscardPreflight],
    ["journal.schema.json", journal, validateExportWorkspaceDiscardJournal],
    ["commit-marker.schema.json", marker, validateExportWorkspaceDiscardCommitMarker],
    ["receipt.schema.json", receipt, validateExportWorkspaceDiscardReceipt],
  ]) {
    const bytes = await readFile(new URL(`../schemas/export-workspace-discard-v0.1/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hashes[name]);
    const oldReader = new Ajv({ strict: true }).compile(JSON.parse(bytes));
    assert.equal(oldReader(make()), false);
    const old = make();
    old.schemaVersion = old.schemaVersion.replace("v0.2", "v0.1");
    old.planVersion = old.planVersion.replace("v0.2", "v0.1");
    assert.equal(oldReader(old), true);
    assert.equal(validate(old).valid, false);
    for (const version of ["v0.3", "v999"]) {
      const future = make();
      future.schemaVersion = future.schemaVersion.replace("v0.2", version);
      assert.equal(validate(future).valid, false);
    }
  }
});

test("valid content-free discard contracts pass schema and semantic checks", () => {
  for (const [value, validate, assertValid] of [
    [preflight(), validateExportWorkspaceDiscardPreflight, assertValidExportWorkspaceDiscardPreflight],
    [journal(), validateExportWorkspaceDiscardJournal, assertValidExportWorkspaceDiscardJournal],
    [marker(), validateExportWorkspaceDiscardCommitMarker, assertValidExportWorkspaceDiscardCommitMarker],
    [receipt(), validateExportWorkspaceDiscardReceipt, assertValidExportWorkspaceDiscardReceipt],
  ]) {
    assert.deepEqual(validate(value), { valid: true, errors: [] });
    assert.equal(assertValid(value), value);
  }
});

test("schemas reject paths, identifiers, hashes, unknown fields, and noncanonical inventory without echoing values", () => {
  const canary = "/Users/private/participant:v1:secret/PRIVATE_PROMPT";
  const cases = [
    [preflight(), validateExportWorkspaceDiscardPreflight, (value) => { value.workspacePath = canary; }],
    [journal(), validateExportWorkspaceDiscardJournal, (value) => { value.inventory[0].sha256 = "a".repeat(64); }],
    [marker(), validateExportWorkspaceDiscardCommitMarker, (value) => { value.participantId = canary; }],
    [receipt(), validateExportWorkspaceDiscardReceipt, (value) => { value.sourceDetails = canary; }],
    [journal(), validateExportWorkspaceDiscardJournal, (value) => { value.inventory.reverse(); }],
    [journal(), validateExportWorkspaceDiscardJournal, (value) => { value.inventoryCounts.totalBytes += 1; }],
    [preflight(), validateExportWorkspaceDiscardPreflight, (value) => { value.fileCounts.totalFiles += 1; }],
  ];
  for (const [value, validate, mutate] of cases) {
    mutate(value);
    const result = validate(value);
    assert.equal(result.valid, false);
    assert.equal(JSON.stringify(result.errors).includes(canary), false);
    assert.equal(JSON.stringify(result.errors).includes("PRIVATE_PROMPT"), false);
  }
});
