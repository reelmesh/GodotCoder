import type { Interface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { findGodotProjectRoot } from "../core/godot-project.js";
import { askMenuQuestion, chooseMenuOption, withMenu } from "../core/menu.js";
import { writeModelConfig, type ModelConfig, type ModelProviderKind } from "../core/providers.js";
import { defaultApiKeyEnv, defaultBaseUrl } from "../core/flags.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { writeRuntimeOverride } from "../core/runtime-overrides.js";
import { loadSettings, setSetting, writeProviderSecret } from "../core/settings.js";
import { workspacePaths } from "../core/workspace.js";

export async function setupCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  if (json) {
    const projectRoot = await findGodotProjectRoot(process.cwd());
    const paths = workspacePaths(projectRoot);
    const runtime = await discoverRuntime(projectRoot);
    const settings = await loadSettings(projectRoot);
    console.log(JSON.stringify({ ok: true, setup: { projectRoot, runtime, settings, paths: { localRoot: paths.localRoot } } }, null, 2));
    return;
  }

  await openSetupMenu();
}

async function openSetupMenu(): Promise<void> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  await withMenu(async (rl) => {
    while (true) {
      console.log("");
      console.log("GodotCoder setup");
      const choice = await chooseMenuOption(rl, "Setup area", [
        { value: "runtime", label: "Godot runtime", description: "native, Flatpak, custom" },
        { value: "model", label: "Model provider", description: "Ollama, LM Studio, OpenRouter, cloud API" },
        { value: "auth", label: "Auth", description: "save/remove API key" },
        { value: "settings", label: "Preferences", description: "mode, approval, diffs" },
        { value: "doctor", label: "Status summary" },
      ]);
      if (!choice) return;
      if (choice === "runtime") await setupRuntime(rl, projectRoot);
      if (choice === "model") await setupModel(rl, projectRoot);
      if (choice === "auth") await setupAuth(rl, projectRoot);
      if (choice === "settings") await setupPreference(rl, projectRoot);
      if (choice === "doctor") await printSetupSummary(projectRoot);
    }
  });
}

async function setupRuntime(rl: Interface, projectRoot: string): Promise<void> {
  const choice = await chooseMenuOption(rl, "Runtime", [
    { value: "godot", label: "Native Godot", description: "godot" },
    { value: "godot4", label: "Native Godot 4", description: "godot4" },
    { value: "flatpak", label: "Flatpak", description: "flatpak run org.godotengine.Godot" },
    { value: "custom", label: "Custom command" },
  ]);
  if (!choice) return;
  const command =
    choice === "flatpak"
      ? ["flatpak", "run", (await askMenuQuestion(rl, "Flatpak app id (org.godotengine.Godot) ▸ ")).trim() || "org.godotengine.Godot"]
      : choice === "custom"
        ? (await askMenuQuestion(rl, "Command ▸ ")).trim().split(/\s+/).filter(Boolean)
        : [choice];
  if (command.length === 0) return;
  await writeRuntimeOverride(projectRoot, command);
  console.log(`Saved runtime: ${command.join(" ")}`);
}

async function setupModel(rl: Interface, projectRoot: string): Promise<void> {
  const provider = (await chooseMenuOption(rl, "Provider", [
    { value: "ollama", label: "Ollama", description: "local" },
    { value: "lmstudio", label: "LM Studio", description: "local" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "openai-compatible", label: "OpenAI-compatible" },
  ])) as ModelProviderKind | null;
  if (!provider) return;
  const model = (await askMenuQuestion(rl, "Model name ▸ ")).trim();
  if (!model) return;
  const defaultUrl = defaultBaseUrl(provider);
  const baseUrl = (await askMenuQuestion(rl, `Base URL (${defaultUrl ?? "required"}) ▸ `)).trim() || defaultUrl;
  const apiKeyEnv = defaultApiKeyEnv(provider);
  const config: ModelConfig = { schemaVersion: 1, provider, model, baseUrl, apiKeyEnv };
  await writeModelConfig(projectRoot, config);
  console.log(`Saved model: ${provider}:${model}`);
}

async function setupAuth(rl: Interface, projectRoot: string): Promise<void> {
  const provider = (await chooseMenuOption(rl, "Provider", [
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "openai-compatible", label: "OpenAI-compatible" },
  ])) as ModelProviderKind | null;
  if (!provider) return;
  const apiKey = (await askMenuQuestion(rl, "API key ▸ ")).trim();
  if (!apiKey) return;
  await writeProviderSecret(projectRoot, provider, apiKey);
  console.log(`Saved auth for ${provider}.`);
}

async function setupPreference(rl: Interface, projectRoot: string): Promise<void> {
  const choice = await chooseMenuOption(rl, "Preference", [
    { value: "defaultMode", label: "Default mode" },
    { value: "approvalMode", label: "Approval mode" },
    { value: "showDiffs", label: "Diff display" },
  ]);
  if (!choice) return;
  const values =
    choice === "defaultMode"
      ? ["plan", "build"]
      : choice === "approvalMode"
        ? ["preview", "auto-apply"]
        : ["compact", "full"];
  const value = await chooseMenuOption(
    rl,
    "Value",
    values.map((item) => ({ value: item, label: item })),
  );
  if (!value) return;
  await setSetting(projectRoot, choice, value);
  console.log(`Saved ${choice}=${value}`);
}

async function printSetupSummary(projectRoot: string): Promise<void> {
  const paths = workspacePaths(projectRoot);
  const runtime = await discoverRuntime(projectRoot);
  const settings = await loadSettings(projectRoot);
  await mkdir(paths.localRoot, { recursive: true });
  await writeFile(paths.modelConfigExample, JSON.stringify({ provider: "ollama", model: "llama3.1", baseUrl: "http://127.0.0.1:11434" }, null, 2) + "\n");
  console.log(`Project: ${projectRoot}`);
  console.log(`Runtime: ${runtime.installType} ${runtime.version ?? "unknown"}`);
  console.log(`Default mode: ${settings.defaultMode}`);
  console.log(`Approval mode: ${settings.approvalMode}`);
  console.log(`Local config: ${paths.localRoot}`);
}
