import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { showAgents } from "./agents.js";
import { buildProject } from "./build.js";
import { runHarnessCommand } from "./harness.js";
import { inspectProject } from "./inspect.js";
import { planProject } from "./plan.js";
import { runtimeCommand, runtimeDoctor } from "./runtime.js";
import { showStatus } from "./status.js";
import { validateProject } from "./validate.js";
import { color, clearScreen, separator } from "../core/terminal.js";

type AgentMode = "build" | "plan";

interface SessionState {
  mode: AgentMode;
  promptCount: number;
  pendingBuildPrompt: string | null;
}

export async function startSession(): Promise<void> {
  const state: SessionState = { mode: "build", promptCount: 0, pendingBuildPrompt: null };

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
      case "/agents":
        await showAgents(args);
        printStatusHint(state);
        return;
      case "/harness":
      case "/run":
        await runHarnessCommand(args);
        printStatusHint(state);
        return;
      case "/runtime":
        await runtimeCommand(args);
        printStatusHint(state);
        return;
      case "/doctor":
        await runtimeDoctor(args);
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
      case "/preview":
        state.mode = "build";
        await runBuildPreview(args.join(" "), state);
        return;
      case "/build":
        state.mode = "build";
        if (args.includes("--apply") || args.includes("--yes")) {
          await runBuildApply(args.filter((arg) => arg !== "--apply" && arg !== "--yes").join(" "), state);
        } else {
          await runBuildPreview(args.join(" "), state);
        }
        return;
      case "/apply":
        state.mode = "build";
        await applyPendingBuild(args.join(" "), state);
        return;
      case "/reject":
        rejectPendingBuild(state);
        return;
      case "/plan":
        state.mode = "plan";
        await runPlan(args.join(" "), state);
        return;
      default:
        state.promptCount += 1;
        if (state.mode === "plan") {
          await runPlan(line, state);
        } else {
          await runBuildPreview(line, state);
        }
    }
  } catch (error) {
    console.error(color(error instanceof Error ? error.message : String(error), "red"));
  }
}

function printWelcome(state: SessionState): void {
  console.log(color("GodotCoder", "bold") + color("  Godot-native agent workspace", "gray"));
  console.log(separator());
  console.log(`${color("project", "cyan")} current Godot workspace  ${color("mode", "cyan")} ${state.mode}  ${color("runtime", "cyan")} native/flatpak`);
  console.log(`${color("commands", "cyan")} /help  /agents  /harness  /status  /inspect  /validate  /build  /runtime doctor  /mode plan|build  /exit`);
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
  console.log(`${color("/agents", "cyan").padEnd(22)} Show Godot-specific agent roster`);
  console.log(`${color("/harness <goal>", "cyan").padEnd(22)} Run directed multi-agent workflow preview`);
  console.log(`${color("/run <goal>", "cyan").padEnd(22)} Alias for /harness`);
  console.log(`${color("/runtime doctor", "cyan").padEnd(22)} Detect native/Flatpak Godot runtime`);
  console.log(`${color("/runtime use <cmd>", "cyan").padEnd(22)} Pin a native, Flatpak, or custom Godot command`);
  console.log(`${color("/doctor", "cyan").padEnd(22)} Alias for /runtime doctor`);
  console.log(`${color("/inspect", "cyan").padEnd(22)} Inspect project.godot and project files`);
  console.log(`${color("/validate", "cyan").padEnd(22)} Run Godot-backed validation`);
  console.log(`${color("/check", "cyan").padEnd(22)} Alias for /validate`);
  console.log(`${color("/mode plan", "cyan").padEnd(22)} Read-only planning mode`);
  console.log(`${color("/mode build", "cyan").padEnd(22)} Implementation mode`);
  console.log(`${color("/plan <idea>", "cyan").padEnd(22)} Scaffold/plan a greenfield or brownfield project`);
  console.log(`${color("/preview <task>", "cyan").padEnd(22)} Preview first playable changes`);
  console.log(`${color("/build <task>", "cyan").padEnd(22)} Preview changes and store pending approval`);
  console.log(`${color("/apply", "cyan").padEnd(22)} Apply pending build preview`);
  console.log(`${color("/reject", "cyan").padEnd(22)} Reject pending build preview`);
  console.log(`${color("/clear", "cyan").padEnd(22)} Clear terminal`);
  console.log(`${color("/exit", "cyan").padEnd(22)} Quit`);
  console.log(separator());
  console.log(color("Natural-language prompts in plan mode create/update planning artifacts. Model-backed generation is the next slice.", "gray"));
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

async function runBuildPreview(prompt: string, state: SessionState): Promise<void> {
  if (!prompt.trim()) {
    console.log("Usage: /build <task>");
    return;
  }

  state.pendingBuildPrompt = stripBuildFlags(prompt);
  console.log(color("Previewing", "green"));
  await buildProject([...state.pendingBuildPrompt.split(/\s+/).filter(Boolean), "--preview"]);
  console.log(color("Pending build stored. Apply with /apply or discard with /reject.", "gray"));
  printStatusHint(state);
}

async function runBuildApply(prompt: string, state: SessionState): Promise<void> {
  const task = stripBuildFlags(prompt || state.pendingBuildPrompt || "");
  if (!task.trim()) {
    console.log("No pending build. Use /build <task> first.");
    return;
  }

  console.log(color("Applying", "green"));
  await buildProject([...task.split(/\s+/).filter(Boolean), "--apply"]);
  state.pendingBuildPrompt = null;
  printStatusHint(state);
}

async function applyPendingBuild(prompt: string, state: SessionState): Promise<void> {
  await runBuildApply(prompt, state);
}

function rejectPendingBuild(state: SessionState): void {
  if (!state.pendingBuildPrompt) {
    console.log("No pending build to reject.");
    return;
  }
  console.log(`Rejected pending build: ${state.pendingBuildPrompt}`);
  state.pendingBuildPrompt = null;
  printStatusHint(state);
}

async function runPlan(idea: string, state: SessionState): Promise<void> {
  if (!idea.trim()) {
    console.log("Usage: /plan <game idea>");
    return;
  }

  console.log(color("Planning", "yellow"));
  await planProject([idea]);
  printStatusHint(state);
}

function printPromptPlaceholder(prompt: string, state: SessionState): void {
  const label = state.mode === "build" ? color("Build prompt", "green") : color("Plan prompt", "yellow");
  console.log(label);
  console.log(`Captured prompt: ${prompt}`);
  console.log(color("Model-backed build chat is not wired yet.", "gray"));
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
  console.log(color(`mode=${state.mode} prompts=${state.promptCount} pending=${state.pendingBuildPrompt ? "build" : "none"}`, "gray"));
}

function stripBuildFlags(prompt: string): string {
  return prompt
    .split(/\s+/)
    .filter((arg) => !["--preview", "--apply", "--yes", "--no-validate"].includes(arg))
    .join(" ")
    .trim();
}
