import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectBrownfieldProject, inferTaskIntent, type BrownfieldProfile, type TaskIntent } from "./brownfield.js";
import { writeChangeRecord, updateChangeRecordValidation } from "./change-records.js";
import { ensureGreenfieldGodotProject } from "./greenfield.js";
import { timestampId } from "./ids.js";
import { inspectGodotProject, tryFindGodotProjectRoot } from "./godot-project.js";
import { writeDocsContext } from "./godot-docs.js";
import { applyLlmBuild, generateLlmBuild, LlmBuildError, type LlmBuildPlan } from "./llm-build.js";
import { writePlanningArtifacts } from "./planning.js";
import { previewGeneratedFiles, type BuildPreview } from "./preview.js";
import { loadModelConfigForRole, type ModelReply } from "./providers.js";
import { attemptRepair, type RepairAttempt } from "./repair.js";
import { createRuntimeProfile } from "./runtime-profile.js";
import { discoverRuntime } from "./runtime-discovery.js";
import { runValidation, type ValidationReport } from "./validation.js";
import { workspacePaths } from "./workspace.js";
import { writeAgentRoster } from "./agents.js";

export interface HarnessStep {
  id: string;
  agent: string;
  status: "done" | "preview" | "skipped" | "failed";
  summary: string;
  artifacts: string[];
  gates: string[];
}

export interface HarnessRun {
  schemaVersion: 1;
  id: string;
  goal: string;
  mode: "greenfield" | "brownfield";
  projectRoot: string;
  apply: boolean;
  startedAt: string;
  finishedAt: string;
  steps: HarnessStep[];
  preview: BuildPreview | null;
  validation: ValidationReport | null;
  repairs: RepairAttempt[];
  modelImplementation: ModelReply | null;
  taskIntent: TaskIntent;
  brownfield: BrownfieldProfile;
}

