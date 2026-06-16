import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./files.js";
import { timestampId } from "./ids.js";
import { type RuntimeProfile } from "./runtime-profile.js";
import { runValidation, type ValidationFinding, type ValidationReport } from "./validation.js";
import { workspacePaths } from "./workspace.js";
import { updateChangeRecordValidation, writeChangeRecord, writeTrackedFile, type FileChange } from "./change-records.js";

export interface RepairAction {
  type: "create-missing-script" | "create-missing-scene" | "create-missing-resource" | "apply-godot4-migration" | "record-diagnosis";
  status: "applied" | "skipped";
  finding: ValidationFinding;
  path: string | null;
  summary: string;
}

export interface RepairAttempt {
  schemaVersion: 1;
  id: string;
  sourceValidationId: string;
  status: "not-needed" | "repaired" | "skipped" | "failed" | "reverted";
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
  const errorFindings = validation.findings.filter((item) => item.severity === "error");
  const handledFindings = new Set<number>();
  const createdMissingScripts = new Set<string>();
  const createdMissingResources = new Set<string>();

  if (validation.summary.errors === 0) {
    const attempt = createAttempt(id, validation.id, "not-needed", "Validation passed; no repair needed.", startedAt, actions, null, null);
    const attemptPath = await writeAttempt(paths.repairsDir, attempt);
    return { attempt, attemptPath };
  }

