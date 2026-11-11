---
title: Collector U128 identity compatibility and recovery review
date: 2026-11-11
type: review
status: owner-authorized-implementation-boundary
---

The owner authorized the [repair](../receipts/2026-11-11-collector-source-identity-repair.md)
after its synthetic diagnosis. This review selects the private-format boundary
before implementation at `71f1a2cb` plus preserved work. It is not migration,
live-state, installed-artifact or native-policy qualification.

- Collector plan v0.3 accepts canonical decimal strings only: device U64, file
  U128. Its commitment domain advances to v0.3; source keys and unchanged-shape
  cursors remain bound to that digest. v0.1/v0.2 and future plans refuse before
  source access. Remove numeric-version inference and old plan dispatch.
- Supplemental plan v3 uses the same field widths and strings, with a v3 digest
  domain. Old plans refuse; no old writer or automatic conversion remains.
  Retained retired-provider evidence does not authorize collection or resume.
- Workspace descriptor v2 and physical schema 8 replace v1/schema 7. Supplemental
  device/file columns use the primary source's canonical string encoding and
  SQL bounds. Remove the `u64:` decoder/encoder; do not reinterpret its bytes.
  Current-reader schema admission and old-reader version refusal precede writes.
- Private source-plan bundle v0.3 and its digest domain advance together. Public
  exported usage/quota record shapes, accounting, timing and index caches,
  pseudonyms, occurrence identities and credentials remain unchanged.
- Existing state is never relabeled, deleted or upgraded in place. No exact old
  workspace target was identified by the earlier access-limited inventory. If
  one is later found, preserve it and review its copy-first recovery separately;
  this review does not authorize a real-data operation or invent a converter.
- Rollback may restore source but must preserve new-format state. Older readers
  must refuse it. No downgrade or shared-history rewrite belongs to rollback.

Acceptance requires U64/U128 limits, adjacent high IDs and malformed/overflow
refusal; native protected-source create/reopen/restart; exact committed records
after process death; append/mutation/replacement/link/owner refusal; unchanged
external sources and retained evidence; bounded resources, cancellation and
content-free errors. The six-file baseline (43 passed / 23 failed) must be rerun
alongside identity and owner/deletion/discard tests, architecture, contract,
documentation and preflight. General native approval flags remain false.
