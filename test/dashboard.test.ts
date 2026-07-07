import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadSessionDashboard } from "../dist/commands/dashboard.js";
import { saveTaskBoard } from "../dist/core/tasks.js";
import { workspacePaths } from "../dist/core/workspace.js";

test("session dashboard summarizes latest artifacts", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-dashboard-"));
  try {
    const paths = workspacePaths(projectRoot);
    await mkdir(paths.validationsDir, { recursive: true });
    await mkdir(paths.playtestsDir, { recursive: true });
    await writeFile(path.join(projectRoot, "project.godot"), "config_version=5\n");
    await writeFile(path.join(paths.validationsDir, "val.json"), JSON.stringify({ id: "val", summary: { errors: 1, warnings: 2 } }) + "\n");
    await writeFile(path.join(paths.playtestsDir, "latest.json"), JSON.stringify({ id: "play", status: "completed" }) + "\n");
    await saveTaskBoard(projectRoot, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      tasks: [
        { id: "task-001", title: "One", description: null, state: "planned", source: "manual", links: { patches: [], validations: [], repairs: [], playtests: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: "task-002", title: "Two", description: null, state: "done", source: "manual", links: { patches: [], validations: [], repairs: [], playtests: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ],
    });

    const dashboard = await loadSessionDashboard(projectRoot);
    assert.equal(dashboard.latestValidation?.errors, 1);
    assert.equal(dashboard.latestValidation?.warnings, 2);
    assert.equal(dashboard.latestPlaytest?.status, "completed");
    assert.equal(dashboard.taskCounts?.planned, 1);
    assert.equal(dashboard.taskCounts?.done, 1);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
