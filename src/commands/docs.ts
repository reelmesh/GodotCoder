import { tryFindGodotProjectRoot } from "../core/godot-project-indexer.js";
import { cacheGodotDoc, loadCachedGodotDoc, officialGodotDocs, searchGodotDocs, writeDocsContext } from "../core/godot-docs.js";

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
    console.log(`Text: ${result.textPath}`);
    console.log(`Meta: ${result.metaPath}`);
    return;
  }

  if (subcommand === "show") {
    const id = rest[0];
    if (!id) {
      console.log("Usage: godotcoder docs show <doc-id>");
      return;
    }
    const cached = await loadCachedGodotDoc(projectRoot, id);
    if (!cached) {
      console.log(`Doc ${id} is not cached. Run: godotcoder docs cache ${id}`);
      return;
    }
    if (json) {
      console.log(JSON.stringify({ ok: true, doc: cached }, null, 2));
      return;
    }
    console.log(`${cached.source.title}`);
    console.log(cached.source.url);
    console.log(`Cached: ${cached.cachedAt}`);
    console.log(`Text: ${cached.textPath}`);
    for (const excerpt of cached.excerpts) {
      console.log("");
      console.log(excerpt);
    }
    return;
  }

  console.log("Usage: godotcoder docs [search <query>|list|cache <doc-id>|show <doc-id>] [--json]");
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
