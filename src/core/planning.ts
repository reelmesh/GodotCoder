import { writeFile } from "node:fs/promises";
import { inspectGodotProject } from "./godot-project.js";
import { workspacePaths } from "./workspace.js";

export interface PlanningResult {
  projectRoot: string;
  idea: string;
  mode: "greenfield" | "brownfield";
  filesWritten: string[];
}

export async function writePlanningArtifacts(projectRoot: string, idea: string, mode: "greenfield" | "brownfield"): Promise<PlanningResult> {
  const paths = workspacePaths(projectRoot);
  const index = await inspectGodotProject(projectRoot);
  const filesWritten: string[] = [];
  const title = titleFromIdea(idea);

  const artifacts: Array<[string, string]> = [
    [
      paths.brief,
      `# Brief

## Pitch

${title}

## Raw Idea

${idea}

## Current Mode

${mode === "greenfield" ? "Greenfield Godot project scaffold." : "Existing Godot project."}

## Initial Target

- Godot 4.3+
- GDScript-first
- 2D-first until scope requires otherwise
- Validate through the installed Godot executable
`,
    ],
    [
      paths.gdd,
      `# Game Design Document

## Concept

${idea}

## Core Loop

1. Player enters the main play scene.
2. Player performs the primary movement/action mechanic.
3. The game presents a clear obstacle, target, or scoring opportunity.
4. Feedback confirms success, failure, or progress.
5. The loop repeats with increasing pressure or variation.

## MVP Mechanics

- Player-controlled entity.
- One core action.
- One obstacle or enemy type.
- One win, score, or survival condition.
- Basic restart path.

## Acceptance Criteria

- Project opens in Godot without script or scene errors.
- Main scene runs.
- Player can interact with the core mechanic.
- The game has a visible objective or feedback loop.
`,
    ],
    [
      paths.technicalPlan,
      `# Technical Plan

## Project Signals

- Main scene: ${index.mainScene ?? "unknown"}
- Config version: ${index.godotVersionSignals.projectConfigVersion ?? "unknown"}
- Feature tags: ${index.godotVersionSignals.featureTags.join(", ") || "none"}

## Initial Structure

- \`scenes/main.tscn\`: entry scene.
- \`scripts/main.gd\`: initial scene script.
- Additional scenes/scripts should be added in small validated steps.

## Rules

- Generate Godot-native files only.
- Prefer GDScript for code.
- Validate with \`godotcoder validate\` after edits.
- Avoid broad rewrites of \`.tscn\` and \`.tres\` files.
`,
    ],
    [
      paths.tasks,
      `# Tasks

- [ ] Define player controller scene and script.
- [ ] Define one core mechanic.
- [ ] Define one obstacle, enemy, or scoring object.
- [ ] Add basic UI feedback.
- [ ] Add restart flow.
- [ ] Run \`godotcoder validate\`.
`,
    ],
    [
      paths.decisions,
      `# Decisions

- Use Godot 4.3 or newer.
- Use GDScript-first implementation.
- Use Godot-backed validation as the authority for project health.
- Start with a small playable vertical slice.
`,
    ],
    [
      paths.riskLog,
      `# Risk Log

- Scope can expand too quickly from a broad game idea.
- Generated scene/resource edits need conservative handling.
- Exact Godot runtime/version should be confirmed with \`godotcoder runtime doctor\`.
`,
    ],
  ];

  for (const [file, contents] of artifacts) {
    await writeFile(file, contents);
    filesWritten.push(file);
  }

  return { projectRoot, idea, mode, filesWritten };
}

function titleFromIdea(idea: string): string {
  const trimmed = idea.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : "Untitled Godot Game";
}
