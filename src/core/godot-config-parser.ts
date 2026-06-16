import { CliError } from "./errors.js";

export type GodotConfigValue = string | number | boolean | null | unknown[] | Record<string, unknown>;
type GodotConfig = Record<string, Record<string, GodotConfigValue>>;

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

export function serializeGodotValue(value: GodotConfigValue | unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CliError("INVALID_PROJECT_SETTING", "Project setting numbers must be finite.");
    }
    return String(value);
  }
  if (typeof value === "string") return `"${escapeGodotString(value)}"`;
  if (Array.isArray(value)) {
    const items = (value as unknown[]).map((item) => serializeGodotValue(item)).join(", ");
    return `PackedStringArray(${items})`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => `"${escapeGodotString(key)}": ${serializeGodotValue(entryValue)}`);
    return `{ ${entries.join(", ")} }`;
  }
  throw new CliError("INVALID_PROJECT_SETTING", `Unsupported project setting value type: ${typeof value}.`);
}

export function escapeGodotString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/"/g, '\\"');
}

export function stringValue(value: GodotConfigValue | undefined): string | null {
  if (typeof value !== "string") return null;
  return value;
}

export function numberValue(value: GodotConfigValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function arrayValue(value: GodotConfigValue | undefined): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

export function normalizeSection(section: string): string {
  return section.replace(/\./g, "_").replace(/\//g, "_");
}

export function normalizeKey(key: string): string {
  return key.trim().replace(/\//g, "_");
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
    return parseGodotArray(array[1] ?? "");
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return parseGodotArray(value.slice(1, -1));
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

function parseGodotArray(value: string): unknown[] {
  return splitTopLevel(value, ",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseGodotValue(item));
}

export function splitTopLevel(value: string, separator: string): string[] {
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
