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

  const context = { current_path: "res://scenes/main.tscn", selected_nodes: [{ name: "Main", path: "/root/Main" }] };
  const editorContext = await runRpc(projectRoot, ["editor.context", "--context", JSON.stringify(context), "--json"]);
  const editorContextPayload = JSON.parse(editorContext.stdout);
  assert.equal(editorContextPayload.ok, true);
  assert.equal(editorContextPayload.result.context.current_path, context.current_path);
  assert.equal(editorContextPayload.result.context.selected_nodes[0].name, "Main");
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
