import { timestampId } from "./ids.js";
import type { RuntimeProfile } from "./runtime-profile.js";
import { runProcess } from "./process.js";
import { godotVersionPolicyText, isGodotVersionSupported } from "./godot-version.js";
import { mkdir, readFile, unlink, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseGodotConfig } from "./godot-project.js";
import { inflateSync } from "node:zlib";
import { inspectExportReadiness, type ExportDoctorReport } from "./export.js";

export interface ValidationFinding {
  severity: "error" | "warning" | "info";
  subsystem: "runtime" | "script" | "scene" | "resource" | "project" | "visual" | "unknown";
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
  raw: string;
}

export interface VisualValidationResult {
  artifactPath: string;
  width: number | null;
  height: number | null;
  blank: boolean | null;
  nearBlank: boolean | null;
  findings: ValidationFinding[];
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
  visual: VisualValidationResult | null;
  exportReadiness: ExportDoctorReport | null;
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

export async function runVisualValidation(
  projectRoot: string,
  runtimeProfile: RuntimeProfile | null,
  timeoutMs: number = 8000,
): Promise<ValidationReport> {
  const startedAt = new Date();
  const id = `val_visual_${timestampId(startedAt)}`;
  const workspaceRoot = path.join(projectRoot, ".godotcoder");
  const logsDir = path.join(workspaceRoot, "logs");
  const artifactDir = path.join(workspaceRoot, "validations", id);
  const artifactPath = path.join(artifactDir, "frame.png");
  const captureScriptPath = path.join(artifactDir, "visual_capture.gd");
  const xdgDataHome = path.join(workspaceRoot, "cache", "xdg-data");
  const xdgCacheHome = path.join(workspaceRoot, "cache", "xdg-cache");
  await mkdir(logsDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await mkdir(xdgDataHome, { recursive: true });
  await mkdir(xdgCacheHome, { recursive: true });

  const command = runtimeProfile?.executable
    ? [
        ...runtimeProfile.executable,
        "--path",
        projectRoot,
        "--log-file",
        path.join(logsDir, `${id}.log`),
        "--script",
        captureScriptPath,
      ]
    : null;

  const visual: VisualValidationResult = {
    artifactPath,
    width: null,
    height: null,
    blank: null,
    nearBlank: null,
    findings: [],
  };

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
    visual.findings.push(finding);
    return createReport(id, command, projectRoot, startedAt, null, runtimeProfile, [finding], visual);
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
    visual.findings.push(finding);
    return createReport(id, command, projectRoot, startedAt, null, runtimeProfile, [finding], visual);
  }

  await writeFile(captureScriptPath, visualCaptureScript(artifactPath));
  const result = await runProcess(command, {
    cwd: projectRoot,
    timeoutMs,
    env: {
      XDG_DATA_HOME: xdgDataHome,
      XDG_CACHE_HOME: xdgCacheHome,
    },
  });

  const findings = parseGodotOutput(`${result.stdout}\n${result.stderr}`);
  if (!result.timedOut && result.exitCode !== 0 && result.exitCode !== null && findings.length === 0) {
    findings.push({
      severity: "error",
      subsystem: "runtime",
      file: null,
      line: null,
      column: null,
      message: `Godot visual run exited with code ${result.exitCode}.`,
      raw: result.stderr || result.stdout,
    });
  }

  try {
    const analysis = await analyzePngFrame(artifactPath);
    visual.width = analysis.width;
    visual.height = analysis.height;
    visual.blank = analysis.blank;
    visual.nearBlank = analysis.nearBlank;
    if (analysis.blank || analysis.nearBlank) {
      visual.findings.push({
        severity: findings.some((finding) => finding.severity === "error") ? "error" : "warning",
        subsystem: "visual",
        file: path.relative(projectRoot, artifactPath),
        line: null,
        column: null,
        message: analysis.blank
          ? "Captured visual frame appears blank."
          : "Captured visual frame appears near-blank.",
        raw: "",
      });
    }
  } catch (error) {
    visual.findings.push({
      severity: findings.some((finding) => finding.severity === "error") ? "error" : "warning",
      subsystem: "visual",
      file: path.relative(projectRoot, artifactPath),
      line: null,
      column: null,
      message: `Visual frame artifact could not be analyzed: ${error instanceof Error ? error.message : String(error)}`,
      raw: "",
    });
  }

  findings.push(...visual.findings);
  return createReport(id, command, projectRoot, startedAt, result.exitCode, runtimeProfile, findings, visual);
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
  visual: VisualValidationResult | null = null,
  exportReadiness: ExportDoctorReport | null = null,
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
    visual,
    exportReadiness,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
    },
  };
}

function visualCaptureScript(artifactPath: string): string {
  return `extends SceneTree

func _initialize() -> void:
\tcall_deferred("_capture")

func _capture() -> void:
\tvar scene_path := str(ProjectSettings.get_setting("application/run/main_scene", ""))
\tif scene_path.is_empty():
\t\tpush_error("VISUAL_CAPTURE_ERROR: application/run/main_scene is not set")
\t\tquit(2)
\t\treturn
\tvar packed := load(scene_path)
\tif packed == null or not packed is PackedScene:
\t\tpush_error("VISUAL_CAPTURE_ERROR: could not load main scene " + scene_path)
\t\tquit(2)
\t\treturn
\tvar node := packed.instantiate()
\troot.add_child(node)
\tfor i in range(8):
\t\tawait process_frame
\tawait RenderingServer.frame_post_draw
\tvar image := root.get_texture().get_image()
\tif image == null or image.is_empty():
\t\tpush_error("VISUAL_CAPTURE_ERROR: viewport image was empty")
\t\tquit(2)
\t\treturn
\tvar err := image.save_png(${JSON.stringify(artifactPath)})
\tif err != OK:
\t\tpush_error("VISUAL_CAPTURE_ERROR: could not save PNG, error " + str(err))
\t\tquit(2)
\t\treturn
\tquit(0)
`;
}

