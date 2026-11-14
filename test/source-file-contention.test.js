import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSourceFileAccess } from "../src/platform/index.js";
import {
  assertWindowsOwnerOnly, createProtectedFixtureTempDirectory,
  writeInitialProtectedFixtureFile,
} from "./helpers/windows-owner-only-fixture.js";

// A disposable peer holds DELETE access but never deletes or writes anything.
// Sharing conflicts must remain refusals, distinct from denied read permission.
const HOLD_DELETE_ACCESS = `
$ErrorActionPreference='Stop'
$phase='compile'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class SyntheticDeleteAccess {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
    IntPtr security, uint disposition, uint flags, IntPtr template);
}
'@
  $phase='open'
  $handle=[SyntheticDeleteAccess]::CreateFileW($env:RHETRION_SYNTHETIC_LEASE,
    0x10080, 7, [IntPtr]::Zero, 3, 0x2200000, [IntPtr]::Zero)
  if ($handle.IsInvalid) {
    $reason=switch ([Runtime.InteropServices.Marshal]::GetLastWin32Error()) {
      5 {'ACCESS_DENIED'} 32 {'SHARING_VIOLATION'} 33 {'LOCK_VIOLATION'}
      2 {'NOT_FOUND'} 3 {'PATH_NOT_FOUND'} 123 {'INVALID_NAME'} default {'OTHER'}
    }
    [Console]::Out.WriteLine('OPEN_'+$reason); exit 11
  }
  $phase='hold'
  try { [Console]::Out.WriteLine('READY'); [Console]::Out.Flush(); $null=[Console]::In.ReadLine() }
  finally { $handle.Dispose() }
} catch { [Console]::Out.WriteLine('FAILED_'+$phase); exit 12 }
`;

async function holdDeleteAccess(path) {
  const child = spawn(join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(HOLD_DELETE_ACCESS, "utf16le").toString("base64")], {
      env: { ...process.env, RHETRION_SYNTHETIC_LEASE: path },
      stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
    });
  const exited = once(child, "exit");
  try {
    await new Promise((resolve, reject) => {
      let marker = "";
      const timeout = setTimeout(() => reject(new Error("synthetic_lease_not_ready")), 10000);
      const cleanup = () => { clearTimeout(timeout); child.stdout.off("data", onData); child.off("exit", onExit); child.off("error", onError); };
      const onData = chunk => {
        marker = (marker + String(chunk)).slice(-128);
        if (/(?:^|\n)READY\r?\n/u.test(marker)) { cleanup(); resolve(); }
      };
      const onExit = code => { cleanup(); reject(new Error(`synthetic_lease_exited_${code}_${marker.trim()}`)); };
      const onError = () => { cleanup(); reject(new Error("synthetic_lease_unavailable")); };
      child.stdout.on("data", onData); child.once("exit", onExit); child.once("error", onError);
    });
  } catch (error) { child.kill(); await exited.catch(() => {}); throw error; }
  return async () => {
    const timeout = setTimeout(() => child.kill(), 5000);
    try { child.stdin.end("release\n"); assert.equal((await exited)[0], 0); }
    finally { clearTimeout(timeout); }
  };
}

test("native source acquisition distinguishes file and ancestor contention without changing sharing or ACLs", async t => {
  const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "source-contention-"));
  const file = join(root, "synthetic.txt");
  writeInitialProtectedFixtureFile(file, "synthetic\n");
  try {
    for (const [name, path] of [["file", file], ["ancestor", root]]) await t.test(name, async () => {
      const release = await holdDeleteAccess(path);
      try {
        await assert.rejects(createSourceFileAccess().open(file), error => {
          assert.equal(error.code, "WINDOWS_FILESYSTEM_SOURCE_BUSY");
          assert.equal(JSON.stringify(error).includes(root), false);
          assert.equal(error.message.includes(root), false);
          return true;
        });
      } finally { await release(); }
      const handle = await createSourceFileAccess().open(file);
      try { assert.equal((await handle.stat()).size, 10); } finally { await handle.close(); }
      assertWindowsOwnerOnly(file);
      assert.equal(await readFile(file, "utf8"), "synthetic\n");
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
