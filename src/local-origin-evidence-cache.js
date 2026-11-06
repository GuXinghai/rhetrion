import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { join } from "node:path";

// The Codex thread store can change independently of the rollout index. A
// complete origin read is reusable only while the main database, its WAL, and
// any rollback journal keep the exact same identity. The SHM file is SQLite
// coordination state, not committed data; its mtime can move on ordinary
// reader activity, so it is deliberately excluded. The cache is process-local
// and content-free; it never persists session identities or metadata.
const METADATA_FILES = Object.freeze([
  "state_5.sqlite",
  "state_5.sqlite-wal",
  "state_5.sqlite-journal",
]);

function fileIdentity(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.birthtimeMs];
}

/** A bounded, content-free identity for the Codex thread metadata store. */
export function readLocalOriginMetadataIdentity(codexHome) {
  if (typeof codexHome !== "string" || codexHome.length === 0) return null;
  const parts = [];
  let present = false;
  for (const name of METADATA_FILES) {
    try {
      const identity = fileIdentity(join(codexHome, name));
      if (identity === undefined) return null;
      present = true;
      parts.push([name, ...identity]);
    } catch (error) {
      if (error?.code === "ENOENT") {
        parts.push([name, null]);
        continue;
      }
      // An unreadable sidecar cannot prove identity. Do not risk a stale hit.
      return null;
    }
  }
  if (!present) return null;
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function samePrefix(cached, current) {
  if (!Array.isArray(cached) || !Array.isArray(current)
      || current.length < cached.length) return false;
  for (let index = 0; index < cached.length; index += 1) {
    if (cached[index] !== current[index]) return false;
  }
  return true;
}

/**
 * Reuse a complete origin read while the metadata store is unchanged and the
 * session list only grows at its tail. Existing sessions keep their exact
 * origin relations; only appended sessions are read. A removal, reorder,
 * metadata write, incomplete read, or unidentifiable store forces a full read
 * and replaces the retained entry. One entry is retained, so a changing store
 * cannot grow this cache.
 */
export function createOriginEvidenceCache({
  metadataIdentity = readLocalOriginMetadataIdentity,
} = {}) {
  if (typeof metadataIdentity !== "function") {
    throw new TypeError("metadataIdentity must be a function");
  }
  let entry = null;
  return {
    async read({
      codexHome,
      sessionIds,
      read,
      signal = null,
    } = {}) {
      if (!Array.isArray(sessionIds)) throw new TypeError("sessionIds must be an array");
      if (typeof read !== "function") throw new TypeError("read must be a function");
      signal?.throwIfAborted?.();
      const before = metadataIdentity(codexHome);
      if (before !== null && entry !== null && entry.metadataIdentity === before
          && samePrefix(entry.sessionIds, sessionIds)) {
        const tail = sessionIds.slice(entry.sessionIds.length);
        if (tail.length === 0) {
          return { complete: true, relations: entry.relations };
        }
        let evidence;
        try {
          evidence = await read(tail);
        } catch (error) {
          entry = null;
          throw error;
        }
        signal?.throwIfAborted?.();
        const after = metadataIdentity(codexHome);
        if (evidence?.complete === true && before === after) {
          const relations = new Map(entry.relations);
          for (const [id, value] of evidence.relations) relations.set(id, value);
          entry = {
            metadataIdentity: before,
            sessionIds: sessionIds.slice(),
            relations,
          };
          return { complete: true, relations };
        }
        entry = null;
        if (before !== after) {
          // The store moved while the tail was read. Retry once in full; the
          // next pass starts from a fresh entry.
          return read(sessionIds);
        }
        return evidence;
      }
      let evidence;
      try {
        evidence = await read(sessionIds);
      } catch (error) {
        entry = null;
        throw error;
      }
      signal?.throwIfAborted?.();
      const after = metadataIdentity(codexHome);
      if (evidence?.complete === true && before !== null && before === after) {
        entry = {
          metadataIdentity: before,
          sessionIds: sessionIds.slice(),
          relations: new Map(evidence.relations),
        };
      } else {
        entry = null;
      }
      return evidence;
    },
  };
}
