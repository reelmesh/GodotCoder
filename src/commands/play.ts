import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { launchGodot } from "../core/launch.js";
import { formatPlaytestFeedbackEntry, runPlaytest, suggestPlaytestTasks, suggestTasksFromPlaytestFeedback, type PlaytestTaskSuggestion } from "../core/playtest.js";
import { findGodotProjectRoot } from "../core/godot-project-indexer.js";
import { addTask, type TaskRecord } from "../core/tasks.js";
import { workspacePaths } from "../core/workspace.js";

export async function playCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const test = args.includes("--test") || args.includes("-t") || args.includes("--playtest");
  const apply = args.includes("--apply");
  const suggestTasks = apply || args.includes("--suggest-tasks");
  const feedbackIndex = args.indexOf("feedback");

  if (feedbackIndex !== -1) {
    const projectRoot = await findGodotProjectRoot(process.cwd());
    const feedback = args.slice(feedbackIndex + 1).filter((arg) => !arg.startsWith("--")).join(" ").trim();
    if (!feedback) {
      console.log("Usage: godotcoder playtest feedback <playtest note> [--apply] [--json]");
      return;
    }
    const suggestions = suggestTasksFromPlaytestFeedback(feedback);
    const tasks = apply ? await addSuggestedTasks(projectRoot, suggestions, null) : [];
    const feedbackPath = apply ? await appendPlaytestFeedback(projectRoot, feedback, suggestions) : null;
    if (json) {
      console.log(JSON.stringify({ ok: true, feedback, feedbackPath, taskSuggestions: suggestions, tasks }, null, 2));
      return;
    }
    printTaskSuggestions(suggestions, tasks);
    if (feedbackPath) {
      console.log(`Feedback log: ${feedbackPath}`);
    }
    return;
  }

  if (test) {
    const projectRoot = await findGodotProjectRoot(process.cwd());
    if (!json) {
      console.log(`Running automated runtime playtest for 5 seconds on ${projectRoot}...`);
    }
    const result = await runPlaytest(projectRoot);
    const suggestions = suggestTasks ? suggestPlaytestTasks(result) : [];
    const tasks = apply ? await addSuggestedTasks(projectRoot, suggestions, result.id) : [];

    if (json) {
      console.log(JSON.stringify({ ok: result.ok, playtest: result, taskSuggestions: suggestions, tasks }, null, 2));
      return;
    }

    console.log(`\nPlaytest completed in ${(result.durationMs / 1000).toFixed(2)}s.`);
    if (result.ok) {
      console.log("Status: SUCCESS (No runtime errors detected)");
    } else {
      console.log(`Status: FAILED (${result.errors.length} error(s) detected)`);
      console.log("\nErrors encountered:");
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }
    console.log(`Interactivity: ${result.interactivity.appearsInteractive ? "appears interactive" : "needs review"}`);
    for (const warning of result.warnings) {
      console.log(`WARN: ${warning}`);
    }
    console.log(`Timeline events: ${result.timeline.length}`);
    console.log(`Record: ${result.artifacts.recordPath}`);
    console.log(`Logs: ${result.artifacts.stdoutPath}, ${result.artifacts.stderrPath}`);
    if (result.visual) {
      console.log(`Frame: ${result.visual.artifactPath} (${result.visual.width}x${result.visual.height}, blank=${result.visual.blank}, nearBlank=${result.visual.nearBlank})`);
    }
    if (suggestTasks) {
      printTaskSuggestions(suggestions, tasks);
    }
    return;
  }

  const mode = args.includes("--editor") || args.includes("-e") ? "editor" : "game";
  const result = await launchGodot(process.cwd(), mode);

  if (json) {
    console.log(JSON.stringify({ ok: true, launch: result }, null, 2));
    return;
  }

  console.log(`Launched Godot ${mode}.`);
  console.log(`Project: ${result.projectRoot}`);
  console.log(`Command: ${result.command.join(" ")}`);
  if (result.pid) {
    console.log(`PID: ${result.pid}`);
  }
}

async function appendPlaytestFeedback(projectRoot: string, feedback: string, suggestions: PlaytestTaskSuggestion[]): Promise<string> {
  const feedbackPath = path.join(workspacePaths(projectRoot).playtestsDir, "feedback.md");
  await mkdir(path.dirname(feedbackPath), { recursive: true });
  await appendFile(feedbackPath, formatPlaytestFeedbackEntry({
    createdAt: new Date().toISOString(),
    feedback,
    suggestions,
  }));
  return feedbackPath;
}

async function addSuggestedTasks(projectRoot: string, suggestions: PlaytestTaskSuggestion[], playtestId: string | null): Promise<TaskRecord[]> {
  const tasks: TaskRecord[] = [];
  for (const suggestion of suggestions) {
    const { task } = await addTask(projectRoot, {
      title: `[${suggestion.intent}] ${suggestion.title}`,
      description: suggestion.description,
      links: playtestId ? { playtests: [playtestId] } : undefined,
    });
    tasks.push(task);
  }
  return tasks;
}

function printTaskSuggestions(suggestions: PlaytestTaskSuggestion[], tasks: TaskRecord[]): void {
  if (suggestions.length === 0) {
    console.log("Task suggestions: none");
    return;
  }
  console.log("\nTask suggestions:");
  suggestions.forEach((suggestion, index) => {
    const task = tasks[index];
    console.log(`  - ${task ? `${task.id} ` : ""}[${suggestion.intent}] ${suggestion.title}`);
  });
  if (tasks.length === 0) {
    console.log("Run again with --apply to append these to the task board.");
  }
}
