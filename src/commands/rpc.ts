import { mkdir, writeFile } from "node:fs/promises";
import { selectBuilder } from "../core/builders/index.js";
import { CliError, formatError } from "../core/errors.js";
import { pathExists } from "../core/files.js";
import { readFlag } from "../core/flags.js";
import { findGodotProjectRoot, inspectGodotProject, loadProjectIndex, type ProjectIndex } from "../core/godot-project.js";
import { searchGodotDocs, writeDocsContext } from "../core/godot-docs.js";
import { previewGeneratedFiles } from "../core/preview.js";
import { runProcess } from "../core/process.js";
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
  if (method === "workspace.changes") {
    return attachContext(await workspaceChanges(), editorContext);
  }
  if (method === "runtime.doctor") {
    return attachContext(await runtimeDoctorRpc(), editorContext);
  }
  if (method === "validation.run") {
    return attachContext(await validateProjectRoot(await findGodotProjectRoot(process.cwd())), editorContext);
  }
  if (method === "validation.scene") {
    const scene = readFlag(filteredArgs, "--scene") ?? sceneFromEditorContext(editorContext);
    if (!scene) {
      throw new CliError("RPC_USAGE", "validation.scene requires --scene <res://path> or editor context with current_path.");
    }
    const projectRoot = await findGodotProjectRoot(process.cwd());
    const projectIndex = await inspectGodotProject(projectRoot);
    return attachContext(validateSceneScope(scene, projectIndex, editorContext), editorContext);
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
    return attachContext({ source: "deterministic", prompt, preview, previewSummary: summarizeBuildPreview(preview) }, editorContext);
  }
  if (method === "debug.current") {
    const errorText = readFlag(filteredArgs, "--error") ?? filteredArgs.join(" ").trim();
    if (!errorText) {
      throw new CliError("RPC_USAGE", "debug.current requires --error <message>.");
    }
    return attachContext(debugCurrent(errorText), editorContext);
  }
  if (method === "editor.explain") {
    if (!editorContext) {
      throw new CliError("RPC_USAGE", "editor.explain requires --context <json>.");
    }
    const projectRoot = await findGodotProjectRoot(process.cwd());
    const projectIndex = await inspectGodotProject(projectRoot);
    return explainEditorContext(parseJsonPayload(editorContext), projectIndex);
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

async function workspaceChanges(): Promise<unknown> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const status = await runProcess(["git", "status", "--porcelain=v1"], { cwd: projectRoot, timeoutMs: 5000 });
  if (status.exitCode !== 0) {
    return {
      vcs: "git",
      available: false,
      clean: null,
      files: [],
      counts: { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0, other: 0 },
      summary: status.stderr.trim() || "Git status is unavailable for this project.",
    };
  }

  const files = parseGitStatus(status.stdout);
  const counts = summarizeGitStatus(files);
  const changed = files.length;
  return {
    vcs: "git",
    available: true,
    clean: changed === 0,
    files,
    counts,
    summary: changed === 0 ? "Workspace is clean." : `${changed} changed file${changed === 1 ? "" : "s"} in git status.`,
  };
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

function summarizeBuildPreview(preview: Awaited<ReturnType<typeof previewGeneratedFiles>>): unknown {
  const counts = {
    create: 0,
    modify: 0,
    unchanged: 0,
  };
  let addedLines = 0;
  let removedLines = 0;
  const changedPaths: string[] = [];
  const unchangedPaths: string[] = [];

  for (const file of preview.files) {
    counts[file.operation] += 1;
    addedLines += file.addedLines;
    removedLines += file.removedLines;
    if (file.operation === "unchanged") {
      unchangedPaths.push(file.path);
    } else {
      changedPaths.push(file.path);
    }
  }

  return {
    fileCount: preview.files.length,
    counts,
    addedLines,
    removedLines,
    changedPaths,
    unchangedPaths,
    hasChanges: changedPaths.length > 0,
  };
}

function explainEditorContext(context: unknown, projectIndex: ProjectIndex): unknown {
  const ctx = asRecord(context);
  const sceneRoot = asRecord(ctx.scene_root);
  const currentScript = asRecord(ctx.current_script);
  const selectedNodes = Array.isArray(ctx.selected_nodes) ? ctx.selected_nodes.map(asRecord).filter((node) => Object.keys(node).length > 0) : [];
  const currentPath = asStringValue(ctx.current_path);
  const currentScriptPath = asStringValue(currentScript.path);
  const selectedNodeNames = selectedNodes.map((node) => asStringValue(node.name)).filter((value): value is string => Boolean(value));
  const selectedNodePaths = selectedNodes.map((node) => asStringValue(node.path)).filter((value): value is string => Boolean(value));
  const focus = currentPath ?? currentScriptPath ?? asStringValue(sceneRoot.path) ?? projectIndex.mainScene;

  return {
    summary: summarizeEditorFocus(focus, selectedNodeNames, currentScriptPath, projectIndex),
    focus: {
      currentPath,
      sceneRoot: {
        name: asStringValue(sceneRoot.name),
        class: asStringValue(sceneRoot.class),
        path: asStringValue(sceneRoot.path),
      },
      selectedNodes: selectedNodes.map((node) => ({
        name: asStringValue(node.name),
        class: asStringValue(node.class),
        path: asStringValue(node.path),
      })),
      currentScript: {
        class: asStringValue(currentScript.class),
        path: currentScriptPath,
      },
    },
    project: {
      applicationName: projectIndex.applicationName,
      mainScene: projectIndex.mainScene,
      scriptCount: projectIndex.scripts.length,
      sceneCount: projectIndex.scenes.length,
      resourceCount: projectIndex.resources.length,
      inputActions: projectIndex.inputMap,
      autoloads: projectIndex.autoloads,
      plugins: projectIndex.plugins,
    },
    suggestedNextCommands: suggestedEditorCommands(currentPath, currentScriptPath, selectedNodePaths),
  };
}

function sceneFromEditorContext(context: string | null): string | null {
  if (!context) return null;
  const parsed = parseJsonPayload(context);
  const currentPath = asStringValue(asRecord(parsed).current_path);
  return currentPath?.endsWith(".tscn") || currentPath?.endsWith(".scn") ? currentPath : null;
}

function validateSceneScope(scene: string, projectIndex: ProjectIndex, context: string | null): unknown {
  const normalized = normalizeResPath(scene);
  const scenes = projectIndex.scenes.map((scenePath) => normalizeResPath(scenePath));
  const exists = scenes.includes(normalized);
  const editorContext = context ? asRecord(parseJsonPayload(context)) : {};
  const sceneRoot = asRecord(editorContext.scene_root);
  const selectedNodes = Array.isArray(editorContext.selected_nodes) ? editorContext.selected_nodes.map(asRecord).filter((node) => Object.keys(node).length > 0) : [];

  return {
    scenePath: scene.startsWith("res://") ? scene : `res://${normalized}`,
    normalizedPath: normalized,
    existsInProject: exists,
    isMainScene: normalizeResPath(projectIndex.mainScene ?? "") === normalized,
    sceneRoot: {
      name: asStringValue(sceneRoot.name),
      class: asStringValue(sceneRoot.class),
      path: asStringValue(sceneRoot.path),
    },
    selectedNodes: selectedNodes.map((node) => ({
      name: asStringValue(node.name),
      class: asStringValue(node.class),
      path: asStringValue(node.path),
    })),
    projectSceneCount: projectIndex.scenes.length,
    summary: exists ? `Scene ${scene} is present in the inspected project.` : `Scene ${scene} was not found in the inspected project index.`,
    suggestedNextCommands: [
      "godotcoder rpc validation.run --json",
      `godotcoder rpc project.inspect --json`,
      exists ? `godotcoder rpc editor.explain --context '<captured editor context>' --json` : `godotcoder repair --json`,
    ],
  };
}

function normalizeResPath(value: string): string {
  return value.replace(/^res:\/\//, "").replace(/^\/+/, "");
}

function parseGitStatus(stdout: string): Array<{ path: string; indexStatus: string; worktreeStatus: string; status: string }> {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const indexStatus = line.slice(0, 1);
      const worktreeStatus = line.slice(1, 2);
      const rawPath = line.slice(3);
      return {
        path: normalizeGitStatusPath(rawPath),
        indexStatus,
        worktreeStatus,
        status: classifyGitStatus(indexStatus, worktreeStatus),
      };
    });
}

