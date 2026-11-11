#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  migrateLocalLegacyReports,
} from "../src/local-legacy-report-storage.js";

function usage() {
  return [
    "Usage: pnpm run migrate:legacy-reports -- [--apply] [--root <directory>]",
    "",
    "Previews bounded copies of known current-owner report artifacts from the repository root",
    "to .usage-monitor/legacy-reports/. Add --apply to copy without overwriting or deleting sources.",
  ].join("\n");
}

function parseArguments(arguments_) {
  let apply = false;
  let dryRun = false;
  let root = process.cwd();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (argument === "--dry-run") { dryRun = true; continue; }
    if (argument === "--root") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--root requires a directory.");
      }
      root = resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    throw Object.assign(new Error("Legacy report migration arguments are invalid."), { code: "legacy_report_arguments_invalid" });
  }
  if (apply && dryRun) {
    throw Object.assign(new Error("Apply and dry run cannot be combined."), { code: "legacy_report_arguments_invalid" });
  }
  return { apply, help: false, root };
}

export async function runLocalLegacyReportMigration(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) return { help: usage() };
  return migrateLocalLegacyReports(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runLocalLegacyReportMigration();
    if (result.help) {
      process.stdout.write(`${result.help}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (["blocked", "failed_without_move", "recovery_required", "source_changed"].includes(result.status)) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    process.stderr.write(`${error?.code ?? "legacy_report_migration_failed"}\n${usage()}\n`);
    process.exitCode = 2;
  }
}
