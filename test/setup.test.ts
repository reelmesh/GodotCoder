import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { setupStatus } from "../dist/commands/setup.js";
import { createRuntimeProfile } from "../dist/core/runtime-profile.js";
import { writeModelConfig } from "../dist/core/providers.js";
import { workspacePaths } from "../dist/core/workspace.js";

test("setup checklist points to the next incomplete setup step", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-setup-"));
  try {
    await writeFile(path.join(projectRoot, "project.godot"), "config_version=5\n");

    const empty = await setupStatus(projectRoot);
    assert.equal(empty.ready, false);
    assert.equal(empty.next, "Create workspace.");

    const paths = workspacePaths(projectRoot);
    await mkdir(paths.workspaceRoot, { recursive: true });
    await writeFile(
      paths.runtimeProfile,
      JSON.stringify(createRuntimeProfile(projectRoot, { command: ["godot"], version: "4.3.stable", installType: "native", diagnostics: [] }), null, 2) + "\n",
    );
    await writeModelConfig(projectRoot, { schemaVersion: 1, provider: "ollama", model: "llama3.1", baseUrl: "http://127.0.0.1:11434", apiKeyEnv: null });
    await mkdir(paths.validationsDir, { recursive: true });
    await writeFile(path.join(paths.validationsDir, "val.json"), "{}\n");

    const ready = await setupStatus(projectRoot);
    assert.equal(ready.ready, true);
    assert.equal(ready.next, "Ready.");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
