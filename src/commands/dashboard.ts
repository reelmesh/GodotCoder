import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../core/files.js";
import { findGodotProjectRoot } from "../core/godot-project-indexer.js";
import { modelQualitySummary } from "../core/model-runs.js";
import { loadTaskBoard } from "../core/tasks.js";
import { workspacePaths } from "../core/workspace.js";

export interface SessionDashboard {
  projectRoot: string;
  latestValidation: ValidationSummary | null;
  latestPlaytest: PlaytestSummary | null;
  taskCounts: { planned: number; active: number; blocked: number; done: number } | null;
  modelQuality: Awaited<ReturnType<typeof modelQualitySummary>>;
}

interface ValidationSummary {
  id: string | null;
  errors: number | null;
  warnings: number | null;
  path: string;
}

interface PlaytestSummary {
  id: string | null;
  status: string | null;
  path: string;
}

export async function dashboardCommand(args: string[] = []): Promise<void> {
  const json = args.includes("--json");
  const dashboard = await loadSessionDashboard(await findGodotProjectRoot(process.cwd()));

  if (json) {
    console.log(JSON.stringify({ ok: true, dashboard }, null, 2));
    return;
  }

  printSessionDashboard(dashboard);
}

export async function loadSessionDashboard(projectRoot: string): Promise<SessionDashboard> {
  const paths = workspacePaths(projectRoot);
  const board = (await pathExists(paths.workspaceRoot)) ? await loadTaskBoard(projectRoot) : null;
  return {
    projectRoot,
    latestValidation: await latestValidation(paths.validationsDir),
    latestPlaytest: await latestPlaytest(paths.playtestsDir),
    taskCounts: board
      ? {
          planned: board.tasks.filter((task) => task.state === "planned").length,
          active: board.tasks.filter((task) => task.state === "active").length,
          blocked: board.tasks.filter((task) => task.state === "blocked").length,
          done: board.tasks.filter((task) => task.state === "done").length,
        }
      : null,
    modelQuality: await modelQualitySummary(projectRoot),
  };
}

export function printSessionDashboard(dashboard: SessionDashboard): void {
  console.log("Session dashboard");
  console.log(`Project: ${dashboard.projectRoot}`);
  console.log(`Validation: ${formatValidation(dashboard.latestValidation)}`);
  console.log(`Playtest: ${formatPlaytest(dashboard.latestPlaytest)}`);
  console.log(`Tasks: ${dashboard.taskCounts ? `${dashboard.taskCounts.planned} planned, ${dashboard.taskCounts.active} active, ${dashboard.taskCounts.blocked} blocked, ${dashboard.taskCounts.done} done` : "none"}`);
  console.log(`Model quality: ${formatModelQuality(dashboard.modelQuality)}`);
}

async function latestValidation(validationsDir: string): Promise<ValidationSummary | null> {
  const file = (await latestJsonFiles(validationsDir))[0];
  if (!file) return null;
  const report = asRecord(await readJsonFile(file.path));
  const summary = asRecord(report.summary);
  return {
    id: stringValue(report.id),
    errors: numberValue(summary.errors),
    warnings: numberValue(summary.warnings),
    path: file.path,
  };
}

async function latestPlaytest(playtestsDir: string): Promise<PlaytestSummary | null> {
  const latestPath = path.join(playtestsDir, "latest.json");
  const filePath = (await pathExists(latestPath)) ? latestPath : (await latestJsonFiles(playtestsDir))[0]?.path;
  if (!filePath) return null;
  const report = asRecord(await readJsonFile(filePath));
  return {
    id: stringValue(report.id),
    status: stringValue(report.status) ?? stringValue(report.outcome),
    path: filePath,
  };
}

async function latestJsonFiles(dir: string): Promise<Array<{ path: string; mtimeMs: number }>> {
  if (!(await pathExists(dir))) return [];
  const files: Array<{ path: string; mtimeMs: number }> = [];
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dir, name);
    const stats = await stat(filePath);
    if (stats.isFile()) files.push({ path: filePath, mtimeMs: stats.mtimeMs });
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function formatValidation(summary: ValidationSummary | null): string {
  return summary ? `${summary.errors ?? "?"} errors, ${summary.warnings ?? "?"} warnings` : "none";
}

function formatPlaytest(summary: PlaytestSummary | null): string {
  return summary ? (summary.status ?? summary.id ?? "recorded") : "none";
}

function formatModelQuality(summary: SessionDashboard["modelQuality"]): string {
  return summary.total === 0 ? "no runs" : `${Math.round(summary.successRate * 100)}% success (${summary.successes}/${summary.total})`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
