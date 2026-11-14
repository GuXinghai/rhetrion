import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createWindowsFilesystemAdapter, createWindowsProtectedStateStore } from '../src/platform/index.js';
import { loadWindowsSourceReadBinding } from '../src/platform/windows-filesystem.js';
import { readOrCreateDeviceSalt } from '../src/local-index-identity.js';
import { createWindowsSyntheticOwnedSource } from './lib/windows-synthetic-source-owner.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('WINDOWS_DIAGNOSTIC_PLATFORM_REQUIRED');
const root = await mkdtemp(join(tmpdir(), 'admission-diagnostic-'));
const adapter = createWindowsFilesystemAdapter();
const source = loadWindowsSourceReadBinding();
const emit = (stage, result) => console.log(JSON.stringify({stage,...result}));
async function probe(stage, run) {
  try { const result = await run(); emit(stage,{ok:true,...result}); }
  catch (error) { emit(stage,{ok:false,code:typeof error?.code==='string' && /^[A-Za-z_]+$/.test(error.code) ? error.code : 'diagnostic_failed'}); }
}
function inspect(path) {
  const x=adapter.inspectPath(path);
  return {ownerMatches:x.ownerMatches,daclProtected:x.daclProtected};
}
function read(path) { let lease; try {lease=source.openSourceFile(path); return {bytes:source.readSourceFile(lease,0,9).length};} finally {if(lease) source.closeSourceFile(lease);} }
try {
  const token=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$i=[System.Security.Principal.WindowsIdentity]::GetCurrent(); [Console]::Write(($i.Owner.Value -eq $i.User.Value).ToString().ToLowerInvariant())"],{encoding:'utf8',timeout:10000,windowsHide:true});
  emit('default_token_owner',{ok:token.status===0,equalsUser:token.stdout==='true',timedOut:token.error?.code==='ETIMEDOUT'});
  await probe('ordinary_temp_directory',()=>inspect(root));
  const plain=join(root,'plain.json'); await writeFile(plain,'synthetic');
  await probe('ordinary_source_metadata',()=>inspect(plain));
  await probe('ordinary_source_admission',()=>read(plain));
  const owned=join(root,'owned.json');
  await probe('synthetic_owner_creation',()=>{createWindowsSyntheticOwnedSource(owned,'synthetic'); return inspect(owned);});
  await probe('synthetic_owner_admission',()=>read(owned));
  const protectedRoot=join(root,'protected');
  await probe('native_protected_directory',()=>{adapter.ensureDirectory(protectedRoot); return inspect(protectedRoot);});
  await probe('native_protected_file',()=>{adapter.createFile(join(protectedRoot,'data.json'),Buffer.from('synthetic')); return inspect(join(protectedRoot,'data.json'));});
  await probe('native_protected_source_admission',()=>read(join(protectedRoot,'data.json')));
  await probe('protected_store_existing_temp',()=>{const s=createWindowsProtectedStateStore({adapter,rootPath:root});s.create('record',Buffer.from('synthetic'));});
  await probe('protected_store_native_root',()=>{const s=createWindowsProtectedStateStore({adapter,rootPath:protectedRoot});s.create('record',Buffer.from('synthetic'));});
  await probe('salt_native_root',async()=>({validLength:(await readOrCreateDeviceSalt(join(protectedRoot,'salt'))).length===32}));
  emit('policy',{productionSafe:adapter.productionSafe,pathWalkRaceSafe:adapter.pathWalkRaceSafe});
} finally {await rm(root,{recursive:true,force:true});}
