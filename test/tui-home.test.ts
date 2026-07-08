import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { brownfieldPreviewArgs, homeStatus, previewReviewSummary } from "../src/commands/home.js";
import { completeSessionLine } from "../src/core/completion.js";

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

it("brownfield guide builds preview args with explicit intent", () => {
  assert.deepEqual(brownfieldPreviewArgs("fix player jump", "fix"), ["fix", "player", "jump", "--intent", "fix", "--preview"]);
});

it("preview review summary counts files and changed lines", () => {
  assert.deepEqual(previewReviewSummary({
    summary: "test",
    files: [
      { path: "res://a.gd", operation: "create", beforeLines: 0, afterLines: 3, addedLines: 3, removedLines: 0, diff: [], diffTruncated: false },
      { path: "res://b.gd", operation: "modify", beforeLines: 5, afterLines: 6, addedLines: 2, removedLines: 1, diff: [], diffTruncated: false },
      { path: "res://c.gd", operation: "unchanged", beforeLines: 2, afterLines: 2, addedLines: 0, removedLines: 0, diff: [], diffTruncated: false },
    ],
  }), { files: 3, create: 1, modify: 1, unchanged: 1, added: 5, removed: 1 });
});

it("playtest completion exposes feedback workflow", () => {
  const [matches] = completeSessionLine("/playtest f");
  const [flagMatches] = completeSessionLine("/playtest --");

  assert.deepEqual(matches, ["feedback"]);
  assert.equal(flagMatches.includes("--suggest-tasks"), true);
  assert.equal(flagMatches.includes("--apply"), true);
});
