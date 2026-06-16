import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { normalizeSection, normalizeKey, serializeGodotValue, type GodotConfigValue } from "./godot-config-parser.js";

export interface ProjectSettingEdit {
  section: string;
  key: string;
  value: GodotConfigValue;
}

export interface InputActionEdit {
  action: string;
  deadzone?: number;
  events?: unknown[];
}

export async function setProjectSetting(projectRoot: string, edit: ProjectSettingEdit): Promise<void> {
  await updateProjectGodot(projectRoot, [edit]);
}

export async function setInputAction(projectRoot: string, edit: InputActionEdit): Promise<void> {
  const deadzone = edit.deadzone ?? 0.5;
  if (!Number.isFinite(deadzone) || deadzone < 0) {
    throw new CliError("INVALID_INPUT_ACTION", "Input action deadzone must be a non-negative finite number.");
  }

  await updateProjectGodot(projectRoot, [
    {
      section: "input",
      key: edit.action,
      value: {
        deadzone,
        events: edit.events ?? [],
      },
    },
  ]);
}

export async function updateProjectGodot(projectRoot: string, edits: ProjectSettingEdit[]): Promise<void> {
  const projectFile = path.join(projectRoot, "project.godot");
  const current = await readFile(projectFile, "utf8");
  const updated = updateGodotConfigText(current, edits);
  if (updated !== current) {
    await writeFile(projectFile, updated, "utf8");
  }
}

export function updateGodotConfigText(text: string, edits: ProjectSettingEdit[]): string {
  if (edits.length === 0) {
    return text;
  }

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = text.endsWith("\n");
  const lines = text.split(/\r?\n/);
  if (hadTrailingNewline) {
    lines.pop();
  }

  for (const edit of edits) {
    validateProjectSettingEdit(edit);
    applyProjectSettingEdit(lines, edit);
  }

  return `${lines.join(newline)}${hadTrailingNewline ? newline : ""}`;
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
  const updatedText = updateGodotConfigTextSingle(text, section, key, value);
  await writeFile(projectFile, updatedText, "utf8");
}

export function updateGodotConfigTextSingle(text: string, targetSection: string, targetKey: string, value: GodotConfigValue): string {
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

function validateProjectSettingEdit(edit: ProjectSettingEdit): void {
  if (!edit.section.trim() || /[\r\n[\]]/.test(edit.section)) {
    throw new CliError("INVALID_PROJECT_SETTING", "Project setting section must be non-empty and cannot contain brackets or newlines.");
  }
  if (!edit.key.trim() || /[\r\n=]/.test(edit.key)) {
    throw new CliError("INVALID_PROJECT_SETTING", "Project setting key must be non-empty and cannot contain equals signs or newlines.");
  }
}

function applyProjectSettingEdit(lines: string[], edit: ProjectSettingEdit): void {
  const targetSection = normalizeSection(edit.section);
  const targetKey = normalizeKey(edit.key);
  const serialized = `${edit.key}=${serializeGodotValue(edit.value)}`;
  const section = findSection(lines, targetSection);

  if (!section) {
    appendSection(lines, edit.section, serialized);
    return;
  }

  for (let index = section.start + 1; index < section.end; index += 1) {
    const separator = lines[index]!.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (normalizeKey(lines[index]!.slice(0, separator)) === targetKey) {
      lines[index] = serialized;
      return;
    }
  }

  lines.splice(section.end, 0, serialized);
}

function findSection(lines: string[], targetSection: string): { start: number; end: number } | null {
  if (targetSection === "root") {
    const firstSection = lines.findIndex((line) => line.trim().match(/^\[(.+)]$/));
    return { start: -1, end: firstSection === -1 ? lines.length : firstSection };
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]!.trim().match(/^\[(.+)]$/);
    if (!match || normalizeSection(match[1]!) !== targetSection) {
      continue;
    }

    let end = lines.length;
    for (let next = index + 1; next < lines.length; next += 1) {
      if (lines[next]!.trim().match(/^\[(.+)]$/)) {
        end = next;
        break;
      }
    }
    return { start: index, end };
  }

  return null;
}

function appendSection(lines: string[], section: string, settingLine: string): void {
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length > 0) {
    lines.push("");
  }
  if (normalizeSection(section) === "root") {
    lines.push(settingLine);
    return;
  }
  lines.push(`[${section}]`, settingLine);
}
