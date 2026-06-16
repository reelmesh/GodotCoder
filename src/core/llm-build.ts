import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeTrackedFile, type FileChange } from "./change-records.js";
import { CliError } from "./errors.js";
import type { GeneratedFile } from "./builders/types.js";
import { docsPromptContext } from "./godot-docs.js";
import { inspectGodotProject } from "./godot-project.js";
import { pathExists } from "./files.js";
import { completeWithModel, loadModelConfig, modelSystemPrompt, type ModelReply } from "./providers.js";
import { asObject, asString } from "./schema.js";
import { workspacePaths } from "./workspace.js";

export interface LlmBuildPlan {
  summary: string;
  files: GeneratedFile[];
  reply: ModelReply;
}

export interface LlmBuildResult {
  filesWritten: string[];
  changes: FileChange[];
  summary: string;
  reply: ModelReply;
}

export interface LlmBuildAttempt {
  stage: "initial" | "retry";
  provider: string | null;
  model: string | null;
  error: string;
  content: string | null;
}

export class LlmBuildError extends CliError {
  constructor(message: string, public readonly attempts: LlmBuildAttempt[]) {
    super("MODEL_OUTPUT_INVALID", message);
  }
}

export async function generateLlmBuild(projectRoot: string, prompt: string): Promise<LlmBuildPlan> {
  const config = await loadModelConfig(projectRoot);
  if (!config) {
    throw new CliError("MODEL_CONFIG_MISSING", "No model provider configured. Use `godotcoder models use ...` first.");
  }

  const projectIndex = await inspectGodotProject(projectRoot);
  const artifacts = await readPlanningContext(projectRoot);
  const messages = [
    { role: "system" as const, content: `${modelSystemPrompt()}\n\nReturn only one JSON object. No markdown fences. No prose outside JSON. Final message must start with { and end with }.` },
    {
      role: "user" as const,
      content: buildPrompt({ prompt, projectIndex, artifacts }),
    },
  ];
  const attempts: LlmBuildAttempt[] = [];
  let reply = await completeWithModel(config, messages, projectRoot);
  let parsed = parseLlmBuildReply(reply.content);
  if (!parsed.ok) {
    attempts.push(createAttempt("initial", reply, parsed.error));
    reply = await completeWithModel(config, [
      { role: "system", content: "Return only valid JSON. No prose. No markdown. First character must be { and last character must be }." },
      {
        role: "user",
        content: buildRetryPrompt({ prompt, projectIndex, parseError: parsed.error }),
      },
    ], projectRoot);
    parsed = parseLlmBuildReply(reply.content);
    if (!parsed.ok) {
      attempts.push(createAttempt("retry", reply, parsed.error));
    }
  }
  if (!parsed.ok) {
    throw new LlmBuildError(parsed.error, attempts);
  }
  return { summary: parsed.summary, files: parsed.files, reply };
}

export async function applyLlmBuild(projectRoot: string, plan: LlmBuildPlan): Promise<LlmBuildResult> {
  const changes: FileChange[] = [];
  for (const file of plan.files) {
    changes.push(await writeTrackedFile(projectRoot, file.path, file.contents));
  }

  return {
    filesWritten: changes.map((change) => change.path),
    changes,
    summary: plan.summary,
    reply: plan.reply,
  };
}

function parseLlmBuildReply(content: string): { ok: true; summary: string; files: GeneratedFile[] } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = parseJsonObject(content);
  } catch (error) {
    return { ok: false, error: `LLM build reply was not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    const root = asObject(json, "LLM build reply");
    const summary = asString(root.summary, "LLM build reply summary");
    const rawFiles = Array.isArray(root.files) ? root.files : [];
    if (rawFiles.length === 0) {
      throw new CliError("MODEL_OUTPUT_INVALID", "LLM build reply must include at least one file.");
    }
    if (rawFiles.length > 16) {
      throw new CliError("MODEL_OUTPUT_INVALID", "LLM build reply may include at most 16 files.");
    }

    const files = rawFiles.map((value, index) => {
      const file = asObject(value, `LLM build reply files[${index}]`);
      const relativePath = normalizeGeneratedPath(asString(file.path, `LLM build reply files[${index}].path`));
      const contents = readGeneratedContents(file, index);
      if (contents.length > 160_000) {
        throw new CliError("MODEL_OUTPUT_INVALID", `${relativePath} is too large for one controlled build step.`);
      }
      
      const placeholderMatch = contents.match(/#\s*(TODO|FIXME|IMPLEMENT|placeholder)/i) || 
                               contents.match(/\bpass\s+#/i);
      if (placeholderMatch) {
        throw new CliError("MODEL_OUTPUT_INVALID", `File ${relativePath} contains unimplemented placeholders or TODO comments ("${placeholderMatch[0]}"). All generated code must be complete and fully functional.`);
      }
      
      return { path: relativePath, contents };
    });

    return { ok: true, summary, files };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readGeneratedContents(file: Record<string, unknown>, index: number): string {
  if (typeof file.contents === "string") {
    return file.contents;
  }

  if (Array.isArray(file.lines)) {
    return file.lines.map((line, lineIndex) => asString(line, `LLM build reply files[${index}].lines[${lineIndex}]`)).join("\n") + "\n";
  }

  throw new CliError("MODEL_OUTPUT_INVALID", `LLM build reply files[${index}] must include contents string or lines array.`);
}

function createAttempt(stage: LlmBuildAttempt["stage"], reply: ModelReply, error: string): LlmBuildAttempt {
  return {
    stage,
    provider: reply.provider,
    model: reply.model,
    error,
    content: reply.content.slice(0, 40_000),
  };
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) return fence[1]!.trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function repairRawNewlinesInJsonStrings(jsonStr: string): string {
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (inString) {
      if (escape) {
        result += char;
        escape = false;
      } else if (char === '\\') {
        result += char;
        escape = true;
      } else if (char === '"') {
        result += char;
        inString = false;
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        if (jsonStr[i + 1] === '\n') {
          result += '\\n';
          i++; // Skip \n
        } else {
          result += '\\n';
        }
      } else {
        result += char;
      }
    } else {
      result += char;
      if (char === '"') {
        inString = true;
      }
    }
  }
  return result;
}

function parseJsonObject(content: string): unknown {
  const extracted = extractJson(content);
  const fixedNewlines = repairRawNewlinesInJsonStrings(extracted);
  try {
    return JSON.parse(fixedNewlines);
  } catch (firstError) {
    try {
      return JSON.parse(repairLooseJson(fixedNewlines));
    } catch {
      throw firstError;
    }
  }
}

function repairLooseJson(value: string): string {
  return value
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)(summary|files|path|contents|lines)\s*:/g, '$1"$2":')
    .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, inner: string) => `: "${inner.replace(/"/g, '\\"')}"`);
}

