import { tryFindGodotProjectRoot } from "../core/godot-project.js";
import { isTaskState, loadTaskBoard, updateTask, type TaskRecord } from "../core/tasks.js";

export async function tasksCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const filtered = args.filter((arg) => arg !== "--json");
  const [subcommand = "list", id] = filtered;
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();

  if (subcommand === "list") {
    const board = await loadTaskBoard(projectRoot);
    if (json) {
      console.log(JSON.stringify({ ok: true, board }, null, 2));
      return;
    }
    printTaskList(board.tasks);
    return;
  }

  if (subcommand === "show") {
    if (!id) {
      console.log("Usage: godotcoder tasks show <task-id> [--json]");
      return;
    }
    const board = await loadTaskBoard(projectRoot);
    const task = board.tasks.find((candidate) => candidate.id === id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    if (json) {
      console.log(JSON.stringify({ ok: true, task }, null, 2));
      return;
    }
    printTask(task);
    return;
  }

  if (subcommand === "update") {
    if (!id) {
      console.log("Usage: godotcoder tasks update <task-id> --state planned|active|blocked|done [--note <text>] [--json]");
      return;
    }
    const state = readOption(filtered, "--state");
    const note = readOption(filtered, "--note");
    if (state && !isTaskState(state)) {
      throw new Error(`Invalid task state: ${state}`);
    }
    const nextState = state && isTaskState(state) ? state : undefined;
    if (!state && !note) {
      console.log("Usage: godotcoder tasks update <task-id> --state planned|active|blocked|done [--note <text>] [--json]");
      return;
    }
    const { task } = await updateTask(projectRoot, id, { state: nextState, note: note ?? undefined });
    if (json) {
      console.log(JSON.stringify({ ok: true, task }, null, 2));
      return;
    }
    console.log(`${task.id} ${task.state} ${task.title}`);
    return;
  }

  console.log("Usage: godotcoder tasks [list|show <task-id>|update <task-id> --state planned|active|blocked|done] [--json]");
}

function printTaskList(tasks: TaskRecord[]): void {
  if (tasks.length === 0) {
    console.log("No tasks found. Run `godotcoder plan <game idea>` to create .godotcoder/tasks.md.");
    return;
  }
  for (const task of tasks) {
    const links = [
      task.links.patches.length ? `${task.links.patches.length} patch` : "",
      task.links.validations.length ? `${task.links.validations.length} validation` : "",
      task.links.repairs.length ? `${task.links.repairs.length} repair` : "",
      task.links.playtests.length ? `${task.links.playtests.length} playtest` : "",
    ].filter(Boolean).join(", ");
    console.log(`${task.id} [${task.state}] ${task.title}${links ? ` (${links})` : ""}`);
  }
}

function printTask(task: TaskRecord): void {
  console.log(`${task.id} [${task.state}] ${task.title}`);
  if (task.description) {
    console.log(task.description);
  }
  console.log(`Patches: ${task.links.patches.join(", ") || "none"}`);
  console.log(`Validations: ${task.links.validations.join(", ") || "none"}`);
  console.log(`Repairs: ${task.links.repairs.join(", ") || "none"}`);
  console.log(`Playtests: ${task.links.playtests.join(", ") || "none"}`);
}

function readOption(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}
