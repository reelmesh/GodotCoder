const commandNames = [
  "/help",
  "?",
  "/home",
  "/menu",
  "/clear",
  "/mode",
  "/agent",
  "/status",
  "/setup",
  "/settings",
  "/auth",
  "/login",
  "/builders",
  "/agents",
  "/models",
  "/runs",
  "/history",
  "/ask",
  "/chat",
  "/harness",
  "/run",
  "/pipeline",
  "/make",
  "/play",
  "/open",
  "/runtime",
  "/doctor",
  "/inspect",
  "/validate",
  "/check",
  "/repair",
  "/preview",
  "/build",
  "/apply",
  "/reject",
  "/plan",
  "/exit",
  "/quit",
] as const;

const providerNames = ["openai", "anthropic", "ollama", "lmstudio", "openai-compatible"] as const;
const modeNames = ["plan", "build"] as const;
const approvalNames = ["preview", "auto-apply"] as const;
const diffNames = ["compact", "full"] as const;
const runtimeCommands = ["doctor", "use"] as const;
const authCommands = ["login", "logout"] as const;
const settingsCommands = ["set", "default-mode", "approval-mode", "provider", "diffs", "init", "help"] as const;
const modelsCommands = ["use"] as const;
const runsCommands = ["list", "show", "help"] as const;

export function completeSessionLine(line: string): [string[], string] {
  const endsWithSpace = /\s$/.test(line);
  const parts = line.trimStart().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return [commandNames.filter((command) => command.startsWith(line.trim())), line];
  }

  const first = parts[0]!;
  if (!first.startsWith("/")) {
    return [[], line];
  }

  if (parts.length === 1 && !endsWithSpace) {
    return [commandNames.filter((command) => command.startsWith(first)), first];
  }

  const second = parts[1] ?? "";
  const currentToken = endsWithSpace ? "" : parts[parts.length - 1] ?? "";

  if (first === "/mode" || first === "/agent") {
    return completeToken(modeNames, currentToken, line);
  }

  if (first === "/settings") {
    if (parts.length === 2 && !endsWithSpace) {
      return completeToken(settingsCommands, second, line);
    }
    switch (second) {
      case "default-mode":
        return completeToken(modeNames, currentToken, line);
      case "approval-mode":
        return completeToken(approvalNames, currentToken, line);
      case "provider":
        return completeToken(providerNames, currentToken, line);
      case "diffs":
        return completeToken(diffNames, currentToken, line);
      default:
        return completeToken(settingsCommands, currentToken, line);
    }
  }

  if (first === "/runtime") {
    if (parts.length === 2 && !endsWithSpace) {
      return completeToken(runtimeCommands, second, line);
    }
    return completeToken(runtimeCommands, currentToken, line);
  }

  if (first === "/auth" || first === "/login") {
    if (parts.length === 2 && !endsWithSpace) {
      return completeToken(authCommands, second, line);
    }
    if (second === "login" || first === "/login") {
      return completeToken(providerNames, currentToken, line);
    }
    return completeToken(authCommands, currentToken, line);
  }

  if (first === "/models") {
    if (parts.length === 2 && !endsWithSpace) {
      return completeToken(modelsCommands, second, line);
    }
    if (second === "use") {
      if (currentToken.startsWith("--provider")) {
        return completeToken(providerNames, currentToken, line);
      }
      return completeToken(modelsCommands, currentToken, line);
    }
    return completeToken(modelsCommands, currentToken, line);
  }

  if (first === "/runs" || first === "/history") {
    if (parts.length === 2 && !endsWithSpace) {
      return completeToken(runsCommands, second, line);
    }
    return completeToken(runsCommands, currentToken, line);
  }

  if (currentToken.startsWith("--")) {
    return completeFlags(first, currentToken, line);
  }

  if (first === "/build" || first === "/preview" || first === "/plan" || first === "/harness" || first === "/run" || first === "/pipeline" || first === "/make" || first === "/ask" || first === "/chat") {
    return [[], line];
  }

  return [[], line];
}

function completeFlags(command: string, token: string, line: string): [string[], string] {
  const flagsByCommand: Record<string, readonly string[]> = {
    "/build": ["--preview", "--apply", "--yes", "--no-validate"],
    "/preview": ["--no-validate"],
    "/harness": ["--apply", "--json", "--llm", "--repair"],
    "/run": ["--apply", "--json", "--llm", "--repair"],
    "/pipeline": ["--preview", "--llm", "--model", "--play", "--json", "--no-validate", "--no-repair"],
    "/make": ["--preview", "--llm", "--model", "--play", "--json", "--no-validate", "--no-repair"],
    "/play": ["--editor", "--json"],
    "/open": ["--editor", "--json"],
    "/plan": ["--json"],
    "/ask": ["--json"],
    "/chat": ["--json"],
    "/settings": ["--json"],
    "/auth": ["--json"],
    "/builders": ["--json"],
    "/models": ["--json"],
    "/runs": ["--json"],
    "/history": ["--json"],
    "/status": ["--json"],
    "/inspect": ["--json"],
    "/validate": ["--json"],
    "/check": ["--json"],
    "/repair": ["--json"],
    "/runtime": ["--json"],
    "/doctor": ["--json"],
  };

  return completeToken(flagsByCommand[command] ?? [], token, line);
}

function completeToken(options: readonly string[], token: string, line: string): [string[], string] {
  const matches = options.filter((option) => option.startsWith(token));
  return [matches, line];
}
