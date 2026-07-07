import type { Interface } from "node:readline/promises";
import { pathExists } from "../core/files.js";
import { tryFindGodotProjectRoot, loadProjectIndex, inspectGodotProject } from "../core/godot-project-indexer.js";
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
import { validateProject, validateProjectRoot } from "./validate.js";
import { dashboardCommand } from "./dashboard.js";
import { askMenuQuestion, chooseMenuOption, withMenu } from "../core/menu.js";
import { workspacePaths } from "../core/workspace.js";
import { color } from "../core/terminal.js";
import { detectBrownfieldProject, type TaskIntent } from "../core/brownfield.js";
import { applyLlmBuild, generateLlmBuild, type LlmBuildPlan } from "../core/llm-build.js";
import { previewGeneratedFiles, type BuildPreview } from "../core/preview.js";
import { updateChangeRecordValidation, writeChangeRecord } from "../core/change-records.js";

export async function homeCommand(args: string[] = []): Promise<void> {
  const embedded = args.includes("--embedded");
  await withMenu(async (rl) => {
    while (true) {
      const choice = await chooseMenuOption(rl, await homePrompt(), [
        { value: "setup", label: "Start guided setup", description: "runtime, model, auth, preferences" },
        { value: "status", label: "Check project status", description: "workspace, runtime, tasks, export" },
        { value: "dashboard", label: "Session dashboard", description: "latest validation, playtest, tasks, model quality" },
        { value: "pipeline", label: "Make a new playable slice", description: "idea to previewed Godot build" },
        { value: "brownfield", label: "Work on existing project", description: "inspect, validate, choose intent, preview" },
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
        if (choice === "dashboard") await dashboardCommand([]);
        if (choice === "pipeline") await pipelineCommand(["--embedded"]);
        if (choice === "brownfield") await guidedBrownfieldWorkflow(rl);
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

async function guidedBrownfieldWorkflow(rl: Interface): Promise<void> {
  await inspectProject([]);
  await validateProject([]);

  const intent = (await chooseMenuOption(rl, "Intent", [
    { value: "fix", label: "Fix", description: "bug, error, crash, broken behavior" },
    { value: "feature", label: "Feature", description: "small new capability" },
    { value: "polish", label: "Polish", description: "feel, UI, balance, visual pass" },
    { value: "refactor", label: "Refactor", description: "cleanup without behavior change" },
  ])) as TaskIntent | null;
  if (!intent) return;

  const task = (await askMenuQuestion(rl, "Focused task > ")).trim();
  if (!task) {
    console.log("No task entered.");
    return;
  }

  await reviewBrownfieldPreview(rl, task, intent);
}

export function brownfieldPreviewArgs(task: string, intent: TaskIntent): string[] {
  return [...task.split(/\s+/).filter(Boolean), "--intent", intent, "--preview"];
}

async function reviewBrownfieldPreview(rl: Interface, initialTask: string, intent: TaskIntent): Promise<void> {
  const projectRoot = await tryFindGodotProjectRoot(process.cwd());
  if (!projectRoot) {
    console.log("No project.godot found.");
    return;
  }

  let task = initialTask;
  while (true) {
    const projectIndex = await inspectGodotProject(projectRoot);
    const brownfield = detectBrownfieldProject(projectIndex);
    const plan = await generateLlmBuild(projectRoot, task, { intent, brownfieldProfile: brownfield });
    const preview = await previewGeneratedFiles(projectRoot, plan.summary, plan.files);
    printPreviewReview(preview);

    const choice = await chooseMenuOption(rl, "Review", [
      { value: "apply", label: "Apply", description: "write this exact preview and validate" },
      { value: "revise", label: "Revise", description: "change task and regenerate preview" },
      { value: "reject", label: "Reject", description: "discard preview" },
    ]);
    if (choice === "apply") {
      await applyReviewedPreview(projectRoot, task, intent, brownfield, plan);
      return;
    }
    if (choice === "revise") {
      const revised = (await askMenuQuestion(rl, "Revised task > ")).trim();
      if (revised) task = revised;
      continue;
    }
    console.log(`Rejected preview: ${task}`);
    return;
  }
}

function printPreviewReview(preview: BuildPreview): void {
  const summary = previewReviewSummary(preview);
  console.log("Preview review");
  console.log(preview.summary);
  console.log(`Files: ${summary.files} (${summary.create} create, ${summary.modify} modify, ${summary.unchanged} unchanged)`);
  console.log(`Lines: +${summary.added} -${summary.removed}`);
  for (const file of preview.files) {
    console.log(`${file.operation} ${file.path} (+${file.addedLines} -${file.removedLines})`);
  }
}

export function previewReviewSummary(preview: BuildPreview): { files: number; create: number; modify: number; unchanged: number; added: number; removed: number } {
  return {
    files: preview.files.length,
    create: preview.files.filter((file) => file.operation === "create").length,
    modify: preview.files.filter((file) => file.operation === "modify").length,
    unchanged: preview.files.filter((file) => file.operation === "unchanged").length,
    added: preview.files.reduce((sum, file) => sum + file.addedLines, 0),
    removed: preview.files.reduce((sum, file) => sum + file.removedLines, 0),
  };
}

async function applyReviewedPreview(
  projectRoot: string,
  task: string,
  intent: TaskIntent,
  brownfield: ReturnType<typeof detectBrownfieldProject>,
  plan: LlmBuildPlan,
): Promise<void> {
  const result = await applyLlmBuild(projectRoot, plan, { prompt: task, intent, brownfieldProfile: brownfield });
  let record = await writeChangeRecord(projectRoot, {
    kind: "build",
    status: "applied",
    prompt: task,
    summary: result.summary,
    files: result.changes,
    validationIds: [],
  });
  const validation = await validateProjectRoot(projectRoot);
  record = await updateChangeRecordValidation(projectRoot, record, validation.report.id);
  console.log(`Applied preview: ${record.id}`);
  console.log(`Validation: ${validation.report.summary.errors} errors, ${validation.report.summary.warnings} warnings`);
}
