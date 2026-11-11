import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportCompatibilityTuple } from "../src/export-contract.js";
import { deriveParticipantId } from "../src/export-identity.js";
import { createCodexExportSourcePlan } from "../src/export-source-plan.js";
import {
  createSupplementalSourcePlan,
  ExportSupplementalSourcePlanError,
  normalizeSupplementalSourcePlan,
  summarizeSupplementalSourcePlan,
} from "../src/export-supplemental-source-plan.js";
import { localCodexCheckpointState, localExportWorkspace } from
  "../src/local-node-runtime.js";
import { stableJson } from "../src/storage.js";
import { createProtectedFixtureTempDirectory, writeInitialProtectedFixtureFile } from "./helpers/windows-owner-only-fixture.js";

const {
  buildExportWorkspaceDescriptor,
  createExportWorkspace,
  ExportWorkspaceError,
  inspectExportWorkspaceDiscardState,
  openExportWorkspace,
  sourceCheckpointBatchSha256,
  supplementalSourceCheckpointBatchSha256,
} = localExportWorkspace;
const { createEmptyCodexCheckpointState } = localCodexCheckpointState;

const SECRET = Buffer.alloc(32, 79);

function digest(label) {
  return createHash("sha256").update(`supplemental-workspace-test:${label}`).digest("hex");
}

function activityPlan() {
  return {
    recordCount: 0,
    recordsSha256: createHash("sha256")
      .update("app-usagemonitor/export-activity-plan/v1\0")
      .update("[]")
      .digest("hex"),
  };
}

function usageRecord(id = "a", tokens = 10) {
  return {
    schemaVersion: "local-usage-event-v1",
    eventTime: "2026-07-24T12:30:00.000Z",
    provider: "openai_codex",
    modelId: "gpt-5.6-sol",
    modelRecognition: "recognized",
    modelFingerprint: null,
    billingSurface: "chatgpt_subscription",
    speedMode: "standard",
    apiServiceTier: "unknown",
    reasoningEffort: "unknown",
    components: {
      inputUncachedTokens: tokens,
      inputCacheReadTokens: 0,
      inputCacheWriteTokens: 0,
      inputCacheWrite5mTokens: null,
      inputCacheWrite1hTokens: null,
      outputTextTokens: 1,
      outputReasoningTokens: 0,
      outputCombinedTokens: null,
    },
    totalInputContextTokens: tokens,
    surface: "local_interactive_unclassified",
    agentScope: "root",
    lineageDisposition: "standalone",
    toolClassCounts: {
      webSearch: 0, fileSearch: 0, codeInterpreter: 0, hostedShell: 0, computerUse: 0,
      mcp: 0, applyPatch: 0, localShell: 0, subagent: 0, toolGateway: 0, other: 0, unknown: 0,
    },
    outcome: "unknown",
    eventId: `event:v2:${id.repeat(64)}`,
    sessionScopeId: `session:v1:${"9".repeat(64)}`,
    accountScopeId: "unattributed",
  };
}

function supplementalPlan({ device = "1", inode = "2" } = {}) {
  return createSupplementalSourcePlan({
    sources: [
      {
        ordinal: 0,
        sourceKey: digest("collector"),
        kind: "codex_collector_ledger",
        parserVersion: "codex-collector-ledger-v0.1",
        binding: {
          kind: "file_prefix",
          device,
          inode,
          birthtimeMs: 3,
          prefixBytes: 11,
          prefixSha256: digest("collector-prefix"),
        },
        initialCursorJson: stableJson({ batch: 0 }),
      },
    ],
  });
}

