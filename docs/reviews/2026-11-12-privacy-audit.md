---
title: Local product privacy audit
date: 2026-11-12
type: review
status: reviewed-with-findings
---

# Result and evidence boundary

Reviewed checkout `28d31c5856e87e284b25e580194cbae7ca06a3f1` plus the existing
uncommitted architecture-cleanup and lineage-diagnostic changes on Windows x64.
No automatic usage-upload path was identified in the inspected desktop/local
composition. Four medium-priority privacy-control findings remain. This is
not a clean privacy sign-off or evidence that private data has actually leaked.

The later [source remediation receipt](../receipts/2026-11-12-privacy-remediation.md)
records the repairs and their separate validation boundary. This audit preserves
the findings as observed before those repairs.

Product code, real profiles, credentials, proxy settings, running processes and
release state were unchanged during the audit. Synthetic probes used disposable
isolated directories, a separate loopback server, fake workload/account ports
and generated markers. No real source records or credentials entered fixtures.

The [privacy inventory](../reference/local-data-and-privacy.md) remains the
intended contract. Source review and synthetic tests do not establish complete
packaged-app traffic behavior, native credential qualification or installed-state
security. This review does not certify every retained CLI/research tool or
transitive dependency.

## Findings, ordered for correction

### F1: Windows snapshot and index-salt readers do not enforce the native ACL boundary

**Priority: medium; confirmed synthetic Windows reproduction.**

In `src/platform/validated-snapshot-store.js`, `ownerOnlyFile` and
`ownerOnlyDirectory` check ordinary Node metadata; Windows has no `getuid`, so
those checks do not establish owner/DACL safety. Readback does not reject a
snapshot with an explicitly broad file ACL. New snapshot files created under a
protected root inherited a non-broad but unprotected DACL in the probe.
`src/local-index-identity.js` similarly reads an existing salt without native
owner/DACL validation. A generated salt with an Everyone-read grant was accepted.

The normal companion root is protected by `prepareLocalInstallationRoots`,
which substantially limits exposure. The probe does not establish that current
live files have broad permissions or that another Windows account read them.
Nevertheless, child-file validation is weaker than the maintained protected-state
contract, especially for the salt used to derive local identities.

**Reproduce:** create a disposable native-protected directory, write a synthetic
snapshot and 32-byte salt, grant read access only on those synthetic files with
the existing `grantSyntheticEveryoneRead` helper, then call
`createValidatedSnapshotStore(...).read()` and `readExistingDeviceSalt()`.
Both currently accept the files.

**Smallest correction:** reuse the existing Windows protected-state/held-handle
boundaries for these owners. Reject unsafe existing objects without repairing
ACLs or minting/replacing a salt. Preserve the snapshot envelope and salt bytes;
review any compatibility effect separately. Test unsafe owner/DACL/link/reparse
states, parent replacement, atomic publication and unchanged identity.

### F2: CLI and experiment failure output retain untrusted error text

**Priority: medium; confirmed synthetic reproduction and sink trace.**

`src/storage.js:readObservations` includes the input path and the JSON parser's
message in its error. A malformed generated record produced both the path and
a source-text excerpt. `src/cli.js` prints arbitrary `error.message` at its final
catch. Separately, `src/experiment-harness.js:runExperiment` stores
`String(error.message).split(":")[0]` in `stopReasons`; a generated arbitrary
workload error survives unchanged. The CLI appends the experiment result to its
result file and prints those reasons.

These are local CLI/research paths, not demonstrated desktop network egress.
The experiment probe injected every port and executed no model turn or live
account operation. Not every real OS error contains sensitive text, but the
sink does not enforce the claimed content-free boundary.

**Smallest correction:** project known fixed error codes and a fixed fallback at
the owned sinks. Keep record ordinals/counts where useful, never raw messages,
paths, JSON excerpts, stdout or stderr. Use marker tests for malformed JSON,
provider rejection, spawn failure and cleanup failure.

### F3: Diagnostic note codes are format-checked rather than allowlisted

**Priority: medium; confirmed isolated HTTP/log reproduction.**

`apps/local/server.js:authorizeDiagnosticNote` validates most `code` values with
`DIAGNOSTIC_ERROR_CODE`, a bounded identifier regex, rather than membership in a
fixed vocabulary. Without `workUsage`, a generated private marker formatted as
lowercase words/underscores received HTTP 200 and was written as the log code.
The browser client's `recordDiagnosticNote` has the same format-only policy.
The special `work_usage_*` context and the new lineage timing subcodes are
more restrictive and were not the bypass used here.

