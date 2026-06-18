import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import { asLiteral, asNullableString, asObject, asOneOf, asString } from "./schema.js";
import { getProviderApiKey } from "./settings.js";
import { workspacePaths } from "./workspace.js";

export type ModelProviderKind = "openai" | "anthropic" | "ollama" | "lmstudio" | "openrouter" | "openai-compatible";

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
  if (config.provider === "lmstudio") {
    return completeLmStudio(config, messages, projectRoot ?? null);
  }
  if (config.provider === "openrouter") {
    return completeOpenRouter(config, messages, projectRoot ?? null);
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
  const keyRequired = config.provider === "openai" || config.provider === "anthropic" || config.provider === "openrouter" || (config.provider === "openai-compatible" && Boolean(config.apiKeyEnv));
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
  return `You are GodotCoder, a specialized Godot game development agent.

Rules:
- Target Engine: Godot 4.3 or newer.
- Scripting: Prefer GDScript. Ensure it compiles cleanly headlessly.
- Quality: Avoid any placeholders, comments like "# TODO", or incomplete function blocks. All generated files must be fully implemented and immediately executable.
- Syntax Conventions: Use modern Godot 4 syntax:
  * Use @export, @export_range, @export_file instead of old export syntax.
  * Use @onready instead of onready.
  * Use instantiate() instead of instance().
  * Use randf_range() instead of rand_range().
  * Use Callable and modern signal connect syntax.
- Use Godot validation as authority.
- For edits, produce small steps that can be previewed, applied, and validated.`;
}

function parseModelConfig(value: unknown): ModelConfig {
  const root = asObject(value, "model config");
  return {
    schemaVersion: asLiteral(root.schemaVersion, 1, "model config schemaVersion"),
    provider: asOneOf(root.provider, ["openai", "anthropic", "ollama", "lmstudio", "openrouter", "openai-compatible"], "model config provider"),
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
    return { schemaVersion: 1, provider: "lmstudio", model: process.env.LMSTUDIO_MODEL, baseUrl: process.env.LMSTUDIO_BASE_URL ?? defaultBaseUrl("lmstudio"), apiKeyEnv: "LM_API_TOKEN" };
  }
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL) {
    return { schemaVersion: 1, provider: "openrouter", model: process.env.OPENROUTER_MODEL, baseUrl: process.env.OPENROUTER_BASE_URL ?? defaultBaseUrl("openrouter"), apiKeyEnv: "OPENROUTER_API_KEY" };
  }
  return null;
}

function defaultBaseUrl(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com/v1";
  if (provider === "ollama") return "http://127.0.0.1:11434";
  if (provider === "lmstudio") return "http://127.0.0.1:1234";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  return process.env.GODOTCODER_BASE_URL ?? null;
}

function defaultApiKeyEnv(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "lmstudio") return "LM_API_TOKEN";
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
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

async function completeOpenRouter(config: ModelConfig, messages: ModelMessage[], projectRoot: string | null): Promise<ModelReply> {
  const baseUrl = config.baseUrl ?? defaultBaseUrl("openrouter");
  const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv ?? "OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new CliError("MODEL_CONFIG_MISSING", "Missing OpenRouter API key. Set OPENROUTER_API_KEY or run auth login.");
  }

  const response = await fetchJson(`${trimSlash(baseUrl!)}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
  });
  const root = asObject(response, "OpenRouter chat response");
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = asObject(choices[0], "OpenRouter chat response choice");
  const message = asObject(first.message, "OpenRouter chat response message");
  return { provider: config.provider, model: config.model, content: asString(message.content, "OpenRouter chat response content") };
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

async function completeLmStudio(config: ModelConfig, messages: ModelMessage[], projectRoot: string | null): Promise<ModelReply> {
  const baseUrl = lmStudioBaseUrl(config.baseUrl ?? defaultBaseUrl("lmstudio")!);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv ?? "LM_API_TOKEN");
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchJson(`${baseUrl}/api/v1/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: config.model, input: [{ type: "text", content: messagesToPrompt(messages) }], temperature: 0.2 }),
  }, 180_000);
  return { provider: config.provider, model: config.model, content: extractChatContent(response, "LM Studio chat response") };
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
  if (config.provider === "lmstudio") {
    const headers: Record<string, string> = {};
    const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv ?? "LM_API_TOKEN");
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    return extractModelIds(await fetchJson(`${lmStudioBaseUrl(config.baseUrl ?? defaultBaseUrl("lmstudio")!)}/api/v1/models`, { headers }), "LM Studio models response");
  }
  if (config.provider === "openrouter") {
    const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv ?? "OPENROUTER_API_KEY");
    const headers = openRouterHeaders(apiKey);
    return extractModelIds(await fetchJson(`${trimSlash(config.baseUrl ?? defaultBaseUrl("openrouter")!)}/models`, { headers }), "OpenRouter models response");
  }
  const baseUrl = config.baseUrl ?? defaultBaseUrl(config.provider);
  if (!baseUrl) return [];
  const headers: Record<string, string> = {};
  const apiKey = await getProviderApiKey(projectRoot, config.provider, config.apiKeyEnv);
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const root = asObject(await fetchJson(`${trimSlash(baseUrl)}/models`, { headers }), "models response");
  return extractModelIds(root, "models response");
}

function openRouterHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-openrouter-title": process.env.OPENROUTER_APP_TITLE ?? "GodotCoder",
  };
  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers["http-referer"] = process.env.OPENROUTER_HTTP_REFERER;
  }
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function extractChatContent(value: unknown, label: string): string {
  const root = asObject(value, label);
  if (typeof root.content === "string") return root.content;
  if (root.message) {
    const message = asObject(root.message, `${label} message`);
    if (typeof message.content === "string") return message.content;
  }
  if (Array.isArray(root.output)) {
    const outputItems = root.output.map((item) => asObject(item, `${label} output item`));
    const message = outputItems.find((item) => item.type === "message" && typeof item.content === "string");
    if (message) return message.content as string;
    const nonReasoning = outputItems.find((item) => item.type !== "reasoning" && typeof item.content === "string");
    if (nonReasoning) return nonReasoning.content as string;
    const anyContent = outputItems.find((item) => typeof item.content === "string");
    if (anyContent) return anyContent.content as string;
  }
  const choices = Array.isArray(root.choices) ? root.choices : [];
  if (choices.length > 0) {
    const first = asObject(choices[0], `${label} choice`);
    if (first.message) {
      const message = asObject(first.message, `${label} choice message`);
      if (typeof message.content === "string") return message.content;
    }
    if (typeof first.text === "string") return first.text;
  }
  throw new CliError("SCHEMA_INVALID", `${label} did not include text content.`);
}

function extractModelIds(value: unknown, label: string): string[] {
  const root = Array.isArray(value) ? { data: value } : asObject(value, label);
  const data = Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : [];
  return data
    .map((item) => {
      const model = asObject(item, `${label} model`);
      return (
        asNullableString(model.id, `${label} model id`) ??
        asNullableString(model.key, `${label} model key`) ??
        asNullableString(model.name, `${label} model name`) ??
        asNullableString(model.model, `${label} model model`) ??
        asNullableString(model.display_name, `${label} model display_name`)
      );
    })
    .filter((item): item is string => Boolean(item));
}

function lmStudioBaseUrl(value: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  return trimSlash(withScheme).replace(/\/(?:api\/)?v1$/, "");
}

function messagesToPrompt(messages: ModelMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join("\n\n");
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
