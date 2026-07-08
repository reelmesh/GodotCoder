import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { authCommand } from "./auth.js";
import { docsCommand } from "./docs.js";
import { dashboardCommand } from "./dashboard.js";
import { exportCommand } from "./export.js";
import { showAgents } from "./agents.js";
import { homeCommand } from "./home.js";
import { runHarnessCommand } from "./harness.js";
import { inspectProject } from "./inspect.js";
import { askModel, modelsCommand } from "./models.js";
import { planProject } from "./plan.js";
import { pipelineCommand } from "./pipeline.js";
import { playCommand } from "./play.js";
import { repairCommand } from "./repair.js";
import { rpcCommand } from "./rpc.js";
import { runtimeCommand, runtimeDoctor } from "./runtime.js";
import { runsCommand } from "./runs.js";
import { setupCommand } from "./setup.js";
import { settingsCommand } from "./settings.js";
import { showStatus } from "./status.js";
import { tasksCommand } from "./tasks.js";
import { validateProject } from "./validate.js";
import { workflowCommand } from "./workflow.js";
import { completeSessionLine } from "../core/completion.js";
import { detectBrownfieldProject, isTaskIntentFlag, parseTaskIntent, type BrownfieldProfile, type TaskIntent } from "../core/brownfield.js";
import { writeChangeRecord, updateChangeRecordValidation } from "../core/change-records.js";
import { ensureGreenfieldGodotProject } from "../core/greenfield.js";
import { inspectGodotProject, tryFindGodotProjectRoot } from "../core/godot-project-indexer.js";
import { applyLlmBuild, generateLlmBuild, type LlmBuildPlan } from "../core/llm-build.js";
import { previewGeneratedFiles, type BuildPreview } from "../core/preview.js";
import { loadModelConfig } from "../core/providers.js";
import { color, clearScreen, separator, logo } from "../core/terminal.js";
import { validateProjectRoot } from "./validate.js";

type AgentMode = "build" | "plan";

interface SessionState {
  mode: AgentMode;
  promptCount: number;
  pendingBuild: PendingBuild | null;
}

interface PendingBuild {
  prompt: string;
  intent: TaskIntent;
  brownfield: BrownfieldProfile;
  plan: LlmBuildPlan;
}

export async function startSession(): Promise<void> {
  const state: SessionState = { mode: "build", promptCount: 0, pendingBuild: null };

  printWelcome(state);
  await checkModelWarning();

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

  await homeCommand(["--embedded"]);

  while (true) {
    const rl = readline.createInterface({ input, output, completer: sessionCompleter });
    let line: string;
    try {
      line = (await rl.question(promptLabel(state))).trim();
    } finally {
      rl.close();
    }

    if (!line) continue;

    if (line === "/exit" || line === "/quit") {
      break;
    }

    await handleSessionLine(line, state);
  }
}

