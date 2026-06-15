import { mkdir, writeFile } from "node:fs/promises";
import { selectBuilder } from "../core/builders/index.js";
import { CliError, formatError } from "../core/errors.js";
import { pathExists } from "../core/files.js";
import { findGodotProjectRoot, inspectGodotProject, loadProjectIndex } from "../core/godot-project.js";
import { searchGodotDocs, writeDocsContext } from "../core/godot-docs.js";
import { previewGeneratedFiles } from "../core/preview.js";
import { discoverRuntime } from "../core/runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "../core/runtime-profile.js";
import { validateProjectRoot } from "./validate.js";
import { workspacePaths } from "../core/workspace.js";

export interface RpcEnvelope {
  ok: boolean;
  method: string;
  result: unknown | null;
  error: { code: string; message: string } | null;
  diagnostics: string[];
}

export async function rpcCommand(args: string[]): Promise<void> {
  const [method, ...rest] = args.filter((arg) => arg !== "--json");
  if (!method) {
    printEnvelope(errorEnvelope("unknown", "RPC_USAGE", "Usage: godotcoder rpc <method> [--json]"));
    return;
  }

  try {
    const result = await runRpcMethod(method, rest);
    printEnvelope({ ok: true, method, result, error: null, diagnostics: [] });
  } catch (error) {
    const formatted = formatError(error);
    const code = error instanceof CliError ? error.code : "RPC_FAILED";
    printEnvelope(errorEnvelope(method, code, formatted.message));
  }
}

async function runRpcMethod(method: string, args: string[]): Promise<unknown> {
  const editorContext = readJsonFlag(args, "--context") ?? readJsonFlag(args, "--payload");
  const filteredArgs = stripFlags(args, ["--context", "--payload"]);
  if (method === "workspace.status") {
    return attachContext(await workspaceStatus(), editorContext);
  }
  if (method === "project.inspect") {
    return attachContext(await projectInspect(), editorContext);
  }
  if (method === "runtime.doctor") {
    return attachContext(await runtimeDoctorRpc(), editorContext);
  }
  if (method === "validation.run") {
    return attachContext(await validateProjectRoot(await findGodotProjectRoot(process.cwd())), editorContext);
  }
  if (method === "docs.search") {
    const query = readFlag(filteredArgs, "--query") ?? filteredArgs.join(" ").trim();
    const projectRoot = await tryProjectRootOrCwd();
    const context = await writeDocsContext(projectRoot, query);
    return attachContext({ query, matches: searchGodotDocs(query), contextPath: context.path }, editorContext);
  }
  if (method === "build.preview") {
    const prompt = readFlag(filteredArgs, "--prompt") ?? filteredArgs.join(" ").trim();
    if (!prompt) {
      throw new CliError("RPC_USAGE", "build.preview requires --prompt <task>.");
    }
    const projectRoot = await findGodotProjectRoot(process.cwd());
    const builder = selectBuilder(prompt);
    const preview = await previewGeneratedFiles(projectRoot, builder.summary, builder.generateFiles());
    return attachContext({ source: "deterministic", prompt, preview }, editorContext);
  }
  if (method === "debug.current") {
    const errorText = readFlag(filteredArgs, "--error") ?? filteredArgs.join(" ").trim();
    if (!errorText) {
      throw new CliError("RPC_USAGE", "debug.current requires --error <message>.");
    }
    return attachContext(debugCurrent(errorText), editorContext);
  }
  if (method === "editor.context") {
    const payload = editorContext ?? readJsonFlag(args, "--context") ?? readJsonFlag(args, "--payload");
    if (!payload) {
      throw new CliError("RPC_USAGE", "editor.context requires --context <json>.");
    }
    return { capturedAt: new Date().toISOString(), context: parseJsonPayload(payload) };
  }

  throw new CliError("RPC_METHOD_NOT_FOUND", `Unknown RPC method: ${method}`);
}

async function workspaceStatus(): Promise<unknown> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  const projectIndex = await loadProjectIndex(paths.projectIndex);
  return {
    projectRoot,
    workspaceRoot: paths.workspaceRoot,
    workspaceExists: await pathExists(paths.workspaceRoot),
    runtimeProfileExists: await pathExists(paths.runtimeProfile),
    projectIndexExists: await pathExists(paths.projectIndex),
    detectedGodotVersion: runtimeProfile?.detectedGodotVersion ?? null,
    minimumGodotVersion: runtimeProfile?.minimumGodotVersion ?? "4.3.0",
    runtimeSupported: runtimeProfile?.supported ?? false,
    installType: runtimeProfile?.installType ?? "unknown",
    mainScene: projectIndex?.mainScene ?? runtimeProfile?.project?.mainScene ?? null,
  };
}

async function projectInspect(): Promise<unknown> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const index = await inspectGodotProject(projectRoot);
  await mkdir(paths.workspaceRoot, { recursive: true });
  await writeFile(paths.projectIndex, JSON.stringify(index, null, 2) + "\n");
  return { projectIndex: index };
}

