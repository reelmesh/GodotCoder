import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asObject, asString, asNullableString, asStringArray, asOneOf, asLiteral, asNullableNumber } from "../dist/core/schema.js";

describe("schema validators", () => {
  describe("asObject", () => {
    it("returns object as-is", () => {
      assert.deepEqual(asObject({ a: 1 }, "test"), { a: 1 });
    });

    it("throws on array", () => {
      assert.throws(() => asObject([], "test"), /must be an object/);
    });

    it("throws on null", () => {
      assert.throws(() => asObject(null, "test"), /must be an object/);
    });

    it("throws on string", () => {
      assert.throws(() => asObject("x", "test"), /must be an object/);
    });
  });

  describe("asString", () => {
    it("returns string as-is", () => {
      assert.equal(asString("hello", "test"), "hello");
    });

    it("throws on number", () => {
      assert.throws(() => asString(42, "test"), /must be a string/);
    });
  });

  describe("asNullableString", () => {
    it("returns string", () => {
      assert.equal(asNullableString("hello", "test"), "hello");
    });

    it("returns null for null", () => {
      assert.equal(asNullableString(null, "test"), null);
    });

    it("returns null for undefined", () => {
      assert.equal(asNullableString(undefined, "test"), null);
    });
  });

  describe("asStringArray", () => {
    it("returns string array", () => {
      assert.deepEqual(asStringArray(["a", "b"], "test"), ["a", "b"]);
    });

    it("throws on mixed array", () => {
      assert.throws(() => asStringArray(["a", 1], "test"), /must be an array of strings/);
    });

    it("throws on non-array", () => {
      assert.throws(() => asStringArray("x", "test"), /must be an array of strings/);
    });
  });

  describe("asOneOf", () => {
    it("returns valid value", () => {
      assert.equal(asOneOf("plan", ["plan", "build"], "test"), "plan");
    });

    it("throws on invalid value", () => {
      assert.throws(() => asOneOf("invalid", ["plan", "build"], "test"), /must be one of/);
    });
  });

  describe("asLiteral", () => {
    it("returns expected value", () => {
      assert.equal(asLiteral(1, 1, "test"), 1);
    });

    it("throws on mismatch", () => {
      assert.throws(() => asLiteral(2, 1, "test"), /must be 1/);
    });
  });

  describe("asNullableNumber", () => {
    it("returns number", () => {
      assert.equal(asNullableNumber(42, "test"), 42);
    });

    it("returns null for null", () => {
      assert.equal(asNullableNumber(null, "test"), null);
    });

    it("throws on NaN", () => {
      assert.throws(() => asNullableNumber(NaN, "test"), /must be a finite number/);
    });
  });
});
