import type { Interface } from "node:readline/promises";
import { pathExists } from "../core/files.js";
import { tryFindGodotProjectRoot, loadProjectIndex } from "../core/godot-project.js";
import { loadModelConfigForRole } from "../core/providers.js";
import { loadRuntimeProfile } from "../core/runtime-profile.js";
import { authCommand } from "./auth.js";
import { buildProject } from "./build.js";
import { inspectProject } from "./inspect.js";
import { modelsCommand } from "./models.js";
import { planProject } from "./plan.js";
import { pipelineCommand } from "./pipeline.js";
import { playCommand } from "./play.js";
import { repairCommand } from "./repair.js";
import { runHarnessCommand } from "./harness.js";
import { runtimeCommand } from "./runtime.js";
import { runsCommand } from "./runs.js";
import { setupCommand } from "./setup.js";
import { settingsCommand } from "./settings.js";
import { showStatus } from "./status.js";
import { validateProject } from "./validate.js";
import { askMenuQuestion, chooseMenuOption, withMenu } from "../core/menu.js";
import { workspacePaths } from "../core/workspace.js";
import { color } from "../core/terminal.js";

export async function homeCommand(args: string[] = []): Promise<void> {
  const embedded = args.includes("--embedded");
  await withMenu(async (rl) => {
    while (true) {
      const choice = await chooseMenuOption(rl, await homePrompt(), [
        { value: "setup", label: "Start guided setup", description: "runtime, model, auth, preferences" },
        { value: "status", label: "Check project status", description: "workspace, runtime, tasks, export" },
        { value: "pipeline", label: "Make a new playable slice", description: "idea to previewed Godot build" },
        { value: "plan", label: "Plan only", description: "brief, GDD, tasks, risks" },
        { value: "build", label: "Preview a change", description: "safe first step for brownfield work" },
        { value: "apply", label: "Apply a change", description: "write files after you know the task" },
        { value: "validate", label: "Validate project", description: "run Godot-backed checks" },
        { value: "repair", label: "Fix validation issues", description: "deterministic repair pass" },
        { value: "play", label: "Play game", description: "launch with configured Godot runtime" },
        { value: "inspect", label: "Inspect project", description: "scenes, scripts, exports, project.godot" },
        { value: "models", label: "Configure models", description: "LLM provider and roles" },
        { value: "runtime", label: "Configure Godot runtime", description: "native, Flatpak, custom command" },
        { value: "runs", label: "View run history", description: "previous harness runs" },
        { value: "harness", label: "Advanced agent harness", description: "directed multi-agent workflow" },
        { value: "auth", label: "Auth and API keys", description: "save/remove local provider keys" },
        { value: "settings", label: "Preferences", description: "mode, approvals, provider, diffs" },
      ]);

      if (!choice) return;

      await runMenuAction(async () => {
        if (choice === "setup") await setupCommand(["--embedded"]);
        if (choice === "status") await showStatus([]);
        if (choice === "pipeline") await pipelineCommand(["--embedded"]);
        if (choice === "plan") await promptAndRun(rl, "Game idea", (prompt) => planProject([prompt]));
        if (choice === "build") await promptAndRun(rl, "Build task", (prompt) => buildProject([...prompt.split(/\s+/).filter(Boolean), "--preview"]));
        if (choice === "apply") await promptAndRun(rl, "Build task", (prompt) => buildProject([...prompt.split(/\s+/).filter(Boolean), "--apply"]));
        if (choice === "play") await playCommand([]);
        if (choice === "harness") await promptAndRun(rl, "Harness goal", (prompt) => runHarnessCommand(prompt.split(/\s+/).filter(Boolean)));
        if (choice === "runs") await runsCommand(["--embedded"]);
        if (choice === "validate") await validateProject([]);
        if (choice === "repair") await repairCommand([]);
        if (choice === "inspect") await inspectProject([]);
        if (choice === "models") await modelsCommand([]);
        if (choice === "auth") await authCommand([]);
        if (choice === "settings") await settingsCommand(["--embedded"]);
        if (choice === "runtime") await runtimeCommand([]);
      });

      if (!embedded) {
        console.log("");
      }
    }
  });
}

export async function homePrompt(): Promise<string> {
  const status = await homeStatus();
  return [
    color("GodotCoder Home", "bold"),
    `Project: ${status.project}`,
    `Workspace: ${status.workspace}`,
    `Godot runtime: ${status.runtime}`,
    `Build model: ${status.model}`,
    `Next: ${status.next}`,
    "",
    "Choose an action",
  ].join("\n");
}

export async function homeStatus(): Promise<{ project: string; workspace: string; runtime: string; model: string; next: string }> {
  const projectRoot = await tryFindGodotProjectRoot(process.cwd());
  if (!projectRoot) {
    return {
      project: "not detected in this folder",
      workspace: "not initialized",
      runtime: "unknown",
      model: "unknown",
      next: "Start guided setup, or open a folder with project.godot.",
    };
  }

  const paths = workspacePaths(projectRoot);
  const [projectIndex, runtimeProfile, modelSelection, workspaceExists] = await Promise.all([
    loadProjectIndex(paths.projectIndex),
    loadRuntimeProfile(paths.runtimeProfile),
    loadModelConfigForRole(projectRoot, "build"),
    pathExists(paths.workspaceRoot),
  ]);
  const projectName = projectIndex?.applicationName ?? projectRoot;
  const runtime = runtimeProfile
    ? `${runtimeProfile.supported ? "ready" : "needs attention"}${runtimeProfile.detectedGodotVersion ? ` (${runtimeProfile.detectedGodotVersion})` : ""}`
    : "not checked";
  const model = modelSelection.config
    ? `${modelSelection.config.provider}:${modelSelection.config.model} [${modelSelection.source}]`
    : "not configured";
  const next = !workspaceExists
    ? "Start guided setup."
    : !runtimeProfile?.supported
      ? "Configure Godot runtime."
      : !modelSelection.config
        ? "Configure models."
        : "Preview a change or validate the project.";

  return {
    project: projectName,
    workspace: workspaceExists ? "ready" : "not initialized",
    runtime,
    model,
    next,
  };
}

async function runMenuAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(color(error instanceof Error ? error.message : String(error), "red"));
  }
}

async function promptAndRun(rl: Interface, label: string, run: (prompt: string) => Promise<void>): Promise<void> {
  const prompt = (await askMenuQuestion(rl, `${label} > `)).trim();
  if (!prompt) {
    console.log("No prompt entered.");
    return;
  }
  await run(prompt);
}
