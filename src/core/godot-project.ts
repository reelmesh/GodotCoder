import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
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
    inputMap: Object.keys(project.input ?? {}),
    autoloads: Object.keys(project.autoload ?? {}),
    plugins: Object.entries(project.editor_plugins ?? {})
      .filter(([, value]) => String(value).includes("enabled"))
      .map(([name]) => name),
    scripts: files.filter((file) => file.endsWith(".gd")),
    scenes: files.filter((file) => file.endsWith(".tscn") || file.endsWith(".scn")),
    resources: files.filter((file) => file.endsWith(".tres") || file.endsWith(".res")),
    exports: files.filter((file) => file === "export_presets.cfg"),
    updatedAt: new Date().toISOString(),
  };
}

export async function loadProjectIndex(filePath: string): Promise<ProjectIndex | null> {
  try {
    return parseProjectIndex(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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

function parseGodotConfig(text: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = "root";
  sections[currentSection] = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      currentSection = normalizeSection(sectionMatch[1]!);
      sections[currentSection] = sections[currentSection] ?? {};
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = normalizeKey(line.slice(0, separator));
    sections[currentSection]![key] = line.slice(separator + 1).trim();
  }

  return sections;
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

function normalizeSection(section: string): string {
  return section.replace(/\./g, "_").replace(/\//g, "_");
}

function normalizeKey(key: string): string {
  return key.trim().replace(/\//g, "_");
}

function stringValue(value: string | undefined): string | null {
  if (!value) return null;
  return value.replace(/^"|"$/g, "");
}

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/^"|"$/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayValue(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith("PackedStringArray(")) return [];
  const inside = trimmed.slice("PackedStringArray(".length, -1);
  return inside
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}
