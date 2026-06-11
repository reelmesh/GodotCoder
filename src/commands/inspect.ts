import { writeFile } from "node:fs/promises";
import { findGodotProjectRoot, inspectGodotProject } from "../core/godot-project.js";
import { workspacePaths } from "../core/workspace.js";

export async function inspectProject(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const index = await inspectGodotProject(projectRoot);

  await writeFile(paths.projectIndex, JSON.stringify(index, null, 2) + "\n");

  if (json) {
    console.log(JSON.stringify({ ok: true, projectIndex: index }, null, 2));
    return;
  }

  console.log("Godot project inspection");
  console.log(`Main scene: ${index.mainScene ?? "unknown"}`);
  console.log(`Features: ${index.godotVersionSignals.featureTags.join(", ") || "none"}`);
  console.log(`Autoloads: ${index.autoloads.length}`);
  console.log(`Input actions: ${index.inputMap.length}`);
  console.log(`Scripts: ${index.scripts.length}`);
  console.log(`Scenes: ${index.scenes.length}`);
  console.log(`Export presets: ${index.exports.join(", ") || "none"}`);
}
