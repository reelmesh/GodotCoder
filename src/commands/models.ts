import { findGodotProjectRoot, tryFindGodotProjectRoot } from "../core/godot-project.js";
import { completeWithModel, inspectProvider, loadModelConfig, modelSystemPrompt, writeModelConfig, writeModelConfigExample, type ModelConfig, type ModelProviderKind } from "../core/providers.js";

export async function modelsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "use") {
    await useModel(rest);
    return;
  }
  await showModels(args);
}

export async function askModel(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const prompt = args.filter((arg) => arg !== "--json").join(" ").trim();
  if (!prompt) {
    console.log("Usage: godotcoder ask <prompt>");
    return;
  }

  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  const config = await loadModelConfig(projectRoot);
  if (!config) {
    console.log("No model provider configured. Use `godotcoder models use ...` first.");
    return;
  }

  const reply = await completeWithModel(config, [
    { role: "system", content: modelSystemPrompt() },
    { role: "user", content: prompt },
  ]);

  if (json) {
    console.log(JSON.stringify({ ok: true, reply }, null, 2));
    return;
  }

  console.log(`${reply.provider}:${reply.model}`);
  console.log(reply.content);
}

async function showModels(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  const config = await loadModelConfig(projectRoot);
  if (await tryFindGodotProjectRoot(process.cwd())) {
    await writeModelConfigExample(projectRoot);
  }
  const status = await inspectProvider(config);

  if (json) {
    console.log(JSON.stringify({ ok: status.configured, status }, null, 2));
    return;
  }

  console.log("GodotCoder models");
  console.log(`Provider: ${config?.provider ?? "not configured"}`);
  console.log(`Model: ${config?.model ?? "not configured"}`);
  console.log(`Base URL: ${config?.baseUrl ?? "default/not configured"}`);
  console.log(`API key env: ${config?.apiKeyEnv ?? "none"}`);
  for (const diagnostic of status.diagnostics) {
    console.log(`WARN: ${diagnostic}`);
  }
  if (status.models.length > 0) {
    console.log(`Available: ${status.models.slice(0, 20).join(", ")}${status.models.length > 20 ? " ..." : ""}`);
  }
}

async function useModel(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const provider = parseProvider(readFlag(args, "--provider"));
  const model = readFlag(args, "--model");
  const baseUrl = readFlag(args, "--base-url");
  const apiKeyEnv = readFlag(args, "--api-key-env");

  if (!provider || !model) {
    console.log("Usage: godotcoder models use --provider <openai|anthropic|ollama|lmstudio|openai-compatible> --model <name> [--base-url <url>] [--api-key-env <ENV>]");
    return;
  }

  const projectRoot = await findGodotProjectRoot(process.cwd());
  const config: ModelConfig = {
    schemaVersion: 1,
    provider,
    model,
    baseUrl: baseUrl ?? defaultBaseUrl(provider),
    apiKeyEnv: apiKeyEnv ?? defaultApiKeyEnv(provider),
  };
  await writeModelConfig(projectRoot, config);
  const status = await inspectProvider(config);

  if (json) {
    console.log(JSON.stringify({ ok: status.configured, config, status }, null, 2));
    return;
  }

  console.log(`Saved model config: ${config.provider}:${config.model}`);
  console.log(`Base URL: ${config.baseUrl ?? "none"}`);
  console.log(`API key env: ${config.apiKeyEnv ?? "none"}`);
  for (const diagnostic of status.diagnostics) {
    console.log(`WARN: ${diagnostic}`);
  }
}

function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function parseProvider(value: string | null): ModelProviderKind | null {
  if (value === "openai" || value === "anthropic" || value === "ollama" || value === "lmstudio" || value === "openai-compatible") {
    return value;
  }
  return null;
}

function defaultBaseUrl(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com/v1";
  if (provider === "ollama") return "http://127.0.0.1:11434";
  if (provider === "lmstudio") return "http://127.0.0.1:1234/v1";
  return null;
}

function defaultApiKeyEnv(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  return null;
}
