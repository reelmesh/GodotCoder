import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { inspectProject } from "./inspect.js";
import { runtimeDoctor } from "./runtime-doctor.js";
import { showStatus } from "./status.js";
import { validateProject } from "./validate.js";

export async function startSession(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log("GodotCoder");
  console.log("Godot-focused agent workspace. Type /help for commands, /exit to quit.");
  console.log("");

  try {
    while (true) {
      const line = (await rl.question("godotcoder> ")).trim();
      if (!line) continue;

      if (line === "/exit" || line === "/quit") {
        break;
      }

      await handleSessionLine(line);
    }
  } finally {
    rl.close();
  }
}

async function handleSessionLine(line: string): Promise<void> {
  const [command, ...args] = line.split(/\s+/);

  try {
    switch (command) {
      case "/help":
        printSessionHelp();
        return;
      case "/status":
        await showStatus(args);
        return;
      case "/runtime":
        await runtimeDoctor(args[0] === "doctor" ? args.slice(1) : args);
        return;
      case "/inspect":
        await inspectProject(args);
        return;
      case "/validate":
        await validateProject(args);
        return;
      case "/plan":
        printPlanningPlaceholder(args.join(" "));
        return;
      default:
        printPromptPlaceholder(line);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

function printSessionHelp(): void {
  console.log(`Commands:
  /status              Show workspace status
  /runtime doctor      Detect native/Flatpak Godot runtime
  /inspect             Inspect project.godot and project files
  /validate            Run Godot-backed validation
  /plan <idea>         Drafting hook for the next model-backed slice
  /exit                Quit

Natural-language prompts are accepted, but model-backed planning/building is the next slice.`);
}

function printPlanningPlaceholder(idea: string): void {
  if (!idea) {
    console.log("Usage: /plan <game idea>");
    return;
  }

  console.log("Planning workflow is not wired to a model yet.");
  console.log(`Captured idea: ${idea}`);
  console.log("Next slice will turn this into brief, GDD, technical plan, tasks, decisions, and risks.");
}

function printPromptPlaceholder(prompt: string): void {
  console.log("Model-backed agent chat is not wired yet.");
  console.log(`Captured prompt: ${prompt}`);
  console.log("Use /status, /runtime doctor, /inspect, or /validate for implemented workflows.");
}
