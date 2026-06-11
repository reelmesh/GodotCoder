import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedFile } from "./builders/asteroid-shooter.js";
import { pathExists } from "./files.js";

export interface PreviewFile {
  path: string;
  operation: "create" | "modify";
  beforeLines: number;
  afterLines: number;
  addedLines: number;
  removedLines: number;
}

export interface BuildPreview {
  summary: string;
  files: PreviewFile[];
}

export async function previewGeneratedFiles(projectRoot: string, summary: string, files: GeneratedFile[]): Promise<BuildPreview> {
  const previews: PreviewFile[] = [];

  for (const file of files) {
    const absolutePath = path.join(projectRoot, file.path);
    const exists = await pathExists(absolutePath);
    const before = exists ? await readFile(absolutePath, "utf8") : "";
    const beforeLines = splitLines(before);
    const afterLines = splitLines(file.contents);
    const diff = lineDiffSummary(beforeLines, afterLines);

    previews.push({
      path: `res://${file.path}`,
      operation: exists ? "modify" : "create",
      beforeLines: beforeLines.length,
      afterLines: afterLines.length,
      addedLines: diff.added,
      removedLines: diff.removed,
    });
  }

  return { summary, files: previews };
}

function splitLines(value: string): string[] {
  if (!value) return [];
  return value.replace(/\n$/, "").split(/\r?\n/);
}

function lineDiffSummary(before: string[], after: string[]): { added: number; removed: number } {
  const beforeCounts = countLines(before);
  const afterCounts = countLines(after);
  let added = 0;
  let removed = 0;

  for (const [line, count] of afterCounts) {
    added += Math.max(0, count - (beforeCounts.get(line) ?? 0));
  }

  for (const [line, count] of beforeCounts) {
    removed += Math.max(0, count - (afterCounts.get(line) ?? 0));
  }

  return { added, removed };
}

function countLines(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}
