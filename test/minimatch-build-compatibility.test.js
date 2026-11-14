import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder/package.json'));
const app = createRequire(builder.resolve('app-builder-lib/package.json'));

test('builder file inclusion and exclusion retain patched minimatch semantics', () => {
  assert.equal(app('minimatch/package.json').version, '11.0.1');
  const { Minimatch } = app('minimatch');
  const { createFilter } = app('app-builder-lib/out/util/filter.js');
  const root = join(process.cwd(), 'synthetic-app');
  const filter = createFilter(root, ['**/*', '!**/*.map', '!private/**'].map(p => new Minimatch(p, { dot: true })));
  const file = { isDirectory: () => false };
  const directory = { isDirectory: () => true };
  assert.equal(filter(join(root, 'dist', 'app.js'), file), true);
  assert.equal(filter(join(root, '.config.json'), file), true);
  assert.equal(filter(join(root, 'dist', 'app.js.map'), file), false);
  assert.equal(filter(join(root, 'private', 'state.json'), file), false);
  assert.equal(filter(join(root, 'dist'), directory), true);
  assert.equal(filter(join(root, 'node_modules'), directory), false);
  const nested = createFilter(root, [new Minimatch('assets/icons/**/*.png', { dot: true })]);
  assert.equal(nested(join(root, 'assets'), directory), true);
  assert.equal(nested(join(root, 'assets', 'icons', 'tray.png'), file), true);
  assert.equal(nested(join(root, 'assets', 'icons', 'tray.txt'), file), false);
});

test('transitive universal consumer retains its named CommonJS matcher API', () => {
  // Resolve the retained dependency only; never execute another platform's packaging.
  const universal = createRequire(app.resolve('@electron/universal/package.json'));
  assert.equal(universal('minimatch/package.json').version, '11.0.1');
  const { minimatch } = universal('minimatch');
  assert.equal(minimatch('nested/Info.plist', '*.plist', { matchBase: true }), true);
  assert.equal(minimatch('nested/addon.node', '*.plist', { matchBase: true }), false);
});
