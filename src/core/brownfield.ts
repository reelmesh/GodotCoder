import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedFile } from "./generated-file.js";
import { CliError } from "./errors.js";
import { pathExists } from "./files.js";
import type { ProjectIndex } from "./godot-project-indexer.js";
import { previewGeneratedFiles, type BuildPreview, type PreviewFile } from "./preview.js";

export type TaskIntent = "feature" | "fix" | "refactor" | "polish";

export interface BrownfieldProfile {
  isBrownfield: boolean;
  meaningfulFileCount: number;
  reasons: string[];
}

export interface BrownfieldSafetyFinding {
  severity: "error" | "warning";
  message: string;
  path: string | null;
}

export interface BrownfieldSafetyReport {
  ok: boolean;
  profile: BrownfieldProfile;
  intent: TaskIntent;
  findings: BrownfieldSafetyFinding[];
  preview: BuildPreview;
}

const MINIMAL_SCAFFOLD = new Set(["project.godot", "scenes/main.tscn", "scripts/main.gd"]);

export function inferTaskIntent(prompt: string): TaskIntent {
  const normalized = prompt.toLowerCase();
  if (/\b(fix|bug|error|crash|repair|broken|regression|traceback|parse error)\b/.test(normalized)) return "fix";
  if (/\b(refactor|clean up|cleanup|rename|restructure|extract|simplify)\b/.test(normalized)) return "refactor";
  if (/\b(polish|juice|feel|tune|balance|animation|sound|particles|visual|ui|ux)\b/.test(normalized)) return "polish";
  return "feature";
}

export function parseTaskIntent(args: string[]): TaskIntent | null {
  const explicit = args.find((arg) => arg.startsWith("--intent="))?.slice("--intent=".length)
    ?? (args.includes("--intent") ? args[args.indexOf("--intent") + 1] : undefined);
  if (explicit === "feature" || explicit === "fix" || explicit === "refactor" || explicit === "polish") return explicit;
  if (args.includes("--feature")) return "feature";
  if (args.includes("--fix")) return "fix";
  if (args.includes("--refactor")) return "refactor";
  if (args.includes("--polish")) return "polish";
  return null;
}

export function isTaskIntentFlag(arg: string, previous?: string): boolean {
  if (previous === "--intent") return true;
  return ["--feature", "--fix", "--refactor", "--polish", "--intent"].includes(arg) || arg.startsWith("--intent=");
}

export function detectBrownfieldProject(projectIndex: ProjectIndex, wasGreenfield = false): BrownfieldProfile {
  if (wasGreenfield) {
    return { isBrownfield: false, meaningfulFileCount: 0, reasons: ["created greenfield scaffold"] };
  }

  const files = [
    ...projectIndex.scenes,
    ...projectIndex.scripts,
    ...projectIndex.resources,
    ...projectIndex.inputMap.map((action) => `input:${action}`),
    ...projectIndex.autoloads.map((autoload) => `autoload:${autoload}`),
  ];
  const meaningful = files.filter((file) => !MINIMAL_SCAFFOLD.has(file));
  const reasons: string[] = [];
  if (meaningful.some((file) => file.startsWith("input:"))) reasons.push("custom input actions");
  if (meaningful.some((file) => file.startsWith("autoload:"))) reasons.push("autoloads");
  if (projectIndex.scenes.some((file) => !MINIMAL_SCAFFOLD.has(file))) reasons.push("existing scenes");
  if (projectIndex.scripts.some((file) => !MINIMAL_SCAFFOLD.has(file))) reasons.push("existing scripts");
  if (projectIndex.resources.length > 0) reasons.push("existing resources");
  if (projectIndex.plugins.length > 0) reasons.push("enabled editor plugins");

  return {
    isBrownfield: meaningful.length > 0 || projectIndex.plugins.length > 0,
    meaningfulFileCount: meaningful.length + projectIndex.plugins.length,
    reasons: reasons.length > 0 ? reasons : ["minimal scaffold only"],
  };
}

export async function assertBrownfieldSafety(
  projectRoot: string,
  prompt: string,
  intent: TaskIntent,
  profile: BrownfieldProfile,
  files: GeneratedFile[],
): Promise<BrownfieldSafetyReport> {
  const preview = await previewGeneratedFiles(projectRoot, "brownfield safety preview", files);
  const findings = profile.isBrownfield ? await evaluateBrownfieldSafety(projectRoot, prompt, intent, preview, files) : [];
  const errors = findings.filter((finding) => finding.severity === "error");
  if (errors.length > 0) {
    throw new BrownfieldSafetyError(errors, { ok: false, profile, intent, findings, preview });
  }
  return { ok: true, profile, intent, findings, preview };
}

export class BrownfieldSafetyError extends CliError {
  constructor(public readonly findings: BrownfieldSafetyFinding[], public readonly report: BrownfieldSafetyReport) {
    super("BROWNFIELD_SAFETY_REJECTED", `Brownfield safety rejected this patch: ${findings.map((finding) => finding.message).join("; ")}`);
  }
}

