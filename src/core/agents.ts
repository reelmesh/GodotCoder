import { mkdir, writeFile } from "node:fs/promises";
import { workspacePaths } from "./workspace.js";

export interface AgentDefinition {
  id: string;
  title: string;
  role: string;
  owns: string[];
  inputs: string[];
  outputs: string[];
  gates: string[];
}

export const godotAgents: AgentDefinition[] = [
  {
    id: "orchestrator",
    title: "Godot Orchestrator",
    role: "Routes work, enforces phase gates, keeps greenfield/brownfield state coherent.",
    owns: ["workflow run", "agent handoffs", "approval policy"],
    inputs: ["user goal", "project index", "runtime profile", "planning artifacts"],
    outputs: [".godotcoder/runs/<id>.json", "next action", "blocked gates"],
    gates: ["project context known", "task has owner", "validation result recorded after apply"],
  },
  {
    id: "scout",
    title: "Godot Code Scout",
    role: "Reads project.godot, scenes, scripts, resources, plugins, and export presets.",
    owns: ["project inspection", "brownfield context"],
    inputs: ["project.godot", "filesystem"],
    outputs: [".godotcoder/project-index.json"],
    gates: ["main scene identified or greenfield scaffold created"],
  },
  {
    id: "producer",
    title: "Game Producer",
    role: "Turns broad idea into milestone backlog, acceptance criteria, and risk list.",
    owns: ["backlog", "scope control", "acceptance criteria"],
    inputs: ["brief", "GDD", "user goal"],
    outputs: [".godotcoder/backlog.md", ".godotcoder/tasks.md"],
    gates: ["vertical slice has playable acceptance criteria"],
  },
  {
    id: "designer",
    title: "Game Designer",
    role: "Defines core fantasy, loop, mechanics, feedback, player objective, restart path.",
    owns: ["brief", "GDD", "mechanic specification"],
    inputs: ["user goal", "project constraints"],
    outputs: [".godotcoder/brief.md", ".godotcoder/gdd.md"],
    gates: ["core loop fits one playable slice"],
  },
  {
    id: "architect",
    title: "Godot Architect",
    role: "Chooses Godot-native structure, scene/script boundaries, data/resource patterns.",
    owns: ["technical plan", "Godot version constraints", "scene architecture"],
    inputs: ["project index", "GDD", "runtime profile"],
    outputs: [".godotcoder/technical-plan.md", ".godotcoder/decisions.md"],
    gates: ["GDScript-first", "Godot 4.3+-compatible", "no non-Godot game runtime"],
  },
  {
    id: "gameplay-engineer",
    title: "Gameplay Engineer",
    role: "Applies small Godot-native changes behind preview/approval boundary.",
    owns: ["GDScript", "scene edits", "patch records"],
    inputs: ["technical plan", "task", "project index"],
    outputs: ["preview diff", ".godotcoder/patches/<id>/record.json"],
    gates: ["preview before apply", "patch record after apply"],
  },
  {
    id: "qa-validator",
    title: "Godot QA Validator",
    role: "Runs Godot executable, parses errors/warnings, blocks bad builds.",
    owns: ["validation reports", "Godot runtime checks"],
    inputs: ["runtime profile", "project files"],
    outputs: [".godotcoder/validations/<id>.json"],
    gates: ["zero script parse errors", "project loads headless"],
  },
  {
    id: "docs-librarian",
    title: "Godot Docs Librarian",
    role: "Provides official Godot docs context and later HF dataset snippets with source labels.",
    owns: ["knowledge retrieval", "source trust"],
    inputs: ["Godot version", "task topic"],
    outputs: [".godotcoder/cache/docs/*"],
    gates: ["official docs preferred", "dataset snippets marked secondary"],
  },
];

export async function writeAgentRoster(projectRoot: string): Promise<string> {
  const paths = workspacePaths(projectRoot);
  await mkdir(paths.workspaceRoot, { recursive: true });
  await writeFile(paths.agentRoster, JSON.stringify({ schemaVersion: 1, agents: godotAgents }, null, 2) + "\n");
  return paths.agentRoster;
}
