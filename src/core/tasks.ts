import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./files.js";
import { workspacePaths } from "./workspace.js";

export type TaskState = "planned" | "active" | "blocked" | "done";

export interface TaskLinks {
  patches: string[];
  validations: string[];
  repairs: string[];
  playtests: string[];
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  state: TaskState;
  source: "markdown" | "manual";
  links: TaskLinks;
  createdAt: string;
  updatedAt: string;
}

export interface TaskBoard {
  schemaVersion: 1;
  updatedAt: string;
  tasks: TaskRecord[];
}

export interface TaskUpdate {
  state?: TaskState;
  note?: string;
  links?: Partial<TaskLinks>;
}

const validTaskStates: TaskState[] = ["planned", "active", "blocked", "done"];

export function isTaskState(value: string): value is TaskState {
  return validTaskStates.includes(value as TaskState);
}

export async function loadTaskBoard(projectRoot: string): Promise<TaskBoard> {
  const paths = workspacePaths(projectRoot);
  const existing = await readTaskBoardFile(paths.tasksState);

  // Only re-read markdown if the file changed since last sync
  const shouldReadMarkdown = await shouldSyncMarkdown(paths.tasks, existing);
  const markdownTasks = shouldReadMarkdown ? await readMarkdownTasks(paths.tasks) : [];
  const board = existing ?? emptyBoard();
  let changed = false;

  const existingTitles = new Set(board.tasks.map((task) => normalizeTitle(task.title)));
  let nextNumber = nextTaskNumber(board.tasks);
  for (const markdownTask of markdownTasks) {
    if (existingTitles.has(normalizeTitle(markdownTask.title))) {
      continue;
    }
    const now = new Date().toISOString();
    board.tasks.push({
      id: `task-${String(nextNumber).padStart(3, "0")}`,
      title: markdownTask.title,
      description: null,
      state: markdownTask.done ? "done" : "planned",
      source: "markdown",
      links: emptyLinks(),
      createdAt: now,
      updatedAt: now,
    });
    existingTitles.add(normalizeTitle(markdownTask.title));
    nextNumber += 1;
    changed = true;
  }

  if (changed || !existing) {
    await saveTaskBoard(projectRoot, board);
  }

  return board;
}

export async function saveTaskBoard(projectRoot: string, board: TaskBoard): Promise<TaskBoard> {
  const paths = workspacePaths(projectRoot);
  const updated: TaskBoard = {
    ...board,
    updatedAt: new Date().toISOString(),
    tasks: board.tasks.map((task) => ({ ...task, links: normalizeLinks(task.links) })),
  };
  await mkdir(paths.workspaceRoot, { recursive: true });
  const tmpPath = paths.tasksState + ".tmp";
  await writeFile(tmpPath, JSON.stringify(updated, null, 2) + "\n");
  await rename(tmpPath, paths.tasksState);
  await syncTasksMarkdown(paths.tasks, updated);
  return updated;
}

export async function getTask(projectRoot: string, id: string): Promise<TaskRecord> {
  const board = await loadTaskBoard(projectRoot);
  const task = board.tasks.find((candidate) => candidate.id === id);
  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }
  return task;
}

export async function updateTask(projectRoot: string, id: string, update: TaskUpdate): Promise<{ board: TaskBoard; task: TaskRecord }> {
  const board = await loadTaskBoard(projectRoot);
  const index = board.tasks.findIndex((task) => task.id === id);
  if (index === -1) {
    throw new Error(`Task not found: ${id}`);
  }
  const current = board.tasks[index]!;
  const description = update.note
    ? [current.description, update.note].filter(Boolean).join("\n")
    : current.description;
  const task: TaskRecord = {
    ...current,
    state: update.state ?? current.state,
    description,
    links: mergeLinks(current.links, update.links ?? {}),
    updatedAt: new Date().toISOString(),
  };
  board.tasks[index] = task;
  const saved = await saveTaskBoard(projectRoot, board);
  return { board: saved, task };
}

export async function linkTaskArtifacts(projectRoot: string, id: string, links: Partial<TaskLinks>): Promise<TaskRecord> {
  const { task } = await updateTask(projectRoot, id, { links });
  return task;
}

