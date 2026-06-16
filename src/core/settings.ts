import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import type { ModelProviderKind } from "./providers.js";
import { asLiteral, asNullableString, asObject, asOneOf, asString } from "./schema.js";
import { workspacePaths } from "./workspace.js";

export interface UserSettings {
  schemaVersion: 1;
  defaultMode: "plan" | "build";
  approvalMode: "preview" | "auto-apply";
  preferredProvider: ModelProviderKind | null;
  showDiffs: "compact" | "full";
}

export interface SecretStore {
  schemaVersion: 1;
  providers: Partial<Record<ModelProviderKind, { apiKey: string; updatedAt: string }>>;
}

export function defaultSettings(): UserSettings {
  return {
    schemaVersion: 1,
    defaultMode: "build",
    approvalMode: "preview",
    preferredProvider: null,
    showDiffs: "compact",
  };
}

export async function loadSettings(projectRoot: string): Promise<UserSettings> {
  const settingsPath = workspacePaths(projectRoot).userSettings;
  if (!(await pathExists(settingsPath))) {
    return defaultSettings();
  }
  return parseSettings(JSON.parse(await readFile(settingsPath, "utf8")));
}

export async function writeSettings(projectRoot: string, settings: UserSettings): Promise<void> {
  const settingsPath = workspacePaths(projectRoot).userSettings;
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

export async function setSetting(projectRoot: string, key: string, value: string): Promise<UserSettings> {
  const current = await loadSettings(projectRoot);
  const next: UserSettings = { ...current };

  if (key === "defaultMode") next.defaultMode = asOneOf(value, ["plan", "build"], "defaultMode");
  if (key === "approvalMode") next.approvalMode = asOneOf(value, ["preview", "auto-apply"], "approvalMode");
  if (key === "preferredProvider") next.preferredProvider = parseProvider(value, "preferredProvider");
  if (key === "showDiffs") next.showDiffs = asOneOf(value, ["compact", "full"], "showDiffs");
  if (!["defaultMode", "approvalMode", "preferredProvider", "showDiffs"].includes(key)) {
    throw new CliError("SETTING_UNKNOWN", `Unknown setting: ${key}`);
  }

  await writeSettings(projectRoot, next);
  return next;
}

export async function loadSecrets(projectRoot: string): Promise<SecretStore> {
  const secretsPath = workspacePaths(projectRoot).secrets;
  if (!(await pathExists(secretsPath))) {
    return { schemaVersion: 1, providers: {} };
  }
  await verifySecretFilePermissions(secretsPath);
  return parseSecrets(JSON.parse(await readFile(secretsPath, "utf8")));
}

export async function writeProviderSecret(projectRoot: string, provider: ModelProviderKind, apiKey: string): Promise<SecretStore> {
  const secretsPath = workspacePaths(projectRoot).secrets;
  const current = await loadSecrets(projectRoot);
  const next: SecretStore = {
    schemaVersion: 1,
    providers: {
      ...current.providers,
      [provider]: { apiKey, updatedAt: new Date().toISOString() },
    },
  };
  await mkdir(path.dirname(secretsPath), { recursive: true });
  await writeFile(secretsPath, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return next;
}

export async function removeProviderSecret(projectRoot: string, provider: ModelProviderKind): Promise<SecretStore> {
  const secretsPath = workspacePaths(projectRoot).secrets;
  const current = await loadSecrets(projectRoot);
  const providers = { ...current.providers };
  delete providers[provider];
  const next: SecretStore = { schemaVersion: 1, providers };
  await mkdir(path.dirname(secretsPath), { recursive: true });
  await writeFile(secretsPath, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return next;
}

export async function getProviderApiKey(projectRoot: string | null, provider: ModelProviderKind, apiKeyEnv: string | null): Promise<string | null> {
  if (apiKeyEnv && process.env[apiKeyEnv]) {
    return process.env[apiKeyEnv]!;
  }
  if (!projectRoot) {
    return null;
  }
  const secrets = await loadSecrets(projectRoot);
  return secrets.providers[provider]?.apiKey ?? null;
}

export function redactSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function parseSettings(value: unknown): UserSettings {
  const root = asObject(value, "user settings");
  return {
    schemaVersion: asLiteral(root.schemaVersion, 1, "user settings schemaVersion"),
    defaultMode: asOneOf(root.defaultMode, ["plan", "build"], "user settings defaultMode"),
    approvalMode: asOneOf(root.approvalMode, ["preview", "auto-apply"], "user settings approvalMode"),
    preferredProvider: root.preferredProvider === null || root.preferredProvider === undefined ? null : parseProvider(root.preferredProvider, "user settings preferredProvider"),
    showDiffs: asOneOf(root.showDiffs, ["compact", "full"], "user settings showDiffs"),
  };
}

async function verifySecretFilePermissions(filePath: string): Promise<void> {
  const { stat, constants } = await import("node:fs/promises");
  try {
    const stats = await stat(filePath);
    const mode = stats.mode & 0o777;
    if (mode > 0o600) {
      console.warn(
        `Warning: ${filePath} has permissions ${mode.toString(8)}. ` +
        `Secrets should be mode 600 (current: ${mode.toString(8)}). ` +
        `Fix with: chmod 600 ${filePath}`,
      );
    }
  } catch {
    // stat failed — file may have been deleted between existence check and stat
  }
}

function parseProvider(value: unknown, label: string): ModelProviderKind {
  return asOneOf(value, ["openai", "anthropic", "ollama", "lmstudio", "openai-compatible"] as const, label);
}

function parseSecrets(value: unknown): SecretStore {
  const root = asObject(value, "secrets");
  const providers = asObject(root.providers, "secrets providers");
  const parsed: SecretStore["providers"] = {};

  for (const provider of ["openai", "anthropic", "ollama", "lmstudio", "openai-compatible"] as const) {
    if (!providers[provider]) continue;
    const entry = asObject(providers[provider], `secrets provider ${provider}`);
    parsed[provider] = {
      apiKey: asString(entry.apiKey, `secrets provider ${provider} apiKey`),
      updatedAt: asNullableString(entry.updatedAt, `secrets provider ${provider} updatedAt`) ?? "",
    };
  }

  return {
    schemaVersion: asLiteral(root.schemaVersion, 1, "secrets schemaVersion"),
    providers: parsed,
  };
}
