import { findGodotProjectRoot, tryFindGodotProjectRoot } from "../core/godot-project.js";
import { loadModelConfig } from "../core/providers.js";
import { loadSettings, setSetting, writeSettings, defaultSettings } from "../core/settings.js";
import { workspacePaths } from "../core/workspace.js";

export async function settingsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "set") {
    await setSettingsValue(rest);
    return;
  }
  if (subcommand === "default-mode") {
    await setNamedSetting("defaultMode", rest);
    return;
  }
  if (subcommand === "approval-mode") {
    await setNamedSetting("approvalMode", rest);
    return;
  }
  if (subcommand === "provider") {
    await setNamedSetting("preferredProvider", rest);
    return;
  }
  if (subcommand === "diffs") {
    await setNamedSetting("showDiffs", rest);
    return;
  }
  if (subcommand === "init") {
    await initSettings(args);
    return;
  }
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printSettingsHelp();
    return;
  }
  await showSettings(args);
}

async function showSettings(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  const settings = await loadSettings(projectRoot);
  const modelConfig = await loadModelConfig(projectRoot);
  const paths = workspacePaths(projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: true, settings, modelConfig, paths: { userSettings: paths.userSettings, modelConfig: paths.modelConfig, secrets: paths.secrets } }, null, 2));
    return;
  }

  console.log("GodotCoder settings");
  console.log(`Default mode: ${settings.defaultMode}`);
  console.log(`Approval mode: ${settings.approvalMode}`);
  console.log(`Preferred provider: ${settings.preferredProvider ?? "none"}`);
  console.log(`Show diffs: ${settings.showDiffs}`);
  console.log(`Model: ${modelConfig ? `${modelConfig.provider}:${modelConfig.model}` : "not configured"}`);
  console.log(`Settings file: ${paths.userSettings}`);
  console.log("");
  printSettingsHelp();
}

async function setSettingsValue(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const clean = args.filter((arg) => arg !== "--json");
  const [key, value] = clean;
  if (!key || !value) {
    console.log("Usage: godotcoder settings set <defaultMode|approvalMode|preferredProvider|showDiffs> <value>");
    return;
  }

  const projectRoot = await findGodotProjectRoot(process.cwd());
  const settings = await setSetting(projectRoot, key, value);
  if (json) {
    console.log(JSON.stringify({ ok: true, settings }, null, 2));
    return;
  }
  console.log(`Saved setting: ${key}=${value}`);
}

async function setNamedSetting(key: string, args: string[]): Promise<void> {
  const json = args.includes("--json");
  const value = args.find((arg) => arg !== "--json");
  if (!value) {
    printSettingsHelp();
    return;
  }

  const projectRoot = await findGodotProjectRoot(process.cwd());
  const settings = await setSetting(projectRoot, key, value);
  if (json) {
    console.log(JSON.stringify({ ok: true, settings }, null, 2));
    return;
  }
  console.log(`Saved setting: ${key}=${value}`);
}

async function initSettings(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const settings = defaultSettings();
  await writeSettings(projectRoot, settings);
  if (json) {
    console.log(JSON.stringify({ ok: true, settings }, null, 2));
    return;
  }
  console.log("Created .godotcoder.local/user-settings.json");
}

function printSettingsHelp(): void {
  console.log("Settings commands");
  console.log("  godotcoder settings default-mode plan|build");
  console.log("  godotcoder settings approval-mode preview|auto-apply");
  console.log("  godotcoder settings provider openai|anthropic|ollama|lmstudio|openai-compatible");
  console.log("  godotcoder settings diffs compact|full");
  console.log("  godotcoder settings set <defaultMode|approvalMode|preferredProvider|showDiffs> <value>");
}