async function fixture({ supplemental = supplementalPlan() } = {}) {
  const root = await mkdtemp(join(tmpdir(), "usage-monitor-supplemental-workspace-"));
  const home = join(root, "codex-home");
  await mkdir(join(home, "sessions"), { recursive: true });
  await mkdir(join(home, "archived_sessions"), { recursive: true });
  await writeFile(join(home, "sessions", "rollout-2026-07-24T12-00-00-supplemental.jsonl"), `${JSON.stringify({
    timestamp: "2026-07-24T12:00:00.000Z",
    type: "session_meta",
    payload: { id: "PRIVATE_SESSION" },
  })}\n`);
  const sourcePlan = await createCodexExportSourcePlan({
    codexHome: home,
    startAt: "2026-07-24T11:00:00.000Z",
    endAt: "2026-07-24T13:00:00.000Z",
  });
  const descriptor = buildExportWorkspaceDescriptor({
    participantId: deriveParticipantId(SECRET),
    createdAt: "2026-07-24T13:00:00.000Z",
    coveredAt: { startAt: sourcePlan.startAt, endAt: sourcePlan.endAt },
    compatibility: exportCompatibilityTuple(),
    sourcePlan,
    supplementalSourcePlan: supplemental,
    activityPlan: activityPlan(),
  });
  return {
    root,
    sourcePlan,
    supplemental,
    descriptor,
    workspace: join(root, "workspace"),
  };
}

function codexBatch(sourceKey, expected, next, resourceDeltas = {}) {
  const value = {
    sourceKey,
    expected: {
      checkpointSeq: expected.checkpointSeq,
      phase: expected.phase,
      byteOffset: expected.byteOffset,
      lineOrdinal: expected.lineOrdinal,
    },
    next,
    records: [],
    seenOccurrences: [],
    localSnapshots: [],
    tierEvents: [],
    openTaskAdds: [],
    openTaskDeletes: [],
    diagnosticDeltas: [],
    resourceDeltas,
  };
  return { ...value, batchSha256: sourceCheckpointBatchSha256(value) };
}

function supplementalBatch(sourceKey, expected, next, {
  records = [], diagnosticDeltas = [], registryGapDeltas = [], resourceDeltas = {},
} = {}) {
  const value = {
    sourceKey,
    expected: {
      checkpointSeq: expected.checkpointSeq,
      status: expected.status,
      cursorJson: expected.cursorJson,
    },
    next,
    records,
    diagnosticDeltas,
    registryGapDeltas,
    resourceDeltas,
  };
  return { ...value, batchSha256: supplementalSourceCheckpointBatchSha256(value) };
}

async function completeCodexSource(workspace, source) {
  const initial = workspace.loadSourceCheckpoint(source.sourceKey);
  await workspace.commitSourceBatch(codexBatch(source.sourceKey, initial, {
    phase: "record_scan",
    byteOffset: 0,
    lineOrdinal: 0,
    parserState: createEmptyCodexCheckpointState(),
    completedPhaseCursor: { byteOffset: source.prefixBytes, lineOrdinal: 1 },
  }, { lines: 1 }));
  const record = workspace.loadSourceCheckpoint(source.sourceKey);
  await workspace.commitSourceBatch(codexBatch(source.sourceKey, record, {
    phase: "complete",
    byteOffset: source.prefixBytes,
    lineOrdinal: 1,
    parserState: record.parserState,
  }, { lines: 1 }));
}

