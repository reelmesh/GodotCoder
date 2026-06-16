import { ensureGreenfieldGodotProject } from "../core/greenfield.js";
import { tryFindGodotProjectRoot } from "../core/godot-project.js";
import { applyLlmBuild, generateLlmBuild } from "../core/llm-build.js";
import { CliError } from "../core/errors.js";
import { loadModelConfig } from "../core/providers.js";
import { validateProjectRoot } from "./validate.js";
import { updateChangeRecordValidation, writeChangeRecord } from "../core/change-records.js";
import { previewGeneratedFiles } from "../core/preview.js";

export async function buildProject(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const preview = args.includes("--preview");
  const apply = args.includes("--apply") || args.includes("--yes");
  const shouldValidate = !args.includes("--no-validate");
  const prompt = args.filter((arg) => !["--json", "--no-validate", "--preview", "--apply", "--yes"].includes(arg)).join(" ").trim();

  if (!prompt) {
    console.log("Usage: godotcoder build <task> [--preview] [--apply] [--no-validate] [--json]");
    return;
  }

  const existingRoot = await tryFindGodotProjectRoot(process.cwd());
  const projectRoot = existingRoot ?? process.cwd();
  const scaffold = await ensureGreenfieldGodotProject(projectRoot, prompt || "GodotCoder Game");

  const modelConfig = await loadModelConfig(projectRoot);
  if (!modelConfig) {
    throw new CliError("MODEL_CONFIG_MISSING", "No model provider configured. GodotCoder is LLM-driven — configure a provider first:\n  godotcoder models use --provider ollama --model llama3.1");
  }

  const plan = await generateLlmBuild(projectRoot, prompt || "build requested game feature");

  if (preview || !apply) {
    const buildPreview = await previewGeneratedFiles(projectRoot, plan.summary, plan.files);
    if (json) {
      console.log(JSON.stringify({ ok: true, mode: "preview", source: "llm", scaffold, preview: buildPreview, model: { provider: plan.reply.provider, model: plan.reply.model } }, null, 2));
      return;
    }

    if (scaffold.createdProjectFile) {
      console.log("No project.godot found. Created a minimal greenfield Godot project.");
    }
    printPreview(buildPreview);
    console.log("Apply with: godotcoder build <task> --apply, or /apply in the interactive shell.");
    return;
  }

  const result = await applyLlmBuild(projectRoot, plan);
  let changeRecord = await writeChangeRecord(projectRoot, {
    kind: "build",
    status: "applied",
    prompt: prompt || "build first playable",
    summary: result.summary,
    files: result.changes,
    validationIds: [],
  });

  let validationReport = null;
  let validationReportPath = null;
  if (shouldValidate) {
    const validation = await validateProjectRoot(projectRoot);
    validationReport = validation.report;
    validationReportPath = validation.reportPath;
    changeRecord = await updateChangeRecordValidation(projectRoot, changeRecord, validationReport.id);
  }

  if (json) {
    console.log(JSON.stringify({ ok: validationReport ? validationReport.summary.errors === 0 : true, source: "llm", scaffold, result, changeRecord, validationReport, validationReportPath }, null, 2));
  } else {
    if (scaffold.createdProjectFile) {
      console.log("No project.godot found. Created a minimal greenfield Godot project.");
    }
    console.log(result.summary);
    for (const file of result.filesWritten) {
      console.log(`Wrote ${file}`);
    }
    console.log(`Recorded change: .godotcoder/patches/${changeRecord.id}/record.json`);
    if (validationReport) {
      console.log("Godot validation");
      console.log(`Report: ${validationReportPath}`);
      console.log(`Exit code: ${validationReport.exitCode ?? "not run"}`);
      console.log(`Errors: ${validationReport.summary.errors}`);
      console.log(`Warnings: ${validationReport.summary.warnings}`);
      for (const finding of validationReport.findings) {
        console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
      }
    }
  }
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
