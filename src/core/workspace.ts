import path from "node:path";

export function workspacePaths(projectRoot: string) {
  const workspaceRoot = path.join(projectRoot, ".godotcoder");
  return {
    workspaceRoot,
    localRoot: path.join(projectRoot, ".godotcoder.local"),
    brief: path.join(workspaceRoot, "brief.md"),
    gdd: path.join(workspaceRoot, "gdd.md"),
    technicalPlan: path.join(workspaceRoot, "technical-plan.md"),
    tasks: path.join(workspaceRoot, "tasks.md"),
    decisions: path.join(workspaceRoot, "decisions.md"),
    riskLog: path.join(workspaceRoot, "risk-log.md"),
    runtimeProfile: path.join(workspaceRoot, "runtime-profile.json"),
    projectIndex: path.join(workspaceRoot, "project-index.json"),
    agentMemory: path.join(workspaceRoot, "agent-memory.json"),
    validationsDir: path.join(workspaceRoot, "validations"),
    patchesDir: path.join(workspaceRoot, "patches"),
    cacheDir: path.join(workspaceRoot, "cache"),
    cacheDocsDir: path.join(workspaceRoot, "cache", "docs"),
  };
}
