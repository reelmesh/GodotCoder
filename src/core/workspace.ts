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
    backlog: path.join(workspaceRoot, "backlog.md"),
    agentRoster: path.join(workspaceRoot, "agent-roster.json"),
    runtimeProfile: path.join(workspaceRoot, "runtime-profile.json"),
    runtimeOverride: path.join(projectRoot, ".godotcoder.local", "runtime-overrides.json"),
    runtimeOverrideExample: path.join(projectRoot, ".godotcoder.local", "runtime-overrides.example.json"),
    modelConfig: path.join(projectRoot, ".godotcoder.local", "model-config.json"),
    modelConfigExample: path.join(projectRoot, ".godotcoder.local", "model-config.example.json"),
    secrets: path.join(projectRoot, ".godotcoder.local", "secrets.json"),
    userSettings: path.join(projectRoot, ".godotcoder.local", "user-settings.json"),
    projectIndex: path.join(workspaceRoot, "project-index.json"),
    agentMemory: path.join(workspaceRoot, "agent-memory.json"),
    validationsDir: path.join(workspaceRoot, "validations"),
    repairsDir: path.join(workspaceRoot, "repairs"),
    patchesDir: path.join(workspaceRoot, "patches"),
    runsDir: path.join(workspaceRoot, "runs"),
    cacheDir: path.join(workspaceRoot, "cache"),
    cacheDocsDir: path.join(workspaceRoot, "cache", "docs"),
  };
}
