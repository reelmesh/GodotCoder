import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./files.js";

export interface GreenfieldProject {
  projectRoot: string;
  projectName: string;
  createdProjectFile: boolean;
}

export async function ensureGreenfieldGodotProject(projectRoot: string, idea?: string): Promise<GreenfieldProject> {
  const projectFile = path.join(projectRoot, "project.godot");
  const projectName = deriveProjectName(idea) ?? (path.basename(projectRoot) || "GodotCoder Game");

  if (await pathExists(projectFile)) {
    return { projectRoot, projectName, createdProjectFile: false };
  }

  await mkdir(projectRoot, { recursive: true });
  await mkdir(path.join(projectRoot, "scenes"), { recursive: true });
  await mkdir(path.join(projectRoot, "scripts"), { recursive: true });

  await writeFile(
    projectFile,
    // config_version tracks the Godot 4 project format. This may need
    // updating for future Godot 4.x releases (e.g., 4.4+ could use version 6).
    `config_version=5

[application]
config/name="${escapeGodotString(projectName)}"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.x")

[rendering]
renderer/rendering_method="forward_plus"
`,
    { flag: "wx" },
  );

  await writeFile(
    path.join(projectRoot, "scenes", "main.tscn"),
    `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]

[node name="Main" type="Node2D"]
script = ExtResource("1_main")
`,
    { flag: "wx" },
  );

  await writeFile(
    path.join(projectRoot, "scripts", "main.gd"),
    `extends Node2D

func _ready() -> void:
\tprint("GodotCoder project ready")
`,
    { flag: "wx" },
  );

  return { projectRoot, projectName, createdProjectFile: true };
}

function deriveProjectName(idea?: string): string | null {
  if (!idea?.trim()) return null;
  const words = idea
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => !["make", "create", "build", "a", "an", "the", "of", "game"].includes(word.toLowerCase()))
    .slice(0, 5);

  if (words.length === 0) return null;
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ");
}

function escapeGodotString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/"/g, '\\"');
}
