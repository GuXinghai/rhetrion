import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat, link, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createWindowsFilesystemAdapter} from '../src/platform/windows-filesystem.js';
import {assertWindowsOwnerOnly, createProtectedFixtureTempDirectory,
  grantSyntheticEveryoneRead, writeInitialProtectedFixtureFile} from './helpers/windows-owner-only-fixture.js';

async function fixture(t) {
  const root=await createProtectedFixtureTempDirectory(join(tmpdir(),'exact-delete-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+'\\'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,'target'),peer=join(root,'quarantine');
  const bytes=Buffer.from('synthetic deletion evidence');
  writeInitialProtectedFixtureFile(file,bytes);
  const stats=await lstat(file,{bigint:true});
  const evidence={device:stats.dev.toString(),inode:stats.ino.toString(),byteSize:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')};
  return {root,file,peer,bytes,evidence,adapter:createWindowsFilesystemAdapter()};
}

test('exact deletion binds identity and SHA-256 before removing a single protected file',async t=>{
  const f=await fixture(t);
  assert.equal(f.adapter.deleteExactFile(f.file,f.evidence).deleted,true);
  await assert.rejects(lstat(f.file),{code:'ENOENT'});
});

test('exact deletion preserves a different object even with byte-identical content',async t=>{
  const f=await fixture(t),replacement=join(f.root,'replacement');
  writeInitialProtectedFixtureFile(replacement,f.bytes);
  const identity=assertWindowsOwnerOnly(replacement).identity;
  await rename(replacement,f.file);
  assert.throws(()=>f.adapter.deleteExactFile(f.file,f.evidence),{code:'WINDOWS_FILESYSTEM_IDENTITY_MISMATCH'});
  assert.deepEqual(await readFile(f.file),f.bytes);
  assert.deepEqual(assertWindowsOwnerOnly(f.file).identity,identity);
});

test('exact deletion refuses changed bytes on the same file object',async t=>{
  const f=await fixture(t),identity=assertWindowsOwnerOnly(f.file).identity;
  const changed=Buffer.alloc(f.bytes.length,90);
  await writeFile(f.file,changed);
  assert.throws(()=>f.adapter.deleteExactFile(f.file,f.evidence),{code:'WINDOWS_FILESYSTEM_IDENTITY_MISMATCH'});
  assert.deepEqual(await readFile(f.file),changed);
  assert.deepEqual(assertWindowsOwnerOnly(f.file).identity,identity);
});

test('two-link deletion requires the exact distinct peer then preserves its recoverable single link',async t=>{
  const f=await fixture(t);
  await link(f.file,f.peer);
  assert.throws(()=>f.adapter.deleteExactFile(f.file,f.evidence),{code:'WINDOWS_FILESYSTEM_HARD_LINK'});
  assert.throws(()=>f.adapter.deleteExactFile(f.file,f.evidence,f.file),{code:'WINDOWS_FILESYSTEM_IDENTITY_MISMATCH'});
  assert.equal(f.adapter.deleteExactFile(f.file,f.evidence,f.peer).deleted,true);
  await assert.rejects(lstat(f.file),{code:'ENOENT'});
  assert.deepEqual(await readFile(f.peer),f.bytes);
  assertWindowsOwnerOnly(f.peer);
  assert.equal(f.adapter.deleteExactFile(f.peer,f.evidence).deleted,true);
  await assert.rejects(lstat(f.peer),{code:'ENOENT'});
});

test('pair deletion refuses unrelated peers and any third link',async t=>{
  const f=await fixture(t),other=join(f.root,'other');
  await link(f.file,f.peer);
  writeInitialProtectedFixtureFile(other,f.bytes);
  assert.throws(()=>f.adapter.deleteExactFile(f.file,f.evidence,other));
  await link(f.file,join(f.root,'third'));
  assert.throws(()=>f.adapter.deleteExactFile(f.file,f.evidence,f.peer),{code:'WINDOWS_FILESYSTEM_HARD_LINK'});
  for(const path of [f.file,f.peer,other])assert.deepEqual(await readFile(path),f.bytes);
});

test('malformed deletion evidence cannot remove a file or expose supplied strings',async t=>{
  const f=await fixture(t),canary='PRIVATE_INVALID_DELETE_EVIDENCE';
  for(const evidence of [{...f.evidence,inode:canary},{...f.evidence,device:'18446744073709551616'},
    {...f.evidence,byteSize:NaN},{...f.evidence,sha256:canary}]){
    assert.throws(()=>f.adapter.deleteExactFile(f.file,evidence),error=>
      /^WINDOWS_FILESYSTEM_/u.test(error.code)&&!String(error).includes(canary));
  }
  assert.deepEqual(await readFile(f.file),f.bytes);
});

test('exact deletion preserves a file whose DACL no longer meets the owner-only contract',async t=>{
  const f=await fixture(t);
  grantSyntheticEveryoneRead(f.file);
  assert.throws(()=>f.adapter.deleteExactFile(f.file,f.evidence),{code:'WINDOWS_FILESYSTEM_SECURITY_POLICY'});
  assert.deepEqual(await readFile(f.file),f.bytes);
});
