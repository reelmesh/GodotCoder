import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeTrackedFile, type FileChange } from "./change-records.js";
import { assertBrownfieldSafety, brownfieldPromptGuidance, detectBrownfieldProject, inferTaskIntent, type BrownfieldProfile, type BrownfieldSafetyReport, type TaskIntent } from "./brownfield.js";
import { CliError } from "./errors.js";
import type { GeneratedFile } from "./builders/types.js";
import { docsPromptContextWithExcerpts } from "./godot-docs.js";
import { inspectGodotProject } from "./godot-project.js";
import { pathExists } from "./files.js";
import { completeWithModel, loadModelConfigForRole, modelSystemPrompt, type ModelReply } from "./providers.js";
import { asObject, asString } from "./schema.js";
import { workspacePaths } from "./workspace.js";
import { formatModelRetryContext, latestModelContext, writeModelRun, type ModelRunRecord } from "./model-runs.js";

async function loadPrompt(name: string): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "..", "prompts", name),
    path.join(moduleDir, "..", "..", "src", "prompts", name),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return readFile(candidate, "utf8");
    }
  }
  throw new CliError("PROMPT_TEMPLATE_MISSING", `Missing prompt template: ${name}`);
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export interface LlmBuildPlan {
  summary: string;
  files: GeneratedFile[];
  reply: ModelReply;
  modelRun: ModelRunRecord;
}

export interface LlmBuildResult {
  filesWritten: string[];
  changes: FileChange[];
  summary: string;
  reply: ModelReply;
  brownfieldSafety: BrownfieldSafetyReport | null;
}

export interface GameAcceptanceProjectState {
  scenes: string[];
  scripts: string[];
}

export interface LlmBuildAttempt {
  stage: "initial" | "retry";
  provider: string | null;
  model: string | null;
  error: string | null;
  content: string | null;
}

export class LlmBuildError extends CliError {
  constructor(message: string, public readonly attempts: LlmBuildAttempt[], public readonly modelRun: ModelRunRecord | null = null) {
    super("MODEL_OUTPUT_INVALID", message);
  }
}

export async function generateLlmBuild(projectRoot: string, prompt: string, options: { intent?: TaskIntent; brownfieldProfile?: BrownfieldProfile } = {}): Promise<LlmBuildPlan> {
  const modelSelection = await loadModelConfigForRole(projectRoot, "build");
  const config = modelSelection.config;
  if (!config) {
    throw new CliError("MODEL_CONFIG_MISSING", "No model provider configured. Use `godotcoder models use ...` first.");
  }
  const modelSource = modelSelection.source === "missing" ? "default" : modelSelection.source;

  const projectIndex = await inspectGodotProject(projectRoot);
  const intent = options.intent ?? inferTaskIntent(prompt);
  const brownfieldProfile = options.brownfieldProfile ?? detectBrownfieldProject(projectIndex);
  const artifacts = await readPlanningContext(projectRoot);
  const modelContext = await latestModelContext(projectRoot);
  const docsContext = await docsPromptContextWithExcerpts(projectRoot, prompt);
  const systemPrompt = `${modelSystemPrompt()}\n\nReturn only one JSON object. No markdown fences. No prose outside JSON. Final message must start with { and end with }.`;
  const userPrompt = await buildPrompt({ prompt, projectIndex, artifacts, docsContext, intent, brownfieldProfile });
  const totalLength = systemPrompt.length + userPrompt.length;
  if (totalLength > 24_000) {
    console.warn(`Warning: LLM prompt is ${totalLength} characters. Some local models may truncate.`);
  }
  const messages = [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: userPrompt,
    },
  ];
  const attempts: LlmBuildAttempt[] = [];
  let reply = await completeWithModel(config, messages, projectRoot);
  let parsed = parseLlmBuildReply(reply.content);
  if (parsed.ok) {
    const gates = evaluateGeneratedGameGates(prompt, projectIndex, parsed.files);
    if (!gates.passed) {
      parsed = { ok: false, error: `Generated game slice missed acceptance gates: ${gates.missing.join("; ")}` };
    }
  }
  let recoveredOnRetry = false;
  if (!parsed.ok) {
    attempts.push(createAttempt("initial", reply, parsed.error));
    reply = await completeWithModel(config, [
      { role: "system", content: "Return only valid JSON. No prose. No markdown. First character must be { and last character must be }." },
      {
        role: "user",
        content: await buildRetryPrompt({ prompt, projectIndex, parseError: parsed.error, intent, brownfieldProfile, modelContext }),
      },
    ], projectRoot);
    parsed = parseLlmBuildReply(reply.content);
    if (parsed.ok) {
      const gates = evaluateGeneratedGameGates(prompt, projectIndex, parsed.files);
      if (!gates.passed) {
        parsed = { ok: false, error: `Generated game slice missed acceptance gates: ${gates.missing.join("; ")}` };
      }
    }
    if (!parsed.ok) {
      attempts.push(createAttempt("retry", reply, parsed.error));
    } else {
      recoveredOnRetry = true;
    }
  }
  if (!parsed.ok) {
    const modelRun = await writeModelRun(projectRoot, {
      command: "build",
      taskType: intent,
      provider: config.provider,
      model: config.model,
      modelSource,
      outcome: "failed",
      recoveredOnRetry: false,
      promptPreview: prompt.slice(0, 1000),
      summary: null,
      error: parsed.error,
      attempts,
      context: modelContext,
    });
    throw new LlmBuildError(parsed.error, attempts, modelRun);
  }
  const modelRun = await writeModelRun(projectRoot, {
    command: "build",
    taskType: intent,
    provider: config.provider,
    model: config.model,
    modelSource,
    outcome: "success",
    recoveredOnRetry,
    promptPreview: prompt.slice(0, 1000),
    summary: parsed.summary,
    error: null,
    attempts: recoveredOnRetry ? [...attempts, createAttempt("retry", reply, null)] : attempts,
    context: modelContext,
  });
  return { summary: parsed.summary, files: parsed.files, reply, modelRun };
}

