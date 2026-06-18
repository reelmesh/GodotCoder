import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzePlaytestInteractivity, parsePlaytestErrors, type PlaytestTimelineEvent } from "../dist/core/playtest.js";

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
});
