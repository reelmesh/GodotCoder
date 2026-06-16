import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { workspacePaths } from "./workspace.js";

export interface GodotDocSource {
  id: string;
  title: string;
  url: string;
  summary: string;
  tags: string[];
}

export interface GodotDocMatch extends GodotDocSource {
  score: number;
}

export const officialGodotDocs: GodotDocSource[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    url: "https://docs.godotengine.org/en/stable/getting_started/introduction/index.html",
    summary: "Official entry point for Godot concepts, editor workflow, scenes, nodes, and project structure.",
    tags: ["intro", "editor", "scene", "node", "project"],
  },
  {
    id: "gdscript-basics",
    title: "GDScript Basics",
    url: "https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html",
    summary: "GDScript syntax, types, functions, classes, signals, exports, and idioms.",
    tags: ["gdscript", "script", "syntax", "class", "signal", "export"],
  },
  {
    id: "nodes-and-scenes",
    title: "Nodes and Scenes",
    url: "https://docs.godotengine.org/en/stable/getting_started/step_by_step/nodes_and_scenes.html",
    summary: "How Godot structures games with nodes, scene trees, instancing, and composition.",
    tags: ["node", "scene", "tree", "instance", "composition"],
  },
  {
    id: "input-examples",
    title: "Input Examples",
    url: "https://docs.godotengine.org/en/stable/tutorials/inputs/input_examples.html",
    summary: "Keyboard, mouse, controller, and action input examples.",
    tags: ["input", "keyboard", "mouse", "controller", "action"],
  },
  {
    id: "2d-movement",
    title: "2D Movement Overview",
    url: "https://docs.godotengine.org/en/stable/tutorials/2d/2d_movement.html",
    summary: "Common 2D movement patterns for Godot games.",
    tags: ["2d", "movement", "player", "physics"],
  },
  {
    id: "class-node2d",
    title: "Node2D Class Reference",
    url: "https://docs.godotengine.org/en/stable/classes/class_node2d.html",
    summary: "Official API reference for Node2D transforms, drawing, and 2D node behavior.",
    tags: ["node2d", "class", "2d", "transform", "draw"],
  },
  {
    id: "class-characterbody2d",
    title: "CharacterBody2D Class Reference",
    url: "https://docs.godotengine.org/en/stable/classes/class_characterbody2d.html",
    summary: "Official API reference for kinematic 2D character movement.",
    tags: ["characterbody2d", "class", "2d", "physics", "movement"],
  },
  {
    id: "class-input",
    title: "Input Class Reference",
    url: "https://docs.godotengine.org/en/stable/classes/class_input.html",
    summary: "Official API reference for polling input state and actions.",
    tags: ["input", "class", "action", "keyboard", "mouse"],
  },
  {
    id: "signals",
    title: "Signals",
    url: "https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html",
    summary: "Godot signal concepts and connection patterns.",
    tags: ["signal", "connect", "event", "node"],
  },
  {
    id: "resources",
    title: "Resources",
    url: "https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html",
    summary: "Reusable data resources, custom resources, and resource loading.",
    tags: ["resource", "tres", "res", "load", "data"],
  },
  {
    id: "command-line",
    title: "Command Line Tutorial",
    url: "https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html",
    summary: "Godot command-line usage for editor, headless validation, exports, and project paths.",
    tags: ["cli", "command", "headless", "validation", "export"],
  },
  {
    id: "project-settings",
    title: "Project Settings",
    url: "https://docs.godotengine.org/en/stable/tutorials/editor/project_settings.html",
    summary: "Project settings, input map, application config, and engine configuration.",
    tags: ["project", "settings", "input_map", "config"],
  },
  {
    id: "exporting-projects",
    title: "Exporting Projects",
    url: "https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html",
    summary: "Export presets and project export workflow.",
    tags: ["export", "preset", "release", "build"],
  },
];

