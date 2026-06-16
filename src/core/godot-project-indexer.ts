import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import { parseGodotConfig, stringValue, numberValue, arrayValue } from "./godot-config-parser.js";
import { asLiteral, asNullableNumber, asNullableString, asObject, asString, asStringArray } from "./schema.js";

export interface ProjectIndex {
  schemaVersion: 1;
  projectRoot: string;
  godotVersionSignals: {
    projectConfigVersion: number | null;
    featureTags: string[];
    runtimeVersion: string | null;
  };
  mainScene: string | null;
  applicationName: string | null;
  renderingMethod: string | null;
  display: {
    width: number | null;
    height: number | null;
    stretchMode: string | null;
    stretchAspect: string | null;
  };
  inputMap: string[];
  autoloads: string[];
  plugins: string[];
  scripts: string[];
  scenes: string[];
  resources: string[];
  exports: string[];
  updatedAt: string;
}

export async function findGodotProjectRoot(start: string): Promise<string> {
  let current = path.resolve(start);

  while (true) {
    if (await pathExists(path.join(current, "project.godot"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new CliError("GODOT_PROJECT_NOT_FOUND", "No project.godot found in this directory or its parents.");
    }
    current = parent;
  }
}

export async function tryFindGodotProjectRoot(start: string): Promise<string | null> {
  try {
    return await findGodotProjectRoot(start);
  } catch (error) {
    if (error instanceof CliError && error.code === "GODOT_PROJECT_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function inspectGodotProject(projectRoot: string): Promise<ProjectIndex> {
  const projectFile = path.join(projectRoot, "project.godot");
  const projectText = await readFile(projectFile, "utf8");
  const project = parseGodotConfig(projectText);
  const files = await collectProjectFiles(projectRoot);

  return {
    schemaVersion: 1,
    projectRoot,
    godotVersionSignals: {
      projectConfigVersion: numberValue(project.root?.config_version),
      featureTags: arrayValue(project.application?.config_features),
      runtimeVersion: null,
    },
    mainScene: stringValue(project.application?.run_main_scene),
    applicationName: stringValue(project.application?.config_name),
    renderingMethod: stringValue(project.rendering?.renderer_rendering_method),
    display: {
      width: numberValue(project.display?.window_size_viewport_width),
      height: numberValue(project.display?.window_size_viewport_height),
      stretchMode: stringValue(project.display?.window_stretch_mode),
      stretchAspect: stringValue(project.display?.window_stretch_aspect),
    },
    inputMap: Object.keys(project.input ?? {}),
    autoloads: Object.keys(project.autoload ?? {}),
    plugins: arrayValue(project.editor_plugins?.enabled),
    scripts: files.filter((file) => file.endsWith(".gd")),
    scenes: files.filter((file) => file.endsWith(".tscn") || file.endsWith(".scn")),
    resources: files.filter((file) => file.endsWith(".tres") || file.endsWith(".res")),
    exports: await inspectExportPresets(projectRoot),
    updatedAt: new Date().toISOString(),
  };
}

export async function loadProjectIndex(filePath: string): Promise<ProjectIndex | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return parseProjectIndex(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    if (error instanceof SyntaxError) {
      console.warn(`Warning: Corrupted project index at ${filePath}: ${error.message}`);
      return null;
    }
    throw error;
  }
}

export function parseProjectIndex(value: unknown): ProjectIndex {
  const root = asObject(value, "project index");
  const signals = asObject(root.godotVersionSignals, "project index godotVersionSignals");

  return {
    schemaVersion: asLiteral(root.schemaVersion, 1, "project index schemaVersion"),
    projectRoot: asString(root.projectRoot, "project index projectRoot"),
    godotVersionSignals: {
      projectConfigVersion: asNullableNumber(signals.projectConfigVersion, "project index godotVersionSignals.projectConfigVersion"),
      featureTags: asStringArray(signals.featureTags, "project index godotVersionSignals.featureTags"),
      runtimeVersion: asNullableString(signals.runtimeVersion, "project index godotVersionSignals.runtimeVersion"),
    },
    mainScene: asNullableString(root.mainScene, "project index mainScene"),
    applicationName: asNullableString(root.applicationName, "project index applicationName"),
    renderingMethod: asNullableString(root.renderingMethod, "project index renderingMethod"),
    display: parseProjectDisplay(root.display),
    inputMap: asStringArray(root.inputMap, "project index inputMap"),
    autoloads: asStringArray(root.autoloads, "project index autoloads"),
    plugins: asStringArray(root.plugins, "project index plugins"),
    scripts: asStringArray(root.scripts, "project index scripts"),
    scenes: asStringArray(root.scenes, "project index scenes"),
    resources: asStringArray(root.resources, "project index resources"),
    exports: asStringArray(root.exports, "project index exports"),
    updatedAt: asString(root.updatedAt, "project index updatedAt"),
  };
}

function parseProjectDisplay(value: unknown): ProjectIndex["display"] {
  const display = asObject(value ?? {}, "project index display");
  return {
    width: asNullableNumber(display.width, "project index display.width"),
    height: asNullableNumber(display.height, "project index display.height"),
    stretchMode: asNullableString(display.stretchMode, "project index display.stretchMode"),
    stretchAspect: asNullableString(display.stretchAspect, "project index display.stretchAspect"),
  };
}

async function inspectExportPresets(projectRoot: string): Promise<string[]> {
  const presetPath = path.join(projectRoot, "export_presets.cfg");
  if (!(await pathExists(presetPath))) {
    return [];
  }

  const text = await readFile(presetPath, "utf8");
  const config = parseGodotConfig(text);
  const presets: string[] = [];

  for (const [section, values] of Object.entries(config)) {
    if (!section.match(/^preset_\d+$/)) {
      continue;
    }

    const name = stringValue(values.name);
    const platform = stringValue(values.platform);
    if (name && platform) {
      presets.push(`${name} (${platform})`);
    } else if (name) {
      presets.push(name);
    } else if (platform) {
      presets.push(platform);
    }
  }

  return presets.length > 0 ? presets.sort() : ["export_presets.cfg"];
}

async function collectProjectFiles(projectRoot: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(relativeDir: string): Promise<void> {
    const absoluteDir = path.join(projectRoot, relativeDir);
    let entries;
    try {
      entries = await readdir(absoluteDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM" || code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.name === ".godot" || entry.name === ".godotcoder" || entry.name === ".godotcoder.local" || entry.name === ".git") {
        continue;
      }

      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await walk(relativePath);
      } else {
        results.push(relativePath.split(path.sep).join("/"));
      }
    }
  }

  await walk("");
  return results.sort();
}
