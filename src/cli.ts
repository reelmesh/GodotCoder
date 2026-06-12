#!/usr/bin/env node

import { buildProject } from "./commands/build.js";
import { showAgents } from "./commands/agents.js";
import { runHarnessCommand } from "./commands/harness.js";
import { initWorkspace } from "./commands/init.js";
import { inspectProject } from "./commands/inspect.js";
import { planProject } from "./commands/plan.js";
import { runtimeCommand } from "./commands/runtime.js";
import { startSession } from "./commands/session.js";
import { showStatus } from "./commands/status.js";
import { validateProject } from "./commands/validate.js";
import { CliError, formatError } from "./core/errors.js";

type CommandHandler = (args: string[]) => Promise<unknown>;

const commands: Record<string, CommandHandler> = {
  init: initWorkspace,
  agents: showAgents,
  harness: runHarnessCommand,
  run: runHarnessCommand,
  build: buildProject,
  status: showStatus,
  inspect: inspectProject,
  validate: validateProject,
  plan: planProject,
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
  godotcoder init
  godotcoder agents [--json]
  godotcoder harness <game goal> [--apply] [--json]
  godotcoder build [prompt] [--preview] [--apply] [--no-validate]
  godotcoder status [--json]
  godotcoder runtime doctor [--json]
  godotcoder runtime use <godot command>
  godotcoder inspect [--json]
  godotcoder validate [--json]
  godotcoder plan <game idea> [--json]

Run without arguments to open the interactive GodotCoder session.
MVP focus: Godot 4.x, Linux-first, CLI workspace commands.`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const formatted = formatError(error);
  console.error(formatted.message);
  process.exitCode = formatted.exitCode;
});
