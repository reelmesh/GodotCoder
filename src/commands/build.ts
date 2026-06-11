import { ensureGreenfieldGodotProject } from "../core/greenfield.js";
import { tryFindGodotProjectRoot } from "../core/godot-project.js";
import { buildAsteroidShooter } from "../core/builders/asteroid-shooter.js";
import { validateProjectRoot } from "./validate.js";
import { updateChangeRecordValidation, writeChangeRecord } from "../core/change-records.js";

export async function buildProject(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const shouldValidate = !args.includes("--no-validate");
  const prompt = args.filter((arg) => arg !== "--json" && arg !== "--no-validate").join(" ").trim();
  const existingRoot = await tryFindGodotProjectRoot(process.cwd());
  const projectRoot = existingRoot ?? process.cwd();
  const scaffold = await ensureGreenfieldGodotProject(projectRoot, prompt || "GodotCoder Game");
  const result = await buildAsteroidShooter(projectRoot);
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
    console.log(JSON.stringify({ ok: validationReport ? validationReport.summary.errors === 0 : true, scaffold, result, changeRecord, validationReport, validationReportPath }, null, 2));
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
