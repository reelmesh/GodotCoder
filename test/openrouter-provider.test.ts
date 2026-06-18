import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";

const cli = path.resolve("dist/cli.js");

it("OpenRouter provider uses /api/v1 endpoints, auth, headers, and chat response parsing", async (t) => {
  const projectRoot = await makeProject("godotcoder-openrouter-");
  const requests: Array<{ method: string | undefined; url: string | undefined; headers: IncomingMessage["headers"]; body: string }> = [];
  const server = await startOpenRouterMock(requests);
  if (!server) {
    t.skip("localhost listen unavailable in this sandbox");
    return;
  }

  try {
    const env = { ...process.env, OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_HTTP_REFERER: "https://example.com/godotcoder" };
    const useResult = await runCli(projectRoot, ["models", "use", "--provider", "openrouter", "--model", "mock/router", "--base-url", `${server.url}/api/v1`, "--json"], env);
    assert.equal(useResult.status, 0, useResult.stderr);
    const usePayload = JSON.parse(useResult.stdout);
    assert.equal(usePayload.ok, true);
    assert.equal(usePayload.config.provider, "openrouter");
    assert.equal(usePayload.config.apiKeyEnv, "OPENROUTER_API_KEY");
    assert.deepEqual(usePayload.status.models, ["mock/router"]);

    const askResult = await runCli(projectRoot, ["ask", "Say ready", "--json"], env);
    assert.equal(askResult.status, 0, askResult.stderr);
    const askPayload = JSON.parse(askResult.stdout);
    assert.equal(askPayload.reply.provider, "openrouter");
    assert.equal(askPayload.reply.content, "OpenRouter mock ready.");

    const modelRequest = requests.find((request) => request.url === "/api/v1/models");
    assert.equal(modelRequest?.headers.authorization, "Bearer sk-or-test");
    assert.equal(modelRequest?.headers["x-openrouter-title"], "GodotCoder");

    const chatRequest = requests.find((request) => request.url === "/api/v1/chat/completions");
    assert.equal(chatRequest?.headers.authorization, "Bearer sk-or-test");
    assert.equal(chatRequest?.headers["x-openrouter-title"], "GodotCoder");
    assert.equal(chatRequest?.headers["http-referer"], "https://example.com/godotcoder");
    const chatBody = JSON.parse(chatRequest?.body ?? "{}");
    assert.equal(chatBody.model, "mock/router");
    assert.equal(chatBody.messages.some((message: { role?: string; content?: string }) => message.role === "user" && message.content === "Say ready"), true);
  } finally {
    await server.close();
  }
});

async function makeProject(prefix: string): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  await writeFile(
    path.join(projectRoot, "project.godot"),
    `config_version=5

[application]
config/name="OpenRouter Provider Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")
`,
  );
  return projectRoot;
}

async function startOpenRouterMock(requests: Array<{ method: string | undefined; url: string | undefined; headers: IncomingMessage["headers"]; body: string }>): Promise<{ url: string; close: () => Promise<void> } | null> {
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({ method: request.method, url: request.url, headers: request.headers, body });

    if (request.url === "/api/v1/models") {
      sendJson(response, { data: [{ id: "mock/router" }] });
      return;
    }

    if (request.url === "/api/v1/chat/completions") {
      sendJson(response, { choices: [{ message: { content: "OpenRouter mock ready." } }] });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  const listened = await new Promise<boolean>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(true));
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EPERM" || error.code === "EACCES") {
      return false;
    }
    throw error;
  });
  if (!listened) {
    return null;
  }

  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function readBody(request: IncomingMessage): Promise<string> {
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

function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env,
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