export async function applyLlmBuild(
  projectRoot: string,
  plan: LlmBuildPlan,
  options: { prompt?: string; intent?: TaskIntent; brownfieldProfile?: BrownfieldProfile; safety?: boolean } = {},
): Promise<LlmBuildResult> {
  const projectIndex = await inspectGodotProject(projectRoot);
  const intent = options.intent ?? inferTaskIntent(options.prompt ?? plan.summary);
  const brownfieldProfile = options.brownfieldProfile ?? detectBrownfieldProject(projectIndex);
  const brownfieldSafety = options.safety === false
    ? null
    : await assertBrownfieldSafety(projectRoot, options.prompt ?? plan.summary, intent, brownfieldProfile, plan.files);

  const changes: FileChange[] = [];
  for (const file of plan.files) {
    changes.push(await writeTrackedFile(projectRoot, file.path, file.contents));
  }

  return {
    filesWritten: changes.map((change) => change.path),
    changes,
    summary: plan.summary,
    reply: plan.reply,
    brownfieldSafety,
  };
}

export function parseLlmBuildReply(content: string): { ok: true; summary: string; files: GeneratedFile[] } | { ok: false; error: string } {
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

function createAttempt(stage: LlmBuildAttempt["stage"], reply: ModelReply, error: string | null): LlmBuildAttempt {
  return {
    stage,
    provider: reply.provider,
    model: reply.model,
    error,
    content: reply.content.slice(0, 40_000),
  };
}

function extractJson(content: string): string {
  let trimmed = content.trim();

  // Strip reasoning blocks from models like DeepSeek-R1
  trimmed = trimmed.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();

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
    .replace(/\t/g, "\\t")
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
    latestPlaytest: path.join(paths.playtestsDir, "latest.json"),
  };
  const artifacts: Record<string, string> = {};
  for (const [name, filePath] of Object.entries(candidates)) {
    if (await pathExists(filePath)) {
      artifacts[name] = (await readFile(filePath, "utf8")).slice(0, 6000);
    }
  }
  return artifacts;
}

