import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectIndex } from "./godot-project-indexer.js";
import type { RuntimeDiscovery } from "./runtime-discovery.js";
import { MIN_GODOT_VERSION, isGodotVersionSupported } from "./godot-version.js";
import { asLiteral, asNullableNumber, asNullableString, asObject, asOneOf, asString, asStringArray } from "./schema.js";

export interface RuntimeProfile {
  schemaVersion: 1;
  projectRoot: string;
  godotProjectFile: string;
  targetGodotMajor: 4;
  detectedGodotVersion: string | null;
  minimumGodotVersion: typeof MIN_GODOT_VERSION;
  supported: boolean;
  installType: "unknown" | "flatpak" | "native" | "custom";
  label: string | null;
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

export function createRuntimeProfile(projectRoot: string, discovery?: RuntimeDiscovery, projectIndex?: ProjectIndex | null): RuntimeProfile {
  return {
    schemaVersion: 1,
    projectRoot,
    godotProjectFile: path.join(projectRoot, "project.godot"),
    targetGodotMajor: 4,
    detectedGodotVersion: discovery?.version ?? null,
    minimumGodotVersion: MIN_GODOT_VERSION,
    supported: isGodotVersionSupported(discovery?.version),
    installType: discovery?.installType ?? "unknown",
    label: discovery?.overrideLabel ?? null,
    executable: discovery?.command ?? null,
    flatpak: {
      appId: discovery?.flatpakAppId ?? null,
      branch: discovery?.flatpakBranch ?? null,
      availableAppIds: discovery?.availableFlatpakAppIds ?? [],
    },
    project: {
      configVersion: projectIndex?.godotVersionSignals.projectConfigVersion ?? null,
      features: projectIndex?.godotVersionSignals.featureTags ?? [],
      mainScene: projectIndex?.mainScene ?? null,
      autoloads: projectIndex?.autoloads ?? [],
      enabledPlugins: projectIndex?.plugins ?? [],
      exportPresets: projectIndex?.exports ?? [],
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
    return parseRuntimeProfile(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function parseRuntimeProfile(value: unknown): RuntimeProfile {
  const root = asObject(value, "runtime profile");
  const flatpak = asObject(root.flatpak, "runtime profile flatpak");
  const project = asObject(root.project, "runtime profile project");
  const paths = asObject(root.paths, "runtime profile paths");
  const validation = asObject(root.validation, "runtime profile validation");

  return {
    schemaVersion: asLiteral(root.schemaVersion, 1, "runtime profile schemaVersion"),
    projectRoot: asString(root.projectRoot, "runtime profile projectRoot"),
    godotProjectFile: asString(root.godotProjectFile, "runtime profile godotProjectFile"),
    targetGodotMajor: asLiteral(root.targetGodotMajor, 4, "runtime profile targetGodotMajor"),
    detectedGodotVersion: asNullableString(root.detectedGodotVersion, "runtime profile detectedGodotVersion"),
    minimumGodotVersion: root.minimumGodotVersion === undefined ? MIN_GODOT_VERSION : asLiteral(root.minimumGodotVersion, MIN_GODOT_VERSION, "runtime profile minimumGodotVersion"),
    supported: root.supported === undefined ? isGodotVersionSupported(asNullableString(root.detectedGodotVersion, "runtime profile detectedGodotVersion")) : Boolean(root.supported),
    installType: asOneOf(root.installType, ["unknown", "flatpak", "native", "custom"], "runtime profile installType"),
    label: asNullableString(root.label, "runtime profile label"),
    executable: root.executable === null || root.executable === undefined ? null : asStringArray(root.executable, "runtime profile executable"),
    flatpak: {
      appId: asNullableString(flatpak.appId, "runtime profile flatpak.appId"),
      branch: asNullableString(flatpak.branch, "runtime profile flatpak.branch"),
      availableAppIds: asStringArray(flatpak.availableAppIds, "runtime profile flatpak.availableAppIds"),
    },
    project: {
      configVersion: asNullableNumber(project.configVersion, "runtime profile project.configVersion"),
      features: asStringArray(project.features, "runtime profile project.features"),
      mainScene: asNullableString(project.mainScene, "runtime profile project.mainScene"),
      autoloads: asStringArray(project.autoloads, "runtime profile project.autoloads"),
      enabledPlugins: asStringArray(project.enabledPlugins, "runtime profile project.enabledPlugins"),
      exportPresets: asStringArray(project.exportPresets, "runtime profile project.exportPresets"),
    },
    paths: {
      userData: asNullableString(paths.userData, "runtime profile paths.userData"),
      logs: asNullableString(paths.logs, "runtime profile paths.logs"),
      exportTemplates: asNullableString(paths.exportTemplates, "runtime profile paths.exportTemplates"),
    },
    validation: {
      supportedCommands: asStringArray(validation.supportedCommands, "runtime profile validation.supportedCommands"),
      lastValidationId: asNullableString(validation.lastValidationId, "runtime profile validation.lastValidationId"),
    },
    updatedAt: asString(root.updatedAt, "runtime profile updatedAt"),
  };
}
