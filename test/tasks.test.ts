import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { linkTaskArtifacts, loadTaskBoard, updateTask } from "../src/core/tasks.js";

test("task board hydrates structured state from tasks.md", async () => {
  const projectRoot = await taskProject();
  await writeFile(path.join(projectRoot, ".godotcoder/tasks.md"), "# Tasks\n\n- [ ] Add player movement.\n- [x] Run validation.\n");

  const board = await loadTaskBoard(projectRoot);

  assert.equal(board.tasks.length, 2);
  assert.equal(board.tasks[0]?.id, "task-001");
  assert.equal(board.tasks[0]?.state, "planned");
  assert.equal(board.tasks[1]?.state, "done");
  assert.match(await readFile(path.join(projectRoot, ".godotcoder/tasks.json"), "utf8"), /Add player movement/);
});

test("task updates sync state back to readable markdown", async () => {
  const projectRoot = await taskProject();
  await writeFile(path.join(projectRoot, ".godotcoder/tasks.md"), "# Tasks\n\n- [ ] Add restart flow.\n");
  await loadTaskBoard(projectRoot);

  const { task } = await updateTask(projectRoot, "task-001", { state: "done", note: "Validated in smoke run." });
  const markdown = await readFile(path.join(projectRoot, ".godotcoder/tasks.md"), "utf8");

  assert.equal(task.state, "done");
  assert.match(task.description ?? "", /Validated/);
  assert.match(markdown, /- \[x\] Add restart flow\./);
});

test("task artifact links are deduplicated", async () => {
  const projectRoot = await taskProject();
  await writeFile(path.join(projectRoot, ".godotcoder/tasks.md"), "# Tasks\n\n- [ ] Add scoring.\n");
  await loadTaskBoard(projectRoot);

  const task = await linkTaskArtifacts(projectRoot, "task-001", {
    patches: ["patch_1", "patch_1"],
    validations: ["validation_1"],
    playtests: ["playtest_1"],
  });

  assert.deepEqual(task.links.patches, ["patch_1"]);
  assert.deepEqual(task.links.validations, ["validation_1"]);
  assert.deepEqual(task.links.playtests, ["playtest_1"]);
});

async function taskProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-tasks-"));
  await mkdir(path.join(projectRoot, ".godotcoder"), { recursive: true });
  return projectRoot;
}