test("new supplemental plans are Codex-only, strict, deterministic, and resource-accountable", async () => {
  const plan = supplementalPlan();
  assert.deepEqual(summarizeSupplementalSourcePlan(plan), {
    schemaVersion: "supplemental-export-source-plan-v3",
    supplementalSourcePlanSha256: plan.supplementalSourcePlanSha256,
    sourceCount: 1,
    sourceFiles: 1,
    sourceBytes: 11,
  });
  for (const mutate of [
    (value) => { value.sources[0].kind = "unreviewed_source"; },
    (value) => {
      value.sources[0].binding = {
        kind: "frozen_inventory",
        inventoryEntries: 1,
        inventoryBytes: 7,
        inventorySha256: digest("wrong-codex-inventory"),
      };
    },
    (value) => { value.sources[0].initialCursorJson = "{\"batch\":0}"; },
    (value) => { value.sources[0].ordinal = 1; },
    (value) => { value.sources[0].sourceKey = "invalid"; },
  ]) {
    const value = structuredClone(plan);
    mutate(value);
    assert.throws(() => summarizeSupplementalSourcePlan(value), (error) => error instanceof ExportSupplementalSourcePlanError
      && error.code === "export_supplemental_source_schema");
  }

  const value = await fixture();
  let workspace;
  try {
    workspace = await createExportWorkspace({
      directory: value.workspace,
      descriptor: value.descriptor,
      sourcePlan: value.sourcePlan,
      supplementalSourcePlan: value.supplemental,
    });
    assert.deepEqual(workspace.resourceUsage(), {
      policyVersion: workspace.resourceUsage().policyVersion,
      sourceFiles: 2,
      sourceBytes: value.sourcePlan.sources[0].prefixBytes + 11,
      directoryEntries: 0,
      lines: 0,
      oversizedIrrelevantLines: 0,
      outputRecords: 0,
      expandedRecordBytes: 0,
      cumulativeElapsedMs: 0,
      peakRssBytes: 0,
      workspaceHighWaterBytes: 0,
      recoveryReservations: 0,
    });
    assert.deepEqual(workspace.loadSupplementalSourcePlan(), value.supplemental);
    const checkpoint = workspace.loadNextSupplementalSourceCheckpoint();
    assert.equal(checkpoint.sourceKey, value.supplemental.sources[0].sourceKey);
    assert.equal(checkpoint.parserVersion, "codex-collector-ledger-v0.1");
  } finally {
    workspace?.close();
    await rm(value.root, { recursive: true, force: true });
  }
});