export async function runHarness(startDir: string, goal: string, options: { apply: boolean; validate: boolean; repair?: boolean; explicitApply?: boolean; intent?: TaskIntent }): Promise<{ run: HarnessRun; runPath: string }> {
  const startedAt = new Date();
  const existingRoot = await tryFindGodotProjectRoot(startDir);
  const projectRoot = existingRoot ?? startDir;
  const mode = existingRoot ? "brownfield" : "greenfield";
  const scaffold = await ensureGreenfieldGodotProject(projectRoot, goal);
  const taskIntent = options.intent ?? inferTaskIntent(goal);
  const paths = workspacePaths(projectRoot);
  const steps: HarnessStep[] = [];

  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(paths.runsDir, { recursive: true });
  await mkdir(paths.patchesDir, { recursive: true });
  await mkdir(paths.validationsDir, { recursive: true });
  await mkdir(paths.repairsDir, { recursive: true });
  await mkdir(paths.modelFailuresDir, { recursive: true });
  await mkdir(paths.cacheDocsDir, { recursive: true });

  const rosterPath = await writeAgentRoster(projectRoot);
  steps.push({
    id: "agent-roster",
    agent: "orchestrator",
    status: "done",
    summary: "Loaded Godot-specific agent roster and ownership gates.",
    artifacts: [rosterPath],
    gates: ["agents have explicit owners", "Godot-only implementation policy active"],
  });

  const projectIndex = await inspectGodotProject(projectRoot);
  const brownfield = detectBrownfieldProject(projectIndex, scaffold.createdProjectFile);
  const apply = options.apply && (!brownfield.isBrownfield || options.explicitApply === true);
  await writeFile(paths.projectIndex, JSON.stringify(projectIndex, null, 2) + "\n");
  steps.push({
    id: "context-scout",
    agent: "scout",
    status: "done",
    summary: scaffold.createdProjectFile ? "Created greenfield scaffold and indexed new Godot project." : "Indexed existing Godot project.",
    artifacts: [paths.projectIndex],
    gates: [`main scene: ${projectIndex.mainScene ?? "unknown"}`, `scripts: ${projectIndex.scripts.length}`, `scenes: ${projectIndex.scenes.length}`],
  });

  if (options.apply && !apply && brownfield.isBrownfield) {
    steps.push({
      id: "brownfield-apply-gate",
      agent: "orchestrator",
      status: "preview",
      summary: "Brownfield project detected; defaulting to preview until --apply is passed explicitly.",
      artifacts: [],
      gates: ["existing project preservation", `reasons: ${brownfield.reasons.join(", ")}`, `intent: ${taskIntent}`],
    });
  }

  const planning = await writePlanningArtifacts(projectRoot, goal, mode);
  steps.push({
    id: "design-architecture",
    agent: "designer+architect",
    status: "done",
    summary: "Updated brief, GDD, technical plan, tasks, decisions, and risks.",
    artifacts: planning.filesWritten,
    gates: ["core loop defined", "Godot 4.3+ + GDScript-first rule recorded", "validation requirement recorded"],
  });

  const docsContext = await writeDocsContext(projectRoot, goal);
  steps.push({
    id: "docs-context",
    agent: "docs-librarian",
    status: "done",
    summary: `Selected ${docsContext.matches.length} official Godot docs sources for this run.`,
    artifacts: [docsContext.path],
    gates: ["official docs preferred", "docs sources labeled by URL"],
  });

  await writeBacklog(projectRoot, goal);
  steps.push({
    id: "producer-backlog",
    agent: "producer",
    status: "done",
    summary: "Created milestone backlog with acceptance gates.",
    artifacts: [paths.backlog],
    gates: ["vertical slice first", "preview before write", "Godot validation after apply"],
  });

  const discovery = await discoverRuntime(projectRoot);
  const runtimeProfile = createRuntimeProfile(projectRoot, discovery, projectIndex);
  await writeFile(paths.runtimeProfile, JSON.stringify(runtimeProfile, null, 2) + "\n");
  steps.push({
    id: "runtime-gate",
    agent: "qa-validator",
    status: runtimeProfile.executable ? "done" : "failed",
    summary: runtimeProfile.executable ? "Godot runtime selected." : "No Godot runtime executable available.",
    artifacts: [paths.runtimeProfile],
    gates: [`install type: ${runtimeProfile.installType}`, `version: ${runtimeProfile.detectedGodotVersion ?? "unknown"}`],
  });

  let validation: ValidationReport | null = null;
  const repairs: RepairAttempt[] = [];
  let modelImplementation: ModelReply | null = null;
  let llmPlan: LlmBuildPlan | null = null;

  // LLM-driven implementation is the only path.
  const modelSelection = await loadModelConfigForRole(projectRoot, "build");
  if (!modelSelection.config) {
    steps.push({
      id: "model-implementation",
      agent: "orchestrator+gameplay-engineer",
      status: "failed",
      summary: "No model provider configured. Configure one first: godotcoder models use --provider ollama --model llama3.1",
      artifacts: [],
      gates: ["LLM provider required for code generation"],
    });

    const run = buildRun(goal, mode, projectRoot, apply, startedAt, steps, null, null, [], null, taskIntent, brownfield);
    const runPath = path.join(paths.runsDir, `${run.id}.json`);
    await writeFile(runPath, JSON.stringify(run, null, 2) + "\n");
    return { run, runPath };
  }

  try {
    llmPlan = await generateLlmBuild(projectRoot, goal, { intent: taskIntent, brownfieldProfile: brownfield });
    modelImplementation = llmPlan.reply;
    steps.push({
      id: "model-implementation",
      agent: "orchestrator+gameplay-engineer",
      status: "done",
      summary: `Model implementation generated with ${modelImplementation.provider}:${modelImplementation.model}.`,
      artifacts: llmPlan.files.map((file) => `res://${file.path}`),
      gates: ["JSON parsed", "paths and extensions allowed", "preview/apply gates still active"],
    });
  } catch (error) {
    const artifacts: string[] = [];
    if (error instanceof LlmBuildError) {
      artifacts.push(await writeModelFailure(projectRoot, goal, error, startedAt));
    }
    steps.push({
      id: "model-implementation",
      agent: "orchestrator+gameplay-engineer",
      status: "failed",
      summary: `Model implementation failed: ${error instanceof Error ? error.message : String(error)}`,
      artifacts,
      gates: ["model output was invalid or did not pass acceptance gates"],
    });

    const run = buildRun(goal, mode, projectRoot, apply, startedAt, steps, null, null, [], null, taskIntent, brownfield);
    const runPath = path.join(paths.runsDir, `${run.id}.json`);
    await writeFile(runPath, JSON.stringify(run, null, 2) + "\n");
    return { run, runPath };
  }

  const preview = await previewGeneratedFiles(projectRoot, llmPlan.summary, llmPlan.files);

  if (apply) {
    const result = await applyHarnessBuild(projectRoot, goal, llmPlan, preview, runtimeProfile, steps, paths, taskIntent, brownfield, options);
    validation = result.validation;
    repairs.push(...result.repairs);
  } else {
    steps.push({
      id: "implementation-preview",
      agent: "gameplay-engineer",
      status: "preview",
      summary: llmPlan.summary,
      artifacts: preview.files.map((file) => file.path),
      gates: ["preview only", "apply required before patch record", "validation waits for apply"],
    });
  }

  const run = buildRun(goal, mode, projectRoot, apply, startedAt, steps, preview, validation, repairs, modelImplementation, taskIntent, brownfield);
  const runPath = path.join(paths.runsDir, `${run.id}.json`);
  await writeFile(runPath, JSON.stringify(run, null, 2) + "\n");
  return { run, runPath };
}

