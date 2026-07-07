import { mkdir } from "node:fs/promises";
import { ensureGreenfieldGodotProject } from "../core/greenfield.js";
import { tryFindGodotProjectRoot } from "../core/godot-project-indexer.js";
import { writePlanningArtifacts } from "../core/planning.js";
import { createRuntimeProfile } from "../core/runtime-profile.js";
import { loadTaskBoard } from "../core/tasks.js";
import { workspacePaths } from "../core/workspace.js";
import { writeFile } from "node:fs/promises";

export async function planProject(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const idea = args.filter((arg) => arg !== "--json").join(" ").trim();

  if (!idea) {
    console.log("Usage: godotcoder plan <game idea>");
    return;
  }

  const existingRoot = await tryFindGodotProjectRoot(process.cwd());
  const mode = existingRoot ? "brownfield" : "greenfield";
  const projectRoot = existingRoot ?? process.cwd();
  const scaffold = await ensureGreenfieldGodotProject(projectRoot, idea);
  const paths = workspacePaths(projectRoot);

  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(paths.validationsDir, { recursive: true });
  await mkdir(paths.patchesDir, { recursive: true });
  await mkdir(paths.cacheDocsDir, { recursive: true });
  await writeFile(paths.agentMemory, JSON.stringify({ schemaVersion: 1, notes: [] }, null, 2) + "\n", { flag: "w" });
  await writeFile(paths.runtimeProfile, JSON.stringify(createRuntimeProfile(projectRoot), null, 2) + "\n", { flag: "w" });

  const result = await writePlanningArtifacts(projectRoot, idea, mode);
  await loadTaskBoard(projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: true, mode, scaffold, result }, null, 2));
    return;
  }

  console.log(`${mode === "greenfield" ? "Created greenfield Godot project and planning artifacts." : "Updated planning artifacts."}`);
  if (scaffold.createdProjectFile) {
    console.log("Created: project.godot, scenes/main.tscn, scripts/main.gd");
  }
  console.log(`Wrote ${result.filesWritten.length} planning files under .godotcoder/`);
  console.log("Next: run /runtime doctor, /validate, then start the first build task.");
}