test("retired source kinds remain inspectable metadata but cannot enter new plans or workspaces", async () => {
  const source = {
    ordinal: 0,
    sourceKey: digest("retired-source-key"),
    kind: "claude_status_snapshot",
    parserVersion: "claude-statusline-v0.2",
    binding: {
      kind: "frozen_inventory",
      inventoryEntries: 0,
      inventoryBytes: 0,
      inventorySha256: digest("retired-inventory"),
    },
    initialCursorJson: stableJson({}),
  };
  const sources = [source];
  const legacy = {
    schemaVersion: "supplemental-export-source-plan-v3",
    supplementalSourcePlanSha256: createHash("sha256")
      .update("app-usagemonitor/supplemental-export-source-plan/v3\0")
      .update(stableJson(sources))
      .digest("hex"),
    sources,
  };
  assert.deepEqual(normalizeSupplementalSourcePlan(legacy), legacy);
  assert.throws(() => createSupplementalSourcePlan({ sources }), (error) => (
    error instanceof ExportSupplementalSourcePlanError
      && error.code === "export_supplemental_source_schema"
  ));

  const value = await fixture({ supplemental: legacy });
  const directory = join(value.root, "must-not-be-created");
  try {
    await assert.rejects(createExportWorkspace({
      directory,
      descriptor: value.descriptor,
      sourcePlan: value.sourcePlan,
      supplementalSourcePlan: legacy,
    }), (error) => error instanceof ExportWorkspaceError && error.code === "export_workspace_schema");
    await assert.rejects(readdir(directory), { code: "ENOENT" });
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("supplemental commits are atomic, byte-identical replays, and gate completion", async () => {
  const value = await fixture();
  let workspace;
  try {
    workspace = await createExportWorkspace({
      directory: value.workspace,
      descriptor: value.descriptor,
      sourcePlan: value.sourcePlan,
      supplementalSourcePlan: value.supplemental,
    });
    await completeCodexSource(workspace, value.sourcePlan.sources[0]);
    await assert.throws(() => workspace.finalizeScan(), (error) => error instanceof ExportWorkspaceError
      && error.code === "export_workspace_checkpoint_mismatch");
    assert.equal(workspace.isScanComplete(), false);
    workspace.close();
    workspace = null;
    assert.equal((await inspectExportWorkspaceDiscardState({ directory: value.workspace })).scanComplete, false);
    workspace = await openExportWorkspace({ directory: value.workspace, expectedDescriptor: value.descriptor });

    const first = workspace.loadSupplementalSourceCheckpoint(value.supplemental.sources[0].sourceKey);
    const batch = supplementalBatch(first.sourceKey, first, {
      status: "pending",
      cursorJson: stableJson({ batch: 1 }),
    }, {
      records: [{ recordType: "usageEvent", record: usageRecord("a", 10) }],
      diagnosticDeltas: [{ code: "malformed_lines", count: 1 }],
      resourceDeltas: { directoryEntries: 1, lines: 1, cumulativeElapsedMs: 4, peakRssBytes: 1024 },
    });
    const committed = await workspace.commitSupplementalSourceBatch(batch);
    assert.equal(committed.alreadyCommitted, false);
    assert.equal(committed.checkpoint.checkpointSeq, 1);
    assert.deepEqual(await workspace.commitSupplementalSourceBatch(batch), {
      alreadyCommitted: true,
      checkpoint: committed.checkpoint,
    });
    assert.deepEqual(workspace.diagnostics(), [{ code: "malformed_lines", count: 1 }]);
    const afterReplayUsage = workspace.resourceUsage();
    assert.equal(afterReplayUsage.outputRecords, 1);
    assert.equal(afterReplayUsage.directoryEntries, 1);

    const branching = supplementalBatch(first.sourceKey, first, {
      status: "pending",
      cursorJson: stableJson({ batch: 99 }),
    });
    await assert.rejects(workspace.commitSupplementalSourceBatch(branching), (error) => error instanceof ExportWorkspaceError
      && error.code === "export_workspace_checkpoint_mismatch");

    const current = workspace.loadSupplementalSourceCheckpoint(first.sourceKey);
    const conflict = supplementalBatch(first.sourceKey, current, {
      status: "pending",
      cursorJson: stableJson({ batch: 2 }),
    }, {
      records: [{ recordType: "usageEvent", record: usageRecord("a", 99) }],
      diagnosticDeltas: [{ code: "malformed_lines", count: 9 }],
      resourceDeltas: { lines: 1 },
    });
    await assert.rejects(workspace.commitSupplementalSourceBatch(conflict), (error) => error instanceof ExportWorkspaceError
      && error.code === "export_workspace_record_conflict");
    assert.deepEqual(workspace.loadSupplementalSourceCheckpoint(first.sourceKey), current);
    assert.deepEqual(workspace.resourceUsage(), afterReplayUsage);

    const invalidCursor = supplementalBatch(first.sourceKey, current, {
      status: "pending",
      cursorJson: "{\"batch\":2}",
    });
    await assert.rejects(workspace.commitSupplementalSourceBatch(invalidCursor), (error) => error instanceof ExportWorkspaceError
      && error.code === "export_workspace_schema");

    await workspace.commitSupplementalSourceBatch(supplementalBatch(first.sourceKey, current, {
      status: "complete",
      cursorJson: stableJson({ batch: 2 }),
    }));
    workspace.finalizeScan();
    assert.equal(workspace.isScanComplete(), true);
    assert.deepEqual(workspace.scanDiagnostics(), {
      sourceFilesScanned: 2,
      codes: [{ code: "malformed_lines", count: 1 }],
    });
    workspace.close();
    workspace = null;
    assert.equal((await inspectExportWorkspaceDiscardState({ directory: value.workspace })).scanComplete, true);
  } finally {
    workspace?.close();
    await rm(value.root, { recursive: true, force: true });
  }
});

test("an empty supplemental plan preserves the Codex-only completion path", async () => {
  const value = await fixture({ supplemental: createSupplementalSourcePlan() });
  let workspace;
  try {
    workspace = await createExportWorkspace({
      directory: value.workspace,
      descriptor: value.descriptor,
      sourcePlan: value.sourcePlan,
    });
    assert.equal(workspace.loadNextSupplementalSourceCheckpoint(), null);
    assert.equal(workspace.hasPendingSupplementalSources(), false);
    await completeCodexSource(workspace, value.sourcePlan.sources[0]);
    workspace.finalizeScan();
    assert.equal(workspace.isScanComplete(), true);
    workspace.close();
    workspace = null;
    const reopened = await openExportWorkspace({ directory: value.workspace, expectedDescriptor: value.descriptor });
    try {
      assert.equal(reopened.isScanComplete(), true);
      assert.deepEqual(reopened.loadSupplementalSourcePlan(), value.supplemental);
    } finally {
      reopened.close();
    }
  } finally {
    workspace?.close();
    await rm(value.root, { recursive: true, force: true });
  }
});

test("opening revalidates the descriptor-bound supplemental plan exactly", async () => {
  const value = await fixture();
  let workspace;
  try {
    workspace = await createExportWorkspace({
      directory: value.workspace,
      descriptor: value.descriptor,
      sourcePlan: value.sourcePlan,
      supplementalSourcePlan: value.supplemental,
    });
    const databaseFile = workspace.databaseFile;
    workspace.close();
    workspace = null;
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(databaseFile);
    try {
      database.prepare(`
        UPDATE supplemental_source_plan SET initial_cursor_json = ? WHERE source_key = ?
      `).run(stableJson({ batch: 7 }), value.supplemental.sources[0].sourceKey);
    } finally {
      database.close();
    }
    await assert.rejects(openExportWorkspace({ directory: value.workspace }), (error) => error instanceof ExportWorkspaceError
      && error.code === "export_workspace_schema");
  } finally {
    workspace?.close();
    await rm(value.root, { recursive: true, force: true });
  }
});

test("retired physical v4 workspaces are refused without modifying retained evidence", async () => {
  const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "export-workspace-retired-"));
  let legacy;
  try {
    const databaseFile = join(root, "workspace.sqlite3");
    writeInitialProtectedFixtureFile(databaseFile, "");
    legacy = new DatabaseSync(databaseFile);
    legacy.exec(await readFile(new URL("./fixtures/export-workspace-v4-schema.sql", import.meta.url), "utf8"));
    legacy.prepare("INSERT INTO workspace_meta(key, value_json) VALUES (?, ?)")
      .run("retained_evidence", stableJson({ synthetic: "archived_v4_evidence" }));
    assert.equal(legacy.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    legacy.close(); legacy = null;
    const originalBytes = await readFile(databaseFile);
    const originalEntries = await readdir(root);
    await assert.rejects(openExportWorkspace({ directory: root }), error => error.code === "export_workspace_schema");
    assert.deepEqual(await readFile(databaseFile), originalBytes);
    assert.deepEqual(await readdir(root), originalEntries);
    legacy = new DatabaseSync(databaseFile, { readOnly: true });
    assert.equal(legacy.prepare("PRAGMA user_version").get().user_version, 4);
    assert.deepEqual(JSON.parse(legacy.prepare("SELECT value_json FROM workspace_meta WHERE key='retained_evidence'").get().value_json),
      { synthetic: "archived_v4_evidence" });
  } finally { legacy?.close(); await rm(root, { recursive: true, force: true }); }
});

test("future workspace schemas are refused before writable pragmas alter the original database", async () => {
  const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "export-workspace-future-"));
  try {
    const databaseFile = join(root, "workspace.sqlite3");
    writeInitialProtectedFixtureFile(databaseFile, "");
    const database = new DatabaseSync(databaseFile);
    database.exec("PRAGMA journal_mode=WAL; PRAGMA application_id=1431522612; PRAGMA user_version=999; CREATE TABLE future_identity(value TEXT) STRICT;");
    database.close();
    const before = createHash("sha256").update(await readFile(databaseFile)).digest("hex");
    await assert.rejects(openExportWorkspace({ directory: root }), error => error.code === "export_workspace_schema");
    assert.equal(createHash("sha256").update(await readFile(databaseFile)).digest("hex"), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("supplemental U64/U128 maxima survive SQLite and restart as exact canonical text", async () => {
  const device = "18446744073709551615";
  const inode = "340282366920938463463374607431768211455";
  const value = await fixture({ supplemental: supplementalPlan({ device, inode }) });
  let workspace;
  try {
    workspace = await createExportWorkspace({ directory: value.workspace, descriptor: value.descriptor,
      sourcePlan: value.sourcePlan, supplementalSourcePlan: value.supplemental });
    const databaseFile = workspace.databaseFile;
    assert.equal(workspace.getDescriptor().workspaceVersion, "local-export-workspace-v2");
    workspace.close(); workspace = null;
    const database = new DatabaseSync(databaseFile);
    try {
      assert.equal(database.prepare("PRAGMA user_version").get().user_version, 8);
      const row = database.prepare("SELECT device, inode, typeof(device) AS device_type, typeof(inode) AS inode_type FROM supplemental_source_plan").get();
      assert.deepEqual({ ...row }, { device, inode, device_type: "text", inode_type: "text" });
      for (const [field, invalid] of [["device", "18446744073709551616"], ["inode", "340282366920938463463374607431768211456"],
        ["inode", "u64:42"], ["inode", "0042"], ["device", "-1"]]) {
        assert.throws(() => database.prepare(`UPDATE supplemental_source_plan SET ${field}=?`).run(invalid), /CHECK constraint failed/);
      }
    } finally { database.close(); }
    workspace = await openExportWorkspace({ directory: value.workspace });
    assert.deepEqual(workspace.loadSupplementalSourcePlan(), value.supplemental);
    assert.deepEqual(workspace.loadSupplementalSourceCheckpoint(value.supplemental.sources[0].sourceKey).binding,
      value.supplemental.sources[0].binding);
  } finally { workspace?.close(); await rm(value.root, { recursive: true, force: true }); }
});

test("old supplemental versions, numeric IDs and malformed field widths are refused without rewriting", () => {
  const plan = supplementalPlan();
  for (const version of ["v1", "v2", "v4"]) {
    const invalid = { ...plan, schemaVersion: `supplemental-export-source-plan-${version}` };
    const before = stableJson(invalid);
    assert.throws(() => normalizeSupplementalSourcePlan(invalid), { code: "export_supplemental_source_schema" });
    assert.equal(stableJson(invalid), before);
  }
  for (const [field, invalid] of [["device", 1], ["inode", 2], ["inode", 9007199254740992],
    ["device", "18446744073709551616"], ["inode", "340282366920938463463374607431768211456"],
    ["inode", "0042"], ["inode", "-1"], ["device", "0x01"]]) {
    assert.throws(() => supplementalPlan({ [field]: invalid }), { code: "export_supplemental_source_schema" });
  }
});

test("prior physical schemas 5, 6 and 7 are refused before changing retained bytes", async () => {
  for (const version of [5, 6, 7]) {
    const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "export-workspace-prior-"));
    try {
      const file = join(root, "workspace.sqlite3");
      writeInitialProtectedFixtureFile(file, "");
      const database = new DatabaseSync(file);
      try {
        database.exec(`PRAGMA application_id=1431522612; PRAGMA user_version=${version}; CREATE TABLE retained_evidence(value TEXT) STRICT;`);
        database.prepare("INSERT INTO retained_evidence VALUES (?)").run("synthetic retained state");
      } finally { database.close(); }
      const before = await readFile(file);
      const entries = await readdir(root);
      await assert.rejects(openExportWorkspace({ directory: root }), { code: "export_workspace_schema" });
      assert.deepEqual(await readFile(file), before);
      assert.deepEqual(await readdir(root), entries);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
