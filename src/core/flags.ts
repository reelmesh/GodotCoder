import { defaultApiKeyEnv, defaultBaseUrl, modelProviderNames, type ModelProviderKind } from "./providers.js";

export function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

export function parseProvider(value: string | null): ModelProviderKind | null {
  return modelProviderNames.find((provider) => provider === value) ?? null;
}

export { defaultApiKeyEnv, defaultBaseUrl };