async function runtimeDoctorRpc(): Promise<unknown> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const paths = workspacePaths(projectRoot);
  const discovery = await discoverRuntime(projectRoot);
  const projectIndex = await inspectGodotProject(projectRoot);
  const runtime = createRuntimeProfile(projectRoot, discovery, projectIndex);
  await mkdir(paths.workspaceRoot, { recursive: true });
  await writeFile(paths.runtimeProfile, JSON.stringify(runtime, null, 2) + "\n");
  return { runtime, diagnostics: discovery.diagnostics };
}

async function tryProjectRootOrCwd(): Promise<string> {
  try {
    return await findGodotProjectRoot(process.cwd());
  } catch (error) {
    if (error instanceof CliError && error.code === "GODOT_PROJECT_NOT_FOUND") {
      return process.cwd();
    }
    throw error;
  }
}

function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function readJsonFlag(args: string[], flag: string): string | null {
  const value = readFlag(args, flag);
  return value ? value : null;
}

function stripFlags(args: string[], flags: string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (flags.includes(arg)) {
      index += 1;
      continue;
    }
    result.push(arg);
  }
  return result;
}

function attachContext(result: unknown, context: string | null): unknown {
  if (!context) {
    return result;
  }
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>), editorContext: parseJsonPayload(context) };
  }
  return { value: result, editorContext: parseJsonPayload(context) };
}

function debugCurrent(errorText: string): unknown {
  const sourceFile = firstMatch(errorText, /(res:\/\/[^\s:)"]+)/)?.[1] ?? null;
  const location = firstMatch(errorText, /res:\/\/[^\s:)"]+:(\d+)(?::(\d+))?/);
  const line = location?.[1] ? Number(location[1]) : null;
  const column = location?.[2] ? Number(location[2]) : null;
  const lower = errorText.toLowerCase();
  const likelySubsystem = classifyDebugSubsystem(lower);
  const summary = summarizeDebugError(errorText);

  return {
    summary,
    likelySubsystem,
    sourceFile,
    line,
    column,
    confidence: sourceFile || lower.includes("error") ? "medium" : "low",
    rootCauseHypothesis: rootCauseHypothesis(lower, likelySubsystem),
    suggestedNextSteps: suggestedDebugSteps(likelySubsystem, sourceFile, line),
    rawError: errorText,
  };
}

function classifyDebugSubsystem(lower: string): string {
  if (lower.includes("parse error") || lower.includes("syntax") || lower.includes("gdscript") || lower.includes("expected")) return "script";
  if (lower.includes("node not found") || lower.includes("scene") || lower.includes(".tscn")) return "scene";
  if (lower.includes("cannot open") || lower.includes("failed loading") || lower.includes("resource") || lower.includes(".tres")) return "resource";
  if (lower.includes("autoload") || lower.includes("project setting") || lower.includes("project.godot")) return "project";
  if (lower.includes("import")) return "import";
  if (lower.includes("export")) return "export";
  if (lower.includes("invalid get index") || lower.includes("nil") || lower.includes("null instance")) return "runtime";
  return "unknown";
}

function summarizeDebugError(errorText: string): string {
  const firstLine = errorText.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine ? firstLine.slice(0, 240) : "No error text provided.";
}

function rootCauseHypothesis(lower: string, subsystem: string): string {
  if (subsystem === "script") return "A GDScript file likely has invalid syntax or an API mismatch for the current Godot version.";
  if (subsystem === "scene") return "A scene or node path reference likely no longer matches the current scene tree.";
  if (subsystem === "resource") return "A referenced resource path may be missing, renamed, or using incompatible resource text.";
  if (subsystem === "project") return "Project settings or autoload configuration likely reference a missing or invalid path.";
  if (subsystem === "runtime" && lower.includes("nil")) return "Runtime code is likely dereferencing a missing node, unloaded resource, or unset variable.";
  if (subsystem === "runtime") return "Runtime code is likely using a value with an unexpected type or missing instance.";
  return "The error needs project context and a validation rerun to narrow down the failing subsystem.";
}

function suggestedDebugSteps(subsystem: string, sourceFile: string | null, line: number | null): string[] {
  const steps: string[] = [];
  if (sourceFile) {
    steps.push(line ? `Inspect ${sourceFile} around line ${line}.` : `Inspect ${sourceFile}.`);
  }
  if (subsystem === "project") {
    steps.push("Run project.inspect to verify autoloads, plugins, and main scene settings.");
  } else if (subsystem === "resource" || subsystem === "scene") {
    steps.push("Run validation.run to confirm all referenced scene/resource paths still load.");
  } else {
    steps.push("Run validation.run after the smallest local fix.");
  }
  steps.push("If the error is from a generated change, inspect the latest .godotcoder patch record before editing.");
  return steps;
}

function firstMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
  return text.match(pattern);
}

function parseJsonPayload(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new CliError("RPC_BAD_PAYLOAD", `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function printEnvelope(envelope: RpcEnvelope): void {
  console.log(JSON.stringify(envelope, null, 2));
}

function errorEnvelope(method: string, code: string, message: string): RpcEnvelope {
  return {
    ok: false,
    method,
    result: null,
    error: { code, message },
    diagnostics: [],
  };
}