function normalizeGeneratedPath(value: string): string {
  const withoutScheme = value.replace(/^res:\/\//, "");
  const normalized = path.posix.normalize(withoutScheme.replace(/\\/g, "/"));
  if (!isAllowedGeneratedPath(normalized)) {
    throw new CliError("MODEL_OUTPUT_INVALID", `Model tried to write unsupported path: ${value}`);
  }
  return normalized;
}

function isAllowedGeneratedPath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("../") || value.includes("/../")) return false;
  if (value === "." || value.startsWith(".godot/") || value.startsWith(".godotcoder/") || value.startsWith(".godotcoder.local/")) return false;
  if (value === "node_modules" || value.startsWith("node_modules/")) return false;
  if (value === "project.godot" || value === "export_presets.cfg") return true;
  return /\.(gd|tscn|tres|res|gdshader|import|cfg|txt|md|json)$/i.test(value);
}

async function readPlanningContext(projectRoot: string): Promise<Record<string, string>> {
  const paths = workspacePaths(projectRoot);
  const candidates = {
    brief: paths.brief,
    gdd: paths.gdd,
    technicalPlan: paths.technicalPlan,
    tasks: paths.tasks,
  };
  const artifacts: Record<string, string> = {};
  for (const [name, filePath] of Object.entries(candidates)) {
    if (await pathExists(filePath)) {
      artifacts[name] = (await readFile(filePath, "utf8")).slice(0, 6000);
    }
  }
  return artifacts;
}

function buildPrompt(input: { prompt: string; projectIndex: Awaited<ReturnType<typeof inspectGodotProject>>; artifacts: Record<string, string> }): string {
  return `Create a controlled Godot implementation patch for this user task.

Task:
${input.prompt}

Project:
- Godot target: 4.3+
- Main scene: ${input.projectIndex.mainScene ?? "unknown"}
- Scripts: ${input.projectIndex.scripts.join(", ") || "none"}
- Scenes: ${input.projectIndex.scenes.join(", ") || "none"}
- Resources: ${input.projectIndex.resources.join(", ") || "none"}
- Autoloads: ${input.projectIndex.autoloads.join(", ") || "none"}

Planning artifacts:
${Object.entries(input.artifacts).map(([name, text]) => `## ${name}\n${text}`).join("\n\n") || "none"}

Official Godot docs sources to prefer:
${docsPromptContext(input.prompt)}

Return JSON exactly matching this shape:
{
  "summary": "one sentence describing the patch",
  "files": [
    {
      "path": "scripts/example.gd",
      "lines": [
        "extends Node2D",
        "",
        "func _ready() -> void:",
        "\\tprint(\\"ready\\")"
      ]
    }
  ]
}

Rules:
- Return full file contents as a JSON array named "lines", one source line per JSON string.
- Complete the code fully! DO NOT leave comments like "# TODO: implement combat" or use placeholders. All generated files must be production-ready and fully written.
- Escape tabs as \\t and quotes as \\" inside JSON strings.
- Do not put raw newline characters inside a JSON string.
- Do not use markdown fences.
- Do not return partial patches.
- Use only Godot-native project files: .gd, .tscn, .tres, .gdshader, project.godot, export_presets.cfg, or small project metadata files.
- Keep patch small enough to review.
- Prefer GDScript.
- No external dependencies.
- No files under .godot, .godotcoder, .godotcoder.local, node_modules, or absolute paths.
- Use Godot 4.3+ APIs.`;
}

function buildRetryPrompt(input: { prompt: string; projectIndex: Awaited<ReturnType<typeof inspectGodotProject>>; parseError: string }): string {
  return `Previous response failed validation: ${input.parseError}

Generate a small Godot 4.3+ implementation for:
${input.prompt}

Current project:
- Main scene: ${input.projectIndex.mainScene ?? "unknown"}
- Scripts: ${input.projectIndex.scripts.join(", ") || "none"}

Return exactly this JSON shape and nothing else:
{
  "summary": "short patch summary",
  "files": [
    {
      "path": "scripts/main.gd",
      "lines": [
        "extends Node2D",
        "",
        "func _ready() -> void:",
        "\\tprint(\\"ready\\")"
      ]
    }
  ]
}

Rules:
- Write full, complete, and fully functional files. DO NOT leave comments like "# TODO" or use placeholders.
- First character of final answer must be {.
- Last character of final answer must be }.
- Use "lines", not "contents".
- One source line per JSON string.
- No markdown.
- No explanation.
- No reasoning in final message.`;
}
