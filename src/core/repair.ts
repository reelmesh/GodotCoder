import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./files.js";
import { type RuntimeProfile } from "./runtime-profile.js";
import { runValidation, type ValidationFinding, type ValidationReport } from "./validation.js";
import { workspacePaths } from "./workspace.js";
import { updateChangeRecordValidation, writeChangeRecord, writeTrackedFile, type FileChange } from "./change-records.js";

export interface RepairAction {
  type: "create-missing-script" | "record-diagnosis";
  status: "applied" | "skipped";
  finding: ValidationFinding;
  path: string | null;
  summary: string;
}

export interface RepairAttempt {
  schemaVersion: 1;
  id: string;
  sourceValidationId: string;
  status: "not-needed" | "repaired" | "skipped" | "failed";
  summary: string;
  startedAt: string;
  finishedAt: string;
  actions: RepairAction[];
  changeRecordId: string | null;
  validationAfter: ValidationReport | null;
}

export async function attemptRepair(projectRoot: string, validation: ValidationReport, runtimeProfile: RuntimeProfile | null): Promise<{ attempt: RepairAttempt; attemptPath: string }> {
  const startedAt = new Date();
  const id = `repair_${timestampId(startedAt)}`;
  const paths = workspacePaths(projectRoot);
  await mkdir(paths.repairsDir, { recursive: true });
  await mkdir(paths.validationsDir, { recursive: true });

  const actions: RepairAction[] = [];
  const changes: FileChange[] = [];

  if (validation.summary.errors === 0) {
    const attempt = createAttempt(id, validation.id, "not-needed", "Validation passed; no repair needed.", startedAt, actions, null, null);
    const attemptPath = await writeAttempt(paths.repairsDir, attempt);
    return { attempt, attemptPath };
  }

  for (const finding of validation.findings.filter((item) => item.severity === "error")) {
    const scriptPath = await missingScriptPath(projectRoot, finding);
    if (!scriptPath) {
      actions.push({
        type: "record-diagnosis",
        status: "skipped",
        finding,
        path: finding.file,
        summary: "No deterministic repair rule matched this finding.",
      });
      continue;
    }

    const relativePath = scriptPath.slice("res://".length);
    const change = await writeTrackedFile(projectRoot, relativePath, placeholderScript(scriptPath));
    changes.push(change);
    actions.push({
      type: "create-missing-script",
      status: "applied",
      finding,
      path: scriptPath,
      summary: `Created missing GDScript placeholder at ${scriptPath}.`,
    });
  }

  if (changes.length === 0) {
    const attempt = createAttempt(id, validation.id, "skipped", "No deterministic repair was available.", startedAt, actions, null, null);
    const attemptPath = await writeAttempt(paths.repairsDir, attempt);
    return { attempt, attemptPath };
  }

  let record = await writeChangeRecord(projectRoot, {
    kind: "repair",
    status: "applied",
    prompt: `repair validation ${validation.id}`,
    summary: `Applied ${changes.length} deterministic repair action${changes.length === 1 ? "" : "s"}.`,
    files: changes,
    validationIds: [validation.id],
  });

  const validationAfter = await runValidation(projectRoot, runtimeProfile);
  const reportPath = path.join(paths.validationsDir, `${validationAfter.id}.json`);
  await writeFile(reportPath, JSON.stringify(validationAfter, null, 2) + "\n");
  record = await updateChangeRecordValidation(projectRoot, record, validationAfter.id);

  const status = validationAfter.summary.errors === 0 ? "repaired" : "failed";
  const summary =
    status === "repaired"
      ? `Repair succeeded after ${changes.length} deterministic action${changes.length === 1 ? "" : "s"}.`
      : `Repair applied ${changes.length} action${changes.length === 1 ? "" : "s"}, but validation still reports ${validationAfter.summary.errors} errors.`;

  const attempt = createAttempt(id, validation.id, status, summary, startedAt, actions, record.id, validationAfter);
  const attemptPath = await writeAttempt(paths.repairsDir, attempt);
  return { attempt, attemptPath };
}

function createAttempt(
  id: string,
  sourceValidationId: string,
  status: RepairAttempt["status"],
  summary: string,
  startedAt: Date,
  actions: RepairAction[],
  changeRecordId: string | null,
  validationAfter: ValidationReport | null,
): RepairAttempt {
  return {
    schemaVersion: 1,
    id,
    sourceValidationId,
    status,
    summary,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    actions,
    changeRecordId,
    validationAfter,
  };
}

async function writeAttempt(repairsDir: string, attempt: RepairAttempt): Promise<string> {
  const attemptPath = path.join(repairsDir, `${attempt.id}.json`);
  await writeFile(attemptPath, JSON.stringify(attempt, null, 2) + "\n");
  return attemptPath;
}

async function missingScriptPath(projectRoot: string, finding: ValidationFinding): Promise<string | null> {
  const haystack = `${finding.file ?? ""}\n${finding.message}\n${finding.raw}`;
  const candidates = Array.from(haystack.matchAll(/res:\/\/[A-Za-z0-9_./-]+\.gd\b/g)).map((match) => match[0]);
  for (const candidate of candidates) {
    const absolute = path.join(projectRoot, candidate.slice("res://".length));
    if (!(await pathExists(absolute))) {
      return candidate;
    }
  }
  return null;
}

function placeholderScript(_resourcePath: string): string {
  return `extends Node

# Generated by GodotCoder repair.
# This placeholder restores a missing script reference so the project can load.

func _ready() -> void:
\tpass
`;
}

function timestampId(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "_").replace(/\.(\d+)Z$/, "_$1");
}
