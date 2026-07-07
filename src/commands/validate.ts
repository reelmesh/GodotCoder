import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findGodotProjectRoot, inspectGodotProject } from "../core/godot-project-indexer.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "../core/runtime-profile.js";
import { runValidation, runSmokeValidation, runExportValidation, runVisualValidation } from "../core/validation.js";
import type { ValidationReport } from "../core/validation.js";
import { workspacePaths } from "../core/workspace.js";

export async function validateProject(args: string[]): Promise<ValidationReport> {
  const json = args.includes("--json");
  const smoke = args.includes("--smoke");
  const visual = args.includes("--visual");
  const isExport = args.includes("--export");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const { report, reportPath } = await validateProjectRoot(projectRoot, { smoke, visual, export: isExport });

  if (json) {
    console.log(JSON.stringify({ ok: report.summary.errors === 0, report, reportPath }, null, 2));
    return report;
  }

  console.log(isExport ? "Godot export validation" : visual ? "Godot visual validation" : smoke ? "Godot smoke run validation" : "Godot validation");
  console.log(`Report: ${reportPath}`);
  if (report.visual) {
    console.log(`Frame: ${report.visual.artifactPath}`);
    console.log(`Frame size: ${report.visual.width ?? "unknown"}x${report.visual.height ?? "unknown"}`);
    console.log(`Blank: ${report.visual.blank ?? "unknown"}`);
    console.log(`Near blank: ${report.visual.nearBlank ?? "unknown"}`);
  }
  console.log(`Exit code: ${report.exitCode ?? "not run"}`);
  console.log(`Errors: ${report.summary.errors}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  for (const finding of report.findings) {
    console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
  }
  return report;
}

export async function validateProjectRoot(
  projectRoot: string,
  options: { smoke?: boolean; visual?: boolean; export?: boolean } = {},
): Promise<{ report: ValidationReport; reportPath: string }> {
  const paths = workspacePaths(projectRoot);
  let runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  if (!runtimeProfile?.executable) {
    const discovery = await discoverRuntime(projectRoot);
    const projectIndex = await inspectGodotProject(projectRoot);
    runtimeProfile = createRuntimeProfile(projectRoot, discovery, projectIndex);
    await mkdir(paths.workspaceRoot, { recursive: true });
    await writeFile(paths.runtimeProfile, JSON.stringify(runtimeProfile, null, 2) + "\n");
  }
  
  const report = options.export
    ? await runExportValidation(projectRoot, runtimeProfile)
    : options.visual
      ? await runVisualValidation(projectRoot, runtimeProfile)
    : options.smoke
      ? await runSmokeValidation(projectRoot, runtimeProfile)
      : await runValidation(projectRoot, runtimeProfile);

  await mkdir(paths.validationsDir, { recursive: true });
  const reportPath = path.join(paths.validationsDir, `${report.id}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  return { report, reportPath };
}
