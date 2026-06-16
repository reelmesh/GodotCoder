import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { findGodotProjectRoot, inspectGodotProject } from "../core/godot-project.js";
import { attemptRepair, type RepairAttempt } from "../core/repair.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "../core/runtime-profile.js";
import { validateProjectRoot } from "./validate.js";
import { workspacePaths } from "../core/workspace.js";
import { pathExists } from "../core/files.js";
import { revertChangeRecord } from "../core/change-records.js";

export async function repairCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);

  const subcommand = args.filter(arg => !arg.startsWith("--")).shift();

  if (subcommand === "list" || subcommand === "status") {
    await listRepairs(projectRoot, json);
    return;
  }

  if (subcommand === "diff") {
    const idx = args.indexOf("diff");
    const targetId = args[idx + 1];
    await showRepairDiff(projectRoot, targetId ?? null, json);
    return;
  }

  if (subcommand === "undo" || subcommand === "revert") {
    const idx = args.indexOf(subcommand);
    const targetId = args[idx + 1];
    if (!targetId) {
      console.log(`Usage: godotcoder repair ${subcommand} <repair-id>`);
      return;
    }
    await undoRepair(projectRoot, targetId, json);
    return;
  }

  // Default: execute repair loop
  let runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  if (!runtimeProfile?.executable) {
    const discovery = await discoverRuntime(projectRoot);
    const projectIndex = await inspectGodotProject(projectRoot);
    runtimeProfile = createRuntimeProfile(projectRoot, discovery, projectIndex);
  }

  const before = await validateProjectRoot(projectRoot);
  const repair = await attemptRepair(projectRoot, before.report, runtimeProfile);

  if (json) {
    console.log(JSON.stringify({
      ok: repair.attempt.status === "not-needed" || repair.attempt.status === "repaired",
      validationBefore: before.report,
      validationBeforePath: before.reportPath,
      repair: repair.attempt,
      repairPath: repair.attemptPath,
    }, null, 2));
    return;
  }

  console.log("GodotCoder repair");
  console.log(`Validation before: ${before.report.summary.errors} errors, ${before.report.summary.warnings} warnings`);
  console.log(`Validation report: ${before.reportPath}`);
  console.log(`Repair: ${repair.attempt.status}`);
  console.log(`Repair report: ${repair.attemptPath}`);
  console.log(repair.attempt.summary);
  for (const action of repair.attempt.actions) {
    console.log(`${action.status.padEnd(7)} ${action.type.padEnd(24)} ${action.summary}`);
  }
  if (repair.attempt.validationAfter) {
    console.log(`Validation after: ${repair.attempt.validationAfter.summary.errors} errors, ${repair.attempt.validationAfter.summary.warnings} warnings`);
  }
}

async function listRepairs(projectRoot: string, json: boolean): Promise<void> {
  const paths = workspacePaths(projectRoot);
  if (!(await pathExists(paths.repairsDir))) {
    if (json) {
      console.log(JSON.stringify({ ok: true, repairs: [] }, null, 2));
    } else {
      console.log("No repairs history found.");
    }
    return;
  }

  const files = await readdir(paths.repairsDir);
  const attempts: RepairAttempt[] = [];
  for (const file of files) {
    if (file.endsWith(".json")) {
      const text = await readFile(path.join(paths.repairsDir, file), "utf8");
      attempts.push(JSON.parse(text));
    }
  }

  attempts.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (json) {
    console.log(JSON.stringify({ ok: true, repairs: attempts }, null, 2));
    return;
  }

  console.log("\nRepair History");
  if (attempts.length === 0) {
    console.log("No repairs recorded.");
    return;
  }

  console.log("ID".padEnd(28) + " " + "STATUS".padEnd(12) + " " + "FINISHED".padEnd(25) + " SUMMARY");
  for (const attempt of attempts) {
    console.log(`${attempt.id.padEnd(28)} ${attempt.status.padEnd(12)} ${attempt.finishedAt.padEnd(25)} ${attempt.summary}`);
  }
}

