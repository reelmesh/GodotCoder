import { timestampId } from "./ids.js";
import type { RuntimeProfile } from "./runtime-profile.js";
import { runProcess } from "./process.js";
import { godotVersionPolicyText, isGodotVersionSupported } from "./godot-version.js";
import { mkdir, readFile, unlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseGodotConfig } from "./godot-project.js";

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

  if (!isGodotVersionSupported(runtimeProfile?.detectedGodotVersion)) {
    const finding: ValidationFinding = {
      severity: "error",
      subsystem: "runtime",
      file: null,
      line: null,
      column: null,
      message: `Unsupported Godot runtime version ${runtimeProfile?.detectedGodotVersion ?? "unknown"}. ${godotVersionPolicyText()}`,
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

export async function runSmokeValidation(
  projectRoot: string,
  runtimeProfile: RuntimeProfile | null,
  timeoutMs: number = 3000,
): Promise<ValidationReport> {
  const startedAt = new Date();
  const id = `val_smoke_${timestampId(startedAt)}`;
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
        "--quit-after",
        String(Math.ceil(timeoutMs / 1000)),
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

  if (!isGodotVersionSupported(runtimeProfile?.detectedGodotVersion)) {
    const finding: ValidationFinding = {
      severity: "error",
      subsystem: "runtime",
      file: null,
      line: null,
      column: null,
      message: `Unsupported Godot runtime version ${runtimeProfile?.detectedGodotVersion ?? "unknown"}. ${godotVersionPolicyText()}`,
      raw: "",
    };
    return createReport(id, command, projectRoot, startedAt, null, runtimeProfile, [finding]);
  }

  const result = await runProcess(command, {
    cwd: projectRoot,
    timeoutMs,
    env: {
      XDG_DATA_HOME: xdgDataHome,
      XDG_CACHE_HOME: xdgCacheHome,
    },
  });

  const findings = parseGodotOutput(`${result.stdout}\n${result.stderr}`);

  if (!result.timedOut && result.exitCode !== 0 && result.exitCode !== null) {
    if (findings.length === 0) {
      findings.push({
        severity: "error",
        subsystem: "runtime",
        file: null,
        line: null,
        column: null,
        message: `Godot smoke run crashed or exited prematurely with code ${result.exitCode}.`,
        raw: result.stderr || result.stdout,
      });
    }
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
  let lastFinding: ValidationFinding | null = null;

  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const severity = line.includes("ERROR") || line.includes("SCRIPT ERROR") ? "error" : line.includes("WARNING") ? "warning" : null;
    if (severity) {
      const fileMatch = line.match(/(res:\/\/[^\s:'".]+(?:\.[A-Za-z0-9_]+)?)(?::(\d+))?/);
      lastFinding = {
        severity,
        subsystem: line.includes("SCRIPT") ? "script" : "unknown",
        file: fileMatch?.[1] ?? null,
        line: fileMatch?.[2] ? Number(fileMatch[2]) : null,
        column: null,
        message: line,
        raw,
      };
      findings.push(lastFinding);
    } else if (lastFinding) {
      const fileMatch = line.match(/(res:\/\/[^\s:'".]+(?:\.[A-Za-z0-9_]+)?)(?::(\d+))?/);
      lastFinding.message += `\n  ${line}`;
      lastFinding.raw += `\n${raw}`;
      if (fileMatch && !lastFinding.file) {
        lastFinding.file = fileMatch[1] ?? null;
        lastFinding.line = fileMatch[2] ? Number(fileMatch[2]) : null;
      }
    }
  }

  return findings;
}

export async function runExportValidation(
  projectRoot: string,
  runtimeProfile: RuntimeProfile | null,
): Promise<ValidationReport> {
  const startedAt = new Date();
  const id = `val_export_${timestampId(startedAt)}`;
  const workspaceRoot = path.join(projectRoot, ".godotcoder");
  const logsDir = path.join(workspaceRoot, "logs");
  const xdgDataHome = path.join(workspaceRoot, "cache", "xdg-data");
  const xdgCacheHome = path.join(workspaceRoot, "cache", "xdg-cache");
  await mkdir(logsDir, { recursive: true });
  await mkdir(xdgDataHome, { recursive: true });
  await mkdir(xdgCacheHome, { recursive: true });

  const commandBase = runtimeProfile?.executable
    ? [
        ...runtimeProfile.executable,
        "--headless",
        "--path",
        projectRoot,
      ]
    : null;

  if (!commandBase) {
    const finding: ValidationFinding = {
      severity: "error",
      subsystem: "runtime",
      file: null,
      line: null,
      column: null,
      message: "No Godot runtime is configured. Run `godotcoder runtime doctor` first.",
      raw: "",
    };
    return createReport(id, null, projectRoot, startedAt, null, runtimeProfile, [finding]);
  }

  if (!isGodotVersionSupported(runtimeProfile?.detectedGodotVersion)) {
    const finding: ValidationFinding = {
      severity: "error",
      subsystem: "runtime",
      file: null,
      line: null,
      column: null,
      message: `Unsupported Godot runtime version ${runtimeProfile?.detectedGodotVersion ?? "unknown"}. ${godotVersionPolicyText()}`,
      raw: "",
    };
    return createReport(id, commandBase, projectRoot, startedAt, null, runtimeProfile, [finding]);
  }

  const presetPath = path.join(projectRoot, "export_presets.cfg");
  let presetsText = "";
  try {
    presetsText = await readFile(presetPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      const finding: ValidationFinding = {
        severity: "error",
        subsystem: "project",
        file: "export_presets.cfg",
        line: null,
        column: null,
        message: `Cannot read export_presets.cfg: ${error instanceof Error ? error.message : String(error)}`,
        raw: "",
      };
      return createReport(id, commandBase, projectRoot, startedAt, 1, runtimeProfile, [finding]);
    }
    const finding: ValidationFinding = {
      severity: "warning",
      subsystem: "project",
      file: "export_presets.cfg",
      line: null,
      column: null,
      message: "No export_presets.cfg found. Define at least one export preset in the Godot Editor first.",
      raw: "",
    };
    return createReport(id, commandBase, projectRoot, startedAt, 0, runtimeProfile, [finding]);
  }

  const config = parseGodotConfig(presetsText);
  const presetNames: string[] = [];
  for (const [section, values] of Object.entries(config)) {
    if (!section.match(/^preset_\d+$/)) {
      continue;
    }
    const name = values["name"];
    if (typeof name === "string") {
      presetNames.push(name);
    }
  }

  if (presetNames.length === 0) {
    const finding: ValidationFinding = {
      severity: "warning",
      subsystem: "project",
      file: "export_presets.cfg",
      line: null,
      column: null,
      message: "No presets defined in export_presets.cfg. Create at least one preset to validate exports.",
      raw: "",
    };
    return createReport(id, commandBase, projectRoot, startedAt, 0, runtimeProfile, [finding]);
  }

  const findings: ValidationFinding[] = [];
  let finalExitCode = 0;
  const tempDir = path.join(os.tmpdir(), "godotcoder-export-val");
  await mkdir(tempDir, { recursive: true });

  for (const [i, presetName] of presetNames.entries()) {
    const tempPckPath = path.join(tempDir, `export_${i}_${timestampId(new Date())}.pck`);
    const command = [
      ...commandBase,
      "--export-pack",
      presetName,
      tempPckPath,
    ];

    const result = await runProcess(command, {
      cwd: projectRoot,
      timeoutMs: 30000,
      env: {
        XDG_DATA_HOME: xdgDataHome,
        XDG_CACHE_HOME: xdgCacheHome,
      },
    });

    const parsed = parseGodotOutput(`${result.stdout}\n${result.stderr}`);
    findings.push(...parsed.map(finding => ({
      ...finding,
      message: `[Preset: ${presetName}] ${finding.message}`
    })));

    if (result.exitCode !== 0 && result.exitCode !== null) {
      finalExitCode = result.exitCode;
      if (parsed.length === 0) {
        findings.push({
          severity: "error",
          subsystem: "runtime",
          file: "export_presets.cfg",
          line: null,
          column: null,
          message: `Godot export failed for preset "${presetName}" with exit code ${result.exitCode}.`,
          raw: result.stderr || result.stdout,
        });
      }
    }

    try {
      await unlink(tempPckPath);
    } catch {
      // Ignore
    }
  }

  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore
  }

  return createReport(id, commandBase, projectRoot, startedAt, finalExitCode, runtimeProfile, findings);
}
