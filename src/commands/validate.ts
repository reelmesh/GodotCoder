import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findGodotProjectRoot } from "../core/godot-project.js";
import { loadRuntimeProfile } from "../core/runtime-profile.js";
import { runValidation } from "../core/validation.js";
import { workspacePaths } from "../core/workspace.js";

export async function validateProject(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  const report = await runValidation(projectRoot, runtimeProfile);

  await mkdir(paths.validationsDir, { recursive: true });
  const reportPath = path.join(paths.validationsDir, `${report.id}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");

  if (json) {
    console.log(JSON.stringify({ ok: report.summary.errors === 0, report, reportPath }, null, 2));
    return;
  }

  console.log("Godot validation");
  console.log(`Report: ${reportPath}`);
  console.log(`Exit code: ${report.exitCode ?? "not run"}`);
  console.log(`Errors: ${report.summary.errors}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  for (const finding of report.findings) {
    console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
  }
}
