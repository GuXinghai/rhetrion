import { lstatSync } from 'node:fs';
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
