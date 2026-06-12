import type { Interface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { findGodotProjectRoot, inspectGodotProject } from "../core/godot-project.js";
import { chooseMenuOption, withMenu } from "../core/menu.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { writeRuntimeOverride } from "../core/runtime-overrides.js";
import { createRuntimeProfile } from "../core/runtime-profile.js";
import { workspacePaths } from "../core/workspace.js";

export async function runtimeCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "doctor") {
    await runtimeDoctor(rest);
    return;
  }
  if (subcommand === "use") {
    await runtimeUse(rest);
    return;
  }
  if (!subcommand && process.stdin.isTTY && !args.includes("--json")) {
    await openRuntimeMenu();
    return;
  }

  console.log("Usage: godotcoder runtime doctor [--json] | godotcoder runtime use <godot command>");
}

async function openRuntimeMenu(): Promise<void> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  await withMenu(async (rl) => {
    while (true) {
      console.log("");
      await runtimeDoctor([]);
      const choice = await chooseMenuOption(rl, "Runtime action", [
        { value: "native", label: "Use native Godot", description: "godot or godot4" },
        { value: "flatpak", label: "Use Flatpak Godot", description: "flatpak run <app-id>" },
        { value: "custom", label: "Use custom command" },
        { value: "doctor", label: "Run doctor again" },
      ]);
      if (!choice) return;
      if (choice === "native") {
        await setRuntimeFromMenu(rl, projectRoot, ["godot"]);
      } else if (choice === "flatpak") {
        const appId = (await rl.question("Flatpak app id (org.godotengine.Godot) ▸ ")).trim() || "org.godotengine.Godot";
        await setRuntimeFromMenu(rl, projectRoot, ["flatpak", "run", appId]);
      } else if (choice === "custom") {
        const command = (await rl.question("Command ▸ ")).trim().split(/\s+/).filter(Boolean);
        if (command.length > 0) {
          await setRuntimeFromMenu(rl, projectRoot, command);
        }
      }
    }
  });
}

async function setRuntimeFromMenu(_rl: Interface, projectRoot: string, command: string[]): Promise<void> {
  await writeRuntimeOverride(projectRoot, command);
  const discovery = await discoverRuntime(projectRoot);
  const projectIndex = await inspectGodotProject(projectRoot);
  const paths = workspacePaths(projectRoot);
  const profile = createRuntimeProfile(projectRoot, discovery, projectIndex);
  await mkdir(paths.workspaceRoot, { recursive: true });
  await writeFile(paths.runtimeProfile, JSON.stringify(profile, null, 2) + "\n");
  console.log(`Saved runtime: ${command.join(" ")}`);
  console.log(`Version: ${profile.detectedGodotVersion ?? "not detected"}`);
}

export async function runtimeDoctor(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const discovery = await discoverRuntime(projectRoot);
  const projectIndex = await inspectGodotProject(projectRoot);
  const profile = createRuntimeProfile(projectRoot, discovery, projectIndex);

  await mkdir(paths.workspaceRoot, { recursive: true });
  await writeFile(paths.runtimeProfile, JSON.stringify(profile, null, 2) + "\n");

  if (json) {
    console.log(JSON.stringify({ ok: true, runtime: profile, diagnostics: discovery.diagnostics }, null, 2));
    return;
  }

  console.log("Godot runtime doctor");
  console.log(`Install type: ${profile.installType}`);
  console.log(`Version: ${profile.detectedGodotVersion ?? "not detected"}`);
  console.log(`Executable: ${profile.executable?.join(" ") ?? "not detected"}`);
  if (profile.label) {
    console.log(`Label: ${profile.label}`);
  }
  if (profile.flatpak.appId) {
    console.log(`Flatpak app: ${profile.flatpak.appId}${profile.flatpak.branch ? ` (${profile.flatpak.branch})` : ""}`);
  }
  for (const diagnostic of discovery.diagnostics) {
    console.log(`${diagnostic.severity.toUpperCase()}: ${diagnostic.message}`);
  }
}

async function runtimeUse(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const command = args.filter((arg) => arg !== "--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const override = await writeRuntimeOverride(projectRoot, command);
  const discovery = await discoverRuntime(projectRoot);
  const projectIndex = await inspectGodotProject(projectRoot);
  const paths = workspacePaths(projectRoot);
  const profile = createRuntimeProfile(projectRoot, discovery, projectIndex);

  await mkdir(paths.workspaceRoot, { recursive: true });
  await writeFile(paths.runtimeProfile, JSON.stringify(profile, null, 2) + "\n");

  if (json) {
    console.log(JSON.stringify({ ok: true, override, runtime: profile, diagnostics: discovery.diagnostics }, null, 2));
    return;
  }

  console.log(`Saved Godot runtime override: ${override.command.join(" ")}`);
  console.log(`Install type: ${override.installType}`);
  console.log(`Version: ${profile.detectedGodotVersion ?? "not detected"}`);
}
