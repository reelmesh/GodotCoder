import type { Interface } from "node:readline/promises";
import { findGodotProjectRoot, tryFindGodotProjectRoot } from "../core/godot-project-indexer.js";
import { chooseMenuOption, withMenu } from "../core/menu.js";
import { loadModelConfig } from "../core/providers.js";
import { loadSettings, setSetting, writeSettings, defaultSettings } from "../core/settings.js";
import { workspacePaths } from "../core/workspace.js";

export async function settingsCommand(args: string[]): Promise<void> {
  const embedded = args.includes("--embedded");
  const [subcommand, ...rest] = args.filter((arg) => arg !== "--embedded");
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
  if (!subcommand && !args.includes("--json")) {
    const exitedToShell = await openSettingsMenu();
    if (exitedToShell && !embedded) {
      const { startSession } = await import("./session.js");
      await startSession();
    }
    return;
  }
  await showSettings(args);
}

async function openSettingsMenu(): Promise<boolean> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  await withMenu(async (rl) => {
    while (true) {
      const settings = await loadSettings(projectRoot);
      console.log("");
      console.log("GodotCoder settings");
      const choice = await chooseMenuOption(rl, "Choose setting", [
        { value: "defaultMode", label: "Default mode", description: settings.defaultMode },
        { value: "approvalMode", label: "Approval mode", description: settings.approvalMode },
        { value: "preferredProvider", label: "Preferred provider", description: settings.preferredProvider ?? "none" },
        { value: "showDiffs", label: "Diff display", description: settings.showDiffs },
        { value: "paths", label: "Show config paths" },
      ]);
      if (!choice) return;

      if (choice === "defaultMode") {
        await chooseValue(rl, projectRoot, "defaultMode", [
          ["plan", "Open in planning mode"],
          ["build", "Open in build mode"],
        ]);
      } else if (choice === "approvalMode") {
        await chooseValue(rl, projectRoot, "approvalMode", [
          ["preview", "Preview before apply"],
          ["auto-apply", "Apply without preview gate"],
        ]);
      } else if (choice === "preferredProvider") {
        await chooseValue(rl, projectRoot, "preferredProvider", [
          ["openai", "OpenAI API"],
          ["anthropic", "Anthropic API"],
          ["ollama", "Ollama local"],
          ["lmstudio", "LM Studio local"],
          ["openrouter", "OpenRouter API"],
          ["openai-compatible", "Custom OpenAI-compatible API"],
        ]);
      } else if (choice === "showDiffs") {
        await chooseValue(rl, projectRoot, "showDiffs", [
          ["compact", "Compact diffs"],
          ["full", "Full diffs"],
        ]);
      } else if (choice === "paths") {
        const paths = workspacePaths(projectRoot);
        console.log(`Settings: ${paths.userSettings}`);
        console.log(`Secrets: ${paths.secrets}`);
        console.log(`Model config: ${paths.modelConfig}`);
        console.log(`Runtime override: ${paths.runtimeOverride}`);
      }
    }
  });
  return true;
}

async function chooseValue(rl: Interface, projectRoot: string, key: string, options: Array<[string, string]>): Promise<void> {
  const choice = await chooseMenuOption(
    rl,
    "Choose value",
    options.map(([value, label]) => ({ value, label })),
  );
  const selected = choice;
  if (!selected) {
    console.log("No change.");
    return;
  }

  await setSetting(projectRoot, key, selected);
  console.log(`Saved ${key}=${selected}`);
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
  console.log("  godotcoder settings provider openai|anthropic|ollama|lmstudio|openrouter|openai-compatible");
  console.log("  godotcoder settings diffs compact|full");
  console.log("  godotcoder settings set <defaultMode|approvalMode|preferredProvider|showDiffs> <value>");
}
