import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { inspectProject } from "./inspect.js";
import { runtimeDoctor } from "./runtime-doctor.js";
import { showStatus } from "./status.js";
import { validateProject } from "./validate.js";
import { color, clearScreen, separator } from "../core/terminal.js";

type AgentMode = "build" | "plan";

interface SessionState {
  mode: AgentMode;
  promptCount: number;
}

export async function startSession(): Promise<void> {
  const state: SessionState = { mode: "build", promptCount: 0 };

  printWelcome(state);

  if (!input.isTTY) {
    const piped = await readStdin();
    for (const rawLine of piped.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      console.log(`${promptLabel(state)}${line}`);
      if (line === "/exit" || line === "/quit") break;
      await handleSessionLine(line, state);
    }
    return;
  }

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const line = (await rl.question(promptLabel(state))).trim();
      if (!line) continue;

      if (line === "/exit" || line === "/quit") {
        break;
      }

      await handleSessionLine(line, state);
    }
  } finally {
    rl.close();
  }
}

async function readStdin(): Promise<string> {
  let contents = "";
  input.setEncoding("utf8");
  for await (const chunk of input) {
    contents += chunk;
  }
  return contents;
}

async function handleSessionLine(line: string, state: SessionState): Promise<void> {
  const [command, ...args] = line.split(/\s+/);

  try {
    switch (command) {
      case "/help":
      case "?":
        printSessionHelp();
        return;
      case "/clear":
        clearScreen();
        printWelcome(state);
        return;
      case "/mode":
      case "/agent":
        setMode(args[0], state);
        return;
      case "/status":
        await showStatus(args);
        printStatusHint(state);
        return;
      case "/runtime":
      case "/doctor":
        await runtimeDoctor(args[0] === "doctor" ? args.slice(1) : args);
        printStatusHint(state);
        return;
      case "/inspect":
        await inspectProject(args);
        printStatusHint(state);
        return;
      case "/validate":
      case "/check":
        await validateProject(args);
        printStatusHint(state);
        return;
      case "/plan":
        state.mode = "plan";
        printPlanningPlaceholder(args.join(" "));
        return;
      default:
        state.promptCount += 1;
        printPromptPlaceholder(line, state);
    }
  } catch (error) {
    console.error(color(error instanceof Error ? error.message : String(error), "red"));
  }
}

function printWelcome(state: SessionState): void {
  console.log(color("GodotCoder", "bold") + color("  Godot-native agent workspace", "gray"));
  console.log(separator());
  console.log(`${color("project", "cyan")} current Godot workspace  ${color("mode", "cyan")} ${state.mode}  ${color("runtime", "cyan")} native/flatpak`);
  console.log(`${color("commands", "cyan")} /help  /status  /inspect  /validate  /runtime doctor  /mode plan|build  /exit`);
  console.log(separator());
  console.log("");
}

function promptLabel(state: SessionState): string {
  const mode = state.mode === "build" ? color("build", "green") : color("plan", "yellow");
  return `${mode} ${color("▸", "cyan")} `;
}

function printSessionHelp(): void {
  console.log(color("Command Palette", "bold"));
  console.log(separator());
  console.log(`${color("/status", "cyan").padEnd(22)} Show workspace status`);
  console.log(`${color("/runtime doctor", "cyan").padEnd(22)} Detect native/Flatpak Godot runtime`);
  console.log(`${color("/doctor", "cyan").padEnd(22)} Alias for /runtime doctor`);
  console.log(`${color("/inspect", "cyan").padEnd(22)} Inspect project.godot and project files`);
  console.log(`${color("/validate", "cyan").padEnd(22)} Run Godot-backed validation`);
  console.log(`${color("/check", "cyan").padEnd(22)} Alias for /validate`);
  console.log(`${color("/mode plan", "cyan").padEnd(22)} Read-only planning mode`);
  console.log(`${color("/mode build", "cyan").padEnd(22)} Implementation mode`);
  console.log(`${color("/plan <idea>", "cyan").padEnd(22)} Drafting hook for the next model-backed slice`);
  console.log(`${color("/clear", "cyan").padEnd(22)} Clear terminal`);
  console.log(`${color("/exit", "cyan").padEnd(22)} Quit`);
  console.log(separator());
  console.log(color("Natural-language prompts are accepted; model-backed planning/building is the next slice.", "gray"));
}

function printPlanningPlaceholder(idea: string): void {
  if (!idea) {
    console.log("Usage: /plan <game idea>");
    return;
  }

  console.log(color("Plan mode", "yellow"));
  console.log(`Captured idea: ${idea}`);
  console.log(color("Next slice will turn this into brief, GDD, technical plan, tasks, decisions, and risks.", "gray"));
}

function printPromptPlaceholder(prompt: string, state: SessionState): void {
  const label = state.mode === "build" ? color("Build prompt", "green") : color("Plan prompt", "yellow");
  console.log(label);
  console.log(`Captured prompt: ${prompt}`);
  console.log(color("Model-backed agent chat is not wired yet.", "gray"));
  console.log(color("Use /status, /runtime doctor, /inspect, or /validate for implemented workflows.", "gray"));
}

function setMode(value: string | undefined, state: SessionState): void {
  if (value !== "plan" && value !== "build") {
    console.log("Usage: /mode plan | /mode build");
    return;
  }

  state.mode = value;
  console.log(`Mode set to ${value === "build" ? color("build", "green") : color("plan", "yellow")}`);
}

function printStatusHint(state: SessionState): void {
  console.log(color(`mode=${state.mode} prompts=${state.promptCount}`, "gray"));
}
