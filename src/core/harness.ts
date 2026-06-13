import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { selectBuilder } from "./builders/index.js";
import { writeChangeRecord, updateChangeRecordValidation } from "./change-records.js";
import { ensureGreenfieldGodotProject } from "./greenfield.js";
import { inspectGodotProject, tryFindGodotProjectRoot } from "./godot-project.js";
import { applyLlmBuild, generateLlmBuild, type LlmBuildPlan } from "./llm-build.js";
import { writePlanningArtifacts } from "./planning.js";
import { previewGeneratedFiles, type BuildPreview } from "./preview.js";
import { loadModelConfig, type ModelReply } from "./providers.js";
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
  modelAdvisory: ModelReply | null;
  modelImplementation: ModelReply | null;
  implementationSource: "deterministic" | "llm";
}

export async function runHarness(startDir: string, goal: string, options: { apply: boolean; validate: boolean; llm: boolean; repair?: boolean }): Promise<{ run: HarnessRun; runPath: string }> {
  const startedAt = new Date();
  const existingRoot = await tryFindGodotProjectRoot(startDir);
  const projectRoot = existingRoot ?? startDir;
  const mode = existingRoot ? "brownfield" : "greenfield";
  const scaffold = await ensureGreenfieldGodotProject(projectRoot, goal);
  const paths = workspacePaths(projectRoot);
  const steps: HarnessStep[] = [];

  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(paths.runsDir, { recursive: true });
  await mkdir(paths.patchesDir, { recursive: true });
  await mkdir(paths.validationsDir, { recursive: true });
  await mkdir(paths.repairsDir, { recursive: true });

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
  await writeFile(paths.projectIndex, JSON.stringify(projectIndex, null, 2) + "\n");
  steps.push({
    id: "context-scout",
    agent: "scout",
    status: "done",
    summary: scaffold.createdProjectFile ? "Created greenfield scaffold and indexed new Godot project." : "Indexed existing Godot project.",
    artifacts: [paths.projectIndex],
    gates: [`main scene: ${projectIndex.mainScene ?? "unknown"}`, `scripts: ${projectIndex.scripts.length}`, `scenes: ${projectIndex.scenes.length}`],
  });

  const planning = await writePlanningArtifacts(projectRoot, goal, mode);
  steps.push({
    id: "design-architecture",
    agent: "designer+architect",
    status: "done",
    summary: "Updated brief, GDD, technical plan, tasks, decisions, and risks.",
    artifacts: planning.filesWritten,
    gates: ["core loop defined", "Godot 4.3+ + GDScript-first rule recorded", "validation requirement recorded"],
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

  const builder = selectBuilder(goal);
  let validation: ValidationReport | null = null;
  const repairs: RepairAttempt[] = [];
  let modelAdvisory: ModelReply | null = null;
  let modelImplementation: ModelReply | null = null;
  let implementationSource: "deterministic" | "llm" = "deterministic";
  let llmPlan: LlmBuildPlan | null = null;
  let implementationSummary = builder.summary;
  let implementationFiles = builder.generateFiles();

  if (options.llm) {
    const modelConfig = await loadModelConfig(projectRoot);
    if (modelConfig) {
      try {
        llmPlan = await generateLlmBuild(projectRoot, goal);
        modelImplementation = llmPlan.reply;
        implementationSource = "llm";
        implementationSummary = llmPlan.summary;
        implementationFiles = llmPlan.files;
        steps.push({
          id: "model-implementation",
          agent: "orchestrator+gameplay-engineer",
          status: "done",
          summary: `Controlled model implementation generated with ${modelImplementation.provider}:${modelImplementation.model}.`,
          artifacts: llmPlan.files.map((file) => `res://${file.path}`),
          gates: ["JSON parsed", "paths and extensions allowed", "preview/apply gates still active"],
        });
      } catch (error) {
        steps.push({
          id: "model-implementation",
          agent: "orchestrator+gameplay-engineer",
          status: "failed",
          summary: `Controlled model implementation failed: ${error instanceof Error ? error.message : String(error)}`,
          artifacts: [],
          gates: ["harness fell back to deterministic builder"],
        });
      }
    } else {
      steps.push({
        id: "model-implementation",
        agent: "orchestrator+gameplay-engineer",
        status: "skipped",
        summary: "No model provider configured.",
        artifacts: [],
        gates: ["run `godotcoder models use ...` to enable LLM implementation"],
      });
    }
  }

  const preview = await previewGeneratedFiles(projectRoot, implementationSummary, implementationFiles);

  if (options.apply) {
    const result = llmPlan ? await applyLlmBuild(projectRoot, llmPlan) : await builder.build(projectRoot);
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
      gates: [`source: ${implementationSource}`, "changes applied", "patch record written"],
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

      if (options.repair && validation.summary.errors > 0) {
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
  } else {
    steps.push({
      id: "implementation-preview",
      agent: "gameplay-engineer",
      status: "preview",
      summary: implementationSummary,
      artifacts: preview.files.map((file) => file.path),
      gates: [`source: ${implementationSource}`, "preview only", "apply required before patch record", "validation waits for apply"],
    });
  }

  const run: HarnessRun = {
    schemaVersion: 1,
    id: `run_${timestampId(startedAt)}`,
    goal,
    mode,
    projectRoot,
    apply: options.apply,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    steps,
    preview,
    validation,
    repairs,
    modelAdvisory,
    modelImplementation,
    implementationSource,
  };
  const runPath = path.join(paths.runsDir, `${run.id}.json`);
  await writeFile(runPath, JSON.stringify(run, null, 2) + "\n");
  return { run, runPath };
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

function timestampId(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "_").replace(/\.(\d+)Z$/, "_$1");
}
