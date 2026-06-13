import { writeTrackedFile } from "../change-records.js";
import type { BuildResult, GeneratedFile, GameBuilder } from "./types.js";

export const platformerBuilder: GameBuilder = {
  id: "platformer",
  summary: "Build a playable single-scene 2D platformer prototype.",
  genres: ["2d platformer", "side scroller"],
  capabilities: ["jumping", "coin collection", "grounded movement", "single-scene prototype"],
  generateFiles: generatePlatformerFiles,
  build: buildPlatformer,
};

export function generatePlatformerFiles(): GeneratedFile[] {
  return [
    {
      path: "scenes/main.tscn",
      contents: `[gd_scene load_steps=2 format=3]

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

export async function buildPlatformer(projectRoot: string): Promise<BuildResult> {
  const changes = [];

  for (const file of generatePlatformerFiles()) {
    changes.push(await writeTrackedFile(projectRoot, file.path, file.contents));
  }

  return {
    filesWritten: changes.map((change) => change.path),
    changes,
    summary: "Built a playable single-scene 2D platformer prototype.",
  };
}

function mainGdscript(): string {
  return `extends Node2D

const GRAVITY := 1400.0
const RUN_SPEED := 310.0
const JUMP_SPEED := -620.0
const PLAYER_SIZE := Vector2(28.0, 40.0)

var player_position := Vector2(96.0, 360.0)
var velocity := Vector2.ZERO
var on_floor := false
var coins: Array[Vector2] = []
var score := 0
var won := false

var platforms := [
\tRect2(0.0, 430.0, 780.0, 42.0),
\tRect2(160.0, 335.0, 150.0, 24.0),
\tRect2(380.0, 270.0, 150.0, 24.0),
\tRect2(610.0, 205.0, 130.0, 24.0),
]

func _ready() -> void:
\tcoins = [
\t\tVector2(220.0, 295.0),
\t\tVector2(445.0, 230.0),
\t\tVector2(670.0, 165.0),
\t]
\tset_process(true)

func _process(delta: float) -> void:
\tif won:
\t\tif Input.is_key_pressed(KEY_R):
\t\t\t_restart()
\t\tqueue_redraw()
\t\treturn

\t_update_player(delta)
\t_collect_coins()
\tqueue_redraw()

func _update_player(delta: float) -> void:
\tvar input_axis := 0.0
\tif Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
\t\tinput_axis -= 1.0
\tif Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
\t\tinput_axis += 1.0

\tvelocity.x = input_axis * RUN_SPEED
\tif on_floor and (Input.is_key_pressed(KEY_SPACE) or Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP)):
\t\tvelocity.y = JUMP_SPEED
\t\ton_floor = false

\tvelocity.y += GRAVITY * delta
\tplayer_position.x += velocity.x * delta
\tplayer_position.x = clampf(player_position.x, PLAYER_SIZE.x * 0.5, get_viewport_rect().size.x - PLAYER_SIZE.x * 0.5)

\tplayer_position.y += velocity.y * delta
\t_resolve_platforms()
\tif player_position.y > get_viewport_rect().size.y + 80.0:
\t\t_restart()

func _resolve_platforms() -> void:
\ton_floor = false
\tvar feet := Vector2(player_position.x, player_position.y + PLAYER_SIZE.y * 0.5)
\tfor platform in platforms:
\t\tvar was_above: bool = feet.y - velocity.y * get_process_delta_time() <= platform.position.y
\t\tvar within_x: bool = feet.x >= platform.position.x and feet.x <= platform.position.x + platform.size.x
\t\tvar crossed_top: bool = feet.y >= platform.position.y and feet.y <= platform.position.y + maxf(18.0, absf(velocity.y) * get_process_delta_time())
\t\tif velocity.y >= 0.0 and was_above and within_x and crossed_top:
\t\t\tplayer_position.y = platform.position.y - PLAYER_SIZE.y * 0.5
\t\t\tvelocity.y = 0.0
\t\t\ton_floor = true
\t\t\treturn

func _collect_coins() -> void:
\tfor index in range(coins.size() - 1, -1, -1):
\t\tif player_position.distance_to(coins[index]) < 34.0:
\t\t\tcoins.remove_at(index)
\t\t\tscore += 1
\tif coins.is_empty():
\t\twon = true

func _draw() -> void:
\tdraw_rect(Rect2(Vector2.ZERO, get_viewport_rect().size), Color(0.06, 0.08, 0.1))
\tfor platform in platforms:
\t\tdraw_rect(platform, Color(0.28, 0.55, 0.36))
\t\tdraw_line(platform.position, platform.position + Vector2(platform.size.x, 0.0), Color(0.6, 0.9, 0.5), 3.0)
\tfor coin in coins:
\t\tdraw_circle(coin, 12.0, Color(1.0, 0.82, 0.2))
\t\tdraw_arc(coin, 7.0, 0.0, TAU, 18, Color(1.0, 0.95, 0.55), 2.0)

\tvar player_rect := Rect2(player_position - PLAYER_SIZE * 0.5, PLAYER_SIZE)
\tdraw_rect(player_rect, Color(0.2, 0.65, 1.0))
\tdraw_rect(player_rect.grow(-5.0), Color(0.12, 0.28, 0.52), false, 2.0)

\tvar font := ThemeDB.fallback_font
\tdraw_string(font, Vector2(20.0, 32.0), "Coins: %d / 3" % score, HORIZONTAL_ALIGNMENT_LEFT, -1.0, 20, Color.WHITE)
\tif won:
\t\tdraw_string(font, Vector2(250.0, 190.0), "You Win - Press R", HORIZONTAL_ALIGNMENT_LEFT, -1.0, 28, Color(0.7, 1.0, 0.45))

func _restart() -> void:
\tplayer_position = Vector2(96.0, 360.0)
\tvelocity = Vector2.ZERO
\ton_floor = false
\tscore = 0
\twon = false
\tcoins = [
\t\tVector2(220.0, 295.0),
\t\tVector2(445.0, 230.0),
\t\tVector2(670.0, 165.0),
\t]
`;
}
