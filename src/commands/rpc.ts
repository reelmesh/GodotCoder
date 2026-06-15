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
  if (method === "workspace.status") {
    return workspaceStatus();
  }
  if (method === "project.inspect") {
    return projectInspect();
  }
  if (method === "runtime.doctor") {
    return runtimeDoctorRpc();
  }
  if (method === "validation.run") {
    return validateProjectRoot(await findGodotProjectRoot(process.cwd()));
  }
  if (method === "docs.search") {
    const query = readFlag(args, "--query") ?? args.join(" ").trim();
    const projectRoot = await tryProjectRootOrCwd();
    const context = await writeDocsContext(projectRoot, query);
    return { query, matches: searchGodotDocs(query), contextPath: context.path };
  }
  if (method === "build.preview") {
    const prompt = readFlag(args, "--prompt") ?? args.join(" ").trim();
    if (!prompt) {
      throw new CliError("RPC_USAGE", "build.preview requires --prompt <task>.");
    }
    const projectRoot = await findGodotProjectRoot(process.cwd());
    const builder = selectBuilder(prompt);
    const preview = await previewGeneratedFiles(projectRoot, builder.summary, builder.generateFiles());
    return { source: "deterministic", prompt, preview };
  }
  if (method === "editor.context") {
    const payload = readFlag(args, "--context") ?? readFlag(args, "--payload");
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
