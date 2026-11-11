import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, readdir, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createWindowsFilesystemAdapter, loadWindowsFilesystemBinding } from '../src/platform/windows-filesystem.js';
import { createTimingFilesystem } from '../src/platform/inference-timing-filesystem.js';
import { openTimingStore, ingestTimingFile, readTimingRows } from '../src/platform/inference-timing-store.js';
import { createParser, createToolFreeParser, digest, METHOD, TOOL_FREE_METHOD, MAX_STATE_BYTES, INFERENCE_TIMING_PARSER_VERSION } from '../src/providers/codex/logs.js';

const CONFIG = { createParser, digest, METHOD, MAX_STATE_BYTES, parserVersion: INFERENCE_TIMING_PARSER_VERSION };
const native = loadWindowsFilesystemBinding();
const filesystem = createTimingFilesystem({ loadWindowsBinding: () => native });
const options = { ...CONFIG, filesystem };
const stamp = 1_788_264_000_000;
const records = () => [
  ['session_meta', { id: 'synthetic-session' }],
  ['event_msg', { type: 'task_started', turn_id: 'synthetic-turn' }],
  ['turn_context', { turn_id: 'synthetic-turn', model: 'gpt-6-astra' }],
  ['event_msg', { type: 'item_completed', turn_id: 'synthetic-turn', thread_id: 'synthetic-session',
    item: { type: 'Reasoning' }, started_at_ms: stamp, completed_at_ms: stamp + 1000 }],
  ['token_usage_record', { thread_id: 'synthetic-session', turn_id: 'synthetic-turn', response_id: 'synthetic-response',
    usage: { output_tokens: 100, reasoning_output_tokens: 50 }, turn_token_usage: { output_tokens: 100, reasoning_output_tokens: 50 } }],
  ['event_msg', { type: 'task_complete', turn_id: 'synthetic-turn', duration_ms: 1000, time_to_first_token_ms: 200 }],
].map(([type, payload]) => JSON.stringify({ timestamp: new Date(stamp + 1000).toISOString(), type, payload })).join('\n') + '\n';

