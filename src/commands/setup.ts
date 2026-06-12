import type { Interface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { findGodotProjectRoot } from "../core/godot-project.js";
import { chooseMenuOption, withMenu } from "../core/menu.js";
import { writeModelConfig, type ModelConfig, type ModelProviderKind } from "../core/providers.js";
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
        { value: "model", label: "Model provider", description: "Ollama, LM Studio, cloud API" },
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
      ? ["flatpak", "run", (await rl.question("Flatpak app id (org.godotengine.Godot) ▸ ")).trim() || "org.godotengine.Godot"]
      : choice === "custom"
        ? (await rl.question("Command ▸ ")).trim().split(/\s+/).filter(Boolean)
        : [choice];
  if (command.length === 0) return;
  await writeRuntimeOverride(projectRoot, command);
  console.log(`Saved runtime: ${command.join(" ")}`);
}

async function setupModel(rl: Interface, projectRoot: string): Promise<void> {
  const provider = (await chooseMenuOption(rl, "Provider", [
    { value: "ollama", label: "Ollama", description: "local" },
    { value: "lmstudio", label: "LM Studio", description: "local" },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "openai-compatible", label: "OpenAI-compatible" },
  ])) as ModelProviderKind | null;
  if (!provider) return;
  const model = (await rl.question("Model name ▸ ")).trim();
  if (!model) return;
  const defaultUrl = provider === "ollama" ? "http://127.0.0.1:11434" : provider === "lmstudio" ? "http://127.0.0.1:1234/v1" : provider === "openai" ? "https://api.openai.com/v1" : provider === "anthropic" ? "https://api.anthropic.com/v1" : null;
  const baseUrl = (await rl.question(`Base URL (${defaultUrl ?? "required"}) ▸ `)).trim() || defaultUrl;
  const apiKeyEnv = provider === "openai" ? "OPENAI_API_KEY" : provider === "anthropic" ? "ANTHROPIC_API_KEY" : null;
  const config: ModelConfig = { schemaVersion: 1, provider, model, baseUrl, apiKeyEnv };
  await writeModelConfig(projectRoot, config);
  console.log(`Saved model: ${provider}:${model}`);
}

async function setupAuth(rl: Interface, projectRoot: string): Promise<void> {
  const provider = (await chooseMenuOption(rl, "Provider", [
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "openai-compatible", label: "OpenAI-compatible" },
  ])) as ModelProviderKind | null;
  if (!provider) return;
  const apiKey = (await rl.question("API key ▸ ")).trim();
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
