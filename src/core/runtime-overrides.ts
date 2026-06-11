import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import { workspacePaths } from "./workspace.js";

export interface RuntimeOverride {
  schemaVersion: 1;
  installType: "native" | "flatpak" | "custom";
  command: string[];
  label: string | null;
  flatpakAppId: string | null;
}

export async function loadRuntimeOverride(projectRoot: string): Promise<RuntimeOverride | null> {
  const overridePath = workspacePaths(projectRoot).runtimeOverride;
  if (!(await pathExists(overridePath))) {
    return null;
  }

  const parsed = JSON.parse(await readFile(overridePath, "utf8")) as Partial<RuntimeOverride>;
  if (parsed.schemaVersion !== 1) {
    throw new CliError("RUNTIME_OVERRIDE_INVALID", "Runtime override schemaVersion must be 1.");
  }
  if (parsed.installType !== "native" && parsed.installType !== "flatpak" && parsed.installType !== "custom") {
    throw new CliError("RUNTIME_OVERRIDE_INVALID", "Runtime override installType must be native, flatpak, or custom.");
  }
  if (!Array.isArray(parsed.command) || parsed.command.length === 0 || parsed.command.some((part) => typeof part !== "string" || !part.trim())) {
    throw new CliError("RUNTIME_OVERRIDE_INVALID", "Runtime override command must be a non-empty string array.");
  }

  return {
    schemaVersion: 1,
    installType: parsed.installType,
    command: parsed.command,
    label: typeof parsed.label === "string" ? parsed.label : null,
    flatpakAppId: typeof parsed.flatpakAppId === "string" ? parsed.flatpakAppId : null,
  };
}

export async function writeRuntimeOverride(projectRoot: string, command: string[], label?: string | null): Promise<RuntimeOverride> {
  if (command.length === 0) {
    throw new CliError("RUNTIME_COMMAND_REQUIRED", "Usage: godotcoder runtime use <godot command>");
  }

  const override = createRuntimeOverride(command, label);
  const paths = workspacePaths(projectRoot);
  await mkdir(path.dirname(paths.runtimeOverride), { recursive: true });
  await writeFile(paths.runtimeOverride, JSON.stringify(override, null, 2) + "\n");
  await writeRuntimeOverrideExample(projectRoot);
  return override;
}

export async function writeRuntimeOverrideExample(projectRoot: string): Promise<void> {
  const paths = workspacePaths(projectRoot);
  const example: RuntimeOverride = {
    schemaVersion: 1,
    installType: "flatpak",
    command: ["flatpak", "run", "org.godotengine.Godot"],
    label: "Godot Flatpak",
    flatpakAppId: "org.godotengine.Godot",
  };

  await mkdir(path.dirname(paths.runtimeOverrideExample), { recursive: true });
  await writeFile(paths.runtimeOverrideExample, JSON.stringify(example, null, 2) + "\n", { flag: "w" });
}

function createRuntimeOverride(command: string[], label?: string | null): RuntimeOverride {
  const flatpakRunIndex = command[0] === "flatpak" && command[1] === "run" ? 2 : -1;
  const flatpakAppId = flatpakRunIndex >= 0 ? command[flatpakRunIndex] ?? null : null;
  const binary = command[0] ?? "";
  const installType = flatpakAppId ? "flatpak" : /godot/i.test(path.basename(binary)) ? "native" : "custom";

  return {
    schemaVersion: 1,
    installType,
    command,
    label: label ?? null,
    flatpakAppId,
  };
}
