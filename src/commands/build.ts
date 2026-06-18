import { ensureGreenfieldGodotProject } from "../core/greenfield.js";
import { inspectGodotProject, tryFindGodotProjectRoot } from "../core/godot-project.js";
import { applyLlmBuild, generateLlmBuild } from "../core/llm-build.js";
import { CliError } from "../core/errors.js";
import { loadModelConfig } from "../core/providers.js";
import { validateProjectRoot } from "./validate.js";
import { updateChangeRecordValidation, writeChangeRecord } from "../core/change-records.js";
import { previewGeneratedFiles } from "../core/preview.js";
import { detectBrownfieldProject, inferTaskIntent, isTaskIntentFlag, parseTaskIntent } from "../core/brownfield.js";
import type { TaskIntent } from "../core/brownfield.js";
import { getTask, linkTaskArtifacts, taskPrompt, updateTask, type TaskRecord } from "../core/tasks.js";

export interface BuildApplyPayload {
  ok: boolean;
  source: "llm";
  scaffold: Awaited<ReturnType<typeof ensureGreenfieldGodotProject>>;
  brownfield: ReturnType<typeof detectBrownfieldProject>;
  intent: TaskIntent;
  task: TaskRecord | null;
  result: Awaited<ReturnType<typeof applyLlmBuild>>;
  changeRecord: Awaited<ReturnType<typeof writeChangeRecord>>;
  validationReport: Awaited<ReturnType<typeof validateProjectRoot>>["report"] | null;
  validationReportPath: string | null;
}

export async function buildProject(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const preview = args.includes("--preview");
  const apply = args.includes("--apply") || args.includes("--yes");
  const shouldValidate = !args.includes("--no-validate");
  const intent = parseTaskIntent(args);
  const taskId = readBuildOption(args, "--task");
  const promptArgs = args.filter((arg, index) => !isBuildFlag(arg, args[index - 1]));
  const prompt = promptArgs.join(" ").trim();

  if (!prompt && !taskId) {
    console.log("Usage: godotcoder build <task> [--task <task-id>] [--preview] [--apply] [--no-validate] [--json]");
    return;
  }

  const existingRoot = await tryFindGodotProjectRoot(process.cwd());
  const projectRoot = existingRoot ?? process.cwd();
  const task = taskId ? await getTask(projectRoot, taskId) : null;
  const buildPrompt = prompt || (task ? taskPrompt(task) : "");

  const taskIntent = intent ?? inferTaskIntent(buildPrompt);
  if (apply && !preview) {
    const payload = await applyBuildTask(buildPrompt || "build first playable", { shouldValidate, intent: taskIntent, taskId: task?.id ?? null });

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      if (payload.scaffold.createdProjectFile) {
        console.log("No project.godot found. Created a minimal greenfield Godot project.");
      }
      if (payload.brownfield.isBrownfield) {
        console.log(`Brownfield safety: ${payload.result.brownfieldSafety?.findings.length ?? 0} findings.`);
      }
      if (payload.task) {
        console.log(`Task: ${payload.task.id} [${payload.task.state}] ${payload.task.title}`);
      }
      console.log(payload.result.summary);
      for (const file of payload.result.filesWritten) {
        console.log(`Wrote ${file}`);
      }
      console.log(`Recorded change: .godotcoder/patches/${payload.changeRecord.id}/record.json`);
      if (payload.validationReport) {
        console.log("Godot validation");
        console.log(`Report: ${payload.validationReportPath}`);
        console.log(`Exit code: ${payload.validationReport.exitCode ?? "not run"}`);
        console.log(`Errors: ${payload.validationReport.summary.errors}`);
        console.log(`Warnings: ${payload.validationReport.summary.warnings}`);
        for (const finding of payload.validationReport.findings) {
          console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
        }
      }
    }
    return;
  }

  const scaffold = await ensureGreenfieldGodotProject(projectRoot, buildPrompt || "GodotCoder Game");
  const projectIndex = await inspectGodotProject(projectRoot);
  const brownfield = detectBrownfieldProject(projectIndex, scaffold.createdProjectFile);

  const modelConfig = await loadModelConfig(projectRoot);
  if (!modelConfig) {
    throw new CliError("MODEL_CONFIG_MISSING", "No model provider configured. GodotCoder is LLM-driven — configure a provider first:\n  godotcoder models use --provider ollama --model llama3.1");
  }

  const plan = await generateLlmBuild(projectRoot, buildPrompt || "build requested game feature", {
    intent: taskIntent,
    brownfieldProfile: brownfield,
  });

  if (preview || !apply) {
    const buildPreview = await previewGeneratedFiles(projectRoot, plan.summary, plan.files);
    if (json) {
      console.log(JSON.stringify({ ok: true, mode: "preview", source: "llm", scaffold, brownfield, intent: taskIntent, task, preview: buildPreview, model: { provider: plan.reply.provider, model: plan.reply.model } }, null, 2));
      return;
    }

    if (scaffold.createdProjectFile) {
      console.log("No project.godot found. Created a minimal greenfield Godot project.");
    }
    if (brownfield.isBrownfield) {
      console.log(`Brownfield mode: ${brownfield.reasons.join(", ")}. Previewing targeted ${taskIntent} patch.`);
    }
    if (task) {
      console.log(`Task: ${task.id} [${task.state}] ${task.title}`);
    }
    printPreview(buildPreview);
    console.log(task ? `Apply with: godotcoder build --task ${task.id} --apply, or /apply in the interactive shell.` : "Apply with: godotcoder build <task> --apply, or /apply in the interactive shell.");
    return;
  }
}