async function applyHarnessBuild(
  projectRoot: string,
  goal: string,
  llmPlan: LlmBuildPlan,
  _preview: BuildPreview,
  runtimeProfile: ReturnType<typeof createRuntimeProfile>,
  steps: HarnessStep[],
  paths: ReturnType<typeof workspacePaths>,
  taskIntent: TaskIntent,
  brownfield: BrownfieldProfile,
  options: { validate: boolean; repair?: boolean },
): Promise<{ validation: ValidationReport | null; repairs: RepairAttempt[] }> {
  let validation: ValidationReport | null = null;
  const repairs: RepairAttempt[] = [];

  const result = await applyLlmBuild(projectRoot, llmPlan, { prompt: goal, intent: taskIntent, brownfieldProfile: brownfield });
  let record = await writeChangeRecord(projectRoot, {
    kind: "build",
    status: "applied",
    prompt: goal,
    summary: result.summary,
    files: result.changes,
    validationIds: [],
  });
  steps.push({
    id: "implementation",
    agent: "gameplay-engineer",
    status: "done",
    summary: result.summary,
    artifacts: [path.join(paths.patchesDir, record.id, "record.json"), ...result.filesWritten],
    gates: ["changes applied", "patch record written"],
  });

  if (options.validate) {
    validation = await runValidation(projectRoot, runtimeProfile);
    const reportPath = path.join(paths.validationsDir, `${validation.id}.json`);
    await writeFile(reportPath, JSON.stringify(validation, null, 2) + "\n");
    record = await updateChangeRecordValidation(projectRoot, record, validation.id);
    steps.push({
      id: "qa-validation",
      agent: "qa-validator",
      status: validation.summary.errors === 0 ? "done" : "failed",
      summary: `Godot validation: ${validation.summary.errors} errors, ${validation.summary.warnings} warnings.`,
      artifacts: [reportPath, path.join(paths.patchesDir, record.id, "record.json")],
      gates: [`exit code: ${validation.exitCode ?? "not run"}`],
    });

    if (options.repair && validation && validation.summary.errors > 0) {
      const repair = await attemptRepair(projectRoot, validation, runtimeProfile);
      repairs.push(repair.attempt);
      steps.push({
        id: "qa-repair",
        agent: "qa-validator+gameplay-engineer",
        status: repair.attempt.status === "repaired" ? "done" : repair.attempt.status === "skipped" ? "skipped" : "failed",
        summary: repair.attempt.summary,
        artifacts: [repair.attemptPath],
        gates: repair.attempt.validationAfter
          ? [`post-repair errors: ${repair.attempt.validationAfter.summary.errors}`, `post-repair warnings: ${repair.attempt.validationAfter.summary.warnings}`]
          : ["no post-repair validation"],
      });
      if (repair.attempt.validationAfter) {
        validation = repair.attempt.validationAfter;
      }
    }
  }

  return { validation, repairs };
}

function buildRun(
  goal: string,
  mode: "greenfield" | "brownfield",
  projectRoot: string,
  apply: boolean,
  startedAt: Date,
  steps: HarnessStep[],
  preview: BuildPreview | null,
  validation: ValidationReport | null,
  repairs: RepairAttempt[],
  modelImplementation: ModelReply | null,
  taskIntent: TaskIntent,
  brownfield: BrownfieldProfile,
): HarnessRun {
  return {
    schemaVersion: 1,
    id: `run_${timestampId(startedAt)}`,
    goal,
    mode,
    projectRoot,
    apply,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    steps,
    preview,
    validation,
    repairs,
    modelImplementation,
    taskIntent,
    brownfield,
  };
}

async function writeModelFailure(projectRoot: string, goal: string, error: LlmBuildError, startedAt: Date): Promise<string> {
  const paths = workspacePaths(projectRoot);
  await mkdir(paths.modelFailuresDir, { recursive: true });
  const failurePath = path.join(paths.modelFailuresDir, `model_failure_${timestampId(startedAt)}.json`);
  await writeFile(
    failurePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        goal,
        createdAt: new Date().toISOString(),
        error: error.message,
        attempts: error.attempts,
      },
      null,
      2,
    ) + "\n",
  );
  return failurePath;
}

async function writeBacklog(projectRoot: string, goal: string): Promise<void> {
  const paths = workspacePaths(projectRoot);
  await writeFile(
    paths.backlog,
    `# Backlog

## Goal

${goal}

## Milestone 1: First Playable

- [ ] Player can move using keyboard.
- [ ] One core mechanic exists and gives visible feedback.
- [ ] One obstacle, collectible, enemy, score, or win condition exists.
- [ ] Restart path exists.
- [ ] \`godotcoder validate\` reports zero script errors.

## Milestone 2: Game Shape

- [ ] Split monolithic prototype into scenes/scripts when complexity justifies it.
- [ ] Add exported tunables for speed, spawn rates, scoring, or level size.
- [ ] Add minimal HUD or diegetic feedback.

## Milestone 3: Ship Gate

- [ ] Export preset exists.
- [ ] Runtime profile current.
- [ ] Validation report clean.
- [ ] Known risks moved into decisions or tasks.
`,
  );
}
