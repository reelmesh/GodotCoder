import { launchGodot } from "../core/launch.js";

export async function playCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
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
