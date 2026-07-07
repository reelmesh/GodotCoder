import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { tryFindGodotProjectRoot } from "../core/godot-project-indexer.js";
import { chooseMenuOption, withMenu } from "../core/menu.js";
import { workspacePaths } from "../core/workspace.js";

interface RunSummary {
  id: string;
  goal: string;
  mode: string;
  apply: boolean;
  startedAt: string;
  finishedAt: string;
  stepCount: number;
  failedSteps: number;
  validationErrors: number | null;
  validationWarnings: number | null;
  path: string;
}

export async function runsCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const embedded = args.includes("--embedded");
  const cleanArgs = args.filter((arg) => arg !== "--json" && arg !== "--embedded");
  const [subcommand, id] = cleanArgs;
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();

  if (subcommand === "show" && id) {
    await showRun(projectRoot, id, json);
    return;
  }

  if (subcommand === "list" || json) {
    await listRuns(projectRoot, json);
    return;
  }

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printRunsHelp();
    return;
  }

  if (subcommand) {
    console.log(`Unknown runs command: ${subcommand}`);
    printRunsHelp();
    return;
  }

  await openRunsMenu(projectRoot, embedded);
}

async function openRunsMenu(projectRoot: string, embedded: boolean): Promise<void> {
  await withMenu(async (rl) => {
    while (true) {
      const runs = await loadRunSummaries(projectRoot);
      if (runs.length === 0) {
        console.log("No harness runs yet.");
        console.log("Use /harness <goal> or /run <goal> to create one.");
        return;
      }

      const selected = await chooseMenuOption(
        rl,
        "Harness runs",
        runs.map((run) => ({
          value: run.id,
          label: run.id,
          description: `${run.apply ? "applied" : "preview"} ${run.mode} - ${truncate(run.goal, 56)}`,
        })),
      );
      if (!selected) return;

      await printRunDetails(runs.find((run) => run.id === selected) ?? null);
      if (!embedded) {
        console.log("");
      }
    }
  });
}

async function listRuns(projectRoot: string, json: boolean): Promise<void> {
  const runs = await loadRunSummaries(projectRoot);
  if (json) {
    console.log(JSON.stringify({ ok: true, projectRoot, runs }, null, 2));
    return;
  }

  if (runs.length === 0) {
    console.log("No harness runs yet.");
    return;
  }

  console.log("GodotCoder runs");
  for (const run of runs) {
    const validation =
      run.validationErrors === null
        ? "not validated"
        : `${run.validationErrors} errors, ${run.validationWarnings ?? 0} warnings`;
    console.log(`${run.id}  ${run.apply ? "applied" : "preview"}  ${run.mode}  ${validation}`);
    console.log(`  ${run.goal}`);
  }
}

async function showRun(projectRoot: string, id: string, json: boolean): Promise<void> {
  const runs = await loadRunSummaries(projectRoot);
  const run = runs.find((candidate) => candidate.id === id || candidate.id.endsWith(id));
  if (!run) {
    console.log(`Run not found: ${id}`);
    return;
  }

  const parsed = JSON.parse(await readFile(run.path, "utf8"));
  if (json) {
    console.log(JSON.stringify({ ok: true, run: parsed, runPath: run.path }, null, 2));
    return;
  }

  await printRunDetails(run);
}

async function printRunDetails(run: RunSummary | null): Promise<void> {
  if (!run) {
    console.log("Run not found.");
    return;
  }

  const parsed = JSON.parse(await readFile(run.path, "utf8"));
  console.log("");
  console.log(`Run: ${run.id}`);
  console.log(`Goal: ${run.goal}`);
  console.log(`Mode: ${run.mode}`);
  console.log(`Apply: ${run.apply ? "yes" : "preview only"}`);
  console.log(`Started: ${run.startedAt}`);
  console.log(`Finished: ${run.finishedAt}`);
  console.log(`Record: ${run.path}`);
  console.log("Steps:");
  for (const step of parsed.steps ?? []) {
    console.log(`  ${String(step.status ?? "unknown").padEnd(7)} ${String(step.agent ?? "agent").padEnd(18)} ${step.summary ?? ""}`);
  }
  if (parsed.validation) {
    console.log(`Validation: ${parsed.validation.summary?.errors ?? 0} errors, ${parsed.validation.summary?.warnings ?? 0} warnings`);
  }
}

async function loadRunSummaries(projectRoot: string): Promise<RunSummary[]> {
  const paths = workspacePaths(projectRoot);
  let entries;
  try {
    entries = await readdir(paths.runsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const runs: RunSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const runPath = path.join(paths.runsDir, entry.name);
    try {
      const parsed = JSON.parse(await readFile(runPath, "utf8"));
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      runs.push({
        id: String(parsed.id ?? entry.name.replace(/\.json$/, "")),
        goal: String(parsed.goal ?? "Untitled run"),
        mode: String(parsed.mode ?? "unknown"),
        apply: Boolean(parsed.apply),
        startedAt: String(parsed.startedAt ?? ""),
        finishedAt: String(parsed.finishedAt ?? ""),
        stepCount: steps.length,
        failedSteps: steps.filter((step: any) => step?.status === "failed").length,
        validationErrors: parsed.validation?.summary?.errors ?? null,
        validationWarnings: parsed.validation?.summary?.warnings ?? null,
        path: runPath,
      });
    } catch {
      continue;
    }
  }

  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function printRunsHelp(): void {
  console.log("Runs commands");
  console.log("  godotcoder runs");
  console.log("  godotcoder runs list");
  console.log("  godotcoder runs show <run-id>");
  console.log("  godotcoder runs --json");
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}
