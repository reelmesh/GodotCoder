import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectExportReadiness, previewLinuxExportPreset, writeLinuxExportPreset } from "../dist/core/export.js";
import { runExportValidation } from "../dist/core/validation.js";

test("export doctor reports missing export presets as not ready", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-export-doctor-missing-"));
  try {
    await writeProject(projectRoot);
    const report = await inspectExportReadiness(projectRoot, null);
    assert.equal(report.ready, false);
    assert.equal(report.presetFileExists, false);
    assert.equal(report.presets.length, 0);
    assert.equal(report.findings.some((finding) => finding.message.includes("No export_presets.cfg")), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("export doctor parses a Linux preset and exposes readiness in export validation JSON", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-export-doctor-valid-"));
  try {
    await writeProject(projectRoot);
    await writeFile(
      path.join(projectRoot, "export_presets.cfg"),
      `[preset.0]
name="Linux"
platform="Linux/X11"
runnable=true
export_path="build/linux/test.x86_64"
`,
    );
    const profile = {
      executable: ["node", path.join(projectRoot, "mock_export.js")],
      detectedGodotVersion: null,
      installType: "native" as const,
    };
    await writeFile(path.join(projectRoot, "mock_export.js"), "process.exit(0);");
    const validation = await runExportValidation(projectRoot, profile);
    assert.equal(validation.exportReadiness?.presets.length, 1);
    assert.equal(validation.exportReadiness?.presets[0]?.name, "Linux");
    assert.equal(validation.exportReadiness?.findings.every((finding) => finding.severity !== "error"), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("linux export preset previews before writing and applies on request", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-export-preset-linux-"));
  try {
    await writeProject(projectRoot);
    const preview = await previewLinuxExportPreset(projectRoot);
    assert.equal(preview.mode, "create");
    assert.match(preview.contents, /\[preset\.0]/);
    assert.match(preview.contents, /platform="Linux\/X11"/);

    const applied = await writeLinuxExportPreset(projectRoot);
    assert.equal(applied.mode, "create");
    const written = await readFile(path.join(projectRoot, "export_presets.cfg"), "utf8");
    assert.match(written, /name="Linux"/);

    const second = await previewLinuxExportPreset(projectRoot);
    assert.equal(second.mode, "already-exists");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function writeProject(projectRoot: string): Promise<void> {
  await writeFile(
    path.join(projectRoot, "project.godot"),
    `config_version=5

[application]
config/name="Export Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")
`,
  );
}
