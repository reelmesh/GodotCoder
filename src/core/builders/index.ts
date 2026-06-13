import { asteroidShooterBuilder } from "./asteroid-shooter.js";
import { platformerBuilder } from "./platformer.js";
import type { GameBuilder } from "./types.js";

const builders = [platformerBuilder, asteroidShooterBuilder];

export function selectBuilder(prompt: string): GameBuilder {
  const normalized = prompt.toLowerCase();
  const scores = builders.map((builder) => ({
    builder,
    score: scoreBuilder(builder, normalized),
  }));

  scores.sort((left, right) => right.score - left.score || left.builder.id.localeCompare(right.builder.id));
  return scores[0]?.builder ?? asteroidShooterBuilder;
}

export function listBuilders(): GameBuilder[] {
  return builders;
}

function scoreBuilder(builder: GameBuilder, normalizedPrompt: string): number {
  let score = 0;
  for (const genre of builder.genres) {
    if (normalizedPrompt.includes(genre)) {
      score += 4;
    }
  }
  for (const capability of builder.capabilities) {
    if (normalizedPrompt.includes(capability)) {
      score += 2;
    }
  }

  if (builder.id === "platformer" && /\b(platformer|platform|jump|coin|side[- ]?scroller|runner)\b/.test(normalizedPrompt)) {
    score += 6;
  }

  if (builder.id === "asteroid-shooter" && /\b(shooter|asteroid|space|bullet|arcade)\b/.test(normalizedPrompt)) {
    score += 6;
  }

  return score;
}
