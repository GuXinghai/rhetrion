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
