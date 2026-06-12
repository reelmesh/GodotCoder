import { findGodotProjectRoot, tryFindGodotProjectRoot } from "../core/godot-project.js";
import type { ModelProviderKind } from "../core/providers.js";
import { loadModelConfig } from "../core/providers.js";
import { loadSecrets, redactSecret, removeProviderSecret, writeProviderSecret } from "../core/settings.js";
import { workspacePaths } from "../core/workspace.js";

export async function authCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "login") {
    await login(rest);
    return;
  }
  if (subcommand === "logout") {
    await logout(rest);
    return;
  }
  await status(args);
}

async function status(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  const secrets = await loadSecrets(projectRoot);
  const modelConfig = await loadModelConfig(projectRoot);
  const providers = Object.fromEntries(
    Object.entries(secrets.providers).map(([provider, entry]) => [
      provider,
      { configured: Boolean(entry?.apiKey), apiKey: redactSecret(entry?.apiKey ?? null), updatedAt: entry?.updatedAt ?? null },
    ]),
  );

  if (json) {
    console.log(JSON.stringify({ ok: true, auth: { providers, activeProvider: modelConfig?.provider ?? null } }, null, 2));
    return;
  }

  console.log("GodotCoder auth");
  console.log(`Active provider: ${modelConfig?.provider ?? "not configured"}`);
  for (const [provider, entry] of Object.entries(providers)) {
    console.log(`${provider}: ${entry.configured ? `configured (${entry.apiKey})` : "not configured"}`);
  }
  console.log(`Secrets file: ${workspacePaths(projectRoot).secrets}`);
}

async function login(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const provider = parseProvider(readFlag(args, "--provider"));
  const apiKey = readFlag(args, "--api-key");
  if (!provider || !apiKey) {
    console.log("Usage: godotcoder auth login --provider <openai|anthropic|openai-compatible> --api-key <key>");
    return;
  }

  const projectRoot = await findGodotProjectRoot(process.cwd());
  const secrets = await writeProviderSecret(projectRoot, provider, apiKey);
  if (json) {
    console.log(JSON.stringify({ ok: true, provider, configured: Boolean(secrets.providers[provider]?.apiKey), secretsPath: workspacePaths(projectRoot).secrets }, null, 2));
    return;
  }

  console.log(`Saved auth for ${provider}.`);
  console.log(`Secrets file: ${workspacePaths(projectRoot).secrets}`);
}

async function logout(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const provider = parseProvider(readFlag(args, "--provider"));
  if (!provider) {
    console.log("Usage: godotcoder auth logout --provider <openai|anthropic|openai-compatible>");
    return;
  }

  const projectRoot = await findGodotProjectRoot(process.cwd());
  await removeProviderSecret(projectRoot, provider);
  if (json) {
    console.log(JSON.stringify({ ok: true, provider }, null, 2));
    return;
  }

  console.log(`Removed auth for ${provider}.`);
}

function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function parseProvider(value: string | null): ModelProviderKind | null {
  if (value === "openai" || value === "anthropic" || value === "openai-compatible") {
    return value;
  }
  return null;
}
