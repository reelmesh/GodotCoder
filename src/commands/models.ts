import type { Interface } from "node:readline/promises";
import { findGodotProjectRoot, tryFindGodotProjectRoot } from "../core/godot-project.js";
import { chooseMenuOption, withMenu } from "../core/menu.js";
import { completeWithModel, inspectProvider, loadModelConfig, modelSystemPrompt, writeModelConfig, writeModelConfigExample, type ModelConfig, type ModelProviderKind } from "../core/providers.js";

export async function modelsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "use") {
    await useModel(rest);
    return;
  }
  if (!subcommand && process.stdin.isTTY && !args.includes("--json")) {
    await openModelsMenu();
    return;
  }
  await showModels(args);
}

async function openModelsMenu(): Promise<void> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  await withMenu(async (rl) => {
    while (true) {
      const config = await loadModelConfig(projectRoot);
      console.log("");
      console.log("GodotCoder models");
      console.log(`Current: ${config ? `${config.provider}:${config.model}` : "not configured"}`);
      const choice = await chooseMenuOption(rl, "Choose action", [
        { value: "provider", label: "Configure provider", description: "Ollama, LM Studio, OpenAI, Anthropic, custom" },
        { value: "status", label: "Check provider status" },
        { value: "test", label: "Ask test prompt" },
      ]);
      if (!choice) return;

      if (choice === "provider") {
        await configureProvider(rl, projectRoot);
      } else if (choice === "status") {
        await showModels([]);
      } else if (choice === "test") {
        const prompt = (await rl.question("Prompt ▸ ")).trim() || "Say one sentence about Godot.";
        await askModel([prompt]);
      }
    }
  });
}

async function configureProvider(rl: Interface, projectRoot: string): Promise<void> {
  const provider = (await chooseMenuOption(rl, "Provider", [
    { value: "ollama", label: "Ollama", description: "local, http://127.0.0.1:11434" },
    { value: "lmstudio", label: "LM Studio", description: "local, http://10.0.0.9:1234" },
    { value: "openai", label: "OpenAI API" },
    { value: "anthropic", label: "Anthropic API" },
    { value: "openai-compatible", label: "OpenAI-compatible API" },
  ])) as ModelProviderKind | null;
  if (!provider) return;

  const model = (await rl.question("Model name ▸ ")).trim();
  if (!model) {
    console.log("No model set.");
    return;
  }

  const defaultUrl = defaultBaseUrl(provider);
  const baseUrlAnswer = (await rl.question(`Base URL (${defaultUrl ?? "required"}) ▸ `)).trim();
  const apiKeyDefault = defaultApiKeyEnv(provider);
  const apiKeyEnvAnswer = provider === "ollama" || provider === "lmstudio" ? "" : (await rl.question(`API key env (${apiKeyDefault ?? "none"}) ▸ `)).trim();
  const config: ModelConfig = {
    schemaVersion: 1,
    provider,
    model,
    baseUrl: baseUrlAnswer || defaultUrl,
    apiKeyEnv: apiKeyEnvAnswer || apiKeyDefault,
  };
  await writeModelConfig(projectRoot, config);
  console.log(`Saved model config: ${config.provider}:${config.model}`);
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
  ], projectRoot);

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
  const status = await inspectProvider(config, projectRoot);

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
  const status = await inspectProvider(config, projectRoot);

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
  if (provider === "lmstudio") return "http://10.0.0.9:1234";
  return null;
}

function defaultApiKeyEnv(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "lmstudio") return "LM_API_TOKEN";
  return null;
}
