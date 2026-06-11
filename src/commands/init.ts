import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureGreenfieldGodotProject } from "../core/greenfield.js";
import { tryFindGodotProjectRoot } from "../core/godot-project.js";
import { createRuntimeProfile } from "../core/runtime-profile.js";
import { workspacePaths } from "../core/workspace.js";

export async function initWorkspace(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const existingRoot = await tryFindGodotProjectRoot(process.cwd());
  const projectRoot = existingRoot ?? process.cwd();
  const scaffold = existingRoot ? null : await ensureGreenfieldGodotProject(projectRoot);
  const paths = workspacePaths(projectRoot);

  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(paths.validationsDir, { recursive: true });
  await mkdir(paths.patchesDir, { recursive: true });
  await mkdir(paths.cacheDocsDir, { recursive: true });

  await writeIfMissing(paths.brief, "# Brief\n\n");
  await writeIfMissing(paths.gdd, "# Game Design Document\n\n");
  await writeIfMissing(paths.technicalPlan, "# Technical Plan\n\n");
  await writeIfMissing(paths.tasks, "# Tasks\n\n");
  await writeIfMissing(paths.decisions, "# Decisions\n\n");
  await writeIfMissing(paths.riskLog, "# Risk Log\n\n");
  await writeIfMissing(paths.agentMemory, JSON.stringify({ schemaVersion: 1, notes: [] }, null, 2) + "\n");

  const runtimeProfile = createRuntimeProfile(projectRoot);
  await writeIfMissing(paths.runtimeProfile, JSON.stringify(runtimeProfile, null, 2) + "\n");

  if (json) {
    console.log(JSON.stringify({ ok: true, projectRoot, workspaceRoot: paths.workspaceRoot, scaffold }, null, 2));
    return;
  }

  if (scaffold?.createdProjectFile) {
    console.log("No project.godot found. Created a minimal greenfield Godot project.");
  }
  console.log(`Initialized GodotCoder workspace at ${path.relative(process.cwd(), paths.workspaceRoot) || paths.workspaceRoot}`);
}

async function writeIfMissing(filePath: string, contents: string): Promise<void> {
  try {
    await writeFile(filePath, contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}
