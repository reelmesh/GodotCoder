import { launchGodot } from "../core/launch.js";
import { runPlaytest } from "../core/playtest.js";
import { findGodotProjectRoot } from "../core/godot-project.js";

export async function playCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const test = args.includes("--test") || args.includes("-t") || args.includes("--playtest");

  if (test) {
    const projectRoot = await findGodotProjectRoot(process.cwd());
    if (!json) {
      console.log(`Running automated runtime playtest for 5 seconds on ${projectRoot}...`);
    }
    const result = await runPlaytest(projectRoot);

    if (json) {
      console.log(JSON.stringify({ ok: result.ok, playtest: result }, null, 2));
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

