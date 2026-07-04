import type { Interface } from "node:readline/promises";
import { findGodotProjectRoot, tryFindGodotProjectRoot } from "../core/godot-project.js";
import { askMenuQuestion, chooseMenuOption, withMenu } from "../core/menu.js";
import { listModelEvalPromptSets, runModelEval } from "../core/model-evals.js";
import { modelRoutingRecommendation, modelRunReport } from "../core/model-runs.js";
import { completeWithModel, inspectProvider, loadModelConfig, loadModelConfigForRole, loadModelRoles, modelRoles, modelSystemPrompt, writeModelConfig, writeModelConfigExample, writeModelRole, writeModelRolesExample, type ModelConfig, type ModelProviderKind, type ModelRole } from "../core/providers.js";
import { readFlag, parseProvider, defaultBaseUrl, defaultApiKeyEnv } from "../core/flags.js";

export async function modelsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === "use") {
    await useModel(rest);
    return;
  }
  if (subcommand === "role" || subcommand === "roles") {
    await modelRoleCommand(rest);
    return;
  }
  if (subcommand === "report") {
    await modelReportCommand(rest);
    return;
  }
  if (subcommand === "eval") {
    await modelEvalCommand(rest);
    return;
  }
  if (subcommand === "recommend" || subcommand === "recommendation") {
    await modelRecommendCommand(rest);
    return;
  }
  if (!subcommand && process.stdin.isTTY && !args.includes("--json")) {
    await openModelsMenu();
    return;
  }
  await showModels(args);
}

async function openModelsMenu(): Promise<void> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  await withMenu(async (rl) => {
    while (true) {
      const config = await loadModelConfig(projectRoot);
      console.log("");
      console.log("GodotCoder models");
      console.log(`Current: ${config ? `${config.provider}:${config.model}` : "not configured"}`);
      const choice = await chooseMenuOption(rl, "Choose action", [
        { value: "provider", label: "Configure provider", description: "Ollama, LM Studio, OpenRouter, cloud API" },
        { value: "status", label: "Check provider status" },
        { value: "test", label: "Ask test prompt" },
      ]);
      if (!choice) return;

      if (choice === "provider") {
        await configureProvider(rl, projectRoot);
      } else if (choice === "status") {
        await showModels([]);
      } else if (choice === "test") {
        const prompt = (await askMenuQuestion(rl, "Prompt ▸ ")).trim() || "Say one sentence about Godot.";
        await askModel([prompt]);
      }
    }
  });
}

async function configureProvider(rl: Interface, projectRoot: string): Promise<void> {
  const provider = (await chooseMenuOption(rl, "Provider", [
    { value: "ollama", label: "Ollama", description: "local, http://127.0.0.1:11434" },
    { value: "lmstudio", label: "LM Studio", description: "local, http://127.0.0.1:1234" },
    { value: "openrouter", label: "OpenRouter API", description: "https://openrouter.ai/api/v1" },
    { value: "openai", label: "OpenAI API" },
    { value: "anthropic", label: "Anthropic API" },
    { value: "openai-compatible", label: "OpenAI-compatible API" },
  ])) as ModelProviderKind | null;
  if (!provider) return;

  const model = (await askMenuQuestion(rl, "Model name ▸ ")).trim();
  if (!model) {
    console.log("No model set.");
    return;
  }

  const defaultUrl = defaultBaseUrl(provider);
  const baseUrlAnswer = (await askMenuQuestion(rl, `Base URL (${defaultUrl ?? "required"}) ▸ `)).trim();
  const apiKeyDefault = defaultApiKeyEnv(provider);
  const apiKeyEnvAnswer = provider === "ollama" || provider === "lmstudio" ? "" : (await askMenuQuestion(rl, `API key env (${apiKeyDefault ?? "none"}) ▸ `)).trim();
  const config: ModelConfig = {
    schemaVersion: 1,
    provider,
    model,
    baseUrl: baseUrlAnswer || defaultUrl,
    apiKeyEnv: apiKeyEnvAnswer || apiKeyDefault,
  };
  await writeModelConfig(projectRoot, config);
  console.log(`Saved model config: ${config.provider}:${config.model}`);
}

