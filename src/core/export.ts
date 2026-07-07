import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import { parseGodotConfig, stringValue } from "./godot-config-parser.js";
import type { RuntimeProfile } from "./runtime-profile.js";

export interface ExportPresetSummary {
  index: number;
  name: string | null;
  platform: string | null;
  exportPath: string | null;
  runnable: boolean | null;
}

export interface ExportDoctorFinding {
  severity: "error" | "warning" | "info";
  message: string;
  file: string | null;
}

export interface ExportDoctorReport {
  schemaVersion: 1;
  projectRoot: string;
  presetFile: string;
  presetFileExists: boolean;
  presets: ExportPresetSummary[];
  templates: {
    checked: boolean;
    version: string | null;
    searchPaths: string[];
    found: boolean | null;
  };
  ready: boolean;
  findings: ExportDoctorFinding[];
}

export interface ExportPresetPreview {
  schemaVersion: 1;
  path: string;
  mode: "create" | "append" | "already-exists";
  presetName: string;
  platform: string;
  contents: string;
}

export async function inspectExportReadiness(projectRoot: string, runtimeProfile: RuntimeProfile | null = null): Promise<ExportDoctorReport> {
  const presetFile = path.join(projectRoot, "export_presets.cfg");
  const findings: ExportDoctorFinding[] = [];
  let presetText = "";
  const presetFileExists = await pathExists(presetFile);

  if (!presetFileExists) {
    findings.push({
      severity: "warning",
      message: "No export_presets.cfg found. Create an export preset before release builds.",
      file: "export_presets.cfg",
    });
  } else {
    try {
      presetText = await readFile(presetFile, "utf8");
    } catch (error) {
      findings.push({
        severity: "error",
        message: `Cannot read export_presets.cfg: ${error instanceof Error ? error.message : String(error)}`,
        file: "export_presets.cfg",
      });
    }
  }

  const presets = presetText ? parseExportPresets(presetText) : [];
  if (presetFileExists && presets.length === 0) {
    findings.push({
      severity: "warning",
      message: "export_presets.cfg exists but does not define any presets.",
      file: "export_presets.cfg",
    });
  }

  for (const preset of presets) {
    if (!preset.name) {
      findings.push({ severity: "warning", message: `Preset ${preset.index} has no name.`, file: "export_presets.cfg" });
    }
    if (!preset.platform) {
      findings.push({ severity: "warning", message: `Preset ${preset.index} has no platform.`, file: "export_presets.cfg" });
    }
    if (!preset.exportPath) {
      findings.push({
        severity: "info",
        message: `Preset ${preset.name ?? preset.index} has no export_path configured yet.`,
        file: "export_presets.cfg",
      });
    }
  }

  const templates = await inspectExportTemplates(projectRoot, runtimeProfile);
  if (templates.checked && templates.found === false) {
    findings.push({
      severity: "warning",
      message: `Export templates were not found for Godot ${templates.version}. Install templates in Godot before exporting.`,
      file: null,
    });
  }
  if (!templates.checked) {
    findings.push({
      severity: "info",
      message: "Export template location could not be checked because the Godot runtime version is unknown.",
      file: null,
    });
  }

  const ready = presets.length > 0 && findings.every((finding) => finding.severity !== "error" && finding.severity !== "warning");
  return {
    schemaVersion: 1,
    projectRoot,
    presetFile,
    presetFileExists,
    presets,
    templates,
    ready,
    findings,
  };
}

