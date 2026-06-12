import readline from "node:readline/promises";
import type { Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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
  if (!subcommand && input.isTTY && !args.includes("--json")) {
    await openSettingsMenu();
    return;
  }
  await showSettings(args);
}

async function openSettingsMenu(): Promise<void> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const settings = await loadSettings(projectRoot);
      console.log("");
      console.log("GodotCoder settings");
      console.log(`1. Default mode        ${settings.defaultMode}`);
      console.log(`2. Approval mode       ${settings.approvalMode}`);
      console.log(`3. Preferred provider  ${settings.preferredProvider ?? "none"}`);
      console.log(`4. Diff display        ${settings.showDiffs}`);
      console.log("5. Show config paths");
      console.log("0. Back");

      const choice = (await rl.question("Choose setting ▸ ")).trim();
      if (choice === "0" || choice.toLowerCase() === "q" || choice.toLowerCase() === "back") {
        return;
      }
      if (choice === "1") {
        await chooseValue(rl, projectRoot, "defaultMode", [
          ["plan", "Open in planning mode"],
          ["build", "Open in build mode"],
        ]);
      } else if (choice === "2") {
        await chooseValue(rl, projectRoot, "approvalMode", [
          ["preview", "Preview before apply"],
          ["auto-apply", "Apply without preview gate"],
        ]);
      } else if (choice === "3") {
        await chooseValue(rl, projectRoot, "preferredProvider", [
          ["openai", "OpenAI API"],
          ["anthropic", "Anthropic API"],
          ["ollama", "Ollama local"],
          ["lmstudio", "LM Studio local"],
          ["openai-compatible", "Custom OpenAI-compatible API"],
        ]);
      } else if (choice === "4") {
        await chooseValue(rl, projectRoot, "showDiffs", [
          ["compact", "Compact diffs"],
          ["full", "Full diffs"],
        ]);
      } else if (choice === "5") {
        const paths = workspacePaths(projectRoot);
        console.log(`Settings: ${paths.userSettings}`);
        console.log(`Secrets: ${paths.secrets}`);
        console.log(`Model config: ${paths.modelConfig}`);
        console.log(`Runtime override: ${paths.runtimeOverride}`);
      } else {
        console.log("Unknown choice.");
      }
    }
  } finally {
    rl.close();
  }
}

async function chooseValue(rl: Interface, projectRoot: string, key: string, options: Array<[string, string]>): Promise<void> {
  for (let index = 0; index < options.length; index += 1) {
    const [value, label] = options[index]!;
    console.log(`${index + 1}. ${value.padEnd(18)} ${label}`);
  }
  const choice = (await rl.question("Choose value ▸ ")).trim();
  const selected = options[Number(choice) - 1]?.[0] ?? options.find(([value]) => value === choice)?.[0];
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
  console.log("  godotcoder settings provider openai|anthropic|ollama|lmstudio|openai-compatible");
  console.log("  godotcoder settings diffs compact|full");
  console.log("  godotcoder settings set <defaultMode|approvalMode|preferredProvider|showDiffs> <value>");
}