async function showRepairDiff(projectRoot: string, targetId: string | null, json: boolean): Promise<void> {
  const paths = workspacePaths(projectRoot);
  let attemptFile = "";

  if (targetId) {
    attemptFile = path.join(paths.repairsDir, `${targetId}.json`);
    if (!(await pathExists(attemptFile))) {
      console.log(`Repair record not found: ${targetId}`);
      return;
    }
  } else {
    // find latest
    if (!(await pathExists(paths.repairsDir))) {
      console.log("No repairs recorded.");
      return;
    }
    const files = (await readdir(paths.repairsDir)).filter(f => f.endsWith(".json"));
    if (files.length === 0) {
      console.log("No repairs recorded.");
      return;
    }
    files.sort((a, b) => b.localeCompare(a));
    attemptFile = path.join(paths.repairsDir, files[0]!);
  }

  const attempt: RepairAttempt = JSON.parse(await readFile(attemptFile, "utf8"));
  if (!attempt.changeRecordId) {
    if (json) {
      console.log(JSON.stringify({ ok: true, msg: "This repair did not apply any code changes." }, null, 2));
    } else {
      console.log(`Repair ${attempt.id} applied no changes.`);
    }
    return;
  }

  const patchRecordFile = path.join(paths.patchesDir, attempt.changeRecordId, "record.json");
  if (!(await pathExists(patchRecordFile))) {
    console.log(`Patch record file not found: ${patchRecordFile}`);
    return;
  }

  const patchRecord = JSON.parse(await readFile(patchRecordFile, "utf8"));

  if (json) {
    console.log(JSON.stringify({ ok: true, patchRecord }, null, 2));
    return;
  }

  console.log(`\nDiff for Repair: ${attempt.id} (Patch: ${attempt.changeRecordId})`);
  for (const file of patchRecord.files) {
    console.log(`\nFile: ${file.path}`);
    console.log(`Operation: ${file.operation}`);
    
    if (file.operation === "create") {
      console.log("[color=green]--- Created File ---[/color]");
      const relativePath = file.path.slice("res://".length);
      const absPath = path.join(projectRoot, relativePath);
      if (await pathExists(absPath)) {
        console.log(await readFile(absPath, "utf8"));
      }
    } else if (file.operation === "modify" && file.beforeContent) {
      console.log("--- Original Content (Before Repair)");
      console.log(file.beforeContent);
      console.log("+++ Current Content (After Repair)");
      const relativePath = file.path.slice("res://".length);
      const absPath = path.join(projectRoot, relativePath);
      if (await pathExists(absPath)) {
        console.log(await readFile(absPath, "utf8"));
      }
    }
  }
}

async function undoRepair(projectRoot: string, targetId: string, json: boolean): Promise<void> {
  const paths = workspacePaths(projectRoot);
  const attemptFile = path.join(paths.repairsDir, `${targetId}.json`);
  if (!(await pathExists(attemptFile))) {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: "REPAIR_NOT_FOUND", message: `Repair record not found: ${targetId}` }, null, 2));
    } else {
      console.log(`Repair record not found: ${targetId}`);
    }
    return;
  }

  const attempt: RepairAttempt = JSON.parse(await readFile(attemptFile, "utf8"));
  if (attempt.status === "reverted") {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: "REPAIR_ALREADY_REVERTED", message: `Repair ${targetId} is already reverted.` }, null, 2));
    } else {
      console.log(`Repair ${targetId} is already reverted.`);
    }
    return;
  }

  if (!attempt.changeRecordId) {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: "NO_CHANGES_APPLIED", message: `Repair ${targetId} applied no changes to revert.` }, null, 2));
    } else {
      console.log(`Repair ${targetId} applied no changes to revert.`);
    }
    return;
  }

  console.log(`Undoing repair ${targetId}...`);
  await revertChangeRecord(projectRoot, attempt.changeRecordId);

  // Update repair status to reverted
  const updatedAttempt: RepairAttempt = {
    ...attempt,
    status: "reverted",
    summary: `Reverted by user. ${attempt.summary}`,
    finishedAt: new Date().toISOString(),
  };
  await writeFile(attemptFile, JSON.stringify(updatedAttempt, null, 2) + "\n");

  const validation = await validateProjectRoot(projectRoot);

  if (json) {
    console.log(JSON.stringify({
      ok: true,
      message: `Reverted repair ${targetId}`,
      validationReport: validation.report,
    }, null, 2));
    return;
  }

  console.log(`Reverted repair ${targetId} successfully.`);
  console.log(`Validation after revert: ${validation.report.summary.errors} errors, ${validation.report.summary.warnings} warnings.`);
}
