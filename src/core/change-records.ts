import { mkdir, readFile, writeFile } from "node:fs/promises";
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
}

export interface ChangeRecord {
  schemaVersion: 1;
  id: string;
  kind: "build" | "repair";
  status: "applied";
  prompt: string;
  summary: string;
  files: FileChange[];
  validationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export async function writeTrackedFile(projectRoot: string, relativePath: string, contents: string): Promise<FileChange> {
  const absolutePath = path.join(projectRoot, relativePath);
  const beforeExists = await pathExists(absolutePath);
  const beforeSha256 = beforeExists ? sha256(await readFile(absolutePath)) : null;
  const afterSha256 = sha256(contents);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);

  return {
    path: toGodotResourcePath(relativePath),
    operation: !beforeExists ? "create" : beforeSha256 === afterSha256 ? "unchanged" : "modify",
    beforeSha256,
    afterSha256,
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
  await writeFile(path.join(recordDir, "record.json"), JSON.stringify(fullRecord, null, 2) + "\n");
  return fullRecord;
}

export async function updateChangeRecordValidation(projectRoot: string, record: ChangeRecord, validationId: string): Promise<ChangeRecord> {
  const updated: ChangeRecord = {
    ...record,
    validationIds: Array.from(new Set([...record.validationIds, validationId])),
    updatedAt: new Date().toISOString(),
  };
  const paths = workspacePaths(projectRoot);
  await writeFile(path.join(paths.patchesDir, record.id, "record.json"), JSON.stringify(updated, null, 2) + "\n");
  return updated;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function toGodotResourcePath(relativePath: string): string {
  return `res://${relativePath.split(path.sep).join("/")}`;
}