async function buildPrompt(input: {
  prompt: string;
  projectIndex: Awaited<ReturnType<typeof inspectGodotProject>>;
  artifacts: Record<string, string>;
  docsContext: string;
  intent: TaskIntent;
  brownfieldProfile: BrownfieldProfile;
}): Promise<string> {
  const template = await loadPrompt("build.txt");
  return fillTemplate(template, {
    prompt: input.prompt,
    mainScene: input.projectIndex.mainScene ?? "unknown",
    scripts: input.projectIndex.scripts.join(", ") || "none",
    scenes: input.projectIndex.scenes.join(", ") || "none",
    resources: input.projectIndex.resources.join(", ") || "none",
    autoloads: input.projectIndex.autoloads.join(", ") || "none",
    brownfieldGuidance: brownfieldPromptGuidance(input.brownfieldProfile, input.intent),
    artifacts: Object.entries(input.artifacts).map(([name, text]) => `## ${name}\n${text}`).join("\n\n") || "none",
    docsContext: input.docsContext,
  });
}

async function buildRetryPrompt(input: {
  prompt: string;
  projectIndex: Awaited<ReturnType<typeof inspectGodotProject>>;
  parseError: string;
  intent: TaskIntent;
  brownfieldProfile: BrownfieldProfile;
  modelContext: ModelRunRecord["context"];
}): Promise<string> {
  const template = await loadPrompt("build-retry.txt");
  return fillTemplate(template, {
    parseError: input.parseError,
    prompt: input.prompt,
    mainScene: input.projectIndex.mainScene ?? "unknown",
    scripts: input.projectIndex.scripts.join(", ") || "none",
    brownfieldGuidance: brownfieldPromptGuidance(input.brownfieldProfile, input.intent),
    modelContext: formatModelRetryContext(input.modelContext),
  });
}

function evaluateGeneratedGameGates(
  prompt: string,
  projectIndex: Awaited<ReturnType<typeof inspectGodotProject>>,
  files: GeneratedFile[],
): { passed: true } | { passed: false; missing: string[] } {
  return evaluateGeneratedGameAcceptance(prompt, projectIndex, files);
}

export function evaluateGeneratedGameAcceptance(
  prompt: string,
  projectState: GameAcceptanceProjectState,
  files: GeneratedFile[],
): { passed: true } | { passed: false; missing: string[] } {
  if (!isOpenEndedGameRequest(prompt)) {
    return { passed: true };
  }

  const missing: string[] = [];
  const allText = files.map((file) => file.contents).join("\n");
  const paths = files.map((file) => file.path);
  const hasScene = projectState.scenes.length > 0 || paths.some((filePath) => filePath.endsWith(".tscn") || filePath === "project.godot");
  const hasScript = projectState.scripts.length > 0 || paths.some((filePath) => filePath.endsWith(".gd"));
  const hasInputLoop = /\b(Input\.|_input\s*\(|_process\s*\(|_physics_process\s*\(|move_and_slide\s*\()/.test(allText);
  const hasFeedback = /\b(score|health|label|hud|animation|modulate|visible|spawn|collision|collect|damage|print\s*\(|queue_redraw\s*\()/.test(allText.toLowerCase());
  const hasObjective = /\b(win|lose|game_over|restart|reload_current_scene|score|goal|timer|enemy|collect|coin|hazard|lives|health\s*[<=>])/.test(allText.toLowerCase());
  const bannedGodot3 = /\byield\s*\(|\bPool[A-Za-z0-9]*Array\b|\bKinematicBody[23]D\b|(^|\n)[ \t]*export\s+var\b|(^|\n)[ \t]*onready\s+var\b|\.instance\s*\(/.test(allText);

  if (!hasScene) missing.push("main scene or scene update");
  if (!hasScript) missing.push("gameplay script");
  if (!hasInputLoop) missing.push("input or frame-processing loop");
  if (!hasFeedback) missing.push("visible feedback");
  if (!hasObjective) missing.push("objective, fail state, restart path, enemy, collectible, or score loop");
  if (bannedGodot3) missing.push("Godot 4.3+ syntax/API compliance");

  return missing.length === 0 ? { passed: true } : { passed: false, missing };
}

function isOpenEndedGameRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  if (/\b(change|fix|repair|refactor|rename|explain|inspect|validate|cache|show|list)\b/.test(normalized)) {
    return false;
  }
  return /\b(make|create|build|prototype|generate)\b/.test(normalized) && /\b(game|platformer|shooter|puzzle|rpg|roguelike|runner|arcade|sim|metroidvania|tower defense)\b/.test(normalized);
}