function sessionCompleter(line: string): [string[], string] {
  return completeSessionLine(line);
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
      case "/home":
      case "/menu":
        await homeCommand(["--embedded"]);
        printStatusHint(state);
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
      case "/dashboard":
        await dashboardCommand(args);
        printStatusHint(state);
        return;
      case "/setup":
        await setupCommand(args);
        printStatusHint(state);
        return;
      case "/workflow":
        await workflowCommand(args);
        printStatusHint(state);
        return;
      case "/settings":
        await settingsCommand(["--embedded", ...args]);
        printStatusHint(state);
        return;
      case "/auth":
      case "/login":
        await authCommand(args);
        printStatusHint(state);
        return;
      case "/agents":
        await showAgents(args);
        printStatusHint(state);
        return;
      case "/docs":
        await docsCommand(args);
        printStatusHint(state);
        return;
      case "/models":
        await modelsCommand(args);
        printStatusHint(state);
        return;
      case "/runs":
      case "/history":
        await runsCommand(["--embedded", ...args]);
        printStatusHint(state);
        return;
      case "/tasks":
        await tasksCommand(args);
        printStatusHint(state);
        return;
      case "/ask":
      case "/chat":
        await askModel(args);
        printStatusHint(state);
        return;
      case "/harness":
      case "/run":
        await runHarnessCommand(args);
        printStatusHint(state);
        return;
      case "/pipeline":
      case "/make":
        await pipelineCommand(["--embedded", ...args]);
        printStatusHint(state);
        return;
      case "/play":
      case "/open":
        await playCommand(args);
        printStatusHint(state);
        return;
      case "/playtest":
        await playCommand(["--test", ...args]);
        printStatusHint(state);
        return;
      case "/runtime":
        await runtimeCommand(args);
        printStatusHint(state);
        return;
      case "/doctor":
        try {
          await runtimeDoctor(args);
        } catch (error) {
          console.log("No Godot project in this directory. Use /home to browse or navigate to a project folder.");
        }
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
      case "/export":
        await exportCommand(args);
        printStatusHint(state);
        return;
      case "/repair":
        await repairCommand(args);
        printStatusHint(state);
        return;
      case "/rpc":
        await rpcCommand(args);
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
  console.log(logo());
  console.log("");
  console.log(`${color("mode", "cyan")} ${state.mode}  ${color("project", "cyan")} current workspace  ${color("runtime", "cyan")} native/flatpak`);
  console.log(`${color("commands", "cyan")} /menu  /make  /play  /playtest  /repair  /rpc  /help  /setup  /settings  /auth  /models  /docs  /runs  /tasks  /harness  /status  /dashboard  /validate  /build  /runtime doctor  /exit`);
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
  console.log(`${color("/menu", "cyan").padEnd(22)} Open the GodotCoder home menu`);
  console.log(`${color("/home", "cyan").padEnd(22)} Alias for /menu`);
  console.log(`${color("/setup", "cyan").padEnd(22)} Guided setup for runtime, models, auth, settings`);
  console.log(`${color("/status", "cyan").padEnd(22)} Show workspace status`);
  console.log(`${color("/settings", "cyan").padEnd(22)} Show local GodotCoder settings`);
  console.log(`${color("/settings default-mode", "cyan").padEnd(22)} Set plan/build default mode`);
  console.log(`${color("/settings approval-mode", "cyan").padEnd(22)} Set preview/auto-apply behavior`);
  console.log(`${color("/settings provider", "cyan").padEnd(22)} Set preferred model provider`);
  console.log(`${color("/settings diffs", "cyan").padEnd(22)} Set compact/full diffs`);
  console.log(`${color("/auth", "cyan").padEnd(22)} Show local auth status`);
  console.log(`${color("/auth login", "cyan").padEnd(22)} Save provider API key locally`);
  console.log(`${color("/agents", "cyan").padEnd(22)} Show Godot-specific agent roster`);
  console.log(`${color("/docs <query>", "cyan").padEnd(22)} Search trusted official Godot docs sources`);
  console.log(`${color("/models", "cyan").padEnd(22)} Show or configure model provider`);
  console.log(`${color("/runs", "cyan").padEnd(22)} Browse harness run history`);
  console.log(`${color("/history", "cyan").padEnd(22)} Alias for /runs`);
  console.log(`${color("/tasks", "cyan").padEnd(22)} List, show, or update task-board state`);
  console.log(`${color("/ask <prompt>", "cyan").padEnd(22)} Ask configured LLM with GodotCoder system prompt`);
  console.log(`${color("/harness <goal>", "cyan").padEnd(22)} Run directed multi-agent workflow preview`);
  console.log(`${color("/run <goal>", "cyan").padEnd(22)} Alias for /harness`);
  console.log(`${color("/pipeline <idea>", "cyan").padEnd(22)} Build a complete playable slice and validate it`);
  console.log(`${color("/make <idea>", "cyan").padEnd(22)} Alias for /pipeline`);
  console.log(`${color("/play", "cyan").padEnd(22)} Launch the current Godot game`);
  console.log(`${color("/playtest", "cyan").padEnd(22)} Run automated playtest or record feedback`);
  console.log(`${color("/open", "cyan").padEnd(22)} Alias for /play`);
  console.log(`${color("/runtime doctor", "cyan").padEnd(22)} Detect native/Flatpak Godot runtime`);
  console.log(`${color("/runtime use <cmd>", "cyan").padEnd(22)} Pin a native, Flatpak, or custom Godot command`);
  console.log(`${color("/doctor", "cyan").padEnd(22)} Alias for /runtime doctor`);
  console.log(`${color("/inspect", "cyan").padEnd(22)} Inspect project.godot and project files`);
  console.log(`${color("/validate [--smoke] [--visual] [--export]", "cyan").padEnd(22)} Run Godot-backed validation; --smoke, --visual, or --export for focused checks`);
  console.log(`${color("/check [--smoke] [--visual] [--export]", "cyan").padEnd(22)} Alias for /validate`);
  console.log(`${color("/export doctor", "cyan").padEnd(22)} Inspect export preset and template readiness`);
  console.log(`${color("/export preset linux", "cyan").padEnd(22)} Preview a starter Linux export preset`);
  console.log(`${color("/repair", "cyan").padEnd(22)} Validate, apply deterministic repair, and revalidate`);
  console.log(`${color("/rpc <method>", "cyan").padEnd(22)} Emit stable JSON RPC envelope`);
  console.log(`${color("/mode plan", "cyan").padEnd(22)} Read-only planning mode`);
  console.log(`${color("/mode build", "cyan").padEnd(22)} Implementation mode`);
  console.log(`${color("/plan <idea>", "cyan").padEnd(22)} Scaffold/plan a greenfield or brownfield project`);
  console.log(`${color("/preview <task>", "cyan").padEnd(22)} Preview controlled build changes`);
  console.log(`${color("/build <task>", "cyan").padEnd(22)} Preview changes; supports --task <id>`);
  console.log(`${color("/apply", "cyan").padEnd(22)} Apply pending build preview`);
  console.log(`${color("/reject", "cyan").padEnd(22)} Reject pending build preview`);
  console.log(`${color("/clear", "cyan").padEnd(22)} Clear terminal`);
  console.log(`${color("/exit", "cyan").padEnd(22)} Quit`);
  console.log(separator());
  console.log(color("Natural-language prompts in build mode preview controlled patches. Add --llm to use configured model.", "gray"));
}