function normalizeGitStatusPath(pathText: string): string {
  const renamed = pathText.split(" -> ");
  return renamed[renamed.length - 1] ?? pathText;
}

function summarizeGitStatus(files: Array<{ status: string }>): Record<string, number> {
  const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0, other: 0 };
  for (const file of files) {
    if (file.status in counts) {
      counts[file.status as keyof typeof counts] += 1;
    } else {
      counts.other += 1;
    }
  }
  return counts;
}

function classifyGitStatus(indexStatus: string, worktreeStatus: string): string {
  if (indexStatus === "?" && worktreeStatus === "?") return "untracked";
  if (indexStatus === "R" || worktreeStatus === "R") return "renamed";
  if (indexStatus === "D" || worktreeStatus === "D") return "deleted";
  if (indexStatus === "A" || worktreeStatus === "A") return "added";
  if (indexStatus === "M" || worktreeStatus === "M") return "modified";
  return "other";
}

function summarizeEditorFocus(focus: string | null, selectedNodeNames: string[], currentScriptPath: string | null, projectIndex: ProjectIndex): string {
  const target = focus ?? "the current editor selection";
  const selected = selectedNodeNames.length > 0 ? ` Selected nodes: ${selectedNodeNames.join(", ")}.` : "";
  const script = currentScriptPath ? ` Current script: ${currentScriptPath}.` : "";
  const project = projectIndex.applicationName ? ` Project: ${projectIndex.applicationName}.` : "";
  return `Editor focus is ${target}.${selected}${script}${project}`;
}

function suggestedEditorCommands(currentPath: string | null, currentScriptPath: string | null, selectedNodePaths: string[]): string[] {
  const commands = ["godotcoder rpc validation.run --json", "godotcoder rpc project.inspect --json"];
  if (currentPath || currentScriptPath || selectedNodePaths.length > 0) {
    commands.unshift("godotcoder rpc editor.explain --context '<captured editor context>' --json");
  }
  if (currentScriptPath) {
    commands.push(`godotcoder rpc docs.search --query "${currentScriptPath.endsWith(".gd") ? "GDScript" : "script"}" --json`);
  }
  return commands;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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
