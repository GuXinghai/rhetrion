import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOriginEvidenceCache,
  readLocalOriginMetadataIdentity,
} from "../src/local-origin-evidence-cache.js";

const EVIDENCE = Object.freeze({
  complete: true,
  relations: new Map([["synthetic-session", Object.freeze({
    originKnown: true,
    autoReview: false,
  })]]),
});

async function workspace(t) {
  const home = await mkdtemp(join(tmpdir(), "origin-evidence-cache-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

function relation(id) {
  return { originKnown: true, autoReview: false };
}

test("origin evidence cache reuses an unchanged store and only reads an appended tail", async t => {
  const home = await workspace(t);
  await writeFile(join(home, "state_5.sqlite"), "one");
  const cache = createOriginEvidenceCache();
  const requests = [];
  const read = async ids => {
    requests.push([...ids]);
    return {
      complete: true,
      relations: new Map(ids.map(id => [id, relation(id)])),
    };
  };
  const request = sessionIds => ({ codexHome: home, sessionIds, read });

  const first = await cache.read(request(["a"]));
  assert.deepEqual([...first.relations.keys()], ["a"]);
  await cache.read(request(["a"]));
  assert.deepEqual(requests, [["a"]], "an identical proof reuses the complete read");

  const appended = await cache.read(request(["a", "b"]));
  assert.deepEqual(requests, [["a"], ["b"]], "only the appended session is read");
  assert.deepEqual([...appended.relations.keys()], ["a", "b"]);

  await cache.read(request(["a", "b"]));
  assert.deepEqual(requests, [["a"], ["b"]], "the merged entry is stable");

  const reordered = await cache.read(request(["b", "a"]));
  assert.deepEqual(requests, [["a"], ["b"], ["b", "a"]], "a reorder forces a full read");
  assert.deepEqual([...reordered.relations.keys()], ["b", "a"]);

  await writeFile(join(home, "state_5.sqlite"), "one-longer");
  await cache.read(request(["b", "a"]));
  assert.deepEqual(requests.at(-1), ["b", "a"], "a changed main database forces a full read");

  await writeFile(join(home, "state_5.sqlite-wal"), "wal");
  await cache.read(request(["b", "a"]));
  assert.deepEqual(requests.at(-1), ["b", "a"], "a new write-ahead log forces a full read");

  const afterWal = requests.length;
  await writeFile(join(home, "state_5.sqlite-shm"), "shm");
  await cache.read(request(["b", "a"]));
  assert.equal(requests.length, afterWal, "SHM coordination changes do not invalidate");
});

test("origin evidence cache never stores incomplete, unidentifiable, or changing reads", async t => {
  const home = await workspace(t);
  const cache = createOriginEvidenceCache();
  let reads = 0;
  const incomplete = async () => {
    reads += 1;
    return { complete: false, relations: new Map() };
  };

  await cache.read({ codexHome: home, sessionIds: ["a"], read: incomplete });
  await cache.read({ codexHome: home, sessionIds: ["a"], read: incomplete });
  assert.equal(reads, 2, "a missing metadata store cannot prove identity");

  await writeFile(join(home, "state_5.sqlite"), "one");
  await cache.read({ codexHome: home, sessionIds: ["a"], read: incomplete });
  await cache.read({ codexHome: home, sessionIds: ["a"], read: incomplete });
  assert.equal(reads, 4, "an incomplete read is never cached");

  let changingReads = 0;
  const changing = async ids => {
    changingReads += 1;
    await writeFile(join(home, "state_5.sqlite"), `change-${changingReads}`);
    return {
      complete: true,
      relations: new Map(ids.map(id => [id, relation(id)])),
    };
  };
  await cache.read({ codexHome: home, sessionIds: ["a"], read: changing });
  await cache.read({ codexHome: home, sessionIds: ["a"], read: changing });
  assert.equal(changingReads, 2, "a read that moves the store is not cached");
});

test("origin evidence cache drops retained evidence after a read error", async t => {
  const home = await workspace(t);
  await writeFile(join(home, "state_5.sqlite"), "one");
  const cache = createOriginEvidenceCache();
  let reads = 0;
  const good = async ids => {
    reads += 1;
    return {
      complete: true,
      relations: new Map(ids.map(id => [id, relation(id)])),
    };
  };
  const request = sessionIds => ({ codexHome: home, sessionIds, read: good });
  await cache.read(request(["a"]));
  await cache.read(request(["a"]));
  assert.equal(reads, 1);
  await assert.rejects(
    () => cache.read({
      codexHome: home,
      sessionIds: ["b"],
      read: async () => {
        throw new Error("synthetic metadata failure");
      },
    }),
    /synthetic metadata failure/u,
  );
  await cache.read(request(["b"]));
  assert.equal(reads, 2, "the failed read invalidates the retained entry");
});

test("origin evidence cache honors cancellation before reading", async t => {
  const home = await workspace(t);
  await writeFile(join(home, "state_5.sqlite"), "one");
  const cache = createOriginEvidenceCache();
  const controller = new AbortController();
  controller.abort();
  let reads = 0;
  await assert.rejects(
    () => cache.read({
      codexHome: home,
      sessionIds: ["a"],
      read: async () => {
        reads += 1;
        return EVIDENCE;
      },
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(reads, 0);
});

test("metadata identity is a content-free digest of the Codex thread store", async t => {
  const home = await workspace(t);
  assert.equal(readLocalOriginMetadataIdentity(home), null);
  await writeFile(join(home, "state_5.sqlite"), "one");
  const first = readLocalOriginMetadataIdentity(home);
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.equal(first.includes(home), false, "the path never enters the identity");
  await writeFile(join(home, "state_5.sqlite"), "two-longer");
  const second = readLocalOriginMetadataIdentity(home);
  assert.match(second, /^[a-f0-9]{64}$/u);
  assert.notEqual(second, first);
});