  for (const [findingIndex, finding] of errorFindings.entries()) {
    const scriptPath = await missingScriptPath(projectRoot, finding);
    if (!scriptPath) {
      continue;
    }
    handledFindings.add(findingIndex);
    if (createdMissingScripts.has(scriptPath)) {
      continue;
    }
    createdMissingScripts.add(scriptPath);

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

  for (const [findingIndex, finding] of errorFindings.entries()) {
    if (handledFindings.has(findingIndex)) {
      continue;
    }
    const resPath = await missingResourcePath(projectRoot, finding);
    if (!resPath) {
      continue;
    }
    handledFindings.add(findingIndex);
    if (createdMissingResources.has(resPath)) {
      continue;
    }
    createdMissingResources.add(resPath);

    const relativePath = resPath.slice("res://".length);
    const ext = path.extname(relativePath).toLowerCase();

    let contents = "";
    let typeName = "file";
    if (ext === ".tscn" || ext === ".scn") {
      contents = placeholderScene(resPath);
      typeName = "scene";
    } else if (ext === ".tres" || ext === ".res") {
      contents = placeholderResource(resPath);
      typeName = "resource";
    } else if ([".png", ".jpg", ".jpeg", ".svg"].includes(ext)) {
      contents = placeholderSvg();
      typeName = "image";
    }

    const change = await writeTrackedFile(projectRoot, relativePath, contents);
    changes.push(change);
    actions.push({
      type: typeName === "scene" ? "create-missing-scene" : "create-missing-resource",
      status: "applied",
      finding,
      path: resPath,
      summary: `Created missing ${typeName} placeholder at ${resPath}.`,
    });
  }

  const migrationFinding = errorFindings.find((finding) => finding.file?.endsWith(".gd")) ?? errorFindings[0] ?? null;
  if (migrationFinding) {
    const migrations = await applyGodot4Migrations(projectRoot);
    for (const migration of migrations) {
      changes.push(migration.change);
      actions.push({
        type: "apply-godot4-migration",
        status: "applied",
        finding: migrationFinding,
        path: migration.change.path,
        summary: migration.summary,
      });
    }
    for (const [findingIndex, finding] of errorFindings.entries()) {
      if (migrations.some((migration) => findingMentionsPath(finding, migration.change.path)) || finding.subsystem === "script") {
        handledFindings.add(findingIndex);
      }
    }
  }

  for (const [findingIndex, finding] of errorFindings.entries()) {
    if (handledFindings.has(findingIndex)) {
      continue;
    }
    actions.push({
      type: "record-diagnosis",
      status: "skipped",
      finding,
      path: finding.file,
      summary: "No deterministic repair rule matched this finding.",
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
  return missingTextResourcePath(projectRoot, finding, [".gd"]);
}

async function missingTextResourcePath(projectRoot: string, finding: ValidationFinding, extensions: string[]): Promise<string | null> {
  const haystack = `${finding.file ?? ""}\n${finding.message}\n${finding.raw}`;
  const candidates = Array.from(haystack.matchAll(/res:\/\/[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+\b/g)).map((match) => match[0]);
  for (const candidate of candidates) {
    if (!extensions.some((extension) => candidate.endsWith(extension))) {
      continue;
    }
    const absolute = path.join(projectRoot, candidate.slice("res://".length));
    if (!(await pathExists(absolute))) {
      return candidate;
    }
  }
  return null;
}

async function missingResourcePath(projectRoot: string, finding: ValidationFinding): Promise<string | null> {
  const haystack = `${finding.file ?? ""}\n${finding.message}\n${finding.raw}`;
  const candidates = Array.from(haystack.matchAll(/res:\/\/[A-Za-z0-9_./-]+\.(tscn|scn|tres|res|png|jpg|jpeg|wav|ogg|mp3|svg|webp|gdshader|import|material|shader)\b/g)).map((match) => match[0]);
  for (const candidate of candidates) {
    const absolute = path.join(projectRoot, candidate.slice("res://".length));
    if (!(await pathExists(absolute))) {
      return candidate;
    }
  }
  return null;
}



function placeholderSvg(): string {
  return `<svg width="1" height="1" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" fill="gray"/></svg>`;
}

async function applyGodot4Migrations(projectRoot: string): Promise<Array<{ change: FileChange; summary: string }>> {
  const migrated: Array<{ change: FileChange; summary: string }> = [];
  const scripts = await collectGdScripts(projectRoot);

  for (const relativePath of scripts) {
    const absolutePath = path.join(projectRoot, relativePath);
    const before = await readFile(absolutePath, "utf8");
    const result = migrateGdscriptText(before);
    if (result.contents === before) {
      continue;
    }

    const change = await writeTrackedFile(projectRoot, relativePath, result.contents);
    migrated.push({
      change,
      summary: `Applied Godot 4 migration fixes in res://${relativePath}: ${result.descriptions.join(", ")}.`,
    });
  }

  return migrated;
}

async function collectGdScripts(projectRoot: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(relativeDir: string): Promise<void> {
    const absoluteDir = path.join(projectRoot, relativeDir);
    let entries;
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM" || code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.name === ".godot" || entry.name === ".godotcoder" || entry.name === ".godotcoder.local" || entry.name === ".git") {
        continue;
      }

      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await walk(relativePath);
      } else if (entry.name.endsWith(".gd")) {
        results.push(relativePath.split(path.sep).join("/"));
      }
    }
  }

  await walk("");
  return results.sort();
}

export function migrateGdscriptText(source: string): { contents: string; descriptions: string[] } {
  let contents = source;
  const descriptions: string[] = [];

  const replace = (pattern: RegExp, replacement: string, description: string) => {
    const next = contents.replace(pattern, replacement);
    if (next !== contents) {
      contents = next;
      descriptions.push(description);
    }
  };

  replace(/\bPoolByteArray\b/g, "PackedByteArray", "PoolByteArray -> PackedByteArray");
  replace(/\bPoolColorArray\b/g, "PackedColorArray", "PoolColorArray -> PackedColorArray");
  replace(/\bPoolIntArray\b/g, "PackedInt32Array", "PoolIntArray -> PackedInt32Array");
  replace(/\bPoolRealArray\b/g, "PackedFloat32Array", "PoolRealArray -> PackedFloat32Array");
  replace(/\bPoolStringArray\b/g, "PackedStringArray", "PoolStringArray -> PackedStringArray");
  replace(/\bPoolVector2Array\b/g, "PackedVector2Array", "PoolVector2Array -> PackedVector2Array");
  replace(/\bPoolVector3Array\b/g, "PackedVector3Array", "PoolVector3Array -> PackedVector3Array");
  replace(/\bOS\.get_ticks_msec\(\)/g, "Time.get_ticks_msec()", "OS.get_ticks_msec -> Time.get_ticks_msec");
  replace(/\bOS\.get_ticks_usec\(\)/g, "Time.get_ticks_usec()", "OS.get_ticks_usec -> Time.get_ticks_usec");
  replace(/\bdeg2rad\(/g, "deg_to_rad(", "deg2rad -> deg_to_rad");
  replace(/\brad2deg\(/g, "rad_to_deg(", "rad2deg -> rad_to_deg");
  replace(/\blinear2db\(/g, "linear_to_db(", "linear2db -> linear_to_db");
  replace(/\bdb2linear\(/g, "db_to_linear(", "db2linear -> db_to_linear");
  replace(/\.instance\(\)/g, ".instantiate()", "instance() -> instantiate()");
  replace(/(^|\n)([ \t]*)export\s+var\s+/g, "$1$2@export var ", "export var -> @export var");
  replace(/(^|\n)([ \t]*)export\(float,\s*([^)\n]+)\)\s+var\s+/g, "$1$2@export_range($3) var ", "export(float) var -> @export_range var");
  replace(/(^|\n)([ \t]*)export\(int,\s*([^)\n]+)\)\s+var\s+/g, "$1$2@export_range($3) var ", "export(int) var -> @export_range var");
  replace(/(^|\n)([ \t]*)export\(String,\s*FILE,\s*([^)\n]+)\)\s+var\s+/g, "$1$2@export_file($3) var ", "export(FILE) var -> @export_file var");
  replace(/(^|\n)([ \t]*)export\([^)\n]+\)\s+var\s+/g, "$1$2@export var ", "export(...) var -> @export var");
  replace(/(^|\n)([ \t]*)onready\s+var\s+/g, "$1$2@onready var ", "onready var -> @onready var");
  replace(/(^|\n)([ \t]*)(?<!# )tool([ \t]*(?:\n|$))/g, "$1$2@tool$3", "tool -> @tool");
  replace(/\bKinematicBody2D\b/g, "CharacterBody2D", "KinematicBody2D -> CharacterBody2D");
  replace(/\bKinematicBody3D\b/g, "CharacterBody3D", "KinematicBody3D -> CharacterBody3D");
  replace(/\bNavigation2D\b/g, "NavigationRegion2D", "Navigation2D -> NavigationRegion2D");
  replace(/\bNavigation3D\b/g, "NavigationRegion3D", "Navigation3D -> NavigationRegion3D");
  replace(/\byield\(([^,\n]+),\s*"([A-Za-z0-9_]+)"\)/g, "await $1.$2", "yield(signal_owner, signal) -> await signal_owner.signal");
  replace(/\brand_range\(/g, "randf_range(", "rand_range -> randf_range");
  contents = migrateConnectCalls(contents, descriptions);

  return {
    contents,
    descriptions: Array.from(new Set(descriptions)),
  };
}

function migrateConnectCalls(source: string, descriptions: string[]): string {
  // Explicit emitter: emitter.connect("signal", receiver, "method") -> emitter.signal.connect(receiver.method)
  let next = source.replace(
    /\b([A-Za-z_][A-Za-z0-9_.$]*)\.connect\(\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*,\s*([A-Za-z_][A-Za-z0-9_.$]*)\s*,\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*\)/g,
    (_match, emitter: string, signal: string, receiver: string, method: string) => {
      const callable = receiver === "self" ? method : `${receiver}.${method}`;
      return `${emitter}.${signal}.connect(${callable})`;
    },
  );
  // Implicit emitter: connect("signal", receiver, "method") -> signal.connect(receiver.method)
  next = next.replace(
    /(?<!\.)\bconnect\(\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*,\s*([A-Za-z_][A-Za-z0-9_.$]*)\s*,\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*\)/g,
    (_match, signal: string, receiver: string, method: string) => {
      const callable = receiver === "self" ? method : `${receiver}.${method}`;
      return `${signal}.connect(${callable})`;
    },
  );
  if (next !== source) {
    descriptions.push('connect("signal", target, "method") -> signal.connect(callable)');
  }
  return next;
}

function findingMentionsPath(finding: ValidationFinding, resourcePath: string): boolean {
  const haystack = `${finding.file ?? ""}\n${finding.message}\n${finding.raw}`;
  return haystack.includes(resourcePath);
}

function placeholderScript(_resourcePath: string): string {
  return `extends Node

# Generated by GodotCoder repair.
# This placeholder restores a missing script reference so the project can load.

func _ready() -> void:
\tpass
`;
}

function placeholderScene(resourcePath: string): string {
  const sceneName = path.basename(resourcePath, path.extname(resourcePath)).replace(/[^A-Za-z0-9_]/g, "_") || "RecoveredScene";
  return `[gd_scene format=3]

[node name="${sceneName}" type="Node2D"]
`;
}

function placeholderResource(_resourcePath: string): string {
  return `[gd_resource type="Resource" format=3]

[resource]
`;
}


