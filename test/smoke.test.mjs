import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { extractDocTextFromHtml, loadCachedGodotDoc, officialGodotDocs, writeDocsContext } from "../dist/core/godot-docs.js";
import { updateGodotConfigText, parseGodotConfig } from "../dist/core/godot-project.js";
import { evaluateGeneratedGameAcceptance } from "../dist/core/llm-build.js";
import { attemptRepair } from "../dist/core/repair.js";

test("project.godot helpers update slash keys and input-map dictionaries", () => {
  const source = `config_version=5

[application]
config/name="Old"
`;
  const next = updateGodotConfigText(source, [
    { section: "application", key: "config/name", value: "New" },
    { section: "input", key: "jump", value: { deadzone: 0.5, events: [] } },
  ]);
  const parsed = parseGodotConfig(next);

  assert.equal(parsed.application.config_name, "New");
  assert.equal(typeof parsed.input.jump, "object");
  assert.equal(Array.isArray(parsed.input.jump), false);
  assert.equal(Array.isArray(parsed.input.jump.events), true);
});

test("repair creates missing scene and resource placeholders", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-repair-smoke-"));
  const validation = fakeValidation(projectRoot, [
    {
      severity: "error",
      subsystem: "scene",
      file: null,
      line: null,
      column: null,
      message: "Failed loading resource: res://scenes/missing_menu.tscn",
      raw: "ERROR: Failed loading resource: res://scenes/missing_menu.tscn",
    },
    {
      severity: "error",
      subsystem: "resource",
      file: null,
      line: null,
      column: null,
      message: "Failed loading resource: res://data/missing_item.tres",
      raw: "ERROR: Failed loading resource: res://data/missing_item.tres",
    },
  ]);

  const { attempt } = await attemptRepair(projectRoot, validation, null);
  const scene = await readFile(path.join(projectRoot, "scenes/missing_menu.tscn"), "utf8");
  const resource = await readFile(path.join(projectRoot, "data/missing_item.tres"), "utf8");

  assert.match(scene, /\[gd_scene format=3]/);
  assert.match(resource, /\[gd_resource type="Resource" format=3]/);
  assert.equal(attempt.actions.some((action) => action.type === "create-missing-scene"), true);
  assert.equal(attempt.actions.some((action) => action.type === "create-missing-resource"), true);
});

test("repair migrates common Godot 3 script syntax", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-migration-smoke-"));
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "scripts/main.gd"),
    `tool
extends KinematicBody2D
onready var button = $Button

func _ready():
\tbutton.connect("pressed", self, "_on_pressed")

func _on_pressed():
\tpass
`,
  );

  await attemptRepair(
    projectRoot,
    fakeValidation(projectRoot, [
      {
        severity: "error",
        subsystem: "script",
        file: "res://scripts/main.gd",
        line: 1,
        column: null,
        message: "SCRIPT ERROR: Parse Error",
        raw: "SCRIPT ERROR: Parse Error: res://scripts/main.gd:1",
      },
    ]),
    null,
  );

  const migrated = await readFile(path.join(projectRoot, "scripts/main.gd"), "utf8");
  assert.match(migrated, /@tool/);
  assert.match(migrated, /extends CharacterBody2D/);
  assert.match(migrated, /@onready var/);
  assert.match(migrated, /button\.pressed\.connect\(_on_pressed\)/);
});

test("docs cache text extraction enriches docs context", async () => {
  const text = extractDocTextFromHtml(
    `<html><body><nav>skip</nav><h1>Input</h1><p>Use Input actions to decouple gameplay controls from physical devices.</p><script>bad()</script></body></html>`,
  );
  assert.equal(text.includes("skip"), false);
  assert.equal(text.includes("bad"), false);
  assert.match(text, /Input actions/);

  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-docs-smoke-"));
  const docsDir = path.join(projectRoot, ".godotcoder/cache/docs");
  await mkdir(docsDir, { recursive: true });
  const source = officialGodotDocs.find((doc) => doc.id === "class-input");
  await writeFile(
    path.join(docsDir, "class-input.json"),
    JSON.stringify({
      schemaVersion: 1,
      cachedAt: "2026-06-14T00:00:00.000Z",
      source,
      textPath: path.join(docsDir, "class-input.txt"),
      excerpts: ["Input action excerpt from cached official docs."],
    }),
  );

  const cached = await loadCachedGodotDoc(projectRoot, "class-input");
  assert.match(cached.excerpts[0], /cached official/);

  const context = await writeDocsContext(projectRoot, "input action", 2);
  const classInput = context.matches.find((match) => match.id === "class-input");
  assert.match(classInput.excerpts[0], /cached official/);
  assert.match(await readFile(context.path, "utf8"), /Input action excerpt/);
});

test("open-ended game acceptance gates reject placeholders but allow playable slices", () => {
  const project = { scenes: [], scripts: [] };
  const weak = evaluateGeneratedGameAcceptance("make a cozy puzzle game", project, [
    { path: "scripts/main.gd", contents: `extends Node2D\nfunc _ready():\n\tprint("ready")\n` },
  ]);
  assert.equal(weak.passed, false);
  assert.equal(weak.missing.some((gate) => gate.includes("scene")), true);
  assert.equal(weak.missing.some((gate) => gate.includes("input")), true);

  const strong = evaluateGeneratedGameAcceptance("make a cozy puzzle game", project, [
    { path: "scenes/main.tscn", contents: `[gd_scene format=3]\n[node name="Main" type="Node2D"]\n` },
    {
      path: "scripts/main.gd",
      contents: `extends Node2D
var score := 0
func _physics_process(delta: float) -> void:
\tif Input.is_action_pressed("ui_right"):
\t\tposition.x += 100.0 * delta
\tscore += 1
\tif score > 10:
\t\tget_tree().reload_current_scene()
`,
    },
  ]);
  assert.equal(strong.passed, true);

  const edit = evaluateGeneratedGameAcceptance("change scripts/main.gd to print hello", project, []);
  assert.equal(edit.passed, true);
});

function fakeValidation(projectRoot, findings) {
  return {
    schemaVersion: 1,
    id: "val_fake",
    command: null,
    cwd: projectRoot,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    exitCode: 1,
    runtime: { installType: "unknown", version: null },
    findings,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
    },
  };
}
