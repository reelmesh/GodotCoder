import { LlmBuildError, generateLlmBuild } from "./llm-build.js";

export interface ModelEvalPrompt {
  id: string;
  prompt: string;
}

export interface ModelEvalResult {
  id: string;
  prompt: string;
  ok: boolean;
  provider: string | null;
  model: string | null;
  modelRunId: string | null;
  recoveredOnRetry: boolean;
  files: number;
  summary: string | null;
  error: string | null;
}

export interface ModelEvalReport {
  promptSet: string;
  total: number;
  passed: number;
  failed: number;
  recoveredOnRetry: number;
  results: ModelEvalResult[];
}

const promptSets: Record<string, ModelEvalPrompt[]> = {
  mixed: [
    { id: "arcade-loop", prompt: "make a compact 2d arcade game with movement, scoring, hazards, and restart" },
    { id: "puzzle-loop", prompt: "make a small grid puzzle game with one objective, visual feedback, and a reset path" },
    { id: "platformer-loop", prompt: "make a tiny 2d platformer with coins, danger, score feedback, and restart" },
    { id: "ui-heavy", prompt: "make a simple menu-driven score challenge game with HUD feedback and a win condition" },
    { id: "brownfield-edit", prompt: "change scripts/main.gd to add a visible score label and print a ready message" },
  ],
  arcade: [
    { id: "dodger", prompt: "make a 2d arcade dodger game with player movement, enemy hazards, score, and restart" },
    { id: "collector", prompt: "make a 2d arcade collector game with spawning pickups, score feedback, timer, and win condition" },
    { id: "shooter", prompt: "make a tiny arcade shooter with movement, firing, enemies, health, and game over restart" },
    { id: "runner", prompt: "make a 2d arcade runner with obstacles, score, collision feedback, and restart" },
    { id: "pongish", prompt: "make a small pong-like arcade game with paddle input, ball movement, score, and win state" },
  ],
  edits: [
    { id: "score-edit", prompt: "change scripts/main.gd to add score tracking and visible feedback" },
    { id: "restart-edit", prompt: "change scripts/main.gd to add a restart input and print restart feedback" },
    { id: "polish-edit", prompt: "change scripts/main.gd to add visible color feedback when the player scores" },
  ],
};

export function listModelEvalPromptSets(): string[] {
  return Object.keys(promptSets).sort();
}

export async function runModelEval(projectRoot: string, options: { promptSet?: string; limit?: number } = {}): Promise<ModelEvalReport> {
  const promptSet = options.promptSet && promptSets[options.promptSet] ? options.promptSet : "mixed";
  const prompts = promptSets[promptSet]!.slice(0, boundedLimit(options.limit, promptSets[promptSet]!.length));
  const results: ModelEvalResult[] = [];

  for (const item of prompts) {
    try {
      const plan = await generateLlmBuild(projectRoot, item.prompt);
      results.push({
        id: item.id,
        prompt: item.prompt,
        ok: true,
        provider: plan.reply.provider,
        model: plan.reply.model,
        modelRunId: plan.modelRun.id,
        recoveredOnRetry: plan.modelRun.recoveredOnRetry,
        files: plan.files.length,
        summary: plan.summary,
        error: null,
      });
    } catch (error) {
      if (error instanceof LlmBuildError) {
        results.push({
          id: item.id,
          prompt: item.prompt,
          ok: false,
          provider: error.modelRun?.provider ?? null,
          model: error.modelRun?.model ?? null,
          modelRunId: error.modelRun?.id ?? null,
          recoveredOnRetry: false,
          files: 0,
          summary: null,
          error: error.message,
        });
      } else {
        results.push({
          id: item.id,
          prompt: item.prompt,
          ok: false,
          provider: null,
          model: null,
          modelRunId: null,
          recoveredOnRetry: false,
          files: 0,
          summary: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const passed = results.filter((result) => result.ok).length;
  const recoveredOnRetry = results.filter((result) => result.recoveredOnRetry).length;
  return {
    promptSet,
    total: results.length,
    passed,
    failed: results.length - passed,
    recoveredOnRetry,
    results,
  };
}

function boundedLimit(value: number | undefined, max: number): number {
  if (!value || !Number.isFinite(value)) return max;
  return Math.max(1, Math.min(Math.floor(value), max));
}
