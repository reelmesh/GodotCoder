import { pathExists } from "../core/files.js";
import { findGodotProjectRoot, loadProjectIndex } from "../core/godot-project.js";
import { loadRuntimeProfile } from "../core/runtime-profile.js";
import { workspacePaths } from "../core/workspace.js";

export async function showStatus(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  const projectIndex = await loadProjectIndex(paths.projectIndex);

  const status = {
    projectRoot,
    workspaceRoot: paths.workspaceRoot,
    workspaceExists: await pathExists(paths.workspaceRoot),
    runtimeProfileExists: await pathExists(paths.runtimeProfile),
    projectIndexExists: await pathExists(paths.projectIndex),
    detectedGodotVersion: runtimeProfile?.detectedGodotVersion ?? null,
    installType: runtimeProfile?.installType ?? "unknown",
    mainScene: projectIndex?.mainScene ?? runtimeProfile?.project?.mainScene ?? null,
  };

  if (json) {
    console.log(JSON.stringify({ ok: true, status }, null, 2));
    return;
  }

  console.log("GodotCoder status");
  console.log(`Project: ${status.projectRoot}`);
  console.log(`Workspace: ${status.workspaceExists ? status.workspaceRoot : "not initialized"}`);
  console.log(`Runtime: ${status.installType}${status.detectedGodotVersion ? ` (${status.detectedGodotVersion})` : ""}`);
  console.log(`Main scene: ${status.mainScene ?? "unknown"}`);
}
