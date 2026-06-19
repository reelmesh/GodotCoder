import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { timestampId } from "./ids.js";
import type { ModelProviderKind } from "./providers.js";
import { workspacePaths } from "./workspace.js";

export interface ModelRunAttempt {
  stage: "initial" | "retry";
  provider: string | null;
  model: string | null;
  error: string | null;
  content: string | null;
}

export interface ModelRunRecord {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  command: "build";
  taskType: string;
  provider: ModelProviderKind;
  model: string;
  modelSource?: "role" | "fallback" | "default";
  outcome: "success" | "failed";
  recoveredOnRetry: boolean;
  promptPreview: string;
  summary: string | null;
  error: string | null;
  attempts: ModelRunAttempt[];
  context: {
    validation: string | null;
    visualValidation: string | null;
    repair: string | null;
    playtest: string | null;
    tasks: string | null;
  };
}

export interface ModelRunGroupSummary {
  provider: string;
  model: string;
  modelSource: "role" | "fallback" | "default" | "unknown";
  taskType: string;
  total: number;
  successes: number;
  failures: number;
  recoveredOnRetry: number;
  successRate: number;
}

export interface ModelRunReport {
  total: number;
  successes: number;
  failures: number;
  recoveredOnRetry: number;
  successRate: number;
  groups: ModelRunGroupSummary[];
  latest: ModelRunRecord[];
}

export interface ModelRoutingCandidate {
  provider: string;
  model: string;
  modelSource: "role" | "fallback" | "default" | "unknown";
  total: number;
  successes: number;
  failures: number;
  recoveredOnRetry: number;
  successRate: number;
  score: number;
  confidence: "low" | "medium" | "high";
}

export interface ModelRoutingRecommendation {
  totalRuns: number;
  recommended: ModelRoutingCandidate | null;
  candidates: ModelRoutingCandidate[];
  notes: string[];
}

export async function writeModelRun(projectRoot: string, input: Omit<ModelRunRecord, "schemaVersion" | "id" | "createdAt">): Promise<ModelRunRecord> {
  const paths = workspacePaths(projectRoot);
  await mkdir(paths.modelRunsDir, { recursive: true });
  const createdAt = new Date();
  const record: ModelRunRecord = {
    schemaVersion: 1,
    id: `model_run_${timestampId(createdAt)}`,
    createdAt: createdAt.toISOString(),
    ...input,
  };
  await writeFile(path.join(paths.modelRunsDir, `${record.id}.json`), JSON.stringify(record, null, 2) + "\n");
  return record;
}

