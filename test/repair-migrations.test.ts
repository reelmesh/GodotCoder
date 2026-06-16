import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { migrateGdscriptText } from "../dist/core/repair.js";

describe("migrateGdscriptText", () => {
  it("replaces PoolByteArray with PackedByteArray", () => {
    const result = migrateGdscriptText("var data = PoolByteArray()");
    assert.ok(result.contents.includes("PackedByteArray"));
    assert.ok(result.descriptions.includes("PoolByteArray -> PackedByteArray"));
  });

  it("replaces PoolStringArray with PackedStringArray", () => {
    const result = migrateGdscriptText("var names = PoolStringArray()");
    assert.ok(result.contents.includes("PackedStringArray"));
  });

  it("replaces OS.get_ticks_msec with Time.get_ticks_msec", () => {
    const result = migrateGdscriptText("OS.get_ticks_msec()");
    assert.ok(result.contents.includes("Time.get_ticks_msec()"));
  });

  it("replaces deg2rad with deg_to_rad", () => {
    const result = migrateGdscriptText("deg2rad(90)");
    assert.ok(result.contents.includes("deg_to_rad(90)"));
  });

  it("replaces .instance() with .instantiate()", () => {
    const result = migrateGdscriptText("var node = scene.instance()");
    assert.ok(result.contents.includes(".instantiate()"));
  });

  it("replaces export var with @export var", () => {
    const result = migrateGdscriptText("export var speed = 100");
    assert.ok(result.contents.includes("@export var speed = 100"));
  });

  it("replaces onready var with @onready var", () => {
    const result = migrateGdscriptText("onready var label = $Label");
    assert.ok(result.contents.includes("@onready var label = $Label"));
  });

  it("replaces KinematicBody2D with CharacterBody2D", () => {
    const result = migrateGdscriptText("extends KinematicBody2D");
    assert.ok(result.contents.includes("CharacterBody2D"));
  });

  it("replaces yield with await", () => {
    const result = migrateGdscriptText(`yield(get_tree(), "idle_frame")`);
    assert.ok(result.contents.includes("await get_tree().idle_frame"));
  });

  it("replaces rand_range with randf_range", () => {
    const result = migrateGdscriptText("rand_range(0, 100)");
    assert.ok(result.contents.includes("randf_range(0, 100)"));
  });

  it("replaces connect calls with signal.connect syntax", () => {
    const result = migrateGdscriptText(`button.connect("pressed", self, "on_pressed")`);
    assert.ok(result.contents.includes("pressed.connect(on_pressed)"));
  });

  it("replaces explicit emitter connect", () => {
    const result = migrateGdscriptText(`timer.connect("timeout", self, "on_timeout")`);
    assert.ok(result.contents.includes("timeout.connect(on_timeout)"));
  });

  it("returns unchanged content when no migrations apply", () => {
    const source = `extends Node2D\n\nfunc _ready() -> void:\n\tprint("hello")\n`;
    const result = migrateGdscriptText(source);
    assert.equal(result.contents, source);
    assert.deepEqual(result.descriptions, []);
  });

  it("deduplicates descriptions", () => {
    const source = "var a = PoolByteArray()\nvar b = PoolByteArray()";
    const result = migrateGdscriptText(source);
    const poolDescriptions = result.descriptions.filter((d) => d.includes("PoolByteArray"));
    assert.equal(poolDescriptions.length, 1);
  });

  it("handles tool annotation correctly", () => {
    const result = migrateGdscriptText("tool\nextends Node2D");
    assert.ok(result.contents.includes("@tool"));
  });
});