async function runBuildPreview(prompt: string, state: SessionState): Promise<void> {
  if (!prompt.trim()) {
    console.log("Usage: /build <task>");
    return;
  }

  const args = prompt.split(/\s+/).filter(Boolean);
  const task = stripBuildFlags(prompt);
  const intent = parseTaskIntent(args) ?? "feature";
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  await ensureGreenfieldGodotProject(projectRoot, task);
  const projectIndex = await inspectGodotProject(projectRoot);
  const brownfield = detectBrownfieldProject(projectIndex);
  console.log(color("Previewing", "green"));
  const plan = await generateLlmBuild(projectRoot, task, { intent, brownfieldProfile: brownfield });
  const preview = await previewGeneratedFiles(projectRoot, plan.summary, plan.files);
  printPreview(preview);
  state.pendingBuild = { prompt: task, intent, brownfield, plan };
  console.log(color("Pending build stored. Apply with /apply or discard with /reject.", "gray"));
  printStatusHint(state);
}

async function runBuildApply(prompt: string, state: SessionState): Promise<void> {
  if (prompt.trim()) {
    await runBuildPreview(prompt, state);
  }
  const pending = state.pendingBuild;
  if (!pending) {
    console.log("No pending build. Use /build <task> first.");
    return;
  }

  console.log(color("Applying", "green"));
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  const result = await applyLlmBuild(projectRoot, pending.plan, { prompt: pending.prompt, intent: pending.intent, brownfieldProfile: pending.brownfield });
  let record = await writeChangeRecord(projectRoot, {
    kind: "build",
    status: "applied",
    prompt: pending.prompt,
    summary: result.summary,
    files: result.changes,
    validationIds: [],
  });
  const validation = await validateProjectRoot(projectRoot);
  record = await updateChangeRecordValidation(projectRoot, record, validation.report.id);
  console.log(`Applied pending build: ${record.id}`);
  console.log(`Validation: ${validation.report.summary.errors} errors, ${validation.report.summary.warnings} warnings`);
  state.pendingBuild = null;
  printStatusHint(state);
}

async function applyPendingBuild(prompt: string, state: SessionState): Promise<void> {
  await runBuildApply(prompt, state);
}

function rejectPendingBuild(state: SessionState): void {
  if (!state.pendingBuild) {
    console.log("No pending build to reject.");
    return;
  }
  console.log(`Rejected pending build: ${state.pendingBuild.prompt}`);
  state.pendingBuild = null;
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

function setMode(value: string | undefined, state: SessionState): void {
  if (value !== "plan" && value !== "build") {
    console.log("Usage: /mode plan | /mode build");
    return;
  }

  state.mode = value;
  console.log(`Mode set to ${value === "build" ? color("build", "green") : color("plan", "yellow")}`);
}

function printStatusHint(state: SessionState): void {
  console.log(color(`mode=${state.mode} prompts=${state.promptCount} pending=${state.pendingBuild ? "build" : "none"}`, "gray"));
}

async function checkModelWarning(): Promise<void> {
  try {
    const { tryFindGodotProjectRoot } = await import("../core/godot-project-indexer.js");
    const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
    const config = await loadModelConfig(projectRoot);
    if (!config) {
      console.log(color("No model provider configured.", "yellow"));
      console.log(color("Quick setup: /auth openai <api-key>  or  /auth anthropic <api-key>", "gray"));
      console.log(color("Or run /setup for guided configuration.", "gray"));
      console.log("");
    }
  } catch {
    // project root not found — skip warning
  }
}

function stripBuildFlags(prompt: string): string {
  const args = prompt.split(/\s+/);
  return args
    .filter((arg, index) => !["--preview", "--apply", "--yes", "--no-validate"].includes(arg) && !isTaskIntentFlag(arg, args[index - 1]))
    .join(" ")
    .trim();
}

function printPreview(preview: BuildPreview): void {
  console.log("Build preview");
  console.log(preview.summary);
  for (const file of preview.files) {
    console.log(`${file.operation} ${file.path} (+${file.addedLines} -${file.removedLines}, ${file.beforeLines} -> ${file.afterLines} lines)`);
  }
}
