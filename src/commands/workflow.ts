import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findGodotProjectRoot } from "../core/godot-project-indexer.js";
import { chooseMenuOption, withMenu } from "../core/menu.js";
import { workspacePaths } from "../core/workspace.js";

const CUSTOM_GDD_TEMPLATE = `# Game Design Document (Custom Workflow Template)

## 1. Core Fantasy & Vision
*State the high-level player fantasy and game concept directly. Avoid marketing copy.*

## 2. Game Pillars
*List 3 core pillars that guide all design decisions. Every pillar must translate to gameplay loop elements.*
- **Pillar 1**: [Description]
- **Pillar 2**: [Description]
- **Pillar 3**: [Description]

## 3. Core Gameplay Loop
*Describe the moment-to-moment feedback loop. (e.g. Scan -> Evade -> Target -> Fire -> Collect).*

## 4. Mechanics & Systems (SMART Criteria)
*Define mechanics precisely. Avoid subjective words like "fun" or "satisfying". Provide concrete numbers.*
- **Stamina/Movement**: [e.g. Dash costs 1 stamina pip. Regenerates at 1 pip/s. Jump height is 3 tiles.]
- **Combat/Interactions**: [e.g. Parries extend combos by 6 frames.]

## 5. Technical Constraints
*State engine and platform limitations (e.g. Godot 4.3+ only, GDScript-first, 60fps target on Linux).*
`;

const CUSTOM_EPICS_TEMPLATE = `# Epic & Story Breakdown (Custom Workflow Template)

## Epic 1: Core Setup & Playable Sandbox
*Goal: Establish a running greenfield scaffold containing the player controller physics sandbox.*
- **Story 1.1**: Setup project structure, features array, and blank start scene.
- **Story 1.2**: Add basic player sprite, physics collisions, and input actions map.

## Epic 2: Core Gameplay Loop
*Goal: Integrate the primary interactive mechanic (e.g. shooting, dodging, score accumulation).*
- **Story 2.1**: Implement spawner controller logic and basic enemy collision shapes.
- **Story 2.2**: Wire UI elements for scoring and level iteration.

## Epic 3: Game Over & Playback Loop
*Goal: Implement defeat triggers, end menu, and restart flow.*
- **Story 3.1**: Monitor player health or hit triggers, loading Game Over overlay.
- **Story 3.2**: Hook keyboard shortcut 'R' to clear game state and restart main scene.
`;

const CUSTOM_WORKFLOW_RULES = `# Development Workflow (Custom Workflow Template)

## 1. Traceability
Every code change must trace back to a documented mechanic in [gdd.md](.godotcoder/gdd.md) or story in [epics.md](.godotcoder/epics.md). No ad-hoc scope additions.

## 2. Engine Isolation
Do not put engine-specific node naming conventions or script path hierarchies into the GDD. Keep design specs abstract; implementation details belong solely in the Technical Plan.

## 3. Playtesting & Validation
Every applied feature must immediately undergo verification gates:
- No script syntax compilation warnings: run \`godotcoder validate\`.
- Game must launch headless: run \`godotcoder play --headless\`.
- Commits must use Conventional formats (e.g. \`feat(combat): implement frame-perfect parry\`).
`;

export async function workflowCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());

  if (args.includes("status")) {
    await printWorkflowStatus(projectRoot, json);
    return;
  }

  if (args.includes("init")) {
    const templateIdx = args.indexOf("--template");
    const template = templateIdx !== -1 ? args[templateIdx + 1] : "custom";
    await initCustomTemplates(projectRoot, template ?? "custom", json);
    return;
  }

  // Interactive Menu Mode
  if (!json) {
    await openWorkflowMenu(projectRoot);
  } else {
    await printWorkflowStatus(projectRoot, true);
  }
}

async function openWorkflowMenu(projectRoot: string): Promise<void> {
  await withMenu(async (rl) => {
    while (true) {
      console.log("");
      console.log("GodotCoder Workflow Customization");
      const choice = await chooseMenuOption(rl, "Workflow Area", [
        { value: "status", label: "Show active workflow status" },
        { value: "init_custom", label: "Initialize custom template", description: "generates GDD, Epics, and Workflow rules" },
        { value: "back", label: "Go back" },
      ]);
      if (!choice || choice === "back") return;
      if (choice === "status") await printWorkflowStatus(projectRoot, false);
      if (choice === "init_custom") await initCustomTemplates(projectRoot, "custom", false);
    }
  });
}

async function printWorkflowStatus(projectRoot: string, json: boolean): Promise<void> {
  const paths = workspacePaths(projectRoot);
  const conductorDir = path.join(projectRoot, "conductor");
  
  const statusInfo = {
    projectRoot,
    conductorPath: conductorDir,
    files: {
      gdd: paths.gdd,
      brief: paths.brief,
      workflow: paths.technicalPlan,
      tracks: path.join(conductorDir, "tracks.md"),
    }
  };

  if (json) {
    console.log(JSON.stringify({ ok: true, status: statusInfo }, null, 2));
    return;
  }

  console.log(`\nActive Workflow Location: ${path.relative(process.cwd(), conductorDir) || conductorDir}`);
  console.log(`- GDD Document: ${path.relative(projectRoot, paths.gdd)}`);
  console.log(`- Tracks Document: ${path.relative(projectRoot, path.join(conductorDir, "tracks.md"))}`);
  console.log(`- Tech Stack Configuration: ${path.relative(projectRoot, path.join(conductorDir, "tech-stack.md"))}`);
}

async function initCustomTemplates(projectRoot: string, template: string, json: boolean): Promise<void> {
  const paths = workspacePaths(projectRoot);
  const conductorDir = path.join(projectRoot, "conductor");

  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(conductorDir, { recursive: true });

  const epicsPath = path.join(paths.workspaceRoot, "epics.md");
  const workflowRulesPath = path.join(conductorDir, "workflow.md");

  if (template === "custom" || template === "bmad") {
    await writeFile(paths.gdd, CUSTOM_GDD_TEMPLATE);
    await writeFile(epicsPath, CUSTOM_EPICS_TEMPLATE);
    await writeFile(workflowRulesPath, CUSTOM_WORKFLOW_RULES);

    if (json) {
      console.log(JSON.stringify({ ok: true, msg: "Custom workflow templates initialized." }, null, 2));
      return;
    }
    console.log("\nInitialized custom workflow template structure:");
    console.log(`- Updated GDD: ${path.relative(projectRoot, paths.gdd)}`);
    console.log(`- Created Epics: ${path.relative(projectRoot, epicsPath)}`);
    console.log(`- Updated Workflow rules: ${path.relative(projectRoot, workflowRulesPath)}`);
  } else {
    if (json) {
      console.log(JSON.stringify({ ok: false, error: "Unsupported template type" }, null, 2));
      return;
    }
    console.log(`\nUnknown template: ${template}. Supported templates: custom`);
  }
}
