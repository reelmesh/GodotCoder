import { runProcess } from "./process.js";
import { loadRuntimeOverride } from "./runtime-overrides.js";

export interface Diagnostic {
  severity: "info" | "warning" | "error";
  message: string;
}

export interface RuntimeDiscovery {
  installType: "unknown" | "flatpak" | "native" | "custom";
  command: string[] | null;
  version: string | null;
  flatpakAppId: string | null;
  flatpakBranch: string | null;
  overrideLabel: string | null;
  availableFlatpakAppIds: string[];
  diagnostics: Diagnostic[];
}

export async function discoverRuntime(projectRoot?: string): Promise<RuntimeDiscovery> {
  const diagnostics: Diagnostic[] = [];
  const flatpakApps = await discoverFlatpakApps();
  const availableFlatpakAppIds = flatpakApps.map((app) => app.application);

  if (projectRoot) {
    const override = await loadRuntimeOverride(projectRoot);
    if (override) {
      const version = await readGodotVersion([...override.command, "--version"]);
      diagnostics.push({
        severity: version ? "info" : "error",
        message: version
          ? `Using local Godot runtime override: ${override.command.join(" ")}.`
          : `Runtime override did not return a Godot version: ${override.command.join(" ")}.`,
      });

      return {
        installType: override.installType,
        command: override.command,
        version,
        flatpakAppId: override.flatpakAppId,
        flatpakBranch: flatpakApps.find((app) => app.application === override.flatpakAppId)?.branch ?? null,
        overrideLabel: override.label,
        availableFlatpakAppIds,
        diagnostics,
      };
    }
  }

  for (const binary of ["godot4", "godot"]) {
    const version = await readGodotVersion([binary, "--version"]);
    if (version) {
      if (!flatpakApps.some((app) => /godot/i.test(`${app.application} ${app.name}`))) {
        diagnostics.push({
          severity: "info",
          message: "No Godot Flatpak app was found in `flatpak list --app`; using native Godot.",
        });
      }

      return {
        installType: "native",
        command: [binary],
        version,
        flatpakAppId: null,
        flatpakBranch: null,
        overrideLabel: null,
        availableFlatpakAppIds,
        diagnostics,
      };
    }
  }

  const godotFlatpak = flatpakApps.find((app) => /godot/i.test(`${app.application} ${app.name}`));
  if (godotFlatpak) {
    const command = ["flatpak", "run", godotFlatpak.application];
    const version = await readGodotVersion([...command, "--version"]);
    return {
      installType: "flatpak",
      command,
      version,
      flatpakAppId: godotFlatpak.application,
      flatpakBranch: godotFlatpak.branch,
      overrideLabel: null,
      availableFlatpakAppIds,
      diagnostics,
    };
  }

  diagnostics.push({
    severity: "warning",
    message: "No Godot Flatpak app was found in `flatpak list --app`.",
  });

  diagnostics.push({
    severity: "error",
    message: "No Godot runtime was detected. Configure a runtime override or install Godot 4.x.",
  });

  return {
    installType: "unknown",
    command: null,
    version: null,
    flatpakAppId: null,
    flatpakBranch: null,
    overrideLabel: null,
    availableFlatpakAppIds,
    diagnostics,
  };
}

async function discoverFlatpakApps(): Promise<Array<{ application: string; name: string; branch: string }>> {
  const result = await runProcess(["flatpak", "list", "--app", "--columns=application,name,branch"], { timeoutMs: 5000 });
  if (result.exitCode !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [application = "", name = "", branch = ""] = line.split("\t");
      return { application, name, branch };
    });
}

async function readGodotVersion(command: string[]): Promise<string | null> {
  const result = await runProcess(command, { timeoutMs: 5000 });
  if (result.exitCode !== 0 && !result.stdout && !result.stderr) {
    return null;
  }

  const output = `${result.stdout}\n${result.stderr}`.trim();
  const versionMatch = output.match(/\b(?:Godot Engine v)?([0-9]+\.[0-9][^\s]*)/i);
  return versionMatch?.[1] ?? null;
}
