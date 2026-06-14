import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const cli = path.resolve("dist/cli.js");

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
        summary: "Updated ready message.",
        files: [
          {
            path: "scripts/main.gd",
            lines: ["extends Node2D", "", "func _ready() -> void:", "\tprint(\"mock ready\")"],
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

    const buildResult = await runCli(projectRoot, ["build", "change scripts/main.gd to print mock ready", "--llm", "--preview", "--json"]);
    assert.equal(buildResult.status, 0, buildResult.stderr);
    const payload = JSON.parse(buildResult.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.source, "llm");
    assert.equal(payload.preview.files.some((file) => file.path === "res://scripts/main.gd"), true);
    assert.equal(chatCalls, 3);
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
    const useResult = await runCli(projectRoot, ["models", "use", "--provider", "openai-compatible", "--model", "mock-bad", "--base-url", server.url, "--json"]);
    assert.equal(useResult.status, 0, useResult.stderr);

    const harnessResult = await runCli(projectRoot, ["harness", "make a 2d arcade game", "--llm", "--json"]);
    assert.equal(harnessResult.status, 0, harnessResult.stderr);
    const payload = JSON.parse(harnessResult.stdout);
    assert.equal(payload.run.implementationSource, "deterministic");
    assert.equal(payload.run.steps.some((step) => step.id === "model-implementation" && step.status === "failed"), true);

    const failureDir = path.join(projectRoot, ".godotcoder/model-failures");
    const failures = await readdir(failureDir);
    assert.equal(failures.some((file) => file.endsWith(".json")), true);
    const failure = JSON.parse(await readFile(path.join(failureDir, failures.find((file) => file.endsWith(".json"))), "utf8"));
    assert.equal(failure.attempts.length, 2);
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
      sendJson(response, { data: [{ id: "mock-model" }, { id: "mock-bad" }] });
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

function runCli(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
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
