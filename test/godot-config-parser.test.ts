import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGodotConfig, serializeGodotValue, escapeGodotString, stringValue, numberValue, arrayValue } from "../dist/core/godot-config-parser.js";

describe("godot-config-parser", () => {
  describe("parseGodotConfig", () => {
    it("parses root-level settings", () => {
      const config = parseGodotConfig("config_version=5");
      assert.equal(config.root?.config_version, 5);
    });

    it("parses sections", () => {
      const config = parseGodotConfig("[application]\nconfig/name=\"My Game\"");
      assert.equal(config.application?.config_name, "My Game");
    });

    it("parses booleans and null", () => {
      const config = parseGodotConfig("enabled=true\ndisabled=false\nvalue=null");
      assert.equal(config.root?.enabled, true);
      assert.equal(config.root?.disabled, false);
      assert.equal(config.root?.value, null);
    });

    it("parses PackedStringArray", () => {
      const config = parseGodotConfig(`features=PackedStringArray("4.x", "Mobile")`);
      assert.deepEqual(config.root?.features, ["4.x", "Mobile"]);
    });

    it("parses quoted strings", () => {
      const config = parseGodotConfig(`name="Hello World"`);
      assert.equal(config.root?.name, "Hello World");
    });

    it("skips comments", () => {
      const config = parseGodotConfig("; this is a comment\nkey=value");
      assert.equal(config.root?.key, "value");
    });

    it("handles multi-line values", () => {
      const config = parseGodotConfig(`dict={ \n"a": 1,\n"b": 2\n}`);
      assert.deepEqual(config.root?.dict, { a: 1, b: 2 });
    });

    it("returns empty config for empty text", () => {
      const config = parseGodotConfig("");
      assert.deepEqual(config, { root: {} });
    });
  });

  describe("serializeGodotValue", () => {
    it("serializes null", () => {
      assert.equal(serializeGodotValue(null), "null");
    });

    it("serializes booleans", () => {
      assert.equal(serializeGodotValue(true), "true");
      assert.equal(serializeGodotValue(false), "false");
    });

    it("serializes numbers", () => {
      assert.equal(serializeGodotValue(42), "42");
      assert.equal(serializeGodotValue(3.14), "3.14");
    });

    it("throws on Infinity", () => {
      assert.throws(() => serializeGodotValue(Infinity), /must be finite/);
    });

    it("serializes strings with escaping", () => {
      assert.equal(serializeGodotValue("hello"), `"hello"`);
      assert.equal(serializeGodotValue('say "hi"'), `"say \\"hi\\""`);
    });

    it("serializes string arrays as PackedStringArray", () => {
      assert.equal(serializeGodotValue(["a", "b"]), `PackedStringArray("a", "b")`);
    });

    it("serializes objects", () => {
      const result = serializeGodotValue({ key: "val", num: 1 });
      assert.ok(result.startsWith("{"));
      assert.ok(result.includes(`"key": "val"`));
      assert.ok(result.includes(`"num": 1`));
    });
  });

  describe("escapeGodotString", () => {
    it("escapes quotes", () => {
      assert.equal(escapeGodotString(`say "hi"`), `say \\"hi\\"`);
    });

    it("escapes newlines and tabs", () => {
      assert.equal(escapeGodotString("a\nb\tc"), "a\\nb\\tc");
    });

    it("escapes backslashes", () => {
      assert.equal(escapeGodotString("a\\b"), "a\\\\b");
    });
  });

  describe("helper functions", () => {
    it("stringValue returns string or null", () => {
      assert.equal(stringValue("hello"), "hello");
      assert.equal(stringValue(42), null);
      assert.equal(stringValue(undefined), null);
    });

    it("numberValue returns number or null", () => {
      assert.equal(numberValue(42), 42);
      assert.equal(numberValue("42"), 42);
      assert.equal(numberValue("hello"), null);
      assert.equal(numberValue(undefined), null);
    });

    it("arrayValue returns string array", () => {
      assert.deepEqual(arrayValue(["a", "b"]), ["a", "b"]);
      assert.deepEqual(arrayValue([1, "b"]), ["b"]);
      assert.deepEqual(arrayValue(undefined), []);
    });
  });
});