export async function askModel(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const prompt = args.filter((arg) => arg !== "--json").join(" ").trim();
  if (!prompt) {
    console.log("Usage: godotcoder ask <prompt>");
    return;
  }

  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  const modelSelection = await loadModelConfigForRole(projectRoot, "planning");
  if (!modelSelection.config) {
    console.log("No model provider configured. Use `godotcoder models use ...` first.");
    return;
  }

  const reply = await completeWithModel(modelSelection.config, [
    { role: "system", content: modelSystemPrompt() },
    { role: "user", content: prompt },
  ], projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: true, modelSource: modelSelection.source, reply }, null, 2));
    return;
  }

  console.log(`${reply.provider}:${reply.model} [${modelSelection.source}]`);
  console.log(reply.content);
}

async function showModels(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = (await tryFindGodotProjectRoot(process.cwd())) ?? process.cwd();
  const config = await loadModelConfig(projectRoot);
  if (await tryFindGodotProjectRoot(process.cwd())) {
    await writeModelConfigExample(projectRoot);
  }
  const status = await inspectProvider(config, projectRoot);
  const roles = await loadModelRoles(projectRoot);
  await writeModelRolesExample(projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: status.configured, status, roles }, null, 2));
    return;
  }

  console.log("GodotCoder models");
  console.log(`Provider: ${config?.provider ?? "not configured"}`);
  console.log(`Model: ${config?.model ?? "not configured"}`);
  console.log(`Base URL: ${config?.baseUrl ?? "default/not configured"}`);
  console.log(`API key env: ${config?.apiKeyEnv ?? "none"}`);
  for (const diagnostic of status.diagnostics) {
    console.log(`WARN: ${diagnostic}`);
  }
  if (status.models.length > 0) {
    console.log(`Available: ${status.models.slice(0, 20).join(", ")}${status.models.length > 20 ? " ..." : ""}`);
  }
  const configuredRoles = Object.entries(roles.roles);
  if (configuredRoles.length > 0) {
    console.log("Roles:");
    for (const [role, roleConfig] of configuredRoles) {
      console.log(`- ${role}: ${roleConfig.provider}:${roleConfig.model}`);
    }
  }
}

async function useModel(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const provider = parseProvider(readFlag(args, "--provider"));
  const model = readFlag(args, "--model");
  const baseUrl = readFlag(args, "--base-url");
  const apiKeyEnv = readFlag(args, "--api-key-env");

  if (!provider || !model) {
    console.log("Usage: godotcoder models use --provider <openai|anthropic|ollama|lmstudio|openrouter|openai-compatible> --model <name> [--base-url <url>] [--api-key-env <ENV>]");
    return;
  }

  const projectRoot = await findGodotProjectRoot(process.cwd());
  const config: ModelConfig = {
    schemaVersion: 1,
    provider,
    model,
    baseUrl: baseUrl ?? defaultBaseUrl(provider),
    apiKeyEnv: apiKeyEnv ?? defaultApiKeyEnv(provider),
  };
  await writeModelConfig(projectRoot, config);
  const status = await inspectProvider(config, projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: status.configured, config, status }, null, 2));
    return;
  }

  console.log(`Saved model config: ${config.provider}:${config.model}`);
  console.log(`Base URL: ${config.baseUrl ?? "none"}`);
  console.log(`API key env: ${config.apiKeyEnv ?? "none"}`);
  for (const diagnostic of status.diagnostics) {
    console.log(`WARN: ${diagnostic}`);
  }
}

async function modelRoleCommand(args: string[]): Promise<void> {
  const [subcommand, maybeRole, ...rest] = args;
  const json = args.includes("--json");
  if (!subcommand || subcommand === "list" || subcommand === "show") {
    await showModelRoles(json);
    return;
  }

  if (subcommand !== "set") {
    console.log("Usage: godotcoder models role [list|set <planning|build|review|fallback> --provider <provider> --model <name> [--base-url <url>] [--api-key-env <ENV>] [--json]]");
    return;
  }

  const role = parseModelRole(maybeRole);
  const provider = parseProvider(readFlag(rest, "--provider"));
  const model = readFlag(rest, "--model");
  const baseUrl = readFlag(rest, "--base-url");
  const apiKeyEnv = readFlag(rest, "--api-key-env");
  if (!role || !provider || !model) {
    console.log("Usage: godotcoder models role set <planning|build|review|fallback> --provider <provider> --model <name> [--base-url <url>] [--api-key-env <ENV>] [--json]");
    return;
  }

  const projectRoot = await findGodotProjectRoot(process.cwd());
  const config: ModelConfig = {
    schemaVersion: 1,
    provider,
    model,
    baseUrl: baseUrl ?? defaultBaseUrl(provider),
    apiKeyEnv: apiKeyEnv ?? defaultApiKeyEnv(provider),
  };
  const roles = await writeModelRole(projectRoot, role, config);
  const status = await inspectProvider(config, projectRoot);
  if (json) {
    console.log(JSON.stringify({ ok: status.configured, role, config, roles, status }, null, 2));
    return;
  }

  console.log(`Saved ${role} model role: ${config.provider}:${config.model}`);
  console.log(`Base URL: ${config.baseUrl ?? "none"}`);
  console.log(`API key env: ${config.apiKeyEnv ?? "none"}`);
  for (const diagnostic of status.diagnostics) {
    console.log(`WARN: ${diagnostic}`);
  }
}

