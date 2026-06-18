import { runHarness } from "../core/harness.js";
import { isTaskIntentFlag, parseTaskIntent } from "../core/brownfield.js";

export async function runHarnessCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const apply = args.includes("--apply") || args.includes("--yes");
  const repair = args.includes("--repair");
  const validate = !args.includes("--no-validate");
  const intent = parseTaskIntent(args);
  const goal = args.filter((arg, index) => !isHarnessFlag(arg, args[index - 1])).join(" ").trim();

  if (!goal) {
    console.log("Usage: godotcoder harness <game goal> [--apply] [--repair] [--json]");
    console.log("Requires a configured model provider.");
    return;
  }

  const result = await runHarness(process.cwd(), goal, { apply, explicitApply: apply, validate, repair, intent: intent ?? undefined });

  if (json) {
    console.log(JSON.stringify({ ok: result.run.validation ? result.run.validation.summary.errors === 0 : true, run: result.run, runPath: result.runPath }, null, 2));
    return;
  }

  console.log("GodotCoder harness run");
  console.log(`Run: ${result.runPath}`);
  console.log(`Mode: ${result.run.mode}`);
  console.log(`Goal: ${result.run.goal}`);
  for (const step of result.run.steps) {
    console.log(`${step.status.padEnd(7)} ${step.agent.padEnd(18)} ${step.summary}`);
  }
  if (result.run.modelImplementation) {
    console.log("");
    console.log(`Model implementation: ${result.run.modelImplementation.provider}:${result.run.modelImplementation.model}`);
  }
  if (!result.run.apply) {
    console.log("Preview only. Apply with: godotcoder harness <goal> --apply");
  }
}

function isHarnessFlag(arg: string, previous: string | undefined): boolean {
  if (isTaskIntentFlag(arg, previous)) return true;
  return ["--json", "--apply", "--yes", "--no-validate", "--repair"].includes(arg);
}