export async function loadModelRuns(projectRoot: string): Promise<ModelRunRecord[]> {
  const paths = workspacePaths(projectRoot);
  const files = await latestJsonFiles(paths.modelRunsDir);
  const records: ModelRunRecord[] = [];
  for (const filePath of files) {
    try {
      records.push(parseModelRunRecord(JSON.parse(await readFile(filePath, "utf8"))));
    } catch {
      // Ignore malformed historical records; reports should remain usable.
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function modelRunReport(projectRoot: string, limit = 5): Promise<ModelRunReport> {
  const records = await loadModelRuns(projectRoot);
  return summarizeModelRuns(records, limit);
}

export async function modelRoutingRecommendation(projectRoot: string): Promise<ModelRoutingRecommendation> {
  return recommendModelRouting(await loadModelRuns(projectRoot));
}

export function summarizeModelRuns(records: ModelRunRecord[], limit = 5): ModelRunReport {
  const successes = records.filter((record) => record.outcome === "success").length;
  const failures = records.filter((record) => record.outcome === "failed").length;
  const recoveredOnRetry = records.filter((record) => record.recoveredOnRetry).length;
  const groups = new Map<string, ModelRunGroupSummary>();

  for (const record of records) {
    const modelSource = record.modelSource ?? "unknown";
    const key = [record.provider, record.model, modelSource, record.taskType].join("\0");
    const group = groups.get(key) ?? {
      provider: record.provider,
      model: record.model,
      modelSource,
      taskType: record.taskType,
      total: 0,
      successes: 0,
      failures: 0,
      recoveredOnRetry: 0,
      successRate: 0,
    };
    group.total += 1;
    if (record.outcome === "success") group.successes += 1;
    if (record.outcome === "failed") group.failures += 1;
    if (record.recoveredOnRetry) group.recoveredOnRetry += 1;
    group.successRate = rate(group.successes, group.total);
    groups.set(key, group);
  }

  return {
    total: records.length,
    successes,
    failures,
    recoveredOnRetry,
    successRate: rate(successes, records.length),
    groups: Array.from(groups.values()).sort((a, b) => b.total - a.total || b.successRate - a.successRate || a.provider.localeCompare(b.provider)),
    latest: records.slice(0, limit),
  };
}

export function recommendModelRouting(records: ModelRunRecord[]): ModelRoutingRecommendation {
  const candidates = summarizeModelCandidates(records);
  const recommended = candidates[0] ?? null;
  const notes: string[] = [];

  if (records.length === 0) {
    notes.push("No model-run records yet. Run `godotcoder models eval` or a few preview builds first.");
  } else if (recommended && recommended.total < 3) {
    notes.push("Recommendation is based on limited local evidence. Run more eval prompts before changing routing.");
  }

  const failing = candidates.filter((candidate) => candidate.total >= 2 && candidate.successRate < 0.5);
  for (const candidate of failing.slice(0, 3)) {
    notes.push(`${candidate.provider}:${candidate.model} has a low observed success rate (${candidate.successes}/${candidate.total}).`);
  }

  if (recommended && recommended.modelSource === "fallback") {
    notes.push("The fallback model is currently the strongest observed candidate; consider assigning it to the build role if that matches your intent.");
  }

  return {
    totalRuns: records.length,
    recommended,
    candidates,
    notes,
  };
}

export async function latestModelContext(projectRoot: string): Promise<ModelRunRecord["context"]> {
  const paths = workspacePaths(projectRoot);
  const [validation, visualValidation, repair, playtest, tasks] = await Promise.all([
    latestValidationSummary(paths.validationsDir, false),
    latestValidationSummary(paths.validationsDir, true),
    latestRepairSummary(paths.repairsDir),
    readLatestJsonSummary(path.join(paths.playtestsDir, "latest.json"), summarizePlaytest),
    readTextSummary(paths.tasks),
  ]);
  return { validation, visualValidation, repair, playtest, tasks };
}

export function formatModelRetryContext(context: ModelRunRecord["context"]): string {
  const lines = [
    ["Latest validation", context.validation],
    ["Latest visual validation", context.visualValidation],
    ["Latest repair", context.repair],
    ["Latest playtest", context.playtest],
    ["Current tasks", context.tasks],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `- ${label}: ${value}`);

  return lines.length ? lines.join("\n") : "No recent GodotCoder validation, repair, playtest, or task findings are available.";
}

async function latestValidationSummary(dir: string, requireVisual: boolean): Promise<string | null> {
  const files = await latestJsonFiles(dir);
  for (const filePath of files) {
    const summary = await readLatestJsonSummary(filePath, (value) => summarizeValidation(value, requireVisual));
    if (summary) return summary;
  }
  return null;
}

async function latestRepairSummary(dir: string): Promise<string | null> {
  const files = await latestJsonFiles(dir);
  for (const filePath of files) {
    const summary = await readLatestJsonSummary(filePath, summarizeRepair);
    if (summary) return summary;
  }
  return null;
}

async function latestJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dir, entry.name))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function readLatestJsonSummary(filePath: string, summarize: (value: unknown) => string | null): Promise<string | null> {
  try {
    return summarize(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return null;
  }
}

async function readTextSummary(filePath: string): Promise<string | null> {
  try {
    const text = (await readFile(filePath, "utf8")).trim().replace(/\s+/g, " ");
    return text ? truncate(text, 600) : null;
  } catch {
    return null;
  }
}

function summarizeValidation(value: unknown, requireVisual: boolean): string | null {
  if (!isRecord(value)) return null;
  const visual = isRecord(value.visual) ? value.visual : null;
  if (requireVisual && !visual) return null;
  const summary = isRecord(value.summary) ? value.summary : {};
  const findings = Array.isArray(value.findings) ? value.findings : [];
  const details = findings
    .map((finding) => isRecord(finding) ? `${stringValue(finding.severity) ?? "finding"}: ${stringValue(finding.message) ?? ""}` : "")
    .filter(Boolean)
    .slice(0, 3)
    .join("; ");
  const visualDetails = visual
    ? `visual blank=${String(visual.blank ?? "unknown")} nearBlank=${String(visual.nearBlank ?? "unknown")}`
    : null;
  return truncate([
    `id=${stringValue(value.id) ?? "unknown"}`,
    `errors=${numberValue(summary.errors) ?? 0}`,
    `warnings=${numberValue(summary.warnings) ?? 0}`,
    visualDetails,
    details,
  ].filter(Boolean).join(", "), 700);
}

function summarizeRepair(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const actions = Array.isArray(value.actions) ? value.actions.length : 0;
  const validationAfter = isRecord(value.validationAfter) ? value.validationAfter : null;
  const afterSummary = validationAfter && isRecord(validationAfter.summary) ? validationAfter.summary : null;
  return truncate([
    `id=${stringValue(value.id) ?? "unknown"}`,
    `status=${stringValue(value.status) ?? "unknown"}`,
    `actions=${actions}`,
    stringValue(value.summary),
    afterSummary ? `after errors=${numberValue(afterSummary.errors) ?? 0} warnings=${numberValue(afterSummary.warnings) ?? 0}` : null,
  ].filter(Boolean).join(", "), 700);
}

function summarizePlaytest(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const signals = isRecord(value.signals) ? value.signals : {};
  const errors = Array.isArray(value.errors) ? value.errors.length : 0;
  return truncate([
    `id=${stringValue(value.id) ?? "unknown"}`,
    `ok=${String(value.ok ?? "unknown")}`,
    `errors=${errors}`,
    `input=${String(signals.inputSimulated ?? "unknown")}`,
    `sceneChanged=${String(signals.sceneChanged ?? "unknown")}`,
    `visualNonblank=${String(signals.visualNonblank ?? "unknown")}`,
  ].join(", "), 700);
}

function summarizeModelCandidates(records: ModelRunRecord[]): ModelRoutingCandidate[] {
  const candidates = new Map<string, ModelRoutingCandidate>();
  for (const record of records) {
    const modelSource = record.modelSource ?? "unknown";
    const key = [record.provider, record.model, modelSource].join("\0");
    const candidate = candidates.get(key) ?? {
      provider: record.provider,
      model: record.model,
      modelSource,
      total: 0,
      successes: 0,
      failures: 0,
      recoveredOnRetry: 0,
      successRate: 0,
      score: 0,
      confidence: "low",
    };
    candidate.total += 1;
    if (record.outcome === "success") candidate.successes += 1;
    if (record.outcome === "failed") candidate.failures += 1;
    if (record.recoveredOnRetry) candidate.recoveredOnRetry += 1;
    candidate.successRate = rate(candidate.successes, candidate.total);
    candidate.confidence = candidate.total >= 5 ? "high" : candidate.total >= 3 ? "medium" : "low";
    candidate.score = recommendationScore(candidate);
    candidates.set(key, candidate);
  }

  return Array.from(candidates.values()).sort((a, b) => b.score - a.score || b.total - a.total || a.provider.localeCompare(b.provider));
}

function recommendationScore(candidate: ModelRoutingCandidate): number {
  const retryPenalty = candidate.total > 0 ? candidate.recoveredOnRetry / candidate.total : 0;
  const evidenceBonus = Math.min(candidate.total, 10) / 100;
  return Number((candidate.successRate - retryPenalty * 0.15 + evidenceBonus).toFixed(3));
}

function parseModelRunRecord(value: unknown): ModelRunRecord {
  const root = isRecord(value) ? value : {};
  return {
    schemaVersion: 1,
    id: stringValue(root.id) ?? "unknown",
    createdAt: stringValue(root.createdAt) ?? "",
    command: "build",
    taskType: stringValue(root.taskType) ?? "unknown",
    provider: providerValue(root.provider),
    model: stringValue(root.model) ?? "unknown",
    modelSource: modelSourceValue(root.modelSource),
    outcome: root.outcome === "failed" ? "failed" : "success",
    recoveredOnRetry: root.recoveredOnRetry === true,
    promptPreview: stringValue(root.promptPreview) ?? "",
    summary: stringValue(root.summary),
    error: stringValue(root.error),
    attempts: Array.isArray(root.attempts) ? root.attempts.map(parseModelRunAttempt) : [],
    context: parseModelRunContext(root.context),
  };
}

function parseModelRunAttempt(value: unknown): ModelRunAttempt {
  const root = isRecord(value) ? value : {};
  return {
    stage: root.stage === "retry" ? "retry" : "initial",
    provider: stringValue(root.provider),
    model: stringValue(root.model),
    error: stringValue(root.error),
    content: stringValue(root.content),
  };
}

function parseModelRunContext(value: unknown): ModelRunRecord["context"] {
  const root = isRecord(value) ? value : {};
  return {
    validation: stringValue(root.validation),
    visualValidation: stringValue(root.visualValidation),
    repair: stringValue(root.repair),
    playtest: stringValue(root.playtest),
    tasks: stringValue(root.tasks),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function providerValue(value: unknown): ModelProviderKind {
  if (value === "openai" || value === "anthropic" || value === "ollama" || value === "lmstudio" || value === "openrouter" || value === "openai-compatible") {
    return value;
  }
  return "openai-compatible";
}

function modelSourceValue(value: unknown): ModelRunRecord["modelSource"] {
  if (value === "role" || value === "fallback" || value === "default") return value;
  return undefined;
}

function rate(count: number, total: number): number {
  return total > 0 ? Number((count / total).toFixed(3)) : 0;
}
