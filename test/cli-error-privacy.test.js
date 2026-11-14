import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cliFailureCode } from "../src/cli.js";
import { readObservations } from "../src/storage.js";

const PRIVATE = "synthetic_private_content_marker";

test("observation read errors omit source paths and parser excerpts while retaining record ordinal", async t => {
  const root = await mkdtemp(join(tmpdir(), "observation-private-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "private-observations.jsonl");
  await writeFile(file, `{"count":1}\n\n${PRIVATE}\n`);
  await assert.rejects(readObservations(file), error => {
    assert.equal(error.code, "observation_json_invalid");
    assert.equal(error.recordOrdinal, 2);
    assert.equal(error.message, "Observation record is invalid JSON");
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.equal(JSON.stringify(error).includes(PRIVATE), false);
    assert.equal(error.message.includes(file), false);
    return true;
  });
  await assert.rejects(readObservations(root), error => {
    assert.equal(error.code, "observation_read_failed");
    assert.equal(error.message, "Observation records could not be read");
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.equal(error.message.includes(root), false);
    return true;
  });
  assert.deepEqual(await readObservations(join(root, "missing.jsonl")), []);
});

test("CLI error boundary accepts only fixed codes and never reads raw messages or causes", () => {
  for (const [error, expected] of [
    [{ code: "observation_json_invalid", message: PRIVATE }, "observation_json_invalid"],
    [{ code: "CLI_PATH_SAFETY_INPUT_OUTPUT_COLLISION", message: PRIVATE }, "CLI_PATH_SAFETY_INPUT_OUTPUT_COLLISION"],
    [{ code: "ENOENT", message: PRIVATE }, "file_not_found"],
    [{ code: "EPERM", message: PRIVATE }, "permission_denied"],
    [{ code: "ABORT_ERR", message: PRIVATE }, "operation_aborted"],
    [new SyntaxError(PRIVATE), "invalid_json"],
    ...["cli_missing_input", "cli_missing_directory", "cli_missing_export_paths", "cli_wrong_discard_confirmation", "cli_unexpected_export_directory", "export_deletion_execute_confirmation", "export_set_verify_chunk_artifact_digest"].map(code => [{code, message: PRIVATE},code]),
    [{code: `export_set_verify_${PRIVATE}`, message: PRIVATE}, "command_failed"],
    [{ code: PRIVATE, message: PRIVATE }, "command_failed"],
    [new Error(PRIVATE), "command_failed"],
    [null, "command_failed"],
  ]) assert.equal(cliFailureCode(error), expected);
  assert.equal(cliFailureCode({ get code() { throw new Error(PRIVATE); } }), "command_failed");
  assert.equal(cliFailureCode({ get message() { assert.fail("raw message read"); } }), "command_failed");
});

test("actual CLI stderr is content-free for malformed records and unknown commands", async t => {
  const root = await mkdtemp(join(tmpdir(), "cli-private-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "private-observations.jsonl");
  await writeFile(file, PRIVATE);
  for (const [args, code] of [
    [["report", "--data-file", file], "observation_json_invalid"],
    [[PRIVATE], "command_failed"],
  ]) {
    const result = spawnSync(process.execPath, [resolve("src/cli.js"), ...args], {
      cwd: process.cwd(), env: process.env, encoding: "utf8", windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), `usage-monitor: ${code}`);
    assert.equal(result.stderr.includes(PRIVATE), false);
    assert.equal(result.stderr.includes(root), false);
  }
});
