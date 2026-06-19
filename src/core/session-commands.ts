export interface SessionCommand {
  name: string;
  aliases?: string[];
  handler: string;
  description: string;
  flags?: string[];
}

export const sessionCommands: SessionCommand[] = [
  { name: "/help", aliases: ["?"], handler: "help", description: "Show command palette" },
  { name: "/home", aliases: ["/menu"], handler: "home", description: "Open GodotCoder home menu" },
  { name: "/clear", handler: "clear", description: "Clear terminal" },
  { name: "/mode", aliases: ["/agent"], handler: "mode", description: "Set plan/build mode" },
  { name: "/status", handler: "status", description: "Show workspace status" },
  { name: "/setup", handler: "setup", description: "Guided setup wizard" },
  { name: "/workflow", handler: "workflow", description: "Workflow customization" },
  { name: "/settings", handler: "settings", description: "Manage settings", flags: ["--json"] },
  { name: "/auth", aliases: ["/login"], handler: "auth", description: "Manage provider auth", flags: ["--json"] },
  { name: "/agents", handler: "agents", description: "Show agent roster" },
  { name: "/docs", handler: "docs", description: "Search official Godot docs", flags: ["--json"] },
  { name: "/models", handler: "models", description: "Configure model provider", flags: ["use", "role", "roles", "report", "eval", "recommend", "recommendation", "list", "set", "planning", "build", "review", "fallback", "mixed", "arcade", "edits", "--provider", "--model", "--base-url", "--api-key-env", "--prompt-set", "--limit", "--json"] },
  { name: "/runs", aliases: ["/history"], handler: "runs", description: "Browse harness run history", flags: ["--json"] },
  { name: "/tasks", handler: "tasks", description: "Manage task board", flags: ["list", "show", "update", "--state", "--json"] },
  { name: "/ask", aliases: ["/chat"], handler: "ask", description: "Ask configured LLM", flags: ["--json"] },
  { name: "/harness", aliases: ["/run"], handler: "harness", description: "Run multi-agent workflow", flags: ["--apply", "--json", "--repair", "--intent", "--feature", "--fix", "--refactor", "--polish"] },
  { name: "/pipeline", aliases: ["/make"], handler: "pipeline", description: "Build playable slice", flags: ["--preview", "--apply", "--play", "--json", "--no-validate", "--no-repair", "--intent", "--feature", "--fix", "--refactor", "--polish"] },
  { name: "/play", aliases: ["/open"], handler: "play", description: "Launch Godot game", flags: ["--editor", "--test", "--playtest", "--json"] },
  { name: "/playtest", handler: "playtest", description: "Run automated playtest", flags: ["--json"] },
  { name: "/runtime", handler: "runtime", description: "Manage Godot runtime", flags: ["--json"] },
  { name: "/doctor", handler: "doctor", description: "Check Godot runtime health", flags: ["--json"] },
  { name: "/inspect", handler: "inspect", description: "Inspect Godot project", flags: ["--json"] },
  { name: "/validate", aliases: ["/check"], handler: "validate", description: "Validate project", flags: ["--json", "--smoke", "--visual", "--export"] },
  { name: "/export", handler: "export", description: "Inspect or create export presets", flags: ["doctor", "preset", "linux", "--json", "--apply"] },
  { name: "/repair", handler: "repair", description: "Repair validation errors", flags: ["--json"] },
  { name: "/rpc", handler: "rpc", description: "JSON RPC envelope", flags: ["--json", "--query", "--prompt", "--error", "--scene", "--context"] },
  { name: "/preview", handler: "preview", description: "Preview build changes", flags: ["--no-validate"] },
  { name: "/build", handler: "build", description: "Build game feature", flags: ["--task", "--preview", "--apply", "--yes", "--no-validate", "--intent", "--feature", "--fix", "--refactor", "--polish"] },
  { name: "/apply", handler: "apply", description: "Apply pending build" },
  { name: "/reject", handler: "reject", description: "Reject pending build" },
  { name: "/plan", handler: "plan", description: "Plan game idea", flags: ["--json"] },
  { name: "/exit", aliases: ["/quit"], handler: "exit", description: "Quit session" },
];

export function allCommandNames(): string[] {
  const names: string[] = [];
  for (const cmd of sessionCommands) {
    names.push(cmd.name);
    if (cmd.aliases) names.push(...cmd.aliases);
  }
  return names;
}
