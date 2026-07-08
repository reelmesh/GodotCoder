import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzePlaytestInteractivity, formatPlaytestFeedbackEntry, parsePlaytestErrors, readPlaytestFeedbackEntries, suggestPlaytestTasks, suggestTasksFromPlaytestFeedback, type PlaytestTimelineEvent } from "../dist/core/playtest.js";

describe("playtest intelligence", () => {
  it("records interactive signals when input, frames, visual output, and scene changes are present", () => {
    const timeline: PlaytestTimelineEvent[] = [
      { atMs: 0, kind: "ready", frames: 0, physicsFrames: 0, nodeCount: 5, textHash: "a" },
      { atMs: 500, kind: "input", action: "ui_accept", pressed: true, frames: 20, physicsFrames: 10, nodeCount: 5, textHash: "a" },
      { atMs: 1000, kind: "sample", frames: 60, physicsFrames: 30, nodeCount: 6, textHash: "b", sceneChanged: true, textChanged: true },
    ];
    const result = analyzePlaytestInteractivity({
      timeline,
      visual: { artifactPath: "/tmp/frame.png", width: 640, height: 360, blank: false, nearBlank: false },
      errors: [],
      timedOut: false,
      exitCode: 0,
    });

    assert.equal(result.appearsInteractive, true);
    assert.equal(result.signals.inputSimulated, true);
    assert.equal(result.signals.frameProcessingActive, true);
    assert.equal(result.signals.physicsProcessingActive, true);
    assert.equal(result.signals.sceneStateChanged, true);
    assert.equal(result.signals.textChanged, true);
    assert.equal(result.signals.visualNonBlank, true);
    assert.deepEqual(result.warnings, []);
  });

  it("warns when no visible or interactive change is observed", () => {
    const result = analyzePlaytestInteractivity({
      timeline: [{ atMs: 0, kind: "ready", frames: 0, physicsFrames: 0 }],
      visual: { artifactPath: "/tmp/frame.png", width: 640, height: 360, blank: true, nearBlank: true },
      errors: [],
      timedOut: false,
      exitCode: 0,
    });

    assert.equal(result.appearsInteractive, false);
    assert.equal(result.signals.inputSimulated, false);
    assert.equal(result.signals.visualNonBlank, false);
    assert.equal(result.warnings.some((warning) => warning.includes("No simulated input")), true);
    assert.equal(result.warnings.some((warning) => warning.includes("blank")), true);
  });

  it("parses runtime errors and timeout failures from playtest output", () => {
    const errors = parsePlaytestErrors("ok\nSCRIPT ERROR: Parse Error at res://scripts/main.gd:3\n", 1, true);

    assert.equal(errors.some((error) => error.includes("SCRIPT ERROR")), true);
    assert.equal(errors.some((error) => error.includes("timed out")), true);
  });

  it("suggests tasks from bad playtest signals", () => {
    const interactivity = analyzePlaytestInteractivity({
      timeline: [{ atMs: 0, kind: "ready", frames: 0, physicsFrames: 0 }],
      visual: { artifactPath: "/tmp/frame.png", width: 640, height: 360, blank: true, nearBlank: true },
      errors: ["SCRIPT ERROR: Parse Error"],
      timedOut: false,
      exitCode: 1,
    });
    const suggestions = suggestPlaytestTasks({
      id: "playtest_1",
      errors: ["SCRIPT ERROR: Parse Error"],
      visual: { artifactPath: "/tmp/frame.png", width: 640, height: 360, blank: true, nearBlank: true },
      interactivity,
    });

    assert.equal(suggestions.length, 3);
    assert.equal(suggestions[0]?.intent, "fix");
    assert.match(suggestions[0]?.description ?? "", /SCRIPT ERROR/);
    assert.equal(suggestions.some((suggestion) => suggestion.title.includes("blank")), true);
  });

  it("classifies manual playtest feedback into a task suggestion", () => {
    const bug = suggestTasksFromPlaytestFeedback("Player gets stuck after the first jump.");
    const feel = suggestTasksFromPlaytestFeedback("Jump feels floaty.");

    assert.equal(bug[0]?.category, "bug");
    assert.equal(bug[0]?.intent, "fix");
    assert.equal(feel[0]?.category, "feel");
    assert.equal(feel[0]?.intent, "polish");
    assert.match(feel[0]?.description ?? "", /Jump feels floaty/);
  });

  it("formats manual playtest feedback as durable markdown", () => {
    const suggestions = suggestTasksFromPlaytestFeedback("Jump feels floaty.");
    const markdown = formatPlaytestFeedbackEntry({
      createdAt: "2026-07-07T12:00:00.000Z",
      feedback: "Jump feels floaty.",
      suggestions,
    });

    assert.match(markdown, /## 2026-07-07T12:00:00.000Z/);
    assert.match(markdown, /Feedback: Jump feels floaty\./);
    assert.match(markdown, /Suggested tasks:/);
    assert.match(markdown, /\[polish]/);
  });

  it("reads recent manual playtest feedback entries", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "godotcoder-playtest-feedback-"));
    const filePath = path.join(dir, "feedback.md");
    await writeFile(filePath, [
      "## 2026-07-07T12:00:00.000Z",
      "",
      "Feedback: First note.",
      "",
      "Suggested tasks:",
      "- [fix] Old task.",
      "",
      "## 2026-07-07T12:01:00.000Z",
      "",
      "Feedback: Jump feels floaty.",
      "",
      "Suggested tasks:",
      "- [polish] Polish game feel from playtest feedback. (feel)",
      "",
    ].join("\n"));

    const entries = await readPlaytestFeedbackEntries(filePath, 1);

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.feedback, "Jump feels floaty.");
    assert.deepEqual(entries[0]?.suggestions, ["[polish] Polish game feel from playtest feedback. (feel)"]);
  });
});
