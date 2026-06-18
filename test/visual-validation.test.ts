import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { analyzePngBytes, runVisualValidation } from "../dist/core/validation.js";

test("visual frame analysis distinguishes blank and nonblank PNG frames", () => {
  const blank = analyzePngBytes(makePng(2, 1, [
    [0, 0, 0, 255],
    [0, 0, 0, 255],
  ]));
  assert.equal(blank.width, 2);
  assert.equal(blank.height, 1);
  assert.equal(blank.blank, true);
  assert.equal(blank.nearBlank, true);

  const nonblank = analyzePngBytes(makePng(2, 1, [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
  ]));
  assert.equal(nonblank.blank, false);
  assert.equal(nonblank.nearBlank, false);
});

test("runVisualValidation reports a structured warning when the frame artifact is missing", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-visual-run-"));
  await mkdir(path.join(projectRoot, ".godotcoder"), { recursive: true });
  const scriptPath = path.join(projectRoot, "mock_godot_visual.js");
  await writeFile(scriptPath, "process.exit(0);");
  const profile = {
    executable: ["node", scriptPath],
    detectedGodotVersion: "4.3.0",
    installType: "native" as const,
  };

  try {
    const report = await runVisualValidation(projectRoot, profile, 1000);
    assert.equal(report.visual?.width, null);
    assert.equal(report.summary.errors, 0);
    assert.equal(report.summary.warnings, 1);
    assert.equal(report.findings[0]?.subsystem, "visual");
    assert.match(report.findings[0]?.message ?? "", /could not be analyzed/);
    assert.match(report.visual?.artifactPath ?? "", /\.godotcoder\/validations\/val_visual_/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

function makePng(width: number, height: number, pixels: Array<[number, number, number, number]>): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const pixel = pixels[y * width + x]!;
      raw[offset++] = pixel[0];
      raw[offset++] = pixel[1];
      raw[offset++] = pixel[2];
      raw[offset++] = pixel[3];
    }
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}
