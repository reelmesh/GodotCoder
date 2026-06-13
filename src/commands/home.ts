import type { Interface } from "node:readline/promises";
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
import { chooseMenuOption, withMenu } from "../core/menu.js";
import { color } from "../core/terminal.js";

export async function homeCommand(args: string[] = []): Promise<void> {
  const embedded = args.includes("--embedded");
  await withMenu(async (rl) => {
    while (true) {
      const choice = await chooseMenuOption(rl, "GodotCoder", [
        { value: "setup", label: "Setup", description: "runtime, model, auth, preferences" },
        { value: "status", label: "Status", description: "workspace and runtime summary" },
        { value: "pipeline", label: "Make game", description: "idea to playable validated slice" },
        { value: "plan", label: "Plan game", description: "brief, GDD, tasks, risks" },
        { value: "build", label: "Build preview", description: "greenfield or brownfield first playable" },
        { value: "apply", label: "Build and apply", description: "write files and validate" },
        { value: "play", label: "Play game", description: "launch with configured Godot runtime" },
        { value: "harness", label: "Agent harness", description: "directed multi-agent workflow" },
        { value: "runs", label: "Run history", description: "inspect previous harness runs" },
        { value: "validate", label: "Validate", description: "Godot-backed project check" },
        { value: "repair", label: "Repair", description: "validate, repair, revalidate" },
        { value: "inspect", label: "Inspect project", description: "project.godot, scenes, scripts, exports" },
        { value: "models", label: "Models", description: "configure/test LLM provider" },
        { value: "auth", label: "Auth", description: "save/remove local API keys" },
        { value: "settings", label: "Settings", description: "mode, approvals, provider, diffs" },
        { value: "runtime", label: "Runtime", description: "native, Flatpak, custom command" },
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

async function runMenuAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(color(error instanceof Error ? error.message : String(error), "red"));
  }
}

async function promptAndRun(rl: Interface, label: string, run: (prompt: string) => Promise<void>): Promise<void> {
  const prompt = (await rl.question(`${label} > `)).trim();
  if (!prompt) {
    console.log("No prompt entered.");
    return;
  }
  await run(prompt);
}
