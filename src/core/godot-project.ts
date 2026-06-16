import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import { asLiteral, asNullableNumber, asNullableString, asObject, asString, asStringArray } from "./schema.js";

export type GodotConfigValue = string | number | boolean | null | string[] | Record<string, unknown>;
type GodotConfig = Record<string, Record<string, GodotConfigValue>>;

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

export function parseGodotConfig(text: string): GodotConfig {
  const sections: GodotConfig = {};
  let currentSection = "root";
  sections[currentSection] = {};

  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex]!;
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
    let rawValue = line.slice(separator + 1).trim();
    while (!isBalancedGodotValue(rawValue) && lineIndex + 1 < lines.length) {
      lineIndex += 1;
      rawValue += `\n${lines[lineIndex]!.trim()}`;
    }
    sections[currentSection]![key] = parseGodotValue(rawValue);
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

function stringValue(value: GodotConfigValue | undefined): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function numberValue(value: GodotConfigValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayValue(value: GodotConfigValue | undefined): string[] {
  if (Array.isArray(value)) return value;
  return [];
}

function parseGodotValue(value: string): GodotConfigValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;

  const numberMatch = value.match(/^-?\d+(?:\.\d+)?$/);
  if (numberMatch) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const packedStringArray = value.match(/^PackedStringArray\((.*)\)$/);
  if (packedStringArray) {
    return parseStringList(packedStringArray[1] ?? "");
  }

  const array = value.match(/^Array\((.*)\)$/);
  if (array) {
    return parseStringList(array[1] ?? "");
  }

  if (value.startsWith('"') && value.endsWith('"')) {
    return unquoteGodotString(value);
  }

  if (value.startsWith("{") && value.endsWith("}")) {
    return parseGodotDictionary(value);
  }

  return value;
}

function isBalancedGodotValue(value: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of value) {
    if (inString) {
      escaped = char === "\\" && !escaped;
      if (char === '"' && !escaped) inString = false;
      if (char !== "\\") escaped = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") depth += 1;
    if (char === "}" || char === "]" || char === ")") depth -= 1;
  }
  return depth <= 0 && !inString;
}

function parseGodotDictionary(value: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const inner = value.slice(1, -1).trim();
  for (const part of splitTopLevel(inner, ",")) {
    const separator = part.indexOf(":");
    if (separator === -1) continue;
    const key = unquoteGodotString(part.slice(0, separator).trim());
    result[key] = parseGodotValue(part.slice(separator + 1).trim());
  }
  return result;
}

function parseStringList(value: string): string[] {
  return splitTopLevel(value, ",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('"') && item.endsWith('"') ? unquoteGodotString(item) : item));
}

function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (inString) {
      escaped = char === "\\" && !escaped;
      if (char === '"' && !escaped) inString = false;
      if (char !== "\\") escaped = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function unquoteGodotString(value: string): string {
  const trimmed = value.trim();
  const raw = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
  return raw.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
}

export async function updateGodotProjectSetting(projectRoot: string, section: string, key: string, value: GodotConfigValue): Promise<void> {
  const projectFile = path.join(projectRoot, "project.godot");
  let text = "";
  try {
    text = await readFile(projectFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const updatedText = updateGodotConfigText(text, section, key, value);
  await writeFile(projectFile, updatedText, "utf8");
}

export function updateGodotConfigText(text: string, targetSection: string, targetKey: string, value: GodotConfigValue): string {
  const lines = text.split(/\r?\n/);
  const serialized = serializeGodotValue(value);
  let currentSection = "root";
  let keyIndex = -1;
  let sectionStartIndex = -1;
  let nextSectionIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.startsWith(";")) continue;

    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      const secName = sectionMatch[1]!;
      if (currentSection === targetSection) {
        nextSectionIndex = index;
        break;
      }
      currentSection = secName;
      if (currentSection === targetSection) {
        sectionStartIndex = index;
      }
      continue;
    }

    if (currentSection === targetSection) {
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        if (key === targetKey) {
          keyIndex = index;
        }
      }
    }
  }

  const newLine = `${targetKey}=${serialized}`;

  if (keyIndex !== -1) {
    lines[keyIndex] = newLine;
  } else if (sectionStartIndex !== -1) {
    const insertIndex = nextSectionIndex !== -1 ? nextSectionIndex : lines.length;
    lines.splice(insertIndex, 0, newLine);
  } else {
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== "") {
      lines.push("");
    }
    lines.push(`[${targetSection}]`);
    lines.push(newLine);
  }

  return lines.join("\n");
}

export function serializeGodotValue(value: GodotConfigValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value.toString();
  if (typeof value === "string") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
  }
  if (Array.isArray(value)) {
    const items = value.map(item => serializeGodotValue(item)).join(", ");
    return `PackedStringArray(${items})`;
  }
  if (typeof value === "object") {
    const pairs = Object.entries(value)
      .map(([k, v]) => `"${k}": ${serializeGodotValue(v as GodotConfigValue)}`)
      .join(", ");
    return `{ ${pairs} }`;
  }
  return String(value);
}
