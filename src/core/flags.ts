import type { ModelProviderKind } from "./providers.js";

export function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

export function parseProvider(value: string | null): ModelProviderKind | null {
  if (value === "openai" || value === "anthropic" || value === "ollama" || value === "lmstudio" || value === "openai-compatible") {
    return value;
  }
  return null;
}

export function defaultBaseUrl(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com/v1";
  if (provider === "ollama") return "http://127.0.0.1:11434";
  if (provider === "lmstudio") return "http://127.0.0.1:1234";
  return null;
}

export function defaultApiKeyEnv(provider: ModelProviderKind): string | null {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "lmstudio") return "LM_API_TOKEN";
  return null;
}
