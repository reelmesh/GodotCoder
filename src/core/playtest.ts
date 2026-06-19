import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectGodotProject, updateGodotProjectSetting } from "./godot-project.js";
import { discoverRuntime } from "./runtime-discovery.js";
import { createRuntimeProfile, loadRuntimeProfile } from "./runtime-profile.js";
import { workspacePaths } from "./workspace.js";
import { runProcess } from "./process.js";
import { timestampId } from "./ids.js";
import { analyzePngFrame, runVisualValidation, type FrameAnalysis, type ValidationReport } from "./validation.js";

export interface PlaytestTimelineEvent {
  atMs: number;
  kind: "ready" | "input" | "sample" | "frame" | "quit";
  action?: string;
  pressed?: boolean;
  frames?: number;
  physicsFrames?: number;
  nodeCount?: number;
  textHash?: string;
  sceneChanged?: boolean;
  textChanged?: boolean;
}

export interface PlaytestInteractivity {
  appearsInteractive: boolean;
  warnings: string[];
  signals: {
    inputSimulated: boolean;
    frameProcessingActive: boolean;
    physicsProcessingActive: boolean;
    sceneStateChanged: boolean;
    textChanged: boolean;
    visualNonBlank: boolean | null;
    runtimeErrors: boolean;
    prematureExit: boolean;
  };
}

export interface PlaytestResult {
  schemaVersion: 1;
  id: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  output: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  command: string[] | null;
  artifacts: {
    recordPath: string;
    stdoutPath: string;
    stderrPath: string;
    engineLogPath: string;
    timelinePath: string;
    framePath: string;
    visualValidationReportPath: string | null;
    visualValidationArtifactPath: string | null;
  };
  timeline: PlaytestTimelineEvent[];
  visual: (FrameAnalysis & { artifactPath: string }) | null;
  interactivity: PlaytestInteractivity;
}

