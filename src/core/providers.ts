import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import { asLiteral, asNullableString, asObject, asOneOf, asString } from "./schema.js";
import { getProviderApiKey } from "./settings.js";
import { workspacePaths } from "./workspace.js";

export type ModelProviderKind = "openai" | "anthropic" | "ollama" | "lmstudio" | "openai-compatible";

export interface ModelConfig {
  schemaVersion: 1;
  provider: ModelProviderKind;
  model: string;
  baseUrl: string | null;
  apiKeyEnv: string | null;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelReply {
  provider: ModelProviderKind;
  model: string;
  content: string;
}

export interface ProviderStatus {
  provider: ModelProviderKind;
  configured: boolean;
  model: string | null;
  baseUrl: string | null;
  apiKeyEnv: string | null;
  local: boolean;
  diagnostics: string[];
  models: string[];
}

export async function loadModelConfig(projectRoot: string): Promise<ModelConfig | null> {
  const localPath = workspacePaths(projectRoot).modelConfig;
  if (await pathExists(localPath)) {
    return parseModelConfig(JSON.parse(await readFile(localPath, "utf8")));
  }

  return configFromEnv();
}

export async function writeModelConfig(projectRoot: string, config: ModelConfig): Promise<void> {
  const paths = workspacePaths(projectRoot);
  await mkdir(path.dirname(paths.modelConfig), { recursive: true });
  await writeFile(paths.modelConfig, JSON.stringify(config, null, 2) + "\n");
  await writeModelConfigExample(projectRoot);
}

export async function writeModelConfigExample(projectRoot: string): Promise<void> {
  const paths = workspacePaths(projectRoot);
  const example: ModelConfig = {
    schemaVersion: 1,
    provider: "ollama",
    model: "llama3.1",
    baseUrl: "http://127.0.0.1:11434",
    apiKeyEnv: null,
  };
  await mkdir(path.dirname(paths.modelConfigExample), { recursive: true });
  await writeFile(paths.modelConfigExample, JSON.stringify(example, null, 2) + "\n");
}

export async function completeWithModel(config: ModelConfig, messages: ModelMessage[], projectRoot?: string | null): Promise<ModelReply> {
  if (config.provider === "anthropic") {
    return completeAnthropic(config, messages, projectRoot ?? null);
  }
  if (config.provider === "ollama") {
    return completeOllama(config, messages);
  }
  return completeOpenAICompatible(config, messages, projectRoot ?? null);
}

export async function inspectProvider(config: ModelConfig | null, projectRoot?: string | null): Promise<ProviderStatus> {
  if (!config) {
    return {
      provider: "openai-compatible",
      configured: false,
      model: null,
      baseUrl: null,
      apiKeyEnv: null,
      local: false,
      diagnostics: ["No model provider configured. Use `godotcoder models use ...` or env vars."],
      models: [],
    };
  }

  const diagnostics: string[] = [];
  const local = config.provider === "ollama" || config.provider === "lmstudio";
  const keyRequired = config.provider === "openai" || config.provider === "anthropic" || (config.provider === "openai-compatible" && Boolean(config.apiKeyEnv));
  const apiKey = await getProviderApiKey(projectRoot ?? null, config.provider, config.apiKeyEnv);
  if (keyRequired && !apiKey) {
    diagnostics.push(`Missing API key. Set ${config.apiKeyEnv ?? "provider key"} env or run auth login.`);
  }

  const models = await listModels(config, projectRoot ?? null).catch((error: unknown) => {
    diagnostics.push(error instanceof Error ? error.message : String(error));
    return [];
  });

  return {
    provider: config.provider,
    configured: diagnostics.length === 0,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKeyEnv: config.apiKeyEnv,
    local,
    diagnostics,
    models,
  };
}

export function modelSystemPrompt(): string {
  return `You are GodotCoder, a Godot-only game development agent.

Rules:
- Godot 4.3 or newer only.
- Prefer GDScript and Godot-native scenes/resources.
- Avoid suggesting web/mobile/non-Godot runtime code for game implementation.
- Use Godot validation as authority.
- For edits, produce small steps that can be previewed, applied, and validated.`;
}

function parseModelConfig(value: unknown): ModelConfig {
  const root = asObject(value, "model config");
  return {
    schemaVersion: asLiteral(root.schemaVersion, 1, "model config schemaVersion"),
    provider: asOneOf(root.provider, ["openai", "anthropic", "ollama", "lmstudio", "openai-compatible"], "model config provider"),
    model: asString(root.model, "model config model"),
    baseUrl: asNullableString(root.baseUrl, "model config baseUrl"),
    apiKeyEnv: asNullableString(root.apiKeyEnv, "model config apiKeyEnv"),
  };
}

function configFromEnv(): ModelConfig | null {
  const provider = process.env.GODOTCODER_PROVIDER as ModelProviderKind | undefined;
  if (provider) {
    return {
      schemaVersion: 1,
      provider,
      model: requireEnv("GODOTCODER_MODEL"),
      baseUrl: process.env.GODOTCODER_BASE_URL ?? defaultBaseUrl(provider),
      apiKeyEnv: process.env.GODOTCODER_API_KEY_ENV ?? defaultApiKeyEnv(provider),
    };
  }

  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    return { schemaVersion: 1, provider: "openai", model: process.env.OPENAI_MODEL, baseUrl: process.env.OPENAI_BASE_URL ?? defaultBaseUrl("openai"), apiKeyEnv: "OPENAI_API_KEY" };
  }
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL) {
    return { schemaVersion: 1, provider: "anthropic", model: process.env.ANTHROPIC_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL ?? defaultBaseUrl("anthropic"), apiKeyEnv: "ANTHROPIC_API_KEY" };
  }
  if (process.env.OLLAMA_MODEL) {
    return { schemaVersion: 1, provider: "ollama", model: process.env.OLLAMA_MODEL, baseUrl: process.env.OLLAMA_BASE_URL ?? defaultBaseUrl("ollama"), apiKeyEnv: null };
  }
  if (process.env.LMSTUDIO_MODEL) {
    return { schemaVersion: 1, provider: "lmstudio", model: process.env.LMSTUDIO_MODEL, baseUrl: process.env.LMSTUDIO_BASE_URL ?? defaultBaseUrl("lmstudio"), apiKeyEnv: null };
  }
  return null;
}

