import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const cli = path.resolve("dist/cli.js");
const nodeBin = process.argv0 || process.execPath;

test("OpenAI-compatible mock supports models use, ask, and build retry", async (t) => {
  const projectRoot = await makeProject("godotcoder-provider-ok-");
  let chatCalls = 0;
  const server = await startMockServer({
    chat() {
      chatCalls += 1;
      if (chatCalls === 1) {
        return "Mock provider ready.";
      }
      if (chatCalls === 2) {
        return "not json";
      }
      return JSON.stringify({
        summary: "Generated playable mock slice.",
        files: [
          {
            path: "scenes/main.tscn",
            lines: [
              "[gd_scene load_steps=2 format=3]",
              "",
              "[ext_resource type=\"Script\" path=\"res://scripts/main.gd\" id=\"1_main\"]",
              "",
              "[node name=\"Main\" type=\"Node2D\"]",
              "script = ExtResource(\"1_main\")",
            ],
          },
          {
            path: "scripts/main.gd",
            lines: [
              "extends Node2D",
              "",
              "var score := 0",
              "var health := 3",
              "",
              "func _ready() -> void:",
              "\tprint(\"mock ready\")",
              "",
              "func _process(delta: float) -> void:",
              "\tif Input.is_action_pressed(\"ui_right\"):",
              "\t\tposition.x += 100.0 * delta",
              "\tscore += 1",
              "\tif score >= 60:",
              "\t\tprint(\"win score\")",
              "\tif health <= 0:",
              "\t\tget_tree().reload_current_scene()",
            ],
          },
        ],
      });
    },
  });
  if (!server) {
    t.skip("localhost listen unavailable in this sandbox");
    return;
  }

  try {
    const baseUrl = server.url;
    const useResult = await runCli(projectRoot, ["models", "use", "--provider", "openai-compatible", "--model", "mock-model", "--base-url", baseUrl, "--json"]);
    assert.equal(useResult.status, 0, useResult.stderr);
    assert.equal(JSON.parse(useResult.stdout).ok, true);

    const askResult = await runCli(projectRoot, ["ask", "Say ready", "--json"]);
    assert.equal(askResult.status, 0, askResult.stderr);
    assert.equal(JSON.parse(askResult.stdout).reply.content, "Mock provider ready.");

    const roleResult = await runCli(projectRoot, ["models", "role", "set", "build", "--provider", "openai-compatible", "--model", "mock-build", "--base-url", baseUrl, "--json"]);
    assert.equal(roleResult.status, 0, roleResult.stderr);
    const rolePayload = JSON.parse(roleResult.stdout);
    assert.equal(rolePayload.ok, true);
    assert.equal(rolePayload.role, "build");
    assert.equal(rolePayload.config.model, "mock-build");

    const validationsDir = path.join(projectRoot, ".godotcoder/validations");
    await mkdir(validationsDir, { recursive: true });
    await writeFile(path.join(validationsDir, "val_recent.json"), JSON.stringify({
      id: "val_recent",
      summary: { errors: 1, warnings: 0 },
      findings: [{ severity: "error", message: "Missing restart flow." }],
    }));

    const buildResult = await runCli(projectRoot, ["build", "change scripts/main.gd to print mock ready", "--llm", "--preview", "--json"]);
    assert.equal(buildResult.status, 0, buildResult.stderr);
    const payload = JSON.parse(buildResult.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.source, "llm");
    assert.equal(payload.preview.files.some((file) => file.path === "res://scripts/main.gd"), true);
    assert.equal(chatCalls, 3);
    assert.equal(JSON.parse(server.requests[3].body).model, "mock-build");
    assert.match(server.requests[3].body, /Latest validation: id=val_recent/);
    assert.match(server.requests[3].body, /Missing restart flow/);
    assert.equal(JSON.parse(server.requests[4].body).model, "mock-build");
    assert.match(server.requests[4].body, /Latest validation: id=val_recent/);
    assert.match(server.requests[4].body, /Missing restart flow/);

    const modelRunsDir = path.join(projectRoot, ".godotcoder/model-runs");
    const modelRuns = await readdir(modelRunsDir);
    assert.equal(modelRuns.some((file) => file.endsWith(".json")), true);
    const modelRun = JSON.parse(await readFile(path.join(modelRunsDir, modelRuns.find((file) => file.endsWith(".json"))), "utf8"));
    assert.equal(modelRun.outcome, "success");
    assert.equal(modelRun.recoveredOnRetry, true);
    assert.equal(modelRun.model, "mock-build");
    assert.equal(modelRun.modelSource, "role");
    assert.equal(modelRun.attempts.length, 2);
    assert.equal(modelRun.context.validation.includes("val_recent"), true);

    const reportResult = await runCli(projectRoot, ["models", "report", "--json"]);
    assert.equal(reportResult.status, 0, reportResult.stderr);
    const reportPayload = JSON.parse(reportResult.stdout);
    assert.equal(reportPayload.report.total, 1);
    assert.equal(reportPayload.report.successes, 1);
    assert.equal(reportPayload.report.groups[0].model, "mock-build");
    assert.equal(reportPayload.report.groups[0].modelSource, "role");
    assert.equal(reportPayload.report.groups[0].successRate, 1);

    const evalResult = await runCli(projectRoot, ["models", "eval", "--prompt-set", "arcade", "--limit", "2", "--json"]);
    assert.equal(evalResult.status, 0, evalResult.stderr);
    const evalPayload = JSON.parse(evalResult.stdout);
    assert.equal(evalPayload.ok, true);
    assert.equal(evalPayload.report.promptSet, "arcade");
    assert.equal(evalPayload.report.total, 2);
    assert.equal(evalPayload.report.passed, 2);
    assert.equal(evalPayload.report.results.every((result) => result.modelRunId), true);

    const recommendResult = await runCli(projectRoot, ["models", "recommend", "--json"]);
    assert.equal(recommendResult.status, 0, recommendResult.stderr);
    const recommendPayload = JSON.parse(recommendResult.stdout);
    assert.equal(recommendPayload.recommendation.recommended.model, "mock-build");
    assert.equal(recommendPayload.recommendation.recommended.modelSource, "role");
    assert.equal(recommendPayload.recommendation.recommended.successes, 3);
    assert.equal(recommendPayload.recommendation.candidates[0].model, "mock-build");
  } finally {
    await server.close();
  }
});

