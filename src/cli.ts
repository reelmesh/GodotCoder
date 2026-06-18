#!/usr/bin/env node

import { buildProject } from "./commands/build.js";
import { authCommand } from "./commands/auth.js";
import { docsCommand } from "./commands/docs.js";
import { exportCommand } from "./commands/export.js";
import { showAgents } from "./commands/agents.js";
import { runHarnessCommand } from "./commands/harness.js";
import { homeCommand } from "./commands/home.js";
import { initWorkspace } from "./commands/init.js";
import { inspectProject } from "./commands/inspect.js";
import { askModel, modelsCommand } from "./commands/models.js";
import { planProject } from "./commands/plan.js";
import { pipelineCommand } from "./commands/pipeline.js";
import { playCommand } from "./commands/play.js";
import { repairCommand } from "./commands/repair.js";
import { rpcCommand } from "./commands/rpc.js";
import { runtimeCommand } from "./commands/runtime.js";
import { runsCommand } from "./commands/runs.js";
import { setupCommand } from "./commands/setup.js";
import { settingsCommand } from "./commands/settings.js";
import { startSession } from "./commands/session.js";
import { showStatus } from "./commands/status.js";
import { tasksCommand } from "./commands/tasks.js";
import { validateProject } from "./commands/validate.js";
import { CliError, formatError } from "./core/errors.js";

type CommandHandler = (args: string[]) => Promise<unknown>;

const commands: Record<string, CommandHandler> = {
  init: initWorkspace,
  home: homeCommand,
  menu: homeCommand,
  auth: authCommand,
  docs: docsCommand,
  export: exportCommand,
  setup: setupCommand,
  settings: settingsCommand,
  agents: showAgents,
  harness: runHarnessCommand,
  run: runHarnessCommand,
  ask: askModel,
  models: modelsCommand,
  runs: runsCommand,
  build: buildProject,
  status: showStatus,
  tasks: tasksCommand,
  inspect: inspectProject,
  validate: validateProject,
  plan: planProject,
  pipeline: pipelineCommand,
  play: playCommand,
  playtest: (args) => playCommand(["--test", ...args]),
  repair: repairCommand,
  rpc: rpcCommand,
};

async function main(argv: string[]): Promise<void> {
  const [command, subcommand, ...rest] = argv;

  if (!command) {
    await startSession();
    return;
  }

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "runtime") {
    await runtimeCommand([subcommand, ...rest].filter((arg): arg is string => Boolean(arg)));
    return;
  }

  const handler = commands[command];
  if (!handler) {
    throw new CliError("UNKNOWN_COMMAND", `Unknown command: ${command}`);
  }

  await handler([subcommand, ...rest].filter((arg): arg is string => Boolean(arg)));
}

function printHelp(): void {
  console.log(`GodotCoder

Usage:
  godotcoder
  godotcoder menu
  godotcoder init
  godotcoder setup
  godotcoder settings [--json]
  godotcoder settings set <key> <value>
  godotcoder settings default-mode plan|build
  godotcoder settings approval-mode preview|auto-apply
  godotcoder settings provider <provider>
  godotcoder settings diffs compact|full
  godotcoder auth [--json]
  godotcoder auth login --provider <provider> --api-key <key>
  godotcoder auth logout --provider <provider>
  godotcoder docs [search <query>|list|cache <doc-id>|show <doc-id>] [--json]
  godotcoder export doctor [--json]
  godotcoder export preset linux [--apply] [--json]
  godotcoder agents [--json]
  godotcoder models [--json]
  godotcoder models use --provider <openai|anthropic|ollama|lmstudio|openrouter|openai-compatible> --model <model> [--base-url <url>] [--api-key-env <ENV>]
  godotcoder runs
  godotcoder runs list|show <run-id>
  godotcoder ask <prompt> [--json]
  godotcoder harness <game goal> [--apply] [--repair] [--intent feature|fix|refactor|polish] [--json]
  godotcoder build [prompt] [--preview] [--apply] [--intent feature|fix|refactor|polish] [--no-validate]
  godotcoder tasks [list|show <task-id>|update <task-id> --state planned|active|blocked|done] [--json]
  godotcoder status [--json]
  godotcoder runtime doctor [--json]
  godotcoder runtime use <godot command>
  godotcoder inspect [--json]
  godotcoder validate [--json] [--smoke] [--visual] [--export]
  godotcoder repair [--json]
  godotcoder rpc <method> [--json]
  godotcoder plan <game idea> [--json]
  godotcoder pipeline <game idea> [--preview] [--apply] [--play] [--no-repair] [--json]
  godotcoder play [--editor] [--test] [--json]
  godotcoder playtest [--json]

Run without arguments to open the interactive GodotCoder session.
MVP focus: Godot 4.3+, Linux-first, CLI workspace commands.`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const formatted = formatError(error);
  console.error(formatted.message);
  process.exitCode = formatted.exitCode;
});
