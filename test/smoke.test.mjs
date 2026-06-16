import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { extractDocTextFromHtml, loadCachedGodotDoc, officialGodotDocs, writeDocsContext, docsPromptContextWithExcerpts } from "../dist/core/godot-docs.js";
import { updateGodotConfigText, parseGodotConfig } from "../dist/core/godot-project.js";
import { evaluateGeneratedGameAcceptance, parseLlmBuildReply } from "../dist/core/llm-build.js";
import { attemptRepair } from "../dist/core/repair.js";
import { runSmokeValidation, runExportValidation } from "../dist/core/validation.js";

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

test("runSmokeValidation handles timeout as success and parses script errors on premature exit", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-smoke-run-"));
  const scriptPath = path.join(projectRoot, "mock_godot.js");

  // 1. Success on timeout (simulating a game loop running continuously)
  await writeFile(scriptPath, "setTimeout(() => {}, 10000);");
  const profileSuccess = {
    executable: ["node", scriptPath],
    detectedGodotVersion: "4.3.0",
    installType: "native",
  };
  const reportSuccess = await runSmokeValidation(projectRoot, profileSuccess, 200);
  assert.equal(reportSuccess.summary.errors, 0);
  assert.equal(reportSuccess.findings.length, 0);

  // 2. Failure on crash with script error
  await writeFile(
    scriptPath,
    "console.error('SCRIPT ERROR: Invalid get index on base Nil\\n  at res://scripts/player.gd:12'); process.exit(1);",
  );
  const profileCrash = {
    executable: ["node", scriptPath],
    detectedGodotVersion: "4.3.0",
    installType: "native",
  };
  const reportCrash = await runSmokeValidation(projectRoot, profileCrash, 2000);
  assert.equal(reportCrash.summary.errors, 1);
  assert.equal(reportCrash.findings[0].severity, "error");
  assert.equal(reportCrash.findings[0].subsystem, "script");
  assert.equal(reportCrash.findings[0].file, "res://scripts/player.gd");
  assert.equal(reportCrash.findings[0].line, 12);
  assert.match(reportCrash.findings[0].message, /Invalid get index/);

  // 3. Failure on premature exit without explicit logs
  await writeFile(scriptPath, "process.exit(127);");
  const profileExit = {
    executable: ["node", scriptPath],
    detectedGodotVersion: "4.3.0",
    installType: "native",
  };
  const reportExit = await runSmokeValidation(projectRoot, profileExit, 2000);
  assert.equal(reportExit.summary.errors, 1);
  assert.equal(reportExit.findings[0].severity, "error");
  assert.equal(reportExit.findings[0].subsystem, "runtime");
  assert.match(reportExit.findings[0].message, /prematurely/);
});

test("runExportValidation handles missing presets, success, and failures", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-export-run-"));

  // 1. Missing presets file
  const profile = {
    executable: ["node"],
    detectedGodotVersion: "4.3.0",
    installType: "native",
  };
  const reportMissing = await runExportValidation(projectRoot, profile);
  assert.equal(reportMissing.summary.warnings, 1);
  assert.match(reportMissing.findings[0].message, /No export_presets.cfg found/);

  // 2. Presets file with no presets
  await writeFile(path.join(projectRoot, "export_presets.cfg"), "[not_a_preset]\nkey=value");
  const reportEmpty = await runExportValidation(projectRoot, profile);
  assert.equal(reportEmpty.summary.warnings, 1);
  assert.match(reportEmpty.findings[0].message, /No presets defined/);

  // 3. Successful export
  await writeFile(
    path.join(projectRoot, "export_presets.cfg"),
    `[preset.0]\nname="Linux"\nplatform="Linux/X11"\n`,
  );
  const scriptPath = path.join(projectRoot, "mock_godot_export.js");
  await writeFile(scriptPath, "console.log('Exporting resources...'); process.exit(0);");
  const profileSuccess = {
    executable: ["node", scriptPath],
    detectedGodotVersion: "4.3.0",
    installType: "native",
  };
  const reportSuccess = await runExportValidation(projectRoot, profileSuccess);
  assert.equal(reportSuccess.summary.errors, 0);
  assert.equal(reportSuccess.findings.length, 0);

  // 4. Failed export
  await writeFile(
    scriptPath,
    "console.error('ERROR: No export template found for the selected platform.'); process.exit(1);",
  );
  const reportFail = await runExportValidation(projectRoot, profileSuccess);
  assert.equal(reportFail.summary.errors, 1);
  assert.match(reportFail.findings[0].message, /No export template found/);
  assert.equal(reportFail.findings[0].severity, "error");
});

test("docsPromptContextWithExcerpts includes cached excerpts and parseLlmBuildReply handles thinking blocks/tabs", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-hardening-run-"));

  // 1. Check docsPromptContextWithExcerpts with cached docs
  const docsDir = path.join(projectRoot, ".godotcoder/cache/docs");
  await mkdir(docsDir, { recursive: true });
  await writeFile(
    path.join(docsDir, "class-input.json"),
    JSON.stringify({
      schemaVersion: 1,
      cachedAt: "2026-06-14T00:00:00.000Z",
      source: {
        id: "class-input",
        title: "Input Class Reference",
        url: "https://docs.godotengine.org/en/stable/classes/class_input.html",
        summary: "Official API reference for polling input state.",
        tags: ["input"],
      },
      textPath: path.join(docsDir, "class-input.txt"),
      excerpts: ["Excerpt 1: Polling input events.", "Excerpt 2: Input actions."],
    }),
  );

  const docsContext = await docsPromptContextWithExcerpts(projectRoot, "input", 1);
  assert.match(docsContext, /Input Class Reference/);
  assert.match(docsContext, /Excerpt 1: Polling input events/);
  assert.match(docsContext, /Excerpt 2: Input actions/);

  // 2. parseLlmBuildReply strips think tags and repairs tabs
  const replyWithThink = `
  Some extra chat prose here.
  <think>
  Thinking about how to do this.
  I need to output a JSON object.
  </think>
  {
    "summary": "Implement input handling",
    "files": [
      {
        "path": "scripts/main.gd",
        "lines": [
          "extends Node2D",
          "\tfunc _ready():",
          "\t\tprint(\\"hello\\")"
        ]
      }
    ]
  }
  More trailing prose.
  `;
  const result = parseLlmBuildReply(replyWithThink);
  assert.equal(result.ok, true);
  assert.equal(result.summary, "Implement input handling");
  assert.equal(result.files[0].path, "scripts/main.gd");
  assert.equal(result.files[0].contents.includes("\t"), true);
});



