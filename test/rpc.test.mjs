import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const cli = path.resolve("dist/cli.js");

test("rpc emits stable success envelopes", async () => {
  const projectRoot = await makeProject();

  const inspect = await runRpc(projectRoot, ["project.inspect", "--json"]);
  assert.equal(inspect.status, 0, inspect.stderr);
  const inspectPayload = JSON.parse(inspect.stdout);
  assert.equal(inspectPayload.ok, true);
  assert.equal(inspectPayload.method, "project.inspect");
  assert.equal(inspectPayload.error, null);
  assert.equal(inspectPayload.result.projectIndex.applicationName, "RPC Test");

  const status = await runRpc(projectRoot, ["workspace.status", "--json"]);
  const statusPayload = JSON.parse(status.stdout);
  assert.equal(statusPayload.ok, true);
  assert.equal(statusPayload.result.projectRoot, projectRoot);
  assert.equal(statusPayload.result.projectIndexExists, true);

  const statusWithContext = await runRpc(projectRoot, ["workspace.status", "--context", JSON.stringify({ source: "editor" }), "--json"]);
  const statusWithContextPayload = JSON.parse(statusWithContext.stdout);
  assert.equal(statusWithContextPayload.ok, true);
  assert.equal(statusWithContextPayload.result.editorContext.source, "editor");

  const gitInit = await runCommand(projectRoot, ["git", "init"]);
  assert.equal(gitInit.status, 0, gitInit.stderr);
  const changes = await runRpc(projectRoot, ["workspace.changes", "--context", JSON.stringify({ source: "editor" }), "--json"]);
  const changesPayload = JSON.parse(changes.stdout);
  assert.equal(changesPayload.ok, true);
  assert.equal(changesPayload.method, "workspace.changes");
  assert.equal(changesPayload.result.available, true);
  assert.equal(changesPayload.result.clean, false);
  assert.equal(changesPayload.result.files.some((file) => file.path === "project.godot"), true);
  assert.equal(changesPayload.result.editorContext.source, "editor");

  const docs = await runRpc(projectRoot, ["docs.search", "--query", "input", "--json"]);
  const docsPayload = JSON.parse(docs.stdout);
  assert.equal(docsPayload.ok, true);
  assert.equal(docsPayload.method, "docs.search");
  assert.equal(docsPayload.result.matches.some((match) => match.id === "class-input"), true);

  const preview = await runRpc(projectRoot, ["build.preview", "--prompt", "make a 2d platformer with coins", "--json"]);
  const previewPayload = JSON.parse(preview.stdout);
  assert.equal(previewPayload.ok, true);
  assert.equal(previewPayload.result.source, "deterministic");
  assert.equal(previewPayload.result.preview.files.length > 0, true);
  assert.equal(previewPayload.result.previewSummary.fileCount, previewPayload.result.preview.files.length);
  assert.equal(previewPayload.result.previewSummary.hasChanges, true);
  assert.equal(previewPayload.result.previewSummary.changedPaths.some((filePath) => filePath.startsWith("res://")), true);

  const debugError = "Parse Error: Expected expression at res://scripts/player.gd:12:5";
  const debug = await runRpc(projectRoot, ["debug.current", "--error", debugError, "--context", JSON.stringify({ current_path: "res://scenes/main.tscn" }), "--json"]);
  const debugPayload = JSON.parse(debug.stdout);
  assert.equal(debugPayload.ok, true);
  assert.equal(debugPayload.method, "debug.current");
  assert.equal(debugPayload.result.likelySubsystem, "script");
  assert.equal(debugPayload.result.sourceFile, "res://scripts/player.gd");
  assert.equal(debugPayload.result.line, 12);
  assert.equal(debugPayload.result.column, 5);
  assert.equal(debugPayload.result.editorContext.current_path, "res://scenes/main.tscn");

  const context = { current_path: "res://scenes/main.tscn", selected_nodes: [{ name: "Main", path: "/root/Main" }] };
  const editorContext = await runRpc(projectRoot, ["editor.context", "--context", JSON.stringify(context), "--json"]);
  const editorContextPayload = JSON.parse(editorContext.stdout);
  assert.equal(editorContextPayload.ok, true);
  assert.equal(editorContextPayload.result.context.current_path, context.current_path);
  assert.equal(editorContextPayload.result.context.selected_nodes[0].name, "Main");

  const explainContext = {
    current_path: "res://scenes/main.tscn",
    scene_root: { name: "Main", class: "Node2D", path: "/root/Main" },
    selected_nodes: [{ name: "Player", class: "CharacterBody2D", path: "/root/Main/Player" }],
    current_script: { class: "GDScript", path: "res://scripts/player.gd" },
  };
  const explain = await runRpc(projectRoot, ["editor.explain", "--context", JSON.stringify(explainContext), "--json"]);
  const explainPayload = JSON.parse(explain.stdout);
  assert.equal(explainPayload.ok, true);
  assert.equal(explainPayload.method, "editor.explain");
  assert.equal(explainPayload.result.focus.currentPath, explainContext.current_path);
  assert.equal(explainPayload.result.focus.selectedNodes[0].name, "Player");
  assert.equal(explainPayload.result.project.applicationName, "RPC Test");
  assert.equal(explainPayload.result.project.sceneCount, 1);
  assert.equal(explainPayload.result.suggestedNextCommands.some((command) => command.includes("validation.run")), true);
});

test("rpc emits stable error envelopes", async () => {
  const projectRoot = await makeProject();
  const result = await runRpc(projectRoot, ["unknown.method", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.method, "unknown.method");
  assert.equal(payload.result, null);
  assert.equal(payload.error.code, "RPC_METHOD_NOT_FOUND");
});

async function makeProject() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-rpc-smoke-"));
  await mkdir(path.join(projectRoot, "scenes"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "project.godot"),
    `config_version=5

[application]
config/name="RPC Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")
`,
  );
  await writeFile(path.join(projectRoot, "scenes/main.tscn"), `[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n`);
  return projectRoot;
}

function runCommand(cwd, command) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function runRpc(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "rpc", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
