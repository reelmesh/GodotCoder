import { access, readFile, stat } from "node:fs/promises";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonIfExists(filePath: string): Promise<any | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}
