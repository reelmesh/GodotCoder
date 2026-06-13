import { listBuilders } from "../core/builders/index.js";

export async function buildersCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const builders = listBuilders();

  if (json) {
    console.log(JSON.stringify({ ok: true, builders }, null, 2));
    return;
  }

  console.log("GodotCoder builders");
  for (const builder of builders) {
    console.log(`${builder.id.padEnd(18)} ${builder.summary}`);
    console.log(`  genres: ${builder.genres.join(", ")}`);
    console.log(`  capabilities: ${builder.capabilities.join(", ")}`);
  }
}