function crashWriter(file) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec('PRAGMA journal_mode=PERSIST; PRAGMA synchronous=FULL; PRAGMA cache_size=1; BEGIN IMMEDIATE;');
    if (db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='synthetic_pages'").get().n)
      db.exec('UPDATE synthetic_pages SET value=zeroblob(8192); UPDATE turn SET tokens=tokens+1;');
    db.exec('CREATE TABLE uncommitted(value BLOB); INSERT INTO uncommitted VALUES(zeroblob(1048576));');
    process.exit(23);
  `, file], { timeout: 10000, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 23, 'synthetic crash writer must reach its interrupted transaction');
}

async function fixture(t, mutate = () => {}, config = CONFIG) {
  const root = await mkdtemp(join(tmpdir(), 'timing-hot-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = join(root, 'state');
  createWindowsFilesystemAdapter().ensureDirectory(state);
  const directory = join(state, 'timing');
  const source = join(state, 'synthetic.jsonl');
  await writeFile(source, records());
  const store = await openTimingStore(directory, { ...config, filesystem });
  await ingestTimingFile(store, source);
  const rows = readTimingRows(store);
  assert.equal(rows.length, 1);
  const file = store.file;
  mutate(store.db);
  store.close();
  crashWriter(file);
  const pair = async () => Promise.all([readFile(file), readFile(`${file}-journal`)]);
  assert.deepEqual([...(await pair())[1].subarray(0, 8)], [217, 213, 5, 249, 32, 161, 99, 215]);
  return { root, state, directory, file, source, rows, pair };
}

test('current hot timing journals restore committed measurements and replay unchanged sources once', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 3; i++) {
    const store = await openTimingStore(f.directory, options);
    try {
      assert.deepEqual(readTimingRows(store), f.rows);
      assert.equal(store.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='uncommitted'").get().n, 0);
      assert.deepEqual(await ingestTimingFile(store, f.source), { bytes: 0, unchanged: true });
    } finally { store.close(); }
  }
  assert.equal((await readdir(f.directory)).some(name => name.startsWith('.timing-recovery-')), false);
});

test('multiple synced rollback segments restore every preimage before clearing the journal', async t => {
  const f = await fixture(t, db => db.exec(`
    CREATE TABLE synthetic_pages(id INTEGER PRIMARY KEY,value BLOB);
    WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200)
      INSERT INTO synthetic_pages SELECT x,zeroblob(4096) FROM n;`));
  const journal = (await f.pair())[1];
  assert.ok(journal.length > 200 * 4096, 'the crash must spill preimages across many journal segments');
  const store = await openTimingStore(f.directory, options);
  try {
    assert.deepEqual(readTimingRows(store), f.rows);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM synthetic_pages WHERE length(value)=4096').get().n, 200);
    assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  } finally { store.close(); }
});

test('the supplemental method restores through the same guards without accepting the primary schema', async t => {
  const config = { ...CONFIG, createParser: createToolFreeParser, METHOD: TOOL_FREE_METHOD };
  const f = await fixture(t, () => {}, config), before = await f.pair();
  await assert.rejects(openTimingStore(f.directory, options), { message: 'incompatible_database' });
  assert.deepEqual(await f.pair(), before);
  const store = await openTimingStore(f.directory, { ...config, filesystem });
  try { assert.deepEqual(readTimingRows(store), f.rows); } finally { store.close(); }
});

for (const [name, mutate, extra, expected] of [
  ['future schema', db => db.exec('PRAGMA user_version=999'), {}, 'incompatible_database'],
  ['old schema', db => db.exec('PRAGMA user_version=11'), {}, 'incompatible_database'],
  ['future parser', db => db.exec('UPDATE source SET parser_version=999'), {}, 'incompatible_parser_version'],
  ['foreign namespace', db => db.exec("PRAGMA ignore_check_constraints=ON; UPDATE metadata SET identity_version='synthetic-foreign-v1'"), {}, 'incompatible_timing_identity'],
  ['duplicate metadata', db => db.exec('INSERT INTO metadata SELECT * FROM metadata'), {}, 'incompatible_timing_identity'],
  ['wrong correlation key', () => {}, { correlationKey: Buffer.alloc(32, 0xee) }, 'correlation_mismatch'],
]) test(`${name} hot store is refused without changing main or journal bytes`, async t => {
  const f = await fixture(t, mutate), before = await f.pair();
  await assert.rejects(openTimingStore(f.directory, { ...options, ...extra }), { message: expected });
  assert.deepEqual(await f.pair(), before);
});

for (const corruption of ['checksum', 'truncated']) test(`a ${corruption} journal is refused without changing original evidence`, async t => {
  const f = await fixture(t);
  const journal = (await f.pair())[1];
  if (corruption === 'checksum') journal[512 + 4 + 4096] ^= 1;
  await writeFile(`${f.file}-journal`, corruption === 'truncated' ? journal.subarray(0, 600) : journal);
  const before = await f.pair();
  await assert.rejects(openTimingStore(f.directory, options), { message: 'timing_recovery_refused' });
  assert.deepEqual(await f.pair(), before);
});

test('recovery holds native read/write exclusion and cannot accept ordinary source tokens', async t => {
  const f = await fixture(t);
  let checked = false;
  const adapter = { ...native, restoreTimingRecoveryFile(main, journal, recovered) {
    const attempt = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { openSync, readSync, writeSync, closeSync } from 'node:fs';
      let refused = 0;
      for (const name of process.argv.slice(1)) {
        try { const fd=openSync(name,'r+'); closeSync(fd); } catch { refused++; }
        try { const fd=openSync(name,'r'); try { readSync(fd,Buffer.alloc(1),0,1,0); } finally { closeSync(fd); } } catch { refused++; }
      }
      process.exit(refused===4 ? 0 : 1);
    `, f.file, `${f.file}-journal`], { timeout: 10000, windowsHide: true });
    assert.equal(attempt.status, 0, 'the original main and journal must reject both reading and writing');
    assert.throws(() => native.restoreTimingRecoveryFile(recovered, journal, recovered));
    checked = true;
    return native.restoreTimingRecoveryFile(main, journal, recovered);
  } };
  const guarded = createTimingFilesystem({ loadWindowsBinding: () => adapter });
  const store = await openTimingStore(f.directory, { ...CONFIG, filesystem: guarded });
  try { assert.deepEqual(readTimingRows(store), f.rows); assert.equal(checked, true); }
  finally { store.close(); }
});

