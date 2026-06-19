import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathExists } from "./files.js";
import { timestampId } from "./ids.js";
import { workspacePaths } from "./workspace.js";

export interface FileChange {
  path: string;
  operation: "create" | "modify" | "unchanged";
  beforeSha256: string | null;
  afterSha256: string;
  beforeContent?: string | null;
}

export interface ChangeRecord {
  schemaVersion: 1;
  id: string;
  kind: "build" | "repair";
  status: "applied";
  prompt: string;
  taskId?: string | null;
  summary: string;
  files: FileChange[];
  validationIds: string[];
  createdAt: string;
  updatedAt: string;
}

const MAX_BEFORE_CONTENT_BYTES = 100_000;

export async function writeTrackedFile(projectRoot: string, relativePath: string, contents: string): Promise<FileChange> {
  const absolutePath = path.join(projectRoot, relativePath);
  const beforeExists = await pathExists(absolutePath);
  const beforeContentRaw = beforeExists ? await readFile(absolutePath, "utf8") : null;
  const beforeContent = beforeContentRaw !== null && Buffer.byteLength(beforeContentRaw, "utf8") <= MAX_BEFORE_CONTENT_BYTES
    ? beforeContentRaw
    : null;
  const beforeSha256 = beforeContentRaw !== null ? sha256(beforeContentRaw) : null;
  const afterSha256 = sha256(contents);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);

  return {
    path: toGodotResourcePath(relativePath),
    operation: !beforeExists ? "create" : beforeSha256 === afterSha256 ? "unchanged" : "modify",
    beforeSha256,
    afterSha256,
    beforeContent,
  };
}

export async function writeChangeRecord(projectRoot: string, record: Omit<ChangeRecord, "schemaVersion" | "id" | "createdAt" | "updatedAt">): Promise<ChangeRecord> {
  const now = new Date().toISOString();
  const id = `patch_${timestampId(new Date(now))}`;
  const fullRecord: ChangeRecord = {
    schemaVersion: 1,
    id,
    createdAt: now,
    updatedAt: now,
    ...record,
  };
  const paths = workspacePaths(projectRoot);
  const recordDir = path.join(paths.patchesDir, id);
  await mkdir(recordDir, { recursive: true });
  const recordPath = path.join(recordDir, "record.json");
  const tmpPath = recordPath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(fullRecord, null, 2) + "\n");
  await rename(tmpPath, recordPath);
  return fullRecord;
}

export async function updateChangeRecordValidation(projectRoot: string, record: ChangeRecord, validationId: string): Promise<ChangeRecord> {
  const updated: ChangeRecord = {
    ...record,
    validationIds: Array.from(new Set([...record.validationIds, validationId])),
    updatedAt: new Date().toISOString(),
  };
  const paths = workspacePaths(projectRoot);
  const recordPath = path.join(paths.patchesDir, record.id, "record.json");
  const tmpPath = recordPath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(updated, null, 2) + "\n");
  await rename(tmpPath, recordPath);
  return updated;
}

export async function revertChangeRecord(projectRoot: string, recordId: string): Promise<void> {
  const paths = workspacePaths(projectRoot);
  const recordFile = path.join(paths.patchesDir, recordId, "record.json");
  if (!(await pathExists(recordFile))) {
    throw new Error(`Change record not found: ${recordId}`);
  }

  const text = await readFile(recordFile, "utf8");
  const record: ChangeRecord = JSON.parse(text);

  for (const file of record.files) {
    const relativePath = file.path.slice("res://".length);
    const absolutePath = path.join(projectRoot, relativePath);

    if (file.operation === "create") {
      if (await pathExists(absolutePath)) {
        await rm(absolutePath, { force: true });
      }
    } else if (file.operation === "modify") {
      if (file.beforeContent !== undefined && file.beforeContent !== null) {
        await mkdir(path.dirname(absolutePath), { recursive: true });
        const tmpPath = absolutePath + ".gc-tmp";
        await writeFile(tmpPath, file.beforeContent, "utf8");
        await rename(tmpPath, absolutePath);
      }
    }
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function toGodotResourcePath(relativePath: string): string {
  return `res://${relativePath.split(path.sep).join("/")}`;
}

