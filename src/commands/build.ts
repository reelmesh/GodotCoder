import { ensureGreenfieldGodotProject } from "../core/greenfield.js";
import { tryFindGodotProjectRoot } from "../core/godot-project.js";
import { buildAsteroidShooter } from "../core/builders/asteroid-shooter.js";
import { validateProject } from "./validate.js";

export async function buildProject(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const shouldValidate = !args.includes("--no-validate");
  const prompt = args.filter((arg) => arg !== "--json" && arg !== "--no-validate").join(" ").trim();
  const existingRoot = await tryFindGodotProjectRoot(process.cwd());
  const projectRoot = existingRoot ?? process.cwd();
  const scaffold = await ensureGreenfieldGodotProject(projectRoot, prompt || "GodotCoder Game");
  const result = await buildAsteroidShooter(projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: true, scaffold, result }, null, 2));
  } else {
    if (scaffold.createdProjectFile) {
      console.log("No project.godot found. Created a minimal greenfield Godot project.");
    }
    console.log(result.summary);
    for (const file of result.filesWritten) {
      console.log(`Wrote ${file}`);
    }
  }

  if (shouldValidate && !json) {
    await validateProject([]);
  }
}
