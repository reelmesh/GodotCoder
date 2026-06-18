import { mkdir, writeFile } from "node:fs/promises";
import { findGodotProjectRoot, inspectGodotProject } from "../core/godot-project.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "../core/runtime-profile.js";
import { assertExportPresetSubcommand, inspectExportReadiness, previewLinuxExportPreset, writeLinuxExportPreset } from "../core/export.js";
import { workspacePaths } from "../core/workspace.js";

export async function exportCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const positional = args.filter((arg) => !["--json", "--apply", "--yes"].includes(arg));
  const subcommand = assertExportPresetSubcommand(positional[0]);
  const projectRoot = await findGodotProjectRoot(process.cwd());

  if (subcommand === "doctor") {
    const runtimeProfile = await ensureRuntimeProfile(projectRoot);
    const report = await inspectExportReadiness(projectRoot, runtimeProfile);
    if (json) {
      console.log(JSON.stringify({ ok: report.ready, export: report }, null, 2));
      return;
    }
    printDoctor(report);
    return;
  }

  const presetTarget = args.find((arg) => !["preset", "--json", "--apply", "--yes"].includes(arg));
  if (presetTarget !== "linux") {
    console.log("Usage: godotcoder export preset linux [--apply] [--json]");
    return;
  }

  const apply = args.includes("--apply") || args.includes("--yes");
  const preview = apply ? await writeLinuxExportPreset(projectRoot) : await previewLinuxExportPreset(projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: true, mode: apply ? "applied" : "preview", preset: preview }, null, 2));
    return;
  }

  console.log(apply ? "Linux export preset applied" : "Linux export preset preview");
  console.log(`File: ${preview.path}`);
  console.log(`Mode: ${preview.mode}`);
  if (preview.mode === "already-exists") {
    console.log("A Linux export preset already exists.");
    return;
  }
  if (!apply) {
    console.log("");
    console.log(preview.contents);
    console.log("Apply with: godotcoder export preset linux --apply");
  }
}

async function ensureRuntimeProfile(projectRoot: string) {
  const paths = workspacePaths(projectRoot);
  let runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  if (!runtimeProfile?.executable) {
    const discovery = await discoverRuntime(projectRoot);
    const projectIndex = await inspectGodotProject(projectRoot);
    runtimeProfile = createRuntimeProfile(projectRoot, discovery, projectIndex);
    await mkdir(paths.workspaceRoot, { recursive: true });
    await writeFile(paths.runtimeProfile, JSON.stringify(runtimeProfile, null, 2) + "\n");
  }
  return runtimeProfile;
}

function printDoctor(report: Awaited<ReturnType<typeof inspectExportReadiness>>): void {
  console.log("Godot export doctor");
  console.log(`Preset file: ${report.presetFileExists ? report.presetFile : "missing"}`);
  console.log(`Presets: ${report.presets.length}`);
  for (const preset of report.presets) {
    console.log(`- ${preset.name ?? `preset ${preset.index}`} (${preset.platform ?? "unknown platform"}) -> ${preset.exportPath ?? "no export path"}`);
  }
  console.log(`Templates: ${report.templates.checked ? report.templates.found ? "found" : "missing" : "unknown"}`);
  console.log(`Export ready: ${report.ready ? "yes" : "no"}`);
  for (const finding of report.findings) {
    console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
  }
}