test("harness records model failure and falls back when mock returns invalid JSON", async (t) => {
  const projectRoot = await makeProject("godotcoder-provider-fail-");
  const server = await startMockServer({
    chat() {
      return "still not json";
    },
  });
  if (!server) {
    t.skip("localhost listen unavailable in this sandbox");
    return;
  }

  try {
    const roleResult = await runCli(projectRoot, ["models", "role", "set", "fallback", "--provider", "openai-compatible", "--model", "mock-bad", "--base-url", server.url, "--json"]);
    assert.equal(roleResult.status, 0, roleResult.stderr);
    assert.equal(JSON.parse(roleResult.stdout).role, "fallback");

    const harnessResult = await runCli(projectRoot, ["harness", "make a 2d arcade game", "--llm", "--json"]);
    assert.equal(harnessResult.status, 0, harnessResult.stderr);
    const payload = JSON.parse(harnessResult.stdout);
    assert.equal(payload.run.modelImplementation, null);
    assert.equal(payload.run.steps.some((step) => step.id === "model-implementation" && step.status === "failed"), true);

    const failureDir = path.join(projectRoot, ".godotcoder/model-failures");
    const failures = await readdir(failureDir);
    assert.equal(failures.some((file) => file.endsWith(".json")), true);
    const failure = JSON.parse(await readFile(path.join(failureDir, failures.find((file) => file.endsWith(".json"))), "utf8"));
    assert.equal(failure.attempts.length, 2);

    const modelRunsDir = path.join(projectRoot, ".godotcoder/model-runs");
    const modelRuns = await readdir(modelRunsDir);
    const modelRun = JSON.parse(await readFile(path.join(modelRunsDir, modelRuns.find((file) => file.endsWith(".json"))), "utf8"));
    assert.equal(modelRun.outcome, "failed");
    assert.equal(modelRun.provider, "openai-compatible");
    assert.equal(modelRun.model, "mock-bad");
    assert.equal(modelRun.modelSource, "fallback");

    const reportResult = await runCli(projectRoot, ["models", "report", "--json"]);
    assert.equal(reportResult.status, 0, reportResult.stderr);
    const reportPayload = JSON.parse(reportResult.stdout);
    assert.equal(reportPayload.report.total, 1);
    assert.equal(reportPayload.report.failures, 1);
    assert.equal(reportPayload.report.groups[0].modelSource, "fallback");
    assert.equal(reportPayload.report.groups[0].successRate, 0);
  } finally {
    await server.close();
  }
});

test("rpc workspace changes can use review model role", async (t) => {
  const projectRoot = await makeProject("godotcoder-review-role-");
  const server = await startMockServer({
    chat() {
      return "Review role saw the workspace changes.";
    },
  });
  if (!server) {
    t.skip("localhost listen unavailable in this sandbox");
    return;
  }

  try {
    const gitInit = await runCommand(projectRoot, ["git", "init"]);
    assert.equal(gitInit.status, 0, gitInit.stderr);

    const roleResult = await runCli(projectRoot, ["models", "role", "set", "review", "--provider", "openai-compatible", "--model", "mock-review", "--base-url", server.url, "--json"]);
    assert.equal(roleResult.status, 0, roleResult.stderr);

    const changes = await runCli(projectRoot, ["rpc", "workspace.changes", "--llm", "--json"]);
    assert.equal(changes.status, 0, changes.stderr);
    const payload = JSON.parse(changes.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.result.modelReview.available, true);
    assert.equal(payload.result.modelReview.model, "mock-review");
    assert.equal(payload.result.modelReview.modelSource, "role");
    assert.equal(payload.result.modelReview.summary, "Review role saw the workspace changes.");
    assert.equal(JSON.parse(server.requests.at(-1).body).model, "mock-review");
  } finally {
    await server.close();
  }
});

async function makeProject(prefix) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await writeFile(
    path.join(projectRoot, "project.godot"),
    `config_version=5

[application]
config/name="Mock Provider Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")
`,
  );
  return projectRoot;
}

async function startMockServer(handlers) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({ method: request.method, url: request.url, body });

    if (request.url === "/models") {
      sendJson(response, { data: [{ id: "mock-model" }, { id: "mock-build" }, { id: "mock-bad" }] });
      return;
    }

    if (request.url === "/chat/completions") {
      sendJson(response, {
        choices: [
          {
            message: {
              content: handlers.chat(JSON.parse(body || "{}")),
            },
          },
        ],
      });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  const listened = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  }).then(
    () => true,
    (error) => {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        return false;
      }
      throw error;
    },
  );
  if (!listened) {
    return null;
  }
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function sendJson(response, value) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
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

function runCli(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(nodeBin, [cli, ...args], {
      cwd,
      env: { ...process.env },
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
