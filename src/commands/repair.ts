import { findGodotProjectRoot, inspectGodotProject } from "../core/godot-project.js";
import { attemptRepair } from "../core/repair.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "../core/runtime-profile.js";
import { validateProjectRoot } from "./validate.js";
import { workspacePaths } from "../core/workspace.js";

export async function repairCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
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
