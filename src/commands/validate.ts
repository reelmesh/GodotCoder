import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findGodotProjectRoot } from "../core/godot-project.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "../core/runtime-profile.js";
import { runValidation } from "../core/validation.js";
import type { ValidationReport } from "../core/validation.js";
import { workspacePaths } from "../core/workspace.js";

export async function validateProject(args: string[]): Promise<ValidationReport> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const { report, reportPath } = await validateProjectRoot(projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: report.summary.errors === 0, report, reportPath }, null, 2));
    return report;
  }

  console.log("Godot validation");
  console.log(`Report: ${reportPath}`);
  console.log(`Exit code: ${report.exitCode ?? "not run"}`);
  console.log(`Errors: ${report.summary.errors}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  for (const finding of report.findings) {
    console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
  }
  return report;
}

export async function validateProjectRoot(projectRoot: string): Promise<{ report: ValidationReport; reportPath: string }> {
  const paths = workspacePaths(projectRoot);
  let runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  if (!runtimeProfile?.executable) {
    const discovery = await discoverRuntime();
    runtimeProfile = createRuntimeProfile(projectRoot, discovery);
    await mkdir(paths.workspaceRoot, { recursive: true });
    await writeFile(paths.runtimeProfile, JSON.stringify(runtimeProfile, null, 2) + "\n");
  }
  const report = await runValidation(projectRoot, runtimeProfile);

  await mkdir(paths.validationsDir, { recursive: true });
  const reportPath = path.join(paths.validationsDir, `${report.id}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  return { report, reportPath };
}
