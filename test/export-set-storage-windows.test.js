import assert from "node:assert/strict";
import { link, readFile, readdir, rm, symlink } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createExportSetVerificationStorageContext } from "../src/platform/index.js";
import {
  assertWindowsOwnerOnly, createProtectedFixtureTempDirectory,
  grantSyntheticEveryoneRead, writeInitialProtectedFixtureFile,
} from "./helpers/windows-owner-only-fixture.js";

const windows = { skip: process.platform !== "win32" };
const createError = (code) => Object.assign(new Error("synthetic verification refusal"), { code });

test("Windows set artifact ports enforce native file and parent ACLs", windows, async (t) => {
  const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "set-storage-acl-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = createExportSetVerificationStorageContext();
  const path = join(root, "artifact.json");
  const text = '{"value":1}';
  writeInitialProtectedFixtureFile(path, text);
  const options = { root, basename: "artifact.json", label: "manifest",
    maximumBytes: 128, expectedBytes: Buffer.byteLength(text), canonicalJson: JSON.stringify, createError };
  assert.equal(await storage.inspectOwnerDirectory({ directory: root, createError }), root);
  assert.deepEqual((await storage.readCanonicalArtifact(options)).value, { value: 1 });
  assert.equal((await storage.readOwnerOnlyBytes(options)).toString(), text);
  await assert.rejects(storage.readCanonicalArtifact({ ...options,
    canonicalJson() { throw new Error("SYNTHETIC_SERIALIZER_CANARY"); } }),
  (error) => error.code === "manifest_changed" && !error.message.includes("SYNTHETIC_SERIALIZER_CANARY"));
  grantSyntheticEveryoneRead(path);
  for (const read of [storage.readCanonicalArtifact, storage.readOwnerOnlyBytes]) {
    await assert.rejects(read(options), { code: "manifest_permissions" });
  }
  assert.equal(await readFile(path, "utf8"), text);
  grantSyntheticEveryoneRead(root);
  await assert.rejects(storage.inspectOwnerDirectory({ directory: root, createError }), { code: "directory" });
});

test("Windows set artifact ports refuse hardlinks, reparse points and oversized reads", windows, async (t) => {
  const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "set-storage-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = createExportSetVerificationStorageContext();
  const target = join(root, "target.json");
  writeInitialProtectedFixtureFile(target, "{}");
  const options = { root, basename: "target.json", label: "chunk_artifact",
    maximumBytes: 1, expectedBytes: 2, canonicalJson: JSON.stringify, createError };
  await assert.rejects(storage.readOwnerOnlyBytes(options), { code: "chunk_artifact_size" });
  await link(target, join(root, "hard.json"));
  for (const read of [storage.readCanonicalArtifact, storage.readOwnerOnlyBytes]) {
    await assert.rejects(read({ ...options, maximumBytes: 128 }), { code: "chunk_artifact_type" });
  }
  await symlink(target, join(root, "symbolic.json"));
  await assert.rejects(storage.readOwnerOnlyBytes({ ...options,
    basename: "symbolic.json", maximumBytes: 128 }), { code: "chunk_artifact_changed" });
  assert.equal(await readFile(target, "utf8"), "{}");
});

test("Windows uniqueness workspace protects database and journal until close and cleans both", windows, async (t) => {
  const root = await createProtectedFixtureTempDirectory(join(tmpdir(), "set-storage-index-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = createExportSetVerificationStorageContext({ temporaryRoot: root });
  let observed = 0;
  const index = await storage.createUniquenessIndex({ maximumBytes: 1024 * 1024,
    batchLimitRecords: 1, createError, createLimitError: createError,
    isResourceLimitError: () => false,
    observeWorkspace() {
      observed += 1;
      const [name] = readdirSync(root);
      const workspace = join(root, name);
      assertWindowsOwnerOnly(workspace);
      assertWindowsOwnerOnly(join(workspace, "index"));
      assertWindowsOwnerOnly(join(workspace, "index", "ids.sqlite3"));
      assertWindowsOwnerOnly(join(workspace, "index", "ids.sqlite3-journal"));
    },
  });
  index.add("usage", "synthetic-event");
  assert.throws(() => index.add("usage", "synthetic-event"), { code: "chunk_duplicate" });
  const result = await index.close();
  assert.equal(result.recordsIndexed, 1);
  assert.ok(observed >= 1);
  assert.deepEqual(await readdir(root), []);
});
