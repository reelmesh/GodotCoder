import type { RuntimeProfile } from "./runtime-profile.js";
import { runProcess } from "./process.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface ValidationFinding {
  severity: "error" | "warning" | "info";
  subsystem: "runtime" | "script" | "scene" | "resource" | "project" | "unknown";
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
  raw: string;
}

export interface ValidationReport {
  schemaVersion: 1;
  id: string;
  command: string[] | null;
  cwd: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  runtime: {
    installType: RuntimeProfile["installType"] | "unknown";
    version: string | null;
  };
  findings: ValidationFinding[];
  summary: {
    errors: number;
    warnings: number;
  };
}

export async function runValidation(projectRoot: string, runtimeProfile: RuntimeProfile | null): Promise<ValidationReport> {
  const startedAt = new Date();
  const id = `val_${timestampId(startedAt)}`;
  const workspaceRoot = path.join(projectRoot, ".godotcoder");
  const logsDir = path.join(workspaceRoot, "logs");
  const xdgDataHome = path.join(workspaceRoot, "cache", "xdg-data");
  const xdgCacheHome = path.join(workspaceRoot, "cache", "xdg-cache");
  await mkdir(logsDir, { recursive: true });
  await mkdir(xdgDataHome, { recursive: true });
  await mkdir(xdgCacheHome, { recursive: true });

  const command = runtimeProfile?.executable
    ? [
        ...runtimeProfile.executable,
        "--headless",
        "--path",
        projectRoot,
        "--log-file",
        path.join(logsDir, `${id}.log`),
        "--quit",
      ]
    : null;

  if (!command) {
    const finding: ValidationFinding = {
      severity: "error",
      subsystem: "runtime",
      file: null,
      line: null,
      column: null,
      message: "No Godot runtime is configured. Run `godotcoder runtime doctor` first.",
      raw: "",
    };
    return createReport(id, command, projectRoot, startedAt, null, runtimeProfile, [finding]);
  }

  const result = await runProcess(command, {
    cwd: projectRoot,
    timeoutMs: 15000,
    env: {
      XDG_DATA_HOME: xdgDataHome,
      XDG_CACHE_HOME: xdgCacheHome,
    },
  });
  const findings = parseGodotOutput(`${result.stdout}\n${result.stderr}`);
  if (result.exitCode !== 0 && findings.length === 0) {
    findings.push({
      severity: "error",
      subsystem: "runtime",
      file: null,
      line: null,
      column: null,
      message: "Godot validation command exited with a non-zero status.",
      raw: result.stderr || result.stdout,
    });
  }

  return createReport(id, command, projectRoot, startedAt, result.exitCode, runtimeProfile, findings);
}

function createReport(
  id: string,
  command: string[] | null,
  cwd: string,
  startedAt: Date,
  exitCode: number | null,
  runtimeProfile: RuntimeProfile | null,
  findings: ValidationFinding[],
): ValidationReport {
  return {
    schemaVersion: 1,
    id,
    command,
    cwd,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    exitCode,
    runtime: {
      installType: runtimeProfile?.installType ?? "unknown",
      version: runtimeProfile?.detectedGodotVersion ?? null,
    },
    findings,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
    },
  };
}

function parseGodotOutput(output: string): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const severity = line.includes("ERROR") || line.includes("SCRIPT ERROR") ? "error" : line.includes("WARNING") ? "warning" : null;
    if (!severity) continue;

    const fileMatch = line.match(/(res:\/\/[^\s:'".]+(?:\.[A-Za-z0-9_]+)?)(?::(\d+))?/);
    findings.push({
      severity,
      subsystem: line.includes("SCRIPT") ? "script" : "unknown",
      file: fileMatch?.[1] ?? null,
      line: fileMatch?.[2] ? Number(fileMatch[2]) : null,
      column: null,
      message: line,
      raw,
    });
  }

  return findings;
}

function timestampId(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
}
