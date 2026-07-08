import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { formatModelRetryContext, latestModelContext } from "../dist/core/model-runs.js";
import { workspacePaths } from "../dist/core/workspace.js";

test("latest model context includes recent manual playtest feedback", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "godotcoder-model-context-"));
  const paths = workspacePaths(projectRoot);
  await mkdir(paths.playtestsDir, { recursive: true });
  await writeFile(
    path.join(paths.playtestsDir, "feedback.md"),
    `## 2026-07-07T10:00:00.000Z

Feedback: Jump feels floaty.

Suggested tasks:
- [polish] Polish game feel from playtest feedback. (feel)
`,
  );

  const context = await latestModelContext(projectRoot);
  const formatted = formatModelRetryContext(context);

  assert.match(context.playtestFeedback ?? "", /Jump feels floaty/);
  assert.match(formatted, /Recent playtest feedback/);
});
