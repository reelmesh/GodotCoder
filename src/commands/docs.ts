import { tryFindGodotProjectRoot } from "../core/godot-project.js";
import { cacheGodotDoc, officialGodotDocs, searchGodotDocs, writeDocsContext } from "../core/godot-docs.js";

export async function docsCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const cleanArgs = args.filter((arg) => arg !== "--json");
  const [subcommand, ...rest] = cleanArgs;
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();

  if (!subcommand || subcommand === "search") {
    const query = rest.join(" ").trim();
    const matches = searchGodotDocs(query);
    await writeDocsContext(projectRoot, query);
    if (json) {
      console.log(JSON.stringify({ ok: true, query, matches }, null, 2));
      return;
    }
    printMatches(query, matches);
    return;
  }

  if (subcommand === "list") {
    if (json) {
      console.log(JSON.stringify({ ok: true, docs: officialGodotDocs }, null, 2));
      return;
    }
    printMatches("", officialGodotDocs.map((source) => ({ ...source, score: 1 })));
    return;
  }

  if (subcommand === "cache") {
    const id = rest[0];
    if (!id) {
      console.log("Usage: godotcoder docs cache <doc-id>");
      return;
    }
    const result = await cacheGodotDoc(projectRoot, id);
    if (json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      return;
    }
    console.log(`Cached ${result.source.title}`);
    console.log(`HTML: ${result.htmlPath}`);
    console.log(`Meta: ${result.metaPath}`);
    return;
  }

  console.log("Usage: godotcoder docs [search <query>|list|cache <doc-id>] [--json]");
}

function printMatches(query: string, matches: Array<{ id: string; title: string; url: string; summary: string; score: number }>): void {
  console.log("Godot docs");
  if (query) {
    console.log(`Query: ${query}`);
  }
  if (matches.length === 0) {
    console.log("No docs matched.");
    return;
  }
  for (const match of matches) {
    console.log(`${match.id.padEnd(22)} ${match.title}`);
    console.log(`  ${match.summary}`);
    console.log(`  ${match.url}`);
  }
}
