import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { assertBrownfieldSafety, BrownfieldSafetyError, detectBrownfieldProject, inferTaskIntent } from "../dist/core/brownfield.js";
import { inspectGodotProject } from "../dist/core/godot-project.js";

test("brownfield detection treats minimal scaffold as greenfield and extra project files as brownfield", async () => {
  const projectRoot = await makeProject("godotcoder-brownfield-detect-");
  try {
    const minimal = detectBrownfieldProject(await inspectGodotProject(projectRoot));
    assert.equal(minimal.isBrownfield, false);

    await writeFile(path.join(projectRoot, "scripts/player.gd"), "extends Node2D\n");
    const brownfield = detectBrownfieldProject(await inspectGodotProject(projectRoot));
    assert.equal(brownfield.isBrownfield, true);
    assert.equal(brownfield.reasons.includes("existing scripts"), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("brownfield safety accepts small targeted script edits", async () => {
  const projectRoot = await makeProject("godotcoder-brownfield-small-");
  try {
    await writeFile(path.join(projectRoot, "scripts/player.gd"), `extends Node2D

var speed := 120.0

func _process(delta: float) -> void:
\tposition.x += speed * delta
`);
    const profile = detectBrownfieldProject(await inspectGodotProject(projectRoot));
    const report = await assertBrownfieldSafety(projectRoot, "increase player speed", "feature", profile, [
      {
        path: "scripts/player.gd",
        contents: `extends Node2D

var speed := 180.0

func _process(delta: float) -> void:
\tposition.x += speed * delta
`,
      },
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.findings.filter((finding) => finding.severity === "error").length, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("brownfield safety rejects large existing script rewrites without explicit intent", async () => {
  const projectRoot = await makeProject("godotcoder-brownfield-rewrite-");
  try {
    const largeScript = [
      "extends Node2D",
      "",
      ...Array.from({ length: 140 }, (_value, index) => `var value_${index} := ${index}`),
      "",
      "func _ready() -> void:",
      "\tprint(value_0)",
      "",
    ].join("\n");
    await writeFile(path.join(projectRoot, "scripts/player.gd"), largeScript);
    const profile = detectBrownfieldProject(await inspectGodotProject(projectRoot));

    await assert.rejects(
      () => assertBrownfieldSafety(projectRoot, "add jump feedback", inferTaskIntent("add jump feedback"), profile, [
        {
          path: "scripts/player.gd",
          contents: `extends Node2D

func _ready() -> void:
\tprint("jump")
`,
        },
      ]),
      (error) => {
        assert.equal(error instanceof BrownfieldSafetyError, true);
        assert.match(error instanceof Error ? error.message : String(error), /Large existing script replacement/);
        return true;
      },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function makeProject(prefix: string): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await mkdir(path.join(projectRoot, "scenes"), { recursive: true });
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "project.godot"),
    `config_version=5

[application]
config/name="Brownfield Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")
`,
  );
  await writeFile(path.join(projectRoot, "scenes/main.tscn"), `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]

[node name="Main" type="Node2D"]
script = ExtResource("1_main")
`);
  await writeFile(path.join(projectRoot, "scripts/main.gd"), `extends Node2D

func _ready() -> void:
\tprint("GodotCoder project ready")
`);
  return projectRoot;
}