Same-origin and local-header authorization still apply; the probe made an
authorized request to a disposable server. This is not a cross-origin write
bypass or proof that a normal current error contains private text. It is a gap
in the claimed closed diagnostic vocabulary.

**Smallest correction:** define the actual accepted code vocabulary at the
existing owner, reject or map unknown codes to one fixed fallback, and mirror
the contract in the browser client. Preserve bounded references and request
identities. Test identifier-shaped markers as well as obvious paths/messages.

### F4: The authoritative dashboard snapshot permits arbitrary nested fields

**Priority: medium; confirmed persistence/readback reproduction; no current raw-source leak proved.**

`src/local-authoritative-dashboard-snapshot.js:isAuthoritativeDashboardSnapshot`
closes top-level keys and verifies accounting completeness, but does not close
most nested payloads. `snapshotForPersistence` ordinarily returns its input.
A minimal valid synthetic snapshot with an extra private marker inside
`overview` passed validation, was written, and survived readback. Restoration
clones the retained snapshot, and `getOverview` spreads the nested overview into
the local HTTP result.

This demonstrates missing defense at the persistence/publication boundary.
It does not prove a normal current parser populates that extra field. The
separate work-usage saved projection correctly rebuilds an allowlist and replaces
private join handles with snapshot-local aliases; that positive test passed.

**Smallest correction:** build the retained/public snapshot from reviewed
allowlisted nested DTOs and validate the same contract on read. Preserve explicit
unknown/stale evidence. Treat any snapshot format/acceptance change as a separate
compatibility review rather than silently broadening or relabeling its version.

## Boundaries checked without a new finding

- The local companion binds to `127.0.0.1`, verifies Host and loopback peer,
  requires same-origin/local headers for sensitive operations, and has no general
  remote-proxy route. The dashboard CSP and Electron request policy constrain
  requests to the selected local origin and narrow opaque resource protocols.
- The inspected desktop composition has no configured contribution/upload,
  telemetry or updater destination. Codex account/quota reads use local
  app-server RPC; Codex itself may contact its provider. Offline failure remains
  an unavailable/stale observation.
- X uses a separate session. Fixed loopback proxy mode has no configured DIRECT
  fallback. System mode follows system configuration and can become direct if
  that configuration changes. X pages can load their own web assets; this is
  not a blanket network kill switch for the app, Codex or other programs.
- X media is restricted to approved HTTPS hosts, redirect refusal and
  post-associated opaque references. X diagnostic projection omits arbitrary
  messages/paths and bounds frames/causes. Default permissions, window opening
  and dashboard navigation remain restricted.
- Provider normalization and export gates omit synthetic prompt/response,
  command, path, credential and raw-identity markers in the tested cases.
  Unknown upstream model strings become the reviewed unknown model at ingestion.
  Export uses closed schemas and local pseudonyms; retained pseudonyms remain
  linkable and are not claimed anonymous.
- Work-usage names and title fallbacks are transient local display exceptions;
  saved work figures use local aliases. Reviewed browser storage writes retain
  display preferences, not session content or source paths. Companion child
  environment forwarding is allowlisted and its later stdout is drained rather
  than forwarded to diagnostics.
- New lineage diagnostic subcodes remain fixed, content-free and process-local.
  They do not widen persisted quarantine or snapshot formats.

## Validation and remaining gates

Using pinned Node 26.2.0 and `scripts/run-isolated-tests.mjs`, 14 focused existing
files produced **183 passes, 0 failures, 1 pre-existing skip**. They covered Codex
privacy/config/sidecars, export, account scope, refresh diagnostics, saved work
figures, the real synthetic loopback server, desktop/startup/X diagnostics,
X service/media policy and desktop composition. The skip was the existing
Windows `O_NOFOLLOW` symlink-refusal qualification gap; it is not a passing gate.

Six additional temporary synthetic probes reproduced the findings. Their six
passes mean the undesirable current behavior was confirmed, not that privacy
requirements passed. The probes were removed from ordinary test discovery;
only their local ignored helper/log and this content-free review were retained.

A read-only point-time inspection of candidate `2026111201` found eight matching
application processes, one loopback listener, no non-loopback listener and no
established external TCP connection owned by those processes. This excludes
Codex child/provider processes, UDP/DNS, short-lived earlier connections and
future activity. No proxy outage was induced and no traffic payload was captured.

No full suite, credential qualification, new build, restart, live load test,
packet-capture or alternate-Windows-user access test was performed. Correct the
four findings in independent slices, run their negative cases, and qualify the
fresh packaged artifact separately before claiming privacy closure.