function defaultBaseUrl(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com/v1";
  if (provider === "ollama") return "http://127.0.0.1:11434";
  if (provider === "lmstudio") return "http://127.0.0.1:1234/v1";
  return process.env.GODOTCODER_BASE_URL ?? null;
}

function defaultApiKeyEnv(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  return null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new CliError("MODEL_CONFIG_MISSING", `Missing required env: ${name}`);
  }
  return value;
}

async function completeOpenAICompatible(config: ModelConfig, messages: ModelMessage[], projectRoot: string | null): Promise<ModelReply> {
  const baseUrl = config.baseUrl ?? defaultBaseUrl(config.provider);
  if (!baseUrl) throw new CliError("MODEL_CONFIG_MISSING", "OpenAI-compatible provider requires baseUrl.");
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv);
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchJson(`${trimSlash(baseUrl)}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
  });
  const root = asObject(response, "chat response");
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = asObject(choices[0], "chat response choice");
  const message = asObject(first.message, "chat response message");
  return { provider: config.provider, model: config.model, content: asString(message.content, "chat response content") };
}

async function completeAnthropic(config: ModelConfig, messages: ModelMessage[], projectRoot: string | null): Promise<ModelReply> {
  const baseUrl = config.baseUrl ?? defaultBaseUrl("anthropic");
  const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv ?? "ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new CliError("MODEL_CONFIG_MISSING", "Missing Anthropic API key. Set env or run auth login.");
  }
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const nonSystem = messages.filter((message) => message.role !== "system");
  const response = await fetchJson(`${trimSlash(baseUrl!)}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: config.model, max_tokens: 1400, system, messages: nonSystem }),
  });
  const root = asObject(response, "anthropic response");
  const content = Array.isArray(root.content) ? root.content : [];
  const text = content.map((item) => asNullableString(asObject(item, "anthropic content").text, "anthropic content text")).filter((item): item is string => Boolean(item)).join("\n");
  return { provider: config.provider, model: config.model, content: text };
}

async function completeOllama(config: ModelConfig, messages: ModelMessage[]): Promise<ModelReply> {
  const baseUrl = config.baseUrl ?? defaultBaseUrl("ollama");
  const response = await fetchJson(`${trimSlash(baseUrl!)}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.model, messages, stream: false }),
  });
  const root = asObject(response, "ollama response");
  const message = asObject(root.message, "ollama response message");
  return { provider: config.provider, model: config.model, content: asString(message.content, "ollama response content") };
}

async function listModels(config: ModelConfig, projectRoot: string | null): Promise<string[]> {
  if (config.provider === "ollama") {
    const root = asObject(await fetchJson(`${trimSlash(config.baseUrl ?? defaultBaseUrl("ollama")!)}/api/tags`), "ollama tags");
    const models = Array.isArray(root.models) ? root.models : [];
    return models.map((item) => asNullableString(asObject(item, "ollama model").name, "ollama model name")).filter((item): item is string => Boolean(item));
  }
  if (config.provider === "anthropic") {
    return [];
  }
  const baseUrl = config.baseUrl ?? defaultBaseUrl(config.provider);
  if (!baseUrl) return [];
  const headers: Record<string, string> = {};
  const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv);
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const root = asObject(await fetchJson(`${trimSlash(baseUrl)}/models`, { headers }), "models response");
  const data = Array.isArray(root.data) ? root.data : [];
  return data.map((item) => asNullableString(asObject(item, "model").id, "model id")).filter((item): item is string => Boolean(item));
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new CliError("MODEL_REQUEST_FAILED", `${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
