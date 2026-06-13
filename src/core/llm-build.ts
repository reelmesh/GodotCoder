import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeTrackedFile, type FileChange } from "./change-records.js";
import { CliError } from "./errors.js";
import type { GeneratedFile } from "./builders/types.js";
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

export async function generateLlmBuild(projectRoot: string, prompt: string): Promise<LlmBuildPlan> {
  const config = await loadModelConfig(projectRoot);
  if (!config) {
    throw new CliError("MODEL_CONFIG_MISSING", "No model provider configured. Use `godotcoder models use ...` first.");
  }

  const projectIndex = await inspectGodotProject(projectRoot);
  const artifacts = await readPlanningContext(projectRoot);
  const reply = await completeWithModel(config, [
    { role: "system", content: `${modelSystemPrompt()}\n\nReturn only JSON. No markdown fences. No prose outside JSON.` },
    {
      role: "user",
      content: buildPrompt({ prompt, projectIndex, artifacts }),
    },
  ], projectRoot);

  const parsed = parseLlmBuildReply(reply.content);
  return { ...parsed, reply };
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

function parseLlmBuildReply(content: string): Omit<LlmBuildPlan, "reply"> {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(content));
  } catch (error) {
    throw new CliError("MODEL_OUTPUT_INVALID", `LLM build reply was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    const contents = asString(file.contents, `LLM build reply files[${index}].contents`);
    if (contents.length > 160_000) {
      throw new CliError("MODEL_OUTPUT_INVALID", `${relativePath} is too large for one controlled build step.`);
    }
    return { path: relativePath, contents };
  });

  return { summary, files };
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

Return JSON exactly matching this shape:
{
  "summary": "one sentence describing the patch",
  "files": [
    {
      "path": "scripts/example.gd",
      "contents": "full file contents"
    }
  ]
}

Rules:
- Return full file contents, not partial patches.
- Use only Godot-native project files: .gd, .tscn, .tres, .gdshader, project.godot, export_presets.cfg, or small project metadata files.
- Keep patch small enough to review.
- Prefer GDScript.
- No external dependencies.
- No files under .godot, .godotcoder, .godotcoder.local, node_modules, or absolute paths.
- Use Godot 4.3+ APIs.`;
}
