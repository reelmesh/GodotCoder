import type { Interface } from "node:readline/promises";
import { runHarness } from "../core/harness.js";
import { launchGodot, type LaunchResult } from "../core/launch.js";
import { askMenuQuestion, chooseMenuOption, withMenu } from "../core/menu.js";

interface PipelineOptions {
  apply: boolean;
  validate: boolean;
  llm: boolean;
  repair: boolean;
  play: boolean;
  json: boolean;
}

export async function pipelineCommand(args: string[]): Promise<void> {
  const embedded = args.includes("--embedded");
  const cleanArgs = args.filter((arg) => arg !== "--embedded");
  const json = cleanArgs.includes("--json");

  if (cleanArgs.length === 0 && process.stdin.isTTY && !json) {
    await openPipelineMenu(embedded);
    return;
  }

  const options = parsePipelineOptions(cleanArgs);
  const goal = cleanArgs.filter((arg) => !isPipelineFlag(arg)).join(" ").trim();
  if (!goal) {
    printPipelineHelp();
    return;
  }

  await runPipeline(goal, options);
}

async function openPipelineMenu(_embedded: boolean): Promise<void> {
  await withMenu(async (rl) => {
    const goal = (await askMenuQuestion(rl, "Game idea > ")).trim();
    if (!goal) {
      console.log("No game idea entered.");
      return;
    }

    const applyChoice = await chooseMenuOption(rl, "Pipeline mode", [
      { value: "apply", label: "Build playable slice", description: "write files and validate" },
      { value: "preview", label: "Preview only", description: "no file writes beyond planning/workspace artifacts" },
    ]);
    if (!applyChoice) return;

    const modelChoice = await chooseMenuOption(rl, "Model advisory", [
      { value: "off", label: "Skip model advisory", description: "deterministic harness only" },
      { value: "on", label: "Use configured model", description: "risks and next tasks" },
    ]);
    if (!modelChoice) return;

    const playChoice = applyChoice === "apply"
      ? await chooseMenuOption(rl, "After validation", [
          { value: "stay", label: "Stay in CLI", description: "inspect output first" },
          { value: "play", label: "Launch game", description: "open with configured Godot runtime" },
        ])
      : "stay";
    if (!playChoice) return;

    await runPipeline(goal, {
      apply: applyChoice === "apply",
      validate: true,
      llm: modelChoice === "on",
      repair: true,
      play: playChoice === "play",
      json: false,
    });
  });
}

async function runPipeline(goal: string, options: PipelineOptions): Promise<void> {
  const harness = await runHarness(process.cwd(), goal, {
    apply: options.apply,
    validate: options.validate,
    llm: options.llm,
    repair: options.repair,
  });

  let launch: LaunchResult | null = null;
  if (options.play) {
    launch = await launchGodot(harness.run.projectRoot, "game");
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: pipelineOk(harness.run), run: harness.run, runPath: harness.runPath, launch }, null, 2));
    return;
  }

  console.log("GodotCoder pipeline");
  console.log(`Goal: ${harness.run.goal}`);
  console.log(`Mode: ${harness.run.mode}`);
  console.log(`Run: ${harness.runPath}`);
  console.log("");
  for (const step of harness.run.steps) {
    console.log(`${step.status.padEnd(7)} ${step.agent.padEnd(18)} ${step.summary}`);
  }

  if (harness.run.validation) {
    console.log("");
    console.log(`Validation: ${harness.run.validation.summary.errors} errors, ${harness.run.validation.summary.warnings} warnings`);
  }

  if (!options.apply) {
    console.log("");
    console.log("Preview only. Run `godotcoder pipeline <idea>` without --preview to build the playable slice.");
  }

  if (launch) {
    console.log("");
    console.log(`Launched Godot game: ${launch.command.join(" ")}`);
  }
}

function parsePipelineOptions(args: string[]): PipelineOptions {
  return {
    apply: !args.includes("--preview"),
    validate: !args.includes("--no-validate"),
    llm: args.includes("--llm") || args.includes("--model"),
    repair: !args.includes("--no-repair"),
    play: args.includes("--play"),
    json: args.includes("--json"),
  };
}

function isPipelineFlag(arg: string): boolean {
  return ["--preview", "--no-validate", "--no-repair", "--llm", "--model", "--play", "--json"].includes(arg);
}

function pipelineOk(run: Awaited<ReturnType<typeof runHarness>>["run"]): boolean {
  return run.validation ? run.validation.summary.errors === 0 : true;
}

function printPipelineHelp(): void {
  console.log("Usage: godotcoder pipeline <game idea> [--preview] [--llm] [--play] [--no-repair] [--json]");
}
