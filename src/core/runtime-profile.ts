import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeDiscovery } from "./runtime-discovery.js";

export interface RuntimeProfile {
  schemaVersion: 1;
  projectRoot: string;
  godotProjectFile: string;
  targetGodotMajor: 4;
  detectedGodotVersion: string | null;
  installType: "unknown" | "flatpak" | "native" | "custom";
  executable: string[] | null;
  flatpak: {
    appId: string | null;
    branch: string | null;
    availableAppIds: string[];
  };
  project: {
    configVersion: number | null;
    features: string[];
    mainScene: string | null;
    autoloads: string[];
    enabledPlugins: string[];
    exportPresets: string[];
  };
  paths: {
    userData: string | null;
    logs: string | null;
    exportTemplates: string | null;
  };
  validation: {
    supportedCommands: string[];
    lastValidationId: string | null;
  };
  updatedAt: string;
}

export function createRuntimeProfile(projectRoot: string, discovery?: RuntimeDiscovery): RuntimeProfile {
  return {
    schemaVersion: 1,
    projectRoot,
    godotProjectFile: path.join(projectRoot, "project.godot"),
    targetGodotMajor: 4,
    detectedGodotVersion: discovery?.version ?? null,
    installType: discovery?.installType ?? "unknown",
    executable: discovery?.command ?? null,
    flatpak: {
      appId: discovery?.flatpakAppId ?? null,
      branch: discovery?.flatpakBranch ?? null,
      availableAppIds: discovery?.availableFlatpakAppIds ?? [],
    },
    project: {
      configVersion: null,
      features: [],
      mainScene: null,
      autoloads: [],
      enabledPlugins: [],
      exportPresets: [],
    },
    paths: {
      userData: null,
      logs: null,
      exportTemplates: null,
    },
    validation: {
      supportedCommands: discovery?.command ? ["version"] : [],
      lastValidationId: null,
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function loadRuntimeProfile(filePath: string): Promise<RuntimeProfile | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as RuntimeProfile;
  } catch {
    return null;
  }
}