export function taskPrompt(task: TaskRecord): string {
  return [task.title, task.description].filter(Boolean).join("\n\n");
}

function emptyBoard(): TaskBoard {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    tasks: [],
  };
}

function emptyLinks(): TaskLinks {
  return { patches: [], validations: [], repairs: [], playtests: [] };
}

function normalizeLinks(links: TaskLinks): TaskLinks {
  return mergeLinks(emptyLinks(), links);
}

function mergeLinks(current: TaskLinks, update: Partial<TaskLinks>): TaskLinks {
  return {
    patches: unique([...(current.patches ?? []), ...(update.patches ?? [])]),
    validations: unique([...(current.validations ?? []), ...(update.validations ?? [])]),
    repairs: unique([...(current.repairs ?? []), ...(update.repairs ?? [])]),
    playtests: unique([...(current.playtests ?? []), ...(update.playtests ?? [])]),
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function readTaskBoardFile(filePath: string): Promise<TaskBoard | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as TaskBoard;
  return {
    schemaVersion: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask).filter((task): task is TaskRecord => Boolean(task)) : [],
  };
}

function normalizeTask(value: unknown): TaskRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const id = typeof root.id === "string" ? root.id : "";
  const title = typeof root.title === "string" ? root.title : "";
  const state = typeof root.state === "string" && isTaskState(root.state) ? root.state : "planned";
  if (!id || !title) return null;
  const now = new Date().toISOString();
  return {
    id,
    title,
    description: typeof root.description === "string" ? root.description : null,
    state,
    source: root.source === "manual" ? "manual" : "markdown",
    links: normalizeLinks((root.links ?? emptyLinks()) as TaskLinks),
    createdAt: typeof root.createdAt === "string" ? root.createdAt : now,
    updatedAt: typeof root.updatedAt === "string" ? root.updatedAt : now,
  };
}

async function readMarkdownTasks(filePath: string): Promise<Array<{ title: string; done: boolean }>> {
  if (!(await pathExists(filePath))) {
    return [];
  }
  const text = await readFile(filePath, "utf8");
  const tasks: Array<{ title: string; done: boolean }> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.+?)\s*$/);
    if (!match) continue;
    tasks.push({ title: match[2]!, done: match[1]!.toLowerCase() === "x" });
  }
  return tasks;
}

async function syncTasksMarkdown(filePath: string, board: TaskBoard): Promise<void> {
  const existing = (await pathExists(filePath)) ? await readFile(filePath, "utf8") : "# Tasks\n\n";
  const lines = existing.split(/\r?\n/);
  const remaining = new Map(board.tasks.map((task) => [normalizeTitle(task.title), task]));
  const nextLines = lines.map((line) => {
    const match = line.match(/^(\s*[-*]\s+)\[([ xX])](\s+)(.+?)(\s*)$/);
    if (!match) return line;
    const title = match[4]!;
    const task = remaining.get(normalizeTitle(title));
    if (!task) return line;
    remaining.delete(normalizeTitle(title));
    return `${match[1]}[${task.state === "done" ? "x" : " "}]${match[3]}${title}${match[5]}`;
  });

  if (remaining.size > 0) {
    if (!nextLines.some((line) => line.trim() === "# Tasks")) {
      nextLines.push("# Tasks");
    }
    if (nextLines.at(-1)?.trim()) {
      nextLines.push("");
    }
    for (const task of remaining.values()) {
      nextLines.push(`- [${task.state === "done" ? "x" : " "}] ${task.title}`);
    }
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, nextLines.join("\n").replace(/\n*$/, "\n"));
  await rename(tmpPath, filePath);
}

async function shouldSyncMarkdown(tasksMdPath: string, board: TaskBoard | null): Promise<boolean> {
  try {
    const mdStat = await stat(tasksMdPath);
    if (!board) return true;
    const boardTime = new Date(board.updatedAt).getTime();
    return mdStat.mtimeMs > boardTime;
  } catch {
    return false;
  }
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function nextTaskNumber(tasks: TaskRecord[]): number {
  let highest = 0;
  for (const task of tasks) {
    const match = task.id.match(/^task-(\d+)$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}