export async function runPlaytest(projectRoot: string): Promise<PlaytestResult> {
  const startedAt = new Date();
  const id = `playtest_${timestampId(startedAt)}`;
  const paths = workspacePaths(projectRoot);
  const playtestsDir = paths.playtestsDir;
  const artifactDir = path.join(playtestsDir, id);
  const stdoutPath = path.join(artifactDir, "stdout.log");
  const stderrPath = path.join(artifactDir, "stderr.log");
  const engineLogPath = path.join(artifactDir, "godot.log");
  const timelinePath = path.join(artifactDir, "timeline.json");
  const framePath = path.join(artifactDir, "frame.png");
  const recordPath = path.join(playtestsDir, `${id}.json`);
  const simulatorPath = path.join(artifactDir, "playtest_input_simulator.gd");
  const xdgDataHome = path.join(paths.cacheDir, "xdg-data");
  const xdgCacheHome = path.join(paths.cacheDir, "xdg-cache");

  await mkdir(artifactDir, { recursive: true });
  await mkdir(xdgDataHome, { recursive: true });
  await mkdir(xdgCacheHome, { recursive: true });

  let runtimeProfile = await loadRuntimeProfile(paths.runtimeProfile);
  if (!runtimeProfile?.executable) {
    const discovery = await discoverRuntime(projectRoot);
    const projectIndex = await inspectGodotProject(projectRoot);
    runtimeProfile = createRuntimeProfile(projectRoot, discovery, projectIndex);
  }

  if (!runtimeProfile.executable) {
    throw new Error("No Godot runtime configured. Please run `godotcoder runtime doctor` first.");
  }

  const projectGodotPath = path.join(projectRoot, "project.godot");
  const originalGodotConfig = await readFile(projectGodotPath, "utf8");
  const projectIndex = await inspectGodotProject(projectRoot);
  const actions = Array.from(new Set([
    "ui_left",
    "ui_right",
    "ui_up",
    "ui_down",
    "ui_accept",
    "ui_select",
    "ui_cancel",
    ...projectIndex.inputMap,
  ]));
  const command = [
    ...runtimeProfile.executable,
    "--headless",
    "--path",
    projectRoot,
    "--log-file",
    engineLogPath,
  ];

  let processResult: Awaited<ReturnType<typeof runProcess>> | null = null;
  let restoreError: unknown = null;
  try {
    await writeFile(simulatorPath, playtestSimulatorScript({
      actions,
      timelinePath,
      framePath,
      durationSeconds: 5,
    }), "utf8");
    await updateGodotProjectSetting(projectRoot, "autoload", "GodotCoderPlaytestSimulator", `*res://.godotcoder/playtests/${id}/playtest_input_simulator.gd`);
    processResult = await runProcess(command, {
      cwd: projectRoot,
      timeoutMs: 7000,
      env: {
        XDG_DATA_HOME: xdgDataHome,
        XDG_CACHE_HOME: xdgCacheHome,
      },
    });
  } finally {
    try {
      await writeFile(projectGodotPath, originalGodotConfig, "utf8");
    } catch (error) {
      restoreError = error;
    }
  }

  const finishedAt = new Date();
  const stdout = processResult?.stdout ?? "";
  const stderr = processResult?.stderr ?? "";
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);

  const timeline = await readTimeline(timelinePath);
  let visual = await readVisualFrame(framePath);
  let visualValidationReport: ValidationReport | null = null;
  let visualValidationReportPath: string | null = null;
  if (!visual) {
    visualValidationReport = await runVisualValidation(projectRoot, runtimeProfile, 8000);
    visualValidationReportPath = path.join(paths.validationsDir, `${visualValidationReport.id}.json`);
    await mkdir(paths.validationsDir, { recursive: true });
    await writeFile(visualValidationReportPath, JSON.stringify(visualValidationReport, null, 2) + "\n");
    const fallbackVisual = visualValidationReport.visual;
    if (fallbackVisual && fallbackVisual.width !== null && fallbackVisual.height !== null && fallbackVisual.blank !== null && fallbackVisual.nearBlank !== null) {
      visual = {
        artifactPath: fallbackVisual.artifactPath,
        width: fallbackVisual.width,
        height: fallbackVisual.height,
        blank: fallbackVisual.blank,
        nearBlank: fallbackVisual.nearBlank,
        pixelCount: fallbackVisual.width && fallbackVisual.height ? fallbackVisual.width * fallbackVisual.height : 0,
      };
    }
  }
  const output = `${stdout}\n${stderr}`;
  const errors = parsePlaytestErrors(output, processResult?.exitCode ?? null, processResult?.timedOut ?? false);
  if (restoreError) {
    errors.push(`Failed to restore project.godot after playtest: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
  }
  const interactivity = analyzePlaytestInteractivity({
    timeline,
    visual,
    errors,
    timedOut: processResult?.timedOut ?? false,
    exitCode: processResult?.exitCode ?? null,
  });
  const warnings = [...interactivity.warnings];
  const result: PlaytestResult = {
    schemaVersion: 1,
    id,
    ok: errors.length === 0,
    errors,
    warnings,
    output,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    command,
    artifacts: {
      recordPath,
      stdoutPath,
      stderrPath,
      engineLogPath,
      timelinePath,
      framePath,
      visualValidationReportPath,
      visualValidationArtifactPath: visualValidationReport?.visual?.artifactPath ?? visual?.artifactPath ?? null,
    },
    timeline,
    visual,
    interactivity,
  };

  await writeFile(recordPath, JSON.stringify(result, null, 2) + "\n");
  await writeFile(path.join(playtestsDir, "latest.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

export function parsePlaytestErrors(output: string, exitCode: number | null, timedOut: boolean): string[] {
  const errors: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes("SCRIPT ERROR") || trimmed.includes("ERROR:") || trimmed.includes("FATAL:") || trimmed.includes("CRASH:")) {
      errors.push(trimmed);
    }
  }
  if (timedOut) {
    errors.push("Playtest timed out before the in-game fail-safe quit.");
  } else if (exitCode !== null && exitCode !== 0) {
    errors.push(`Process exited with exit code ${exitCode}.`);
  }
  return errors;
}

export function analyzePlaytestInteractivity(input: {
  timeline: PlaytestTimelineEvent[];
  visual: (FrameAnalysis & { artifactPath: string }) | null;
  errors: string[];
  timedOut: boolean;
  exitCode: number | null;
}): PlaytestInteractivity {
  const inputSimulated = input.timeline.some((event) => event.kind === "input");
  const frameProcessingActive = input.timeline.some((event) => (event.frames ?? 0) > 0);
  const physicsProcessingActive = input.timeline.some((event) => (event.physicsFrames ?? 0) > 0);
  const sceneStateChanged = input.timeline.some((event) => event.sceneChanged === true);
  const textChanged = input.timeline.some((event) => event.textChanged === true);
  const visualNonBlank = input.visual ? !input.visual.blank && !input.visual.nearBlank : null;
  const runtimeErrors = input.errors.length > 0;
  const prematureExit = !input.timedOut && input.exitCode !== null && input.exitCode !== 0;
  const warnings: string[] = [];

  if (!inputSimulated) warnings.push("No simulated input events were recorded.");
  if (!frameProcessingActive && !physicsProcessingActive) warnings.push("No active frame or physics processing was observed.");
  if (visualNonBlank === null) warnings.push("No playtest visual frame could be analyzed.");
  if (visualNonBlank === false) warnings.push("Captured playtest frame appears blank or near-blank.");
  if (!sceneStateChanged && !textChanged) warnings.push("No simple scene-state or text changes were observed during the playtest.");

  return {
    appearsInteractive: inputSimulated && (frameProcessingActive || physicsProcessingActive) && !runtimeErrors && visualNonBlank !== false,
    warnings,
    signals: {
      inputSimulated,
      frameProcessingActive,
      physicsProcessingActive,
      sceneStateChanged,
      textChanged,
      visualNonBlank,
      runtimeErrors,
      prematureExit,
    },
  };
}

async function readTimeline(timelinePath: string): Promise<PlaytestTimelineEvent[]> {
  try {
    const parsed = JSON.parse(await readFile(timelinePath, "utf8"));
    return Array.isArray(parsed) ? parsed.map(normalizeTimelineEvent).filter((event): event is PlaytestTimelineEvent => Boolean(event)) : [];
  } catch {
    return [];
  }
}

async function readVisualFrame(framePath: string): Promise<(FrameAnalysis & { artifactPath: string }) | null> {
  try {
    const analysis = await analyzePngFrame(framePath);
    return { artifactPath: framePath, ...analysis };
  } catch {
    return null;
  }
}

function normalizeTimelineEvent(value: unknown): PlaytestTimelineEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const kind = typeof root.kind === "string" ? root.kind : "";
  if (!["ready", "input", "sample", "frame", "quit"].includes(kind)) return null;
  return {
    atMs: typeof root.atMs === "number" ? root.atMs : 0,
    kind: kind as PlaytestTimelineEvent["kind"],
    action: typeof root.action === "string" ? root.action : undefined,
    pressed: typeof root.pressed === "boolean" ? root.pressed : undefined,
    frames: typeof root.frames === "number" ? root.frames : undefined,
    physicsFrames: typeof root.physicsFrames === "number" ? root.physicsFrames : undefined,
    nodeCount: typeof root.nodeCount === "number" ? root.nodeCount : undefined,
    textHash: typeof root.textHash === "string" ? root.textHash : undefined,
    sceneChanged: typeof root.sceneChanged === "boolean" ? root.sceneChanged : undefined,
    textChanged: typeof root.textChanged === "boolean" ? root.textChanged : undefined,
  };
}

function playtestSimulatorScript(input: { actions: string[]; timelinePath: string; framePath: string; durationSeconds: number }): string {
  const actionsList = input.actions.map((action) => JSON.stringify(action)).join(", ");
  return `extends Node

var actions := [${actionsList}]
var timeline: Array = []
var frames := 0
var physics_frames := 0
var input_events := 0
var elapsed := 0.0
var next_sample := 1.0
var initial_node_count := -1
var initial_text_hash := ""
var captured_frame := false

func _ready() -> void:
\trandomize()
\tinitial_node_count = _node_count(get_tree().root)
\tinitial_text_hash = _text_hash(get_tree().root)
\t_record("ready")
\tvar timer := get_tree().create_timer(${input.durationSeconds.toFixed(1)})
\ttimer.timeout.connect(func():
\t\t_record("quit")
\t\t_save_timeline()
\t\tget_tree().quit(0)
\t)

func _process(delta: float) -> void:
\tframes += 1
\telapsed += delta
\tif not captured_frame and elapsed >= 1.0:
\t\tcaptured_frame = true
\t\tcall_deferred("_capture_frame")
\tif elapsed >= next_sample:
\t\t_record("sample")
\t\tnext_sample += 1.0

func _physics_process(_delta: float) -> void:
\tphysics_frames += 1
\tif actions.is_empty():
\t\treturn
\tif randf() < 0.35:
\t\tvar action = actions[randi() % actions.size()]
\t\tvar ev := InputEventAction.new()
\t\tev.action = action
\t\tev.pressed = randf() < 0.65
\t\tInput.parse_input_event(ev)
\t\tinput_events += 1
\t\tif input_events <= 30 or input_events % 10 == 0:
\t\t\t_record("input", action, ev.pressed)

func _notification(what: int) -> void:
\tif what == NOTIFICATION_PREDELETE:
\t\t_save_timeline()

func _capture_frame() -> void:
\tawait RenderingServer.frame_post_draw
\tvar image := get_viewport().get_texture().get_image()
\tif image != null and not image.is_empty():
\t\timage.save_png(${JSON.stringify(input.framePath)})
\t_record("frame")
\t_save_timeline()

func _record(kind: String, action := "", pressed := false) -> void:
\tvar node_count := _node_count(get_tree().root)
\tvar text_hash := _text_hash(get_tree().root)
\tvar event := {
\t\t"atMs": int(elapsed * 1000.0),
\t\t"kind": kind,
\t\t"frames": frames,
\t\t"physicsFrames": physics_frames,
\t\t"nodeCount": node_count,
\t\t"textHash": text_hash,
\t\t"sceneChanged": initial_node_count >= 0 and node_count != initial_node_count,
\t\t"textChanged": not initial_text_hash.is_empty() and text_hash != initial_text_hash,
\t}
\tif not action.is_empty():
\t\tevent["action"] = action
\t\tevent["pressed"] = pressed
\ttimeline.append(event)
\tif timeline.size() > 80:
\t\ttimeline.pop_front()

func _save_timeline() -> void:
\tvar file := FileAccess.open(${JSON.stringify(input.timelinePath)}, FileAccess.WRITE)
\tif file:
\t\tfile.store_string(JSON.stringify(timeline, "\\t"))

func _node_count(node: Node) -> int:
\tvar count := 1
\tfor child in node.get_children():
\t\tif child is Node:
\t\t\tcount += _node_count(child)
\treturn count

func _text_hash(node: Node) -> String:
\tvar text := ""
\tvar value = node.get("text")
\tif value != null:
\t\ttext += str(value)
\tfor child in node.get_children():
\t\tif child is Node:
\t\t\ttext += _text_hash(child)
\treturn str(hash(text))
`;
}
