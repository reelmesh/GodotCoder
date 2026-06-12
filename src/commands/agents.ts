import { godotAgents } from "../core/agents.js";

export async function showAgents(args: string[]): Promise<void> {
  const json = args.includes("--json");

  if (json) {
    console.log(JSON.stringify({ ok: true, agents: godotAgents }, null, 2));
    return;
  }

  console.log("GodotCoder agents");
  for (const agent of godotAgents) {
    console.log(`${agent.id.padEnd(18)} ${agent.title}`);
    console.log(`  ${agent.role}`);
  }
}