async function evaluateBrownfieldSafety(
  projectRoot: string,
  prompt: string,
  intent: TaskIntent,
  preview: BuildPreview,
  files: GeneratedFile[],
): Promise<BrownfieldSafetyFinding[]> {
  const findings: BrownfieldSafetyFinding[] = [];
  const modified = preview.files.filter((file) => file.operation === "modify");
  const created = preview.files.filter((file) => file.operation === "create");
  const explicitRewrite = /\b(rewrite|replace|regenerate|recreate|overhaul|whole project|from scratch)\b/i.test(prompt);

  if (!explicitRewrite && modified.length > 4) {
    findings.push({
      severity: "error",
      path: null,
      message: `Brownfield patch modifies ${modified.length} existing files; split this into smaller targeted edits or pass an explicit rewrite task.`,
    });
  }

  if (!explicitRewrite && created.length > 8) {
    findings.push({
      severity: "warning",
      path: null,
      message: `Brownfield patch creates ${created.length} files; review the preview carefully before applying.`,
    });
  }

  for (const file of preview.files) {
    if (file.operation !== "modify") continue;
    const relativePath = resourceToRelativePath(file.path);
    const generated = files.find((candidate) => candidate.path === relativePath);
    const before = await readExistingText(projectRoot, relativePath);
    if (generated && fileTouchesUnsupportedContent(relativePath, generated.contents)) {
      findings.push({
        severity: "error",
        path: file.path,
        message: "Generated brownfield patch includes non-Godot-native content.",
      });
    }
    if (!explicitRewrite && isLargeScriptReplacement(relativePath, before, file)) {
      findings.push({
        severity: "error",
        path: file.path,
        message: "Large existing script replacement requires an explicit rewrite or replace task.",
      });
    }
    if (!explicitRewrite && looksLikeProjectConfigRewrite(relativePath, file)) {
      findings.push({
        severity: "error",
        path: file.path,
        message: "Large project.godot rewrite is blocked in brownfield mode; make a targeted settings/input/autoload edit.",
      });
    }
    if (!explicitRewrite && intent !== "refactor" && looksLikeDeletionRewrite(file)) {
      findings.push({
        severity: "error",
        path: file.path,
        message: "Brownfield patch removes most of an existing file; deletion/replacement needs explicit intent.",
      });
    }
  }

  return findings;
}

function resourceToRelativePath(value: string): string {
  const raw = value.replace(/^res:\/\//, "");
  const normalized = path.normalize(raw);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new CliError("BROWNFIELD_SAFETY_REJECTED", `Path traversal blocked: ${value}`);
  }
  return normalized;
}

async function readExistingText(projectRoot: string, relativePath: string): Promise<string> {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!(await pathExists(absolutePath))) return "";
  return readFile(absolutePath, "utf8");
}

function isLargeScriptReplacement(relativePath: string, before: string, file: PreviewFile): boolean {
  if (!relativePath.endsWith(".gd")) return false;
  const beforeLines = before.replace(/\n$/, "").split(/\r?\n/).filter(Boolean).length;
  if (beforeLines < 120) return false;
  return file.removedLines > Math.max(80, beforeLines * 0.6) || file.afterLines < beforeLines * 0.5;
}

function looksLikeProjectConfigRewrite(relativePath: string, file: PreviewFile): boolean {
  if (relativePath !== "project.godot") return false;
  return file.removedLines > 20 || file.removedLines > file.beforeLines * 0.35;
}

function looksLikeDeletionRewrite(file: PreviewFile): boolean {
  if (file.beforeLines < 40) return false;
  return file.afterLines < Math.max(8, file.beforeLines * 0.25) || file.removedLines > file.beforeLines * 0.75;
}

function fileTouchesUnsupportedContent(relativePath: string, contents: string): boolean {
  if (/\.(gd|tscn|tres|res|gdshader|import|cfg|txt|md|json)$/i.test(relativePath)) return false;
  return contents.length > 0;
}

export function brownfieldPromptGuidance(profile: BrownfieldProfile, intent: TaskIntent): string {
  if (!profile.isBrownfield) {
    return `Project mode: greenfield or minimal scaffold.
Task intent: ${intent}.`;
  }

  return `Project mode: brownfield (${profile.reasons.join(", ")}).
Task intent: ${intent}.
Brownfield rules:
- Preserve existing architecture, naming, scene ownership, input actions, autoloads, resources, and paths.
- Make small targeted edits that directly satisfy the task.
- Prefer extending existing scenes/scripts over replacing them.
- Do not rewrite large scripts, project.godot, input maps, autoloads, or resource paths unless the task explicitly asks for that exact rewrite.
- Do not remove existing behavior while adding the requested feature/fix/refactor/polish.
- Keep generated files Godot-native.`;
}
