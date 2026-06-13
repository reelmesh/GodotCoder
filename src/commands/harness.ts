import { runHarness } from "../core/harness.js";

export async function runHarnessCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const apply = args.includes("--apply") || args.includes("--yes");
  const llm = args.includes("--llm") || args.includes("--model");
  const repair = args.includes("--repair");
  const validate = !args.includes("--no-validate");
  const goal = args.filter((arg) => !["--json", "--apply", "--yes", "--no-validate", "--llm", "--model", "--repair"].includes(arg)).join(" ").trim();

  if (!goal) {
    console.log("Usage: godotcoder harness <game goal> [--apply] [--repair] [--json]");
    return;
  }

  const result = await runHarness(process.cwd(), goal, { apply, validate, llm, repair });

  if (json) {
    console.log(JSON.stringify({ ok: result.run.validation ? result.run.validation.summary.errors === 0 : true, run: result.run, runPath: result.runPath }, null, 2));
    return;
  }

  console.log("GodotCoder harness run");
  console.log(`Run: ${result.runPath}`);
  console.log(`Mode: ${result.run.mode}`);
  console.log(`Implementation: ${result.run.implementationSource}`);
  console.log(`Goal: ${result.run.goal}`);
  for (const step of result.run.steps) {
    console.log(`${step.status.padEnd(7)} ${step.agent.padEnd(18)} ${step.summary}`);
  }
  if (result.run.modelAdvisory) {
    console.log("");
    console.log(`${result.run.modelAdvisory.provider}:${result.run.modelAdvisory.model}`);
    console.log(result.run.modelAdvisory.content);
  }
  if (result.run.modelImplementation) {
    console.log("");
    console.log(`Model implementation: ${result.run.modelImplementation.provider}:${result.run.modelImplementation.model}`);
  }
  if (!apply) {
    console.log("Preview only. Apply with: godotcoder harness <goal> --apply");
  }
}
