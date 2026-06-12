import { spawn } from "node:child_process";
import { inspectGodotProject, tryFindGodotProjectRoot } from "./godot-project.js";
import { discoverRuntime } from "./runtime-discovery.js";
import { createRuntimeProfile } from "./runtime-profile.js";
import { CliError } from "./errors.js";

export interface LaunchResult {
  projectRoot: string;
  command: string[];
  pid: number | null;
  mode: "game" | "editor";
}

export async function launchGodot(startDir: string, mode: "game" | "editor"): Promise<LaunchResult> {
  const projectRoot = await tryFindGodotProjectRoot(startDir);
  if (!projectRoot) {
    throw new CliError("GODOT_PROJECT_NOT_FOUND", "No project.godot found. Build or initialize a Godot project first.");
  }

  const discovery = await discoverRuntime(projectRoot);
  const projectIndex = await inspectGodotProject(projectRoot);
  const profile = createRuntimeProfile(projectRoot, discovery, projectIndex);
  if (!profile.executable) {
    throw new CliError("GODOT_RUNTIME_NOT_FOUND", "No Godot runtime configured. Use `godotcoder runtime` or `godotcoder setup` first.");
  }

  const command = mode === "editor" ? [...profile.executable, "--editor", "--path", projectRoot] : [...profile.executable, "--path", projectRoot];
  const child = spawn(command[0]!, command.slice(1), {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return {
    projectRoot,
    command,
    pid: child.pid ?? null,
    mode,
  };
}
