import { randomUUID } from 'node:crypto';
import { rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configureGuardedSqliteConnection } from './windows-protected-sqlite.js';
import { WINDOWS_TIMING_RECOVERY_CONTRACT, WINDOWS_TIMING_RECOVERY_METHODS } from './windows-filesystem.js';

const MAGIC = Buffer.from([217, 213, 5, 249, 32, 161, 99, 215]);
const fail = () => { throw new Error('timing_recovery_refused'); };
const retained = new Set();
const power = value => value >= 512 && value <= 65536 && (value & (value - 1)) === 0;

// Only complete, checksummed synced rollback segments are admitted. SQLite itself
// performs recovery; this is a conservative evidence gate, not a journal replayer.
function checkJournal(native, token) {
  const size = native.statSourceFile(token).size;
  if (!Number.isSafeInteger(size) || size < 512 || size > 512 * 1024 ** 2) fail();
  const read = (at, count) => {
    const bytes = native.readSourceFile(token, at, count);
    if (!Buffer.isBuffer(bytes) || bytes.length !== count) fail();
    return bytes;
  };
  let offset = 0, pages = null, pageSize = null, sectorSize = null, records = 0;
  const seen = new Set();
  while (offset < size) {
    const header = read(offset, 28);
    const count = header.readUInt32BE(8), nonce = header.readUInt32BE(12);
    const originalPages = header.readUInt32BE(16), sector = header.readUInt32BE(20), page = header.readUInt32BE(24);
    // SQLite writes a zero magic/count for an unsynced next segment. Recovery
    // stops there: no database write depended on that segment being durable.
    if (records && header.subarray(0, 12).every(byte => byte === 0)
        && pages === originalPages && pageSize === page && sectorSize === sector) break;
    if (!header.subarray(0, 8).equals(MAGIC)) fail();
    if (!count || count === 0xffffffff || !originalPages || !power(sector) || !power(page)
        || originalPages * page > 256 * 1024 ** 2
        || pages !== null && (pages !== originalPages || pageSize !== page || sectorSize !== sector)) fail();
    pages = originalPages; pageSize = page; sectorSize = sector;
    offset += sector;
    if (offset + count * (page + 8) > size) fail();
    for (let i = 0; i < count; i++) {
      const prefix = read(offset, 4), body = read(offset + 4, page), check = read(offset + 4 + page, 4);
      try {
        let sum = nonce;
        for (let at = page - 200; at > 0; at -= 200) sum = (sum + body[at]) >>> 0;
        const number = prefix.readUInt32BE();
        if (!number || number > pages || seen.has(number) || sum !== check.readUInt32BE()) fail();
        seen.add(number);
      } finally { body.fill(0); }
      offset += page + 8; records++;
    }
    if (offset === size) break;
    const aligned = Math.ceil(offset / sector) * sector;
    // Padding alone cannot prove a second durable section.
    if (aligned >= size) fail();
    offset = aligned;
  }
  if (!records) fail();
  return pages * pageSize;
}

/** Private platform fallback; callers retain their original audit guards. */
export async function recoverTimingJournal({ native, lease, file, databaseFactory, validate }) {
  if (retained.size || native.timingRecoveryContractVersion !== WINDOWS_TIMING_RECOVERY_CONTRACT
      || !WINDOWS_TIMING_RECOVERY_METHODS.every(name => typeof native[name] === 'function')) fail();
  let main, journal, recovered, directoryGuard, db, directory;
  let key;
  let stage = 'lock';
  const close = () => {
    if (!db) return;
    db.close();
    if (db.isOpen !== false) fail();
    db = null;
  };
  try {
    main = native.openTimingRecoveryFile(lease.guards[0]);
    journal = native.openTimingRecoveryFile(lease.guards[1]);
    stage = 'journal';
    const mainSize = native.statSourceFile(main).size;
    if (!Number.isSafeInteger(mainSize) || mainSize < 512 || mainSize > 256 * 1024 ** 2) fail();
    const restoredSize = checkJournal(native, journal);
    stage = 'copy';
    directory = join(dirname(file), `.timing-recovery-${randomUUID()}`);
    native.ensureDirectory(directory);
    directoryGuard = native.acquireProtectedDirectoryGuard(directory);
    native.copyLegacyStateFile(main, directory, directoryGuard.identity, 'timing-experiment.sqlite');
    native.copyLegacyStateFile(journal, directory, directoryGuard.identity, 'timing-experiment.sqlite-journal');
    const copy = join(directory, 'timing-experiment.sqlite');
    stage = 'copy_recovery';
    db = databaseFactory(copy, { timeout: 100 });
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY;');
    db.enableDefensive?.(true);
    configureGuardedSqliteConnection(db);
    stage = 'validation';
    key = validate(db);
    close();
    stage = 'frozen_validation';
    recovered = native.openLegacyStateFile(copy);
    if (native.statSourceFile(recovered).size !== restoredSize) fail();
    db = databaseFactory(`${pathToFileURL(copy).href}?mode=ro&immutable=1`, { readOnly: true, timeout: 100 });
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY;');
    db.enableDefensive?.(true);
    if (!key.equals(validate(db))) fail();
    if (db.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok') fail();
    close();
    stage = 'restore';
    if (native.restoreTimingRecoveryFile(main, journal, recovered) !== true) fail();
    return key;
  } catch (error) {
    // Admission errors are fixed and content-free; native/path/SQLite details
    // never escape this recovery-only boundary.
    if (['incompatible_database', 'incompatible_timing_identity', 'incompatible_parser_version', 'correlation_mismatch'].includes(error?.message)) throw error;
    throw Object.assign(new Error('timing_recovery_refused'), { recoveryStage: stage });
  } finally {
    try { close(); }
    catch {
      lease.retain();
      retained.add({ db, native, lease, main, journal, recovered, directoryGuard });
      // Never release file locks/guards while SQLite close is unconfirmed.
      throw new Error('timing_recovery_close_failed');
    }
    let releaseFailed = false;
    for (const token of [recovered, journal, main]) if (token) {
      try { native.closeSourceFile(token); } catch { releaseFailed = true; }
    }
    if (releaseFailed) {
      lease.retain();
      retained.add({ native, lease, main, journal, recovered, directoryGuard });
      throw new Error('timing_recovery_close_failed');
    }
    if (directoryGuard) {
      try {
        try {
          for (const name of ['timing-experiment.sqlite-journal', 'timing-experiment.sqlite']) {
            let info;
            try { info = native.inspectProtectedChild(directory, directoryGuard.identity, name); }
            catch (error) { if (error?.code === 'WINDOWS_FILESYSTEM_NOT_FOUND') continue; throw error; }
            native.deleteProtectedChild(directory, directoryGuard.identity, name, info.identity);
          }
        } finally { native.releaseProtectedDirectoryGuard(directoryGuard.guard); }
        await rmdir(directory);
      } catch { throw new Error('timing_recovery_cleanup_failed'); }
    }
  }
}
