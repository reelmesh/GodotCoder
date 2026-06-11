import { writeTrackedFile } from "../change-records.js";
import type { BuildResult, GeneratedFile, GameBuilder } from "./types.js";

export const asteroidShooterBuilder: GameBuilder = {
  id: "asteroid-shooter",
  summary: "Build a playable single-scene 2D asteroid shooter prototype.",
  generateFiles: generateAsteroidShooterFiles,
  build: buildAsteroidShooter,
};

export function generateAsteroidShooterFiles(): GeneratedFile[] {
  return [
    {
      path: "scenes/main.tscn",
      contents:
    `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]

[node name="Main" type="Node2D"]
script = ExtResource("1_main")
`,
    },
    {
      path: "scripts/main.gd",
      contents: mainGdscript(),
    },
  ];
}

export async function buildAsteroidShooter(projectRoot: string): Promise<BuildResult> {
  const changes = [];

  for (const file of generateAsteroidShooterFiles()) {
    changes.push(await writeTrackedFile(projectRoot, file.path, file.contents));
  }

  return {
    filesWritten: changes.map((change) => change.path),
    changes,
    summary: "Built a playable single-scene 2D asteroid shooter prototype.",
  };
}

function mainGdscript(): string {
  return `extends Node2D

const PLAYER_SPEED := 360.0
const BULLET_SPEED := 620.0
const ASTEROID_MIN_SPEED := 80.0
const ASTEROID_MAX_SPEED := 180.0
const PLAYER_RADIUS := 18.0

var player_position := Vector2.ZERO
var bullets: Array[Vector2] = []
var asteroids: Array[Dictionary] = []
var shoot_cooldown := 0.0
var spawn_timer := 0.0
var score := 0
var game_over := false
var rng := RandomNumberGenerator.new()

func _ready() -> void:
\trng.randomize()
\tplayer_position = get_viewport_rect().size * 0.5
\tset_process(true)

func _process(delta: float) -> void:
\tif game_over:
\t\tif Input.is_key_pressed(KEY_R):
\t\t\t_restart()
\t\tqueue_redraw()
\t\treturn

\t_update_player(delta)
\t_update_bullets(delta)
\t_update_asteroids(delta)
\t_update_spawning(delta)
\t_check_collisions()
\tqueue_redraw()

func _update_player(delta: float) -> void:
\tvar direction := Vector2.ZERO
\tif Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A):
\t\tdirection.x -= 1.0
\tif Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D):
\t\tdirection.x += 1.0
\tif Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_W):
\t\tdirection.y -= 1.0
\tif Input.is_key_pressed(KEY_DOWN) or Input.is_key_pressed(KEY_S):
\t\tdirection.y += 1.0

\tif direction.length() > 0.0:
\t\tplayer_position += direction.normalized() * PLAYER_SPEED * delta
\tplayer_position = player_position.clamp(Vector2(32.0, 32.0), get_viewport_rect().size - Vector2(32.0, 32.0))

\tshoot_cooldown = maxf(0.0, shoot_cooldown - delta)
\tif Input.is_key_pressed(KEY_SPACE) and shoot_cooldown <= 0.0:
\t\tbullets.append(player_position + Vector2(0.0, -PLAYER_RADIUS))
\t\tshoot_cooldown = 0.18

func _update_bullets(delta: float) -> void:
\tfor index in range(bullets.size() - 1, -1, -1):
\t\tbullets[index].y -= BULLET_SPEED * delta
\t\tif bullets[index].y < -16.0:
\t\t\tbullets.remove_at(index)

func _update_asteroids(delta: float) -> void:
\tfor index in range(asteroids.size() - 1, -1, -1):
\t\tvar asteroid := asteroids[index]
\t\tasteroid.position += asteroid.velocity * delta
\t\tasteroids[index] = asteroid
\t\tif asteroid.position.y > get_viewport_rect().size.y + asteroid.radius:
\t\t\tasteroids.remove_at(index)

func _update_spawning(delta: float) -> void:
\tspawn_timer -= delta
\tif spawn_timer > 0.0:
\t\treturn

\tvar radius := rng.randf_range(18.0, 42.0)
\tasteroids.append({
\t\t"position": Vector2(rng.randf_range(radius, get_viewport_rect().size.x - radius), -radius),
\t\t"velocity": Vector2(rng.randf_range(-35.0, 35.0), rng.randf_range(ASTEROID_MIN_SPEED, ASTEROID_MAX_SPEED)),
\t\t"radius": radius,
\t})
\tspawn_timer = rng.randf_range(0.35, 0.85)

func _check_collisions() -> void:
\tfor asteroid_index in range(asteroids.size() - 1, -1, -1):
\t\tvar asteroid := asteroids[asteroid_index]
\t\tif player_position.distance_to(asteroid.position) <= PLAYER_RADIUS + asteroid.radius:
\t\t\tgame_over = true
\t\t\treturn

\t\tfor bullet_index in range(bullets.size() - 1, -1, -1):
\t\t\tif bullets[bullet_index].distance_to(asteroid.position) <= asteroid.radius:
\t\t\t\tbullets.remove_at(bullet_index)
\t\t\t\tasteroids.remove_at(asteroid_index)
\t\t\t\tscore += 10
\t\t\t\tbreak

func _draw() -> void:
\tdraw_rect(Rect2(Vector2.ZERO, get_viewport_rect().size), Color(0.04, 0.05, 0.07))
\t_draw_player()
\tfor bullet in bullets:
\t\tdraw_circle(bullet, 4.0, Color(0.5, 0.95, 1.0))
\tfor asteroid in asteroids:
\t\tdraw_circle(asteroid.position, asteroid.radius, Color(0.65, 0.6, 0.55))
\t\tdraw_arc(asteroid.position, asteroid.radius * 0.65, 0.0, TAU, 16, Color(0.25, 0.23, 0.22), 2.0)

\tvar font := ThemeDB.fallback_font
\tdraw_string(font, Vector2(20.0, 32.0), "Score: %d" % score, HORIZONTAL_ALIGNMENT_LEFT, -1.0, 20, Color.WHITE)
\tif game_over:
\t\tdraw_string(font, get_viewport_rect().size * 0.5 + Vector2(-95.0, 0.0), "Game Over - Press R", HORIZONTAL_ALIGNMENT_LEFT, -1.0, 24, Color(1.0, 0.4, 0.4))

func _draw_player() -> void:
\tvar points := PackedVector2Array([
\t\tplayer_position + Vector2(0.0, -PLAYER_RADIUS),
\t\tplayer_position + Vector2(-PLAYER_RADIUS * 0.8, PLAYER_RADIUS),
\t\tplayer_position + Vector2(PLAYER_RADIUS * 0.8, PLAYER_RADIUS),
\t])
\tdraw_colored_polygon(points, Color(0.2, 0.8, 1.0))

func _restart() -> void:
\tbullets.clear()
\tasteroids.clear()
\tscore = 0
\tgame_over = false
\tplayer_position = get_viewport_rect().size * 0.5
`;
}