export async function applyBuildTask(prompt: string, options: { shouldValidate?: boolean; intent?: TaskIntent | null; taskId?: string | null } = {}): Promise<BuildApplyPayload> {
  const existingRoot = await tryFindGodotProjectRoot(process.cwd());
  const projectRoot = existingRoot ?? process.cwd();
  const scaffold = await ensureGreenfieldGodotProject(projectRoot, prompt || "GodotCoder Game");
  const projectIndex = await inspectGodotProject(projectRoot);
  const brownfield = detectBrownfieldProject(projectIndex, scaffold.createdProjectFile);
  const taskIntent = options.intent ?? inferTaskIntent(prompt);
  const shouldValidate = options.shouldValidate ?? true;
  const task = options.taskId ? await updateTask(projectRoot, options.taskId, { state: "active" }).then((result) => result.task) : null;

  const modelConfig = await loadModelConfig(projectRoot);
  if (!modelConfig) {
    throw new CliError("MODEL_CONFIG_MISSING", "No model provider configured. GodotCoder is LLM-driven — configure a provider first:\n  godotcoder models use --provider ollama --model llama3.1");
  }

  const plan = await generateLlmBuild(projectRoot, prompt || "build requested game feature", {
    intent: taskIntent,
    brownfieldProfile: brownfield,
  });
  const result = await applyLlmBuild(projectRoot, plan, {
    prompt: prompt || "build first playable",
    intent: taskIntent,
    brownfieldProfile: brownfield,
  });
  let changeRecord = await writeChangeRecord(projectRoot, {
    kind: "build",
    status: "applied",
    prompt: prompt || "build first playable",
    taskId: task?.id ?? null,
    summary: result.summary,
    files: result.changes,
    validationIds: [],
  });

  let validationReport: BuildApplyPayload["validationReport"] = null;
  let validationReportPath: string | null = null;
  if (shouldValidate) {
    const validation = await validateProjectRoot(projectRoot);
    validationReport = validation.report;
    validationReportPath = validation.reportPath;
    changeRecord = await updateChangeRecordValidation(projectRoot, changeRecord, validationReport.id);
  }
  const linkedTask = task
    ? await linkTaskArtifacts(projectRoot, task.id, {
        patches: [changeRecord.id],
        validations: validationReport ? [validationReport.id] : [],
      })
    : null;

  return {
    ok: validationReport ? validationReport.summary.errors === 0 : true,
    source: "llm",
    scaffold,
    brownfield,
    intent: taskIntent,
    task: linkedTask,
    result,
    changeRecord,
    validationReport,
    validationReportPath,
  };
}

function isBuildFlag(arg: string, previous: string | undefined): boolean {
  if (isTaskIntentFlag(arg, previous)) return true;
  if (previous === "--task") return true;
  return ["--json", "--no-validate", "--preview", "--apply", "--yes", "--task"].includes(arg);
}

function readBuildOption(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function printPreview(buildPreview: Awaited<ReturnType<typeof previewGeneratedFiles>>): void {
  console.log("Build preview");
  console.log(buildPreview.summary);
  for (const file of buildPreview.files) {
    const sign = file.operation === "create" ? "create" : file.operation === "modify" ? "modify" : "unchanged";
    console.log(`${sign} ${file.path} (+${file.addedLines} -${file.removedLines}, ${file.beforeLines} -> ${file.afterLines} lines)`);
    if (file.operation === "unchanged") {
      continue;
    }
    console.log(`--- ${file.operation === "create" ? "/dev/null" : file.path}`);
    console.log(`+++ ${file.path}`);
    for (const line of file.diff) {
      if (line.text === "..." && line.beforeLine === null && line.afterLine === null) {
        console.log(" ...");
        continue;
      }
      const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
      console.log(`${prefix}${line.text}`);
    }
    if (file.diffTruncated) {
      console.log(" ... diff truncated");
    }
  }
}
