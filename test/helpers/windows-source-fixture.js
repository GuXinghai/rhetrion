import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync as rawWriteFileSync, mkdirSync as rawMkdirSync, mkdtempSync as rawMkdtempSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createWindowsFilesystemAdapter } from '../../src/platform/index.js';

// Only newly-created disposable source fixtures are normalized. Existing files,
// including deliberate foreign-owner/link fixtures, retain their security state.
export function sourceFixtureFile(path) {
  if (process.platform === 'win32') {
    try { lstatSync(path); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      createWindowsFilesystemAdapter().createFile(path, Buffer.alloc(0));
    }
  }
  return path;
}

export async function writeSourceFixture(path, data, options) {
  sourceFixtureFile(path);
  return writeFile(path, data, options);
}

// Valid initial directories use native creation; an existing directory is never
// repaired here, so deliberate unsafe-directory fixtures keep their descriptor.
export async function mkdirSourceFixture(path, options) {
  const { mkdir } = await import('node:fs/promises');
  if (process.platform !== 'win32') return mkdir(path, options);
  try { lstatSync(path); return mkdir(path, options); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    createWindowsFilesystemAdapter().ensureDirectory(path);
  }
}

export { createProtectedFixtureTempDirectory as mkdtemp } from './windows-owner-only-fixture.js';
export { writeSourceFixture as writeFile, mkdirSourceFixture as mkdir };

export function writeSourceFixtureSync(path, data, options) {
  sourceFixtureFile(path);
  return rawWriteFileSync(path, data, options);
}

export function mkdirSourceFixtureSync(path, options) {
  if (process.platform !== 'win32') return rawMkdirSync(path, options);
  try { lstatSync(path); return rawMkdirSync(path, options); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    createWindowsFilesystemAdapter().ensureDirectory(path);
  }
}

export function mkdtempSourceFixtureSync(prefix) {
  if (process.platform !== 'win32') return rawMkdtempSync(prefix);
  const path = `${prefix}${randomUUID()}`;
  createWindowsFilesystemAdapter().ensureDirectory(path);
  return path;
}

// Call only for fresh generator output, before security identities are captured.
// Replacement preserves exact bytes and never mutates a retained source.
export function normalizeFreshSourceFixtures(sources) {
  if (process.platform !== 'win32') return;
  const adapter = createWindowsFilesystemAdapter();
  for (const source of sources) {
    const temporary = `${source}.owned-fixture`;
    adapter.createFile(temporary, Buffer.alloc(0));
    try { rawWriteFileSync(temporary, readFileSync(source)); renameSync(temporary, source); }
    finally { rmSync(temporary, { force: true }); }
  }
}
