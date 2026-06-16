import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { inspectGodotProject } from "./godot-project.js";
import { discoverRuntime } from "./runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "./runtime-profile.js";
import { workspacePaths } from "./workspace.js";
import { updateGodotProjectSetting } from "./godot-project.js";

export interface PlaytestResult {
  ok: boolean;
  errors: string[];
  output: string;
  durationMs: number;
}

export async function runPlaytest(projectRoot: string): Promise<PlaytestResult> {
  const startTime = Date.now();
  const paths = workspacePaths(projectRoot);
  
  // Discover and load runtime profile
  let runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  if (!runtimeProfile?.executable) {
    const discovery = await discoverRuntime(projectRoot);
    const projectIndex = await inspectGodotProject(projectRoot);
    runtimeProfile = createRuntimeProfile(projectRoot, discovery, projectIndex);
  }
  
  if (!runtimeProfile.executable) {
    throw new Error("No Godot runtime configured. Please run `godotcoder runtime doctor` first.");
  }

  const projectGodotPath = path.join(projectRoot, "project.godot");
  const originalGodotConfig = await readFile(projectGodotPath, "utf8");

  // Create .godotcoder directory if missing
  const simulatorDir = path.join(projectRoot, ".godotcoder");
  await mkdir(simulatorDir, { recursive: true });

  const simulatorAbsPath = path.join(simulatorDir, "playtest_input_simulator.gd");
  
  // Fetch custom inputs from project to merge with defaults
  const projectIndex = await inspectGodotProject(projectRoot);
  const customActions = projectIndex.inputMap || [];
  const defaultActions = ["ui_left", "ui_right", "ui_up", "ui_down", "ui_accept", "ui_select", "ui_cancel"];
  const allActions = Array.from(new Set([...defaultActions, ...customActions]));
  const actionsListStr = allActions.map((a) => `"${a}"`).join(", ");

  const gdscript = `extends Node

var actions = [${actionsListStr}]

func _ready() -> void:
	# Fail-safe timeout inside Godot in case process kill fails
	var timer = get_tree().create_timer(6.0)
	timer.timeout.connect(func(): get_tree().quit(0))
	randomize()

func _physics_process(_delta: float) -> void:
	# Simulate random keypress/actions
	if randf() < 0.25:
		var action = actions[randi() % actions.size()]
		var ev = InputEventAction.new()
		ev.action = action
		ev.pressed = randf() < 0.7
		Input.parse_input_event(ev)
`;

  await writeFile(simulatorAbsPath, gdscript, "utf8");

  // Add playtest autoload config
  await updateGodotProjectSetting(projectRoot, "autoload", "GodotCoderPlaytestSimulator", "*res://.godotcoder/playtest_input_simulator.gd");

  const command = [
    ...runtimeProfile.executable,
    "--headless",
    "--path",
    projectRoot,
  ];

  const child = spawn(command[0]!, command.slice(1), {
    cwd: projectRoot,
    env: {
      ...process.env,
      XDG_DATA_HOME: path.join(projectRoot, ".godotcoder", "cache", "xdg-data"),
      XDG_CACHE_HOME: path.join(projectRoot, ".godotcoder", "cache", "xdg-cache"),
    },
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  let timer: NodeJS.Timeout | null = null;
  let exited = false;

  const runPromise = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    child.on("exit", (code, signal) => {
      exited = true;
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code, signal });
    });

    child.on("error", () => {
      exited = true;
      if (timer) clearTimeout(timer);
      resolve({ exitCode: -1, signal: null });
    });
  });

  timer = setTimeout(() => {
    if (!exited) {
      child.kill("SIGTERM");
    }
  }, 5000);

  const { exitCode, signal } = await runPromise;
  const durationMs = Date.now() - startTime;

  // Cleanup: restore config and delete simulator script
  await writeFile(projectGodotPath, originalGodotConfig, "utf8");
  try {
    await rm(simulatorAbsPath, { force: true });
  } catch (e) {
    // Ignore cleanup error
  }

  // Analyze errors
  const errors: string[] = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      trimmed.includes("SCRIPT ERROR") ||
      trimmed.includes("ERROR:") ||
      trimmed.includes("FATAL:") ||
      trimmed.includes("CRASH:")
    ) {
      errors.push(trimmed);
    }
  }

  // If process crashed or exited non-zero (unless killed by us via SIGTERM/SIGKILL)
  if (exitCode !== null && exitCode !== 0 && exitCode !== -1 && !signal) {
    errors.push(`Process exited prematurely with exit code ${exitCode}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    output,
    durationMs,
  };
}
