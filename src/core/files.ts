import { access, readFile, stat } from "node:fs/promises";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export type JsonReadResult =
  | { exists: false }
  | { exists: true; valid: false; error: string }
  | { exists: true; valid: true; data: unknown };

export async function readJsonIfExists(filePath: string): Promise<any | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Like readJsonIfExists but returns a discriminated union for error handling. */
export async function readJsonSafe(filePath: string): Promise<JsonReadResult> {
  if (!(await pathExists(filePath))) {
    return { exists: false };
  }

  try {
    return { exists: true, valid: true, data: JSON.parse(await readFile(filePath, "utf8")) };
  } catch (error) {
    return { exists: true, valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}
