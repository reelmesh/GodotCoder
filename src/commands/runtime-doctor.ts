import { writeFile } from "node:fs/promises";
import { findGodotProjectRoot } from "../core/godot-project.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { createRuntimeProfile } from "../core/runtime-profile.js";
import { workspacePaths } from "../core/workspace.js";

export async function runtimeDoctor(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const discovery = await discoverRuntime();
  const profile = createRuntimeProfile(projectRoot, discovery);

  await writeFile(paths.runtimeProfile, JSON.stringify(profile, null, 2) + "\n");

  if (json) {
    console.log(JSON.stringify({ ok: true, runtime: profile, diagnostics: discovery.diagnostics }, null, 2));
    return;
  }

  console.log("Godot runtime doctor");
  console.log(`Install type: ${profile.installType}`);
  console.log(`Version: ${profile.detectedGodotVersion ?? "not detected"}`);
  console.log(`Executable: ${profile.executable ?? "not detected"}`);
  for (const diagnostic of discovery.diagnostics) {
    console.log(`${diagnostic.severity.toUpperCase()}: ${diagnostic.message}`);
  }
}