export interface FrameAnalysis {
  width: number;
  height: number;
  blank: boolean;
  nearBlank: boolean;
}

export async function analyzePngFrame(filePath: string): Promise<FrameAnalysis> {
  const bytes = await readFile(filePath);
  return analyzePngBytes(bytes);
}

export function analyzePngBytes(bytes: Buffer): FrameAnalysis {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error("artifact is not a PNG image");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error("PNG chunk is truncated");
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height) {
    throw new Error("PNG image is missing dimensions");
  }
  if (bitDepth !== 8) {
    throw new Error(`PNG bit depth ${bitDepth} is not supported`);
  }

  const channels = pngChannels(colorType);
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows: Buffer[] = [];
  let readOffset = 0;
  let previous: Buffer = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    if (readOffset + 1 + stride > inflated.length) {
      throw new Error("PNG image data is truncated");
    }
    const filter = inflated[readOffset]!;
    const source = inflated.subarray(readOffset + 1, readOffset + 1 + stride);
    const row = unfilterPngRow(filter, source, previous, channels);
    rows.push(row);
    previous = row;
    readOffset += 1 + stride;
  }

  let minRgb = Number.POSITIVE_INFINITY;
  let maxRgb = Number.NEGATIVE_INFINITY;
  let minAlpha = Number.POSITIVE_INFINITY;
  let maxAlpha = Number.NEGATIVE_INFINITY;
  let visiblePixels = 0;
  for (const row of rows) {
    for (let x = 0; x < width; x++) {
      const i = x * channels;
      const pixel = readPngPixel(row, i, colorType);
      if (pixel.a <= 2) {
        continue;
      }
      visiblePixels++;
      minRgb = Math.min(minRgb, pixel.r, pixel.g, pixel.b);
      maxRgb = Math.max(maxRgb, pixel.r, pixel.g, pixel.b);
      minAlpha = Math.min(minAlpha, pixel.a);
      maxAlpha = Math.max(maxAlpha, pixel.a);
    }
  }

  const rgbRange = visiblePixels === 0 ? 0 : maxRgb - minRgb;
  const alphaRange = visiblePixels === 0 ? 0 : maxAlpha - minAlpha;
  return {
    width,
    height,
    blank: visiblePixels === 0 || (rgbRange <= 2 && alphaRange <= 2),
    nearBlank: visiblePixels === 0 || (rgbRange <= 10 && alphaRange <= 10),
  };
}

function pngChannels(colorType: number): number {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`PNG color type ${colorType} is not supported`);
}

function unfilterPngRow(filter: number, source: Buffer, previous: Buffer, bytesPerPixel: number): Buffer {
  const row = Buffer.alloc(source.length);
  for (let i = 0; i < source.length; i++) {
    const left = i >= bytesPerPixel ? row[i - bytesPerPixel]! : 0;
    const up = previous[i] ?? 0;
    const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel]! : 0;
    const value = source[i]!;
    if (filter === 0) row[i] = value;
    else if (filter === 1) row[i] = (value + left) & 0xff;
    else if (filter === 2) row[i] = (value + up) & 0xff;
    else if (filter === 3) row[i] = (value + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) row[i] = (value + paethPredictor(left, up, upLeft)) & 0xff;
    else throw new Error(`PNG filter ${filter} is not supported`);
  }
  return row;
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function readPngPixel(row: Buffer, offset: number, colorType: number): { r: number; g: number; b: number; a: number } {
  if (colorType === 0) {
    const gray = row[offset]!;
    return { r: gray, g: gray, b: gray, a: 255 };
  }
  if (colorType === 2) {
    return { r: row[offset]!, g: row[offset + 1]!, b: row[offset + 2]!, a: 255 };
  }
  if (colorType === 4) {
    const gray = row[offset]!;
    return { r: gray, g: gray, b: gray, a: row[offset + 1]! };
  }
  return { r: row[offset]!, g: row[offset + 1]!, b: row[offset + 2]!, a: row[offset + 3]! };
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
  const exportReadiness = await inspectExportReadiness(projectRoot, runtimeProfile);

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
    return createReport(id, null, projectRoot, startedAt, null, runtimeProfile, [finding], null, exportReadiness);
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
    return createReport(id, commandBase, projectRoot, startedAt, null, runtimeProfile, [finding], null, exportReadiness);
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
      return createReport(id, commandBase, projectRoot, startedAt, 1, runtimeProfile, [finding], null, exportReadiness);
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
    return createReport(id, commandBase, projectRoot, startedAt, 0, runtimeProfile, [finding], null, exportReadiness);
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
    return createReport(id, commandBase, projectRoot, startedAt, 0, runtimeProfile, [finding], null, exportReadiness);
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

  return createReport(id, commandBase, projectRoot, startedAt, finalExitCode, runtimeProfile, findings, null, exportReadiness);
}
