import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { homeStatus } from "../src/commands/home.js";

it("home status guides users before and after project detection", async () => {
  const previousCwd = process.cwd();
  const emptyRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-home-empty-"));
  try {
    process.chdir(emptyRoot);
    const emptyStatus = await homeStatus();
    assert.equal(emptyStatus.project, "not detected in this folder");
    assert.match(emptyStatus.next, /Start guided setup/);

    const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-home-project-"));
    await mkdir(path.join(projectRoot, "scenes"), { recursive: true });
    await writeFile(
      path.join(projectRoot, "project.godot"),
      `config_version=5

[application]
config/name="Home Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")
`,
    );
    await writeFile(path.join(projectRoot, "scenes/main.tscn"), `[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n`);
    process.chdir(projectRoot);
    const projectStatus = await homeStatus();
    assert.equal(projectStatus.workspace, "not initialized");
    assert.equal(projectStatus.runtime, "not checked");
    assert.equal(projectStatus.model, "not configured");
    assert.match(projectStatus.next, /Start guided setup/);
  } finally {
    process.chdir(previousCwd);
  }
});
