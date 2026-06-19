import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedFile } from "./builders/types.js";
import { pathExists } from "./files.js";

export interface PreviewFile {
  path: string;
  operation: "create" | "modify" | "unchanged";
  beforeLines: number;
  afterLines: number;
  addedLines: number;
  removedLines: number;
  diff: PreviewDiffLine[];
  diffTruncated: boolean;
}

export interface BuildPreview {
  summary: string;
  files: PreviewFile[];
}

export interface PreviewDiffLine {
  kind: "context" | "add" | "remove";
  beforeLine: number | null;
  afterLine: number | null;
  text: string;
}

export async function previewGeneratedFiles(projectRoot: string, summary: string, files: GeneratedFile[]): Promise<BuildPreview> {
  const previews: PreviewFile[] = [];

  for (const file of files) {
    const absolutePath = path.join(projectRoot, file.path);
    const exists = await pathExists(absolutePath);
    const before = exists ? await readFile(absolutePath, "utf8") : "";
    const beforeLines = splitLines(before);
    const afterLines = splitLines(file.contents);
    const diff = lineDiff(beforeLines, afterLines);

    previews.push({
      path: `res://${file.path}`,
      operation: !exists ? "create" : diff.added === 0 && diff.removed === 0 ? "unchanged" : "modify",
      beforeLines: beforeLines.length,
      afterLines: afterLines.length,
      addedLines: diff.added,
      removedLines: diff.removed,
      diff: diff.lines,
      diffTruncated: diff.truncated,
    });
  }

  return { summary, files: previews };
}

function splitLines(value: string): string[] {
  if (!value) return [];
  return value.replace(/\n$/, "").split(/\r?\n/);
}

function lineDiff(before: string[], after: string[]): { added: number; removed: number; lines: PreviewDiffLine[]; truncated: boolean } {
  const maxDiffLines = 160;
  const maxLcsLines = 2000;

  if (before.length === 0) {
    const lines = after.map((text, index) => ({ kind: "add" as const, beforeLine: null, afterLine: index + 1, text }));
    const truncated = lines.length > maxDiffLines;
    const sliced = lines.slice(0, maxDiffLines);
    return { added: after.length, removed: 0, lines: collapseContext(sliced, 3), truncated };
  }

  if (before.length + after.length > maxLcsLines) {
    return simpleDiff(before, after, maxDiffLines);
  }

  const table = buildLcsTable(before, after);
  const lines: PreviewDiffLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  let added = 0;
  let removed = 0;

  while (beforeIndex < before.length || afterIndex < after.length) {
    if (beforeIndex < before.length && afterIndex < after.length && before[beforeIndex] === after[afterIndex]) {
      lines.push({
        kind: "context",
        beforeLine: beforeIndex + 1,
        afterLine: afterIndex + 1,
        text: before[beforeIndex]!,
      });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    const shouldAdd =
      afterIndex < after.length &&
      (beforeIndex >= before.length || table[beforeIndex]![afterIndex + 1]! >= table[beforeIndex + 1]![afterIndex]!);
    if (shouldAdd) {
      lines.push({ kind: "add", beforeLine: null, afterLine: afterIndex + 1, text: after[afterIndex]! });
      added += 1;
      afterIndex += 1;
      continue;
    }

    if (beforeIndex < before.length) {
      lines.push({ kind: "remove", beforeLine: beforeIndex + 1, afterLine: null, text: before[beforeIndex]! });
      removed += 1;
      beforeIndex += 1;
    }
  }

  const truncated = lines.length > maxDiffLines;
  const sliced = lines.slice(0, maxDiffLines);
  return { added, removed, lines: collapseContext(sliced, 3), truncated };
}

function simpleDiff(before: string[], after: string[], maxLines: number): { added: number; removed: number; lines: PreviewDiffLine[]; truncated: boolean } {
  const lines: PreviewDiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({ kind: "context", beforeLine: i + 1, afterLine: j + 1, text: before[i]! });
      i += 1;
      j += 1;
    } else {
      const nextInAfter = after.indexOf(before[i]!, j);
      const nextInBefore = before.indexOf(after[j]!, i);
      if (nextInAfter !== -1 && (nextInBefore === -1 || nextInAfter - j <= nextInBefore - i)) {
        for (; j < nextInAfter; j += 1) {
          lines.push({ kind: "add", beforeLine: null, afterLine: j + 1, text: after[j]! });
          added += 1;
        }
      } else if (nextInBefore !== -1) {
        for (; i < nextInBefore; i += 1) {
          lines.push({ kind: "remove", beforeLine: i + 1, afterLine: null, text: before[i]! });
          removed += 1;
        }
      } else {
        lines.push({ kind: "remove", beforeLine: i + 1, afterLine: null, text: before[i]! });
        lines.push({ kind: "add", beforeLine: null, afterLine: j + 1, text: after[j]! });
        removed += 1;
        added += 1;
        i += 1;
        j += 1;
      }
    }
  }

  for (; i < before.length; i += 1) { lines.push({ kind: "remove", beforeLine: i + 1, afterLine: null, text: before[i]! }); removed += 1; }
  for (; j < after.length; j += 1) { lines.push({ kind: "add", beforeLine: null, afterLine: j + 1, text: after[j]! }); added += 1; }

  const truncated = lines.length > maxLines;
  const sliced = lines.slice(0, maxLines);
  return { added, removed, lines: collapseContext(sliced, 3), truncated };
}

function buildLcsTable(before: string[], after: string[]): number[][] {
  const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0) as number[]);

  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      table[beforeIndex]![afterIndex] =
        before[beforeIndex] === after[afterIndex]
          ? table[beforeIndex + 1]![afterIndex + 1]! + 1
          : Math.max(table[beforeIndex + 1]![afterIndex]!, table[beforeIndex]![afterIndex + 1]!);
    }
  }

  return table;
}

function collapseContext(lines: PreviewDiffLine[], contextSize: number): PreviewDiffLine[] {
  const changedIndexes = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]!.kind !== "context") {
      for (let contextIndex = Math.max(0, index - contextSize); contextIndex <= Math.min(lines.length - 1, index + contextSize); contextIndex += 1) {
        changedIndexes.add(contextIndex);
      }
    }
  }

  const collapsed: PreviewDiffLine[] = [];
  let skipped = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (changedIndexes.has(index)) {
      skipped = false;
      collapsed.push(lines[index]!);
    } else if (!skipped) {
      skipped = true;
      collapsed.push({ kind: "context", beforeLine: null, afterLine: null, text: "..." });
    }
  }

  return collapsed;
}