export function searchGodotDocs(query: string, limit = 8): GodotDocMatch[] {
  const terms = tokenize(query);
  const matches = officialGodotDocs
    .map((source) => ({ ...source, score: scoreSource(source, terms) }))
    .filter((source) => source.score > 0 || terms.length === 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  return matches.slice(0, limit);
}

export async function writeDocsContext(projectRoot: string, query: string, limit = 8): Promise<{ path: string; matches: GodotDocMatch[] }> {
  const paths = workspacePaths(projectRoot);
  const matches = searchGodotDocs(query, limit);
  await mkdir(paths.cacheDocsDir, { recursive: true });
  await writeFile(paths.docsContext, JSON.stringify({ schemaVersion: 1, query, matches }, null, 2) + "\n");
  return { path: paths.docsContext, matches };
}

export async function cacheGodotDoc(projectRoot: string, id: string): Promise<{ source: GodotDocSource; htmlPath: string; metaPath: string }> {
  const source = officialGodotDocs.find((candidate) => candidate.id === id);
  if (!source) {
    throw new CliError("DOC_NOT_FOUND", `Unknown Godot doc source: ${id}`);
  }

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new CliError("DOC_FETCH_FAILED", `${response.status} ${response.statusText}: ${source.url}`);
  }

  const paths = workspacePaths(projectRoot);
  await mkdir(paths.cacheDocsDir, { recursive: true });
  const htmlPath = path.join(paths.cacheDocsDir, `${source.id}.html`);
  const metaPath = path.join(paths.cacheDocsDir, `${source.id}.json`);
  await writeFile(htmlPath, await response.text());
  await writeFile(metaPath, JSON.stringify({ schemaVersion: 1, cachedAt: new Date().toISOString(), source }, null, 2) + "\n");
  return { source, htmlPath, metaPath };
}

export function docsPromptContext(query: string, limit = 5): string {
  const matches = searchGodotDocs(query, limit);
  if (matches.length === 0) return "No official docs matched.";

  let projectRoot = process.cwd();
  let found = false;
  while (true) {
    if (fs.existsSync(path.join(projectRoot, "project.godot"))) {
      found = true;
      break;
    }
    const parent = path.dirname(projectRoot);
    if (parent === projectRoot) break;
    projectRoot = parent;
  }

  const paths = found ? workspacePaths(projectRoot) : null;

  return matches
    .map((match) => {
      let docBody = "";
      if (paths) {
        const htmlPath = path.join(paths.cacheDocsDir, `${match.id}.html`);
        if (fs.existsSync(htmlPath)) {
          try {
            const htmlText = fs.readFileSync(htmlPath, "utf8");
            const cleaned = cleanHtmlToMarkdown(htmlText);
            docBody = cleaned.length > 2500 ? cleaned.slice(0, 2500) + "\n...[truncated]..." : cleaned;
          } catch (error) {
            // ignore read error
          }
        }
      }
      
      const snippet = docBody ? `\n--- Cached Documentation Content ---\n${docBody}\n--- End Content ---` : "";
      return `- ${match.title}: ${match.summary}\n  URL: ${match.url}${snippet}`;
    })
    .join("\n\n");
}

export function cleanHtmlToMarkdown(htmlText: string): string {
  const bodyMatch = htmlText.match(/<div[^>]*itemprop="articleBody"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                    htmlText.match(/<div[^>]*role="main"[^>]*>([\s\S]*?)<\/div>/i) ||
                    htmlText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let mainContent = bodyMatch ? bodyMatch[1]! : htmlText;

  mainContent = mainContent.replace(/<script[\s\S]*?<\/script>/gi, "");
  mainContent = mainContent.replace(/<style[\s\S]*?<\/style>/gi, "");
  mainContent = mainContent.replace(/<!--[\s\S]*?-->/g, "");

  mainContent = mainContent.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  mainContent = mainContent.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  mainContent = mainContent.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  mainContent = mainContent.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");

  mainContent = mainContent.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```gdscript\n$1\n```\n");
  mainContent = mainContent.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n");
  mainContent = mainContent.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, " `$1` ");

  mainContent = mainContent.replace(/<[^>]+>/g, "");

  mainContent = mainContent
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  const lines = mainContent.split(/\r?\n/).map(line => line.trim());
  const cleanLines: string[] = [];
  for (const line of lines) {
    if (line === "") {
      if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1] !== "") {
        cleanLines.push("");
      }
    } else {
      cleanLines.push(line);
    }
  }

  return cleanLines.join("\n").trim();
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length >= 2);
}

function scoreSource(source: GodotDocSource, terms: string[]): number {
  if (terms.length === 0) return 1;
  const title = source.title.toLowerCase();
  const summary = source.summary.toLowerCase();
  const tags = source.tags.map((tag) => tag.toLowerCase());
  let score = 0;
  for (const term of terms) {
    if (source.id.includes(term)) score += 5;
    if (title.includes(term)) score += 4;
    if (tags.some((tag) => tag.includes(term))) score += 3;
    if (summary.includes(term)) score += 1;
  }
  return score;
}
