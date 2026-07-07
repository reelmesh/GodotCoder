import type { Interface } from "node:readline/promises";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { findGodotProjectRoot } from "../core/godot-project-indexer.js";
import { pathExists } from "../core/files.js";
import { askMenuQuestion, chooseMenuOption, withMenu } from "../core/menu.js";
import { loadModelConfigForRole, writeModelConfig, type ModelConfig, type ModelProviderKind } from "../core/providers.js";
import { defaultApiKeyEnv, defaultBaseUrl } from "../core/flags.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { loadRuntimeProfile } from "../core/runtime-profile.js";
import { writeRuntimeOverride } from "../core/runtime-overrides.js";
import { getProviderApiKey, loadSettings, setSetting, writeProviderSecret } from "../core/settings.js";
import { workspacePaths } from "../core/workspace.js";
import { validateProjectRoot } from "./validate.js";

export interface SetupChecklist {
  projectRoot: string;
  workspace: ChecklistItem;
  runtime: ChecklistItem;
  model: ChecklistItem;
  auth: ChecklistItem;
  validation: ChecklistItem;
  ready: boolean;
  next: string;
}

interface ChecklistItem {
  ok: boolean;
  label: string;
  detail: string;
}

export async function setupCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  if (json) {
    const projectRoot = await findGodotProjectRoot(process.cwd());
    const paths = workspacePaths(projectRoot);
    const runtime = await discoverRuntime(projectRoot);
    const settings = await loadSettings(projectRoot);
    const checklist = await setupStatus(projectRoot);
    console.log(JSON.stringify({ ok: true, setup: { projectRoot, runtime, settings, checklist, paths: { localRoot: paths.localRoot } } }, null, 2));
    return;
  }

  await openSetupMenu();
}

async function openSetupMenu(): Promise<void> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  await withMenu(async (rl) => {
    while (true) {
      console.log("");
      const checklist = await setupStatus(projectRoot);
      printChecklist(checklist);
      const choice = await chooseMenuOption(rl, "Setup area", [
        { value: "workspace", label: statusLabel(checklist.workspace, "Workspace"), description: checklist.workspace.detail },
        { value: "runtime", label: "Godot runtime", description: "native, Flatpak, custom" },
        { value: "model", label: "Model provider", description: "Ollama, LM Studio, OpenRouter, cloud API" },
        { value: "auth", label: "Auth", description: "save/remove API key" },
        { value: "validate", label: statusLabel(checklist.validation, "First validation"), description: checklist.validation.detail },
        { value: "settings", label: "Preferences", description: "mode, approval, diffs" },
        { value: "doctor", label: "Status summary" },
      ]);
      if (!choice) return;
      if (choice === "workspace") await setupWorkspace(projectRoot);
      if (choice === "runtime") await setupRuntime(rl, projectRoot);
      if (choice === "model") await setupModel(rl, projectRoot);
      if (choice === "auth") await setupAuth(rl, projectRoot);
      if (choice === "validate") await runFirstValidation(projectRoot);
      if (choice === "settings") await setupPreference(rl, projectRoot);
      if (choice === "doctor") await printSetupSummary(projectRoot);
    }
  });
}

export async function setupStatus(projectRoot: string): Promise<SetupChecklist> {
  const paths = workspacePaths(projectRoot);
  const [workspaceReady, runtimeProfile, modelSelection, validationReady] = await Promise.all([
    pathExists(paths.workspaceRoot),
    loadRuntimeProfile(paths.runtimeProfile),
    loadModelConfigForRole(projectRoot, "build"),
    hasValidation(paths.validationsDir),
  ]);

  const model = modelSelection.config;
  const authOk = model ? await hasRequiredAuth(projectRoot, model) : false;
  const authRequired = model ? requiresAuth(model) : false;
  const checklist: SetupChecklist = {
    projectRoot,
    workspace: {
      ok: workspaceReady,
      label: "Workspace",
      detail: workspaceReady ? ".godotcoder exists" : "create .godotcoder workspace files",
    },
    runtime: {
      ok: Boolean(runtimeProfile?.supported && runtimeProfile.executable),
      label: "Godot runtime",
      detail: runtimeProfile?.executable
        ? `${runtimeProfile.executable.join(" ")} (${runtimeProfile.detectedGodotVersion ?? "version unknown"})`
        : "choose or detect Godot",
    },
    model: {
      ok: Boolean(model),
      label: "Build model",
      detail: model ? `${model.provider}:${model.model} [${modelSelection.source}]` : "configure a model provider",
    },
    auth: {
      ok: !authRequired || authOk,
      label: "Auth",
      detail: !model ? "configure model first" : authRequired ? (authOk ? "API key available" : `missing ${model.apiKeyEnv ?? "API key"}`) : "not required",
    },
    validation: {
      ok: validationReady,
      label: "First validation",
      detail: validationReady ? "validation report exists" : "run Godot validation",
    },
    ready: false,
    next: "",
  };
  checklist.ready = checklist.workspace.ok && checklist.runtime.ok && checklist.model.ok && checklist.auth.ok && checklist.validation.ok;
  checklist.next = nextSetupStep(checklist);
  return checklist;
}

function printChecklist(checklist: SetupChecklist): void {
  console.log("GodotCoder setup");
  for (const item of [checklist.workspace, checklist.runtime, checklist.model, checklist.auth, checklist.validation]) {
    console.log(`${item.ok ? "[x]" : "[ ]"} ${item.label}: ${item.detail}`);
  }
  console.log(`Next: ${checklist.next}`);
}

async function setupWorkspace(projectRoot: string): Promise<void> {
  const paths = workspacePaths(projectRoot);
  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(paths.localRoot, { recursive: true });
  await mkdir(paths.validationsDir, { recursive: true });
  console.log(`Workspace ready: ${paths.workspaceRoot}`);
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

async function runFirstValidation(projectRoot: string): Promise<void> {
  const { report, reportPath } = await validateProjectRoot(projectRoot);
  console.log(`Validation: ${report.summary.errors} errors, ${report.summary.warnings} warnings`);
  console.log(`Report: ${reportPath}`);
}

async function hasValidation(validationsDir: string): Promise<boolean> {
  try {
    const entries = await readdir(validationsDir);
    return entries.some((entry) => entry.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function hasRequiredAuth(projectRoot: string, model: ModelConfig): Promise<boolean> {
  if (!requiresAuth(model)) return true;
  return Boolean(await getProviderApiKey(projectRoot, model.provider, model.apiKeyEnv));
}

function requiresAuth(model: ModelConfig): boolean {
  return model.provider === "openai" || model.provider === "anthropic" || model.provider === "openrouter" || (model.provider === "openai-compatible" && Boolean(model.apiKeyEnv));
}

function nextSetupStep(checklist: SetupChecklist): string {
  if (!checklist.workspace.ok) return "Create workspace.";
  if (!checklist.runtime.ok) return "Configure Godot runtime.";
  if (!checklist.model.ok) return "Configure model provider.";
  if (!checklist.auth.ok) return "Save API key.";
  if (!checklist.validation.ok) return "Run first validation.";
  return "Ready.";
}

function statusLabel(item: ChecklistItem, label: string): string {
  return `${item.ok ? "Done" : "Set up"}: ${label}`;
}
