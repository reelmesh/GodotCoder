import { pathExists } from "../core/files.js";
import { inspectExportReadiness } from "../core/export.js";
import { findGodotProjectRoot, loadProjectIndex } from "../core/godot-project-indexer.js";
import { loadRuntimeProfile } from "../core/runtime-profile.js";
import { loadTaskBoard } from "../core/tasks.js";
import { workspacePaths } from "../core/workspace.js";

export async function showStatus(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  const projectIndex = await loadProjectIndex(paths.projectIndex);
  const exportReadiness = await inspectExportReadiness(projectRoot, runtimeProfile);
  const taskBoard = (await pathExists(paths.workspaceRoot)) ? await loadTaskBoard(projectRoot) : null;
  const taskCounts = taskBoard
    ? {
        planned: taskBoard.tasks.filter((task) => task.state === "planned").length,
        active: taskBoard.tasks.filter((task) => task.state === "active").length,
        blocked: taskBoard.tasks.filter((task) => task.state === "blocked").length,
        done: taskBoard.tasks.filter((task) => task.state === "done").length,
      }
    : null;

  const status = {
    projectRoot,
    workspaceRoot: paths.workspaceRoot,
    workspaceExists: await pathExists(paths.workspaceRoot),
    runtimeProfileExists: await pathExists(paths.runtimeProfile),
    projectIndexExists: await pathExists(paths.projectIndex),
    detectedGodotVersion: runtimeProfile?.detectedGodotVersion ?? null,
    minimumGodotVersion: runtimeProfile?.minimumGodotVersion ?? "4.3.0",
    runtimeSupported: runtimeProfile?.supported ?? false,
    installType: runtimeProfile?.installType ?? "unknown",
    mainScene: projectIndex?.mainScene ?? runtimeProfile?.project?.mainScene ?? null,
    exportReady: exportReadiness.ready,
    exportPresetCount: exportReadiness.presets.length,
    exportFindings: exportReadiness.findings,
    taskCounts,
  };

  if (json) {
    console.log(JSON.stringify({ ok: true, status }, null, 2));
    return;
  }

  console.log("GodotCoder status");
  console.log(`Project: ${status.projectRoot}`);
  console.log(`Workspace: ${status.workspaceExists ? status.workspaceRoot : "not initialized"}`);
  console.log(`Runtime: ${status.installType}${status.detectedGodotVersion ? ` (${status.detectedGodotVersion})` : ""}`);
  console.log(`Runtime supported: ${status.runtimeSupported ? "yes" : "no"} (minimum ${status.minimumGodotVersion})`);
  console.log(`Main scene: ${status.mainScene ?? "unknown"}`);
  if (status.taskCounts) {
    console.log(`Tasks: ${status.taskCounts.planned} planned, ${status.taskCounts.active} active, ${status.taskCounts.blocked} blocked, ${status.taskCounts.done} done`);
  }
  console.log(`Export ready: ${status.exportReady ? "yes" : "no"} (${status.exportPresetCount} preset${status.exportPresetCount === 1 ? "" : "s"})`);
  for (const finding of status.exportFindings.filter((finding) => finding.severity !== "info").slice(0, 3)) {
    console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
  }
}
