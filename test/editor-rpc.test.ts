import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";

const cli = path.resolve("dist/cli.js");
const nodeBin = process.argv0 || process.execPath;

it("editor RPC exposes latest artifact summaries and reject acknowledgements", async () => {
  const projectRoot = await makeProject();
  await writeArtifactFixtures(projectRoot);

  const summary = await runRpc(projectRoot, ["editor.summary", "--json"]);
  assert.equal(summary.status, 0, summary.stderr);
  const summaryPayload = JSON.parse(summary.stdout);
  assert.equal(summaryPayload.ok, true);
  assert.equal(summaryPayload.method, "editor.summary");
  assert.equal(summaryPayload.result.latestValidation.id, "val_plain");
  assert.equal(summaryPayload.result.latestValidation.errors, 0);
  assert.equal(summaryPayload.result.latestVisualValidation.id, "val_visual");
  assert.equal(summaryPayload.result.latestVisualValidation.visual.blank, true);
  assert.equal(summaryPayload.result.latestRepair.id, "repair_1");
  assert.equal(summaryPayload.result.latestRepair.status, "repaired");
  assert.equal(summaryPayload.result.latestRepair.actionCount, 1);
  assert.equal(summaryPayload.result.latestPlaytestFeedback.feedback, "Jump feels floaty.");
  assert.equal(summaryPayload.result.modelQuality.total, 2);
  assert.equal(summaryPayload.result.modelQuality.successes, 1);
  assert.equal(summaryPayload.result.modelQuality.failures, 1);
  assert.equal(summaryPayload.result.modelQuality.recoveredOnRetry, 1);
  assert.equal(summaryPayload.result.modelQuality.latest.id, "model_run_success");
  assert.equal(summaryPayload.result.modelQuality.latest.modelSource, "role");
  assert.equal(summaryPayload.result.modelQuality.latestFailure.id, "model_run_failure");
  assert.equal(summaryPayload.result.modelQuality.recommendation.model, "mock-build");

  const reject = await runRpc(projectRoot, ["build.reject", "--prompt", "add a pause menu", "--context", JSON.stringify({ source: "editor" }), "--json"]);
  assert.equal(reject.status, 0, reject.stderr);
  const rejectPayload = JSON.parse(reject.stdout);
  assert.equal(rejectPayload.ok, true);
  assert.equal(rejectPayload.method, "build.reject");
  assert.equal(rejectPayload.result.applied, false);
  assert.equal(rejectPayload.result.status, "rejected");
  assert.equal(rejectPayload.result.prompt, "add a pause menu");
  assert.equal(rejectPayload.result.editorContext.source, "editor");
});

async function makeProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-editor-rpc-"));
  await mkdir(path.join(projectRoot, "scenes"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "project.godot"),
    `config_version=5

[application]
config/name="Editor RPC Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")
`,
  );
  await writeFile(path.join(projectRoot, "scenes/main.tscn"), `[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n`);
  return projectRoot;
}

async function writeArtifactFixtures(projectRoot: string): Promise<void> {
  const validationsDir = path.join(projectRoot, ".godotcoder", "validations");
  const repairsDir = path.join(projectRoot, ".godotcoder", "repairs");
  const playtestsDir = path.join(projectRoot, ".godotcoder", "playtests");
  const modelRunsDir = path.join(projectRoot, ".godotcoder", "model-runs");
  await mkdir(validationsDir, { recursive: true });
  await mkdir(repairsDir, { recursive: true });
  await mkdir(playtestsDir, { recursive: true });
  await mkdir(modelRunsDir, { recursive: true });
  await writeFile(path.join(validationsDir, "val_visual.json"), JSON.stringify({
    id: "val_visual",
    checkedAt: "2026-06-18T10:00:00.000Z",
    exitCode: 0,
    summary: { errors: 0, warnings: 1 },
    findings: [],
    visual: {
      artifactPath: ".godotcoder/validations/val_visual/frame.png",
      width: 640,
      height: 360,
      blank: true,
      nearBlank: true,
      findings: [{ severity: "warning", message: "Frame appears blank." }],
    },
  }, null, 2) + "\n");
  await writeFile(path.join(validationsDir, "val_plain.json"), JSON.stringify({
    id: "val_plain",
    checkedAt: "2026-06-18T10:01:00.000Z",
    exitCode: 0,
    summary: { errors: 0, warnings: 0 },
    findings: [],
  }, null, 2) + "\n");
  await writeFile(path.join(repairsDir, "repair_1.json"), JSON.stringify({
    id: "repair_1",
    status: "repaired",
    summary: "Created missing scene placeholder.",
    actions: [{ type: "create-file", path: "scenes/main.tscn", description: "Created scene." }],
    validationAfter: { id: "val_after", summary: { errors: 0, warnings: 0 } },
  }, null, 2) + "\n");
  await writeFile(path.join(playtestsDir, "feedback.md"), "## 2026-07-08T10:00:00.000Z\n\nFeedback: Jump feels floaty.\n");
  await writeFile(path.join(modelRunsDir, "model_run_failure.json"), JSON.stringify({
    schemaVersion: 1,
    id: "model_run_failure",
    createdAt: "2026-06-18T10:02:00.000Z",
    command: "build",
    taskType: "feature",
    provider: "openai-compatible",
    model: "mock-fail",
    modelSource: "default",
    outcome: "failed",
    recoveredOnRetry: false,
    promptPreview: "add movement",
    summary: null,
    error: "Invalid JSON response",
    attempts: [],
    context: {},
  }, null, 2) + "\n");
  await writeFile(path.join(modelRunsDir, "model_run_success.json"), JSON.stringify({
    schemaVersion: 1,
    id: "model_run_success",
    createdAt: "2026-06-18T10:03:00.000Z",
    command: "build",
    taskType: "feature",
    provider: "openai-compatible",
    model: "mock-build",
    modelSource: "role",
    outcome: "success",
    recoveredOnRetry: true,
    promptPreview: "add movement",
    summary: "Added movement.",
    error: null,
    attempts: [],
    context: {},
  }, null, 2) + "\n");
}

function runRpc(cwd: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(nodeBin, [cli, "rpc", ...args], {
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