async function showModelRoles(json: boolean): Promise<void> {
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const roles = await loadModelRoles(projectRoot);
  await writeModelRolesExample(projectRoot);
  if (json) {
    console.log(JSON.stringify({ ok: true, roles }, null, 2));
    return;
  }

  console.log("GodotCoder model roles");
  for (const role of modelRoles) {
    const config = roles.roles[role];
    console.log(`${role}: ${config ? `${config.provider}:${config.model}` : "default"}`);
  }
}

function parseModelRole(value: string | undefined): ModelRole | null {
  return modelRoles.find((role) => role === value) ?? null;
}

async function modelReportCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const limit = parseLimit(readFlag(args, "--limit"));
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const report = await modelRunReport(projectRoot, limit);

  if (json) {
    console.log(JSON.stringify({ ok: true, report }, null, 2));
    return;
  }

  console.log("GodotCoder model report");
  console.log(`Runs: ${report.total} total, ${report.successes} success, ${report.failures} failed, ${report.recoveredOnRetry} recovered on retry`);
  console.log(`Success rate: ${Math.round(report.successRate * 100)}%`);
  if (report.groups.length > 0) {
    console.log("By model:");
    for (const group of report.groups) {
      console.log(`- ${group.provider}:${group.model} [${group.modelSource}, ${group.taskType}] ${group.successes}/${group.total} success, ${group.recoveredOnRetry} retry recovery`);
    }
  }
  if (report.latest.length > 0) {
    console.log("Latest:");
    for (const run of report.latest) {
      console.log(`- ${run.id} ${run.outcome} ${run.provider}:${run.model} ${run.taskType}`);
    }
  }
}

function parseLimit(value: string | null): number {
  if (!value) return 5;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 5;
}

async function modelEvalCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const promptSet = readFlag(args, "--prompt-set") ?? "mixed";
  const limit = parseLimit(readFlag(args, "--limit"));
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const report = await runModelEval(projectRoot, { promptSet, limit });

  if (json) {
    console.log(JSON.stringify({ ok: report.failed === 0, report }, null, 2));
    return;
  }

  console.log("GodotCoder model eval");
  console.log(`Prompt set: ${report.promptSet}`);
  console.log(`Results: ${report.passed}/${report.total} passed, ${report.failed} failed, ${report.recoveredOnRetry} recovered on retry`);
  for (const result of report.results) {
    const status = result.ok ? "PASS" : "FAIL";
    console.log(`- ${status} ${result.id}: ${result.modelRunId ?? "no model run"}${result.error ? ` (${result.error})` : ""}`);
  }
  console.log(`Prompt sets: ${listModelEvalPromptSets().join(", ")}`);
}

async function modelRecommendCommand(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const projectRoot = await findGodotProjectRoot(process.cwd());
  const recommendation = await modelRoutingRecommendation(projectRoot);

  if (json) {
    console.log(JSON.stringify({ ok: true, recommendation }, null, 2));
    return;
  }

  console.log("GodotCoder model recommendation");
  if (!recommendation.recommended) {
    console.log("No recommendation yet.");
  } else {
    const best = recommendation.recommended;
    console.log(`Recommended build candidate: ${best.provider}:${best.model} [${best.modelSource}]`);
    console.log(`Observed: ${best.successes}/${best.total} success, ${best.recoveredOnRetry} recovered on retry, confidence ${best.confidence}`);
  }
  if (recommendation.candidates.length > 0) {
    console.log("Candidates:");
    for (const candidate of recommendation.candidates.slice(0, 5)) {
      console.log(`- ${candidate.provider}:${candidate.model} [${candidate.modelSource}] score ${candidate.score}, ${candidate.successes}/${candidate.total} success, confidence ${candidate.confidence}`);
    }
  }
  for (const note of recommendation.notes) {
    console.log(`NOTE: ${note}`);
  }
}
