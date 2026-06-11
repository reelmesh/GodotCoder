import { asteroidShooterBuilder } from "./asteroid-shooter.js";
import { platformerBuilder } from "./platformer.js";
import type { GameBuilder } from "./types.js";

const builders = [platformerBuilder, asteroidShooterBuilder];

export function selectBuilder(prompt: string): GameBuilder {
  const normalized = prompt.toLowerCase();
  if (/\b(platformer|platform|jump|coin|side[- ]?scroller)\b/.test(normalized)) {
    return platformerBuilder;
  }

  return asteroidShooterBuilder;
}

export function listBuilders(): GameBuilder[] {
  return builders;
}