test('an existing writer refuses recovery before copying and can retry after releasing its handle', async t => {
  const f = await fixture(t), before = await f.pair();
  const writer = await open(f.file, 'r+');
  try { await assert.rejects(openTimingStore(f.directory, options), { message: 'timing_recovery_refused' }); }
  finally { await writer.close(); }
  assert.deepEqual(await f.pair(), before);
  const store = await openTimingStore(f.directory, options);
  try { assert.deepEqual(readTimingRows(store), f.rows); } finally { store.close(); }
});

test('missing recovery capability leaves hot evidence untouched while normal admission still works', async t => {
  const f = await fixture(t), before = await f.pair();
  const old = { ...native, timingRecoveryContractVersion: undefined };
  const oldFilesystem = createTimingFilesystem({ loadWindowsBinding: () => old });
  await assert.rejects(openTimingStore(f.directory, { ...CONFIG, filesystem: oldFilesystem }), { message: 'timing_recovery_refused' });
  assert.deepEqual(await f.pair(), before);
  const store = await openTimingStore(f.directory, options); store.close();
  const ordinary = await openTimingStore(f.directory, { ...CONFIG, filesystem: oldFilesystem });
  try { assert.deepEqual(readTimingRows(ordinary), f.rows); } finally { ordinary.close(); }
});

test('interrupted restore retries safely from a partially restored main and the original hot journal', async t => {
  const f = await fixture(t), before = await f.pair();
  const guard = native.acquireProtectedDirectoryGuard(f.state);
  const saved = join(f.state, 'verified-image.sqlite');
  const adapter = { ...native, restoreTimingRecoveryFile(main, journal, recovered) {
    native.copyLegacyStateFile(recovered, f.state, guard.identity, 'verified-image.sqlite');
    throw new Error('synthetic interruption before restore');
  } };
  try {
    const guarded = createTimingFilesystem({ loadWindowsBinding: () => adapter });
    await assert.rejects(openTimingStore(f.directory, { ...CONFIG, filesystem: guarded }), { message: 'timing_recovery_refused' });
  } finally { native.releaseProtectedDirectoryGuard(guard.guard); }
  assert.deepEqual(await f.pair(), before);
  // Rehearse the durable prefix left by an interrupted copy. Do not invalidate
  // the original hot journal. No failpoint is added to the product/native ABI.
  const image = await readFile(saved);
  const handle = await open(f.file, 'r+');
  try { await handle.write(image.subarray(0, 4096), 0, 4096, 0); await handle.sync(); }
  finally { await handle.close(); }
  assert.deepEqual((await f.pair())[1], before[1]);
  const store = await openTimingStore(f.directory, options);
  try { assert.deepEqual(readTimingRows(store), f.rows); } finally { store.close(); }
});

test('an unconfirmed recovery-copy close pins the originals until the isolated process exits', async t => {
  const f = await fixture(t), before = await f.pair();
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { openSync, closeSync } from 'node:fs';
    import { DatabaseSync } from 'node:sqlite';
    import { createTimingFilesystem } from './src/platform/inference-timing-filesystem.js';
    import { loadWindowsFilesystemBinding } from './src/platform/windows-filesystem.js';
    import { openTimingStore } from './src/platform/inference-timing-store.js';
    import { createParser,digest,METHOD,MAX_STATE_BYTES,INFERENCE_TIMING_PARSER_VERSION } from './src/providers/codex/logs.js';
    const filesystem=createTimingFilesystem({loadWindowsBinding:loadWindowsFilesystemBinding});
    const databaseFactory=(file, options)=>{
      const db=new DatabaseSync(file,options);
      if (!file.includes('.timing-recovery-')) return db;
      return { get isOpen(){return db.isOpen}, exec:db.exec.bind(db), prepare:db.prepare.bind(db),
        close(){throw new Error('PRIVATE-CLOSE-CANARY')} };
    };
    await assert.rejects(openTimingStore(process.argv[1],{createParser,digest,METHOD,MAX_STATE_BYTES,
      parserVersion:INFERENCE_TIMING_PARSER_VERSION,filesystem,databaseFactory}),{message:'timing_recovery_close_failed'});
    assert.throws(()=>{const fd=openSync(process.argv[2],'r+');closeSync(fd)});
    process.exit(0);
  `, f.directory, f.file], { timeout: 10000, encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 0, 'failed copy close must keep original locks until process death');
  assert.deepEqual(await f.pair(), before);
  const store = await openTimingStore(f.directory, options);
  try { assert.deepEqual(readTimingRows(store), f.rows); } finally { store.close(); }
});