export async function previewLinuxExportPreset(projectRoot: string): Promise<ExportPresetPreview> {
  const presetFile = path.join(projectRoot, "export_presets.cfg");
  const exists = await pathExists(presetFile);
  const current = exists ? await readFile(presetFile, "utf8") : "";
  const presets = parseExportPresets(current);
  const existingLinux = presets.find((preset) => isLinuxPlatform(preset.platform));
  if (existingLinux) {
    return {
      schemaVersion: 1,
      path: presetFile,
      mode: "already-exists",
      presetName: existingLinux.name ?? "Linux",
      platform: existingLinux.platform ?? "Linux",
      contents: current,
    };
  }

  const nextIndex = nextPresetIndex(presets);
  const block = linuxPresetBlock(nextIndex);
  return {
    schemaVersion: 1,
    path: presetFile,
    mode: exists && current.trim() ? "append" : "create",
    presetName: "Linux",
    platform: "Linux/X11",
    contents: `${current.replace(/\s*$/, "")}${current.trim() ? "\n\n" : ""}${block}`,
  };
}

export async function writeLinuxExportPreset(projectRoot: string): Promise<ExportPresetPreview> {
  const preview = await previewLinuxExportPreset(projectRoot);
  if (preview.mode === "already-exists") {
    return preview;
  }
  await mkdir(path.dirname(preview.path), { recursive: true });
  await writeFile(preview.path, preview.contents);
  return preview;
}

function parseExportPresets(text: string): ExportPresetSummary[] {
  const config = parseGodotConfig(text);
  const presets: ExportPresetSummary[] = [];
  for (const [section, values] of Object.entries(config)) {
    const match = section.match(/^preset_(\d+)$/);
    if (!match) continue;
    const index = Number(match[1]);
    presets.push({
      index,
      name: stringValue(values.name),
      platform: stringValue(values.platform),
      exportPath: stringValue(values.export_path),
      runnable: typeof values.runnable === "boolean" ? values.runnable : null,
    });
  }
  return presets.sort((a, b) => a.index - b.index);
}

function nextPresetIndex(presets: ExportPresetSummary[]): number {
  return presets.reduce((max, preset) => Math.max(max, preset.index), -1) + 1;
}

function isLinuxPlatform(platform: string | null): boolean {
  return !!platform && /linux/i.test(platform);
}

function linuxPresetBlock(index: number): string {
  return `[preset.${index}]
name="Linux"
platform="Linux/X11"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="build/linux/GodotCoder.x86_64"
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false

[preset.${index}.options]
binary_format/embed_pck=false
texture_format/bptc=true
texture_format/s3tc=true
texture_format/etc=false
texture_format/etc2=false
binary_format/architecture="x86_64"
ssh_remote_deploy/enabled=false
`;
}

async function inspectExportTemplates(projectRoot: string, runtimeProfile: RuntimeProfile | null): Promise<ExportDoctorReport["templates"]> {
  const version = runtimeProfile?.detectedGodotVersion ?? null;
  const searchPaths = version ? templateSearchPaths(projectRoot, version) : [];
  if (!version) {
    return { checked: false, version: null, searchPaths, found: null };
  }

  for (const candidate of searchPaths) {
    if (await pathExists(candidate)) {
      return { checked: true, version, searchPaths, found: true };
    }
  }
  return { checked: true, version, searchPaths, found: false };
}

function templateSearchPaths(projectRoot: string, version: string): string[] {
  const home = process.env.HOME ?? "";
  const xdgDataHome = process.env.XDG_DATA_HOME ?? (home ? path.join(home, ".local", "share") : "");
  const normalizedVersions = Array.from(new Set([version, version.replace(/\.stable$/, "")])).filter(Boolean);
  const roots = [
    xdgDataHome ? path.join(xdgDataHome, "godot", "export_templates") : "",
    home ? path.join(home, ".var", "app", "org.godotengine.Godot", "data", "godot", "export_templates") : "",
    path.join(projectRoot, ".godotcoder", "cache", "xdg-data", "godot", "export_templates"),
  ].filter(Boolean);
  return roots.flatMap((root) => normalizedVersions.map((candidate) => path.join(root, candidate)));
}

export function assertExportPresetSubcommand(value: string | undefined): "doctor" | "preset" {
  if (value === "doctor" || value === "preset") return value;
  throw new CliError("EXPORT_COMMAND_UNKNOWN", "Usage: godotcoder export doctor [--json] | godotcoder export preset linux [--apply] [--json]");
}
