# GodotCoder FAQ

## How do I configure OpenRouter?

Use `godotcoder models use --provider openrouter --model <model>` and set `OPENROUTER_API_KEY`, or log in with `godotcoder auth login --provider openrouter --api-key <key>`. The default OpenRouter base URL is `https://openrouter.ai/api/v1`.

## Where do task updates live?

Task work is stored in both `.godotcoder/tasks.md` and `.godotcoder/tasks.json`. The markdown file stays readable for humans, while the JSON sidecar keeps structured state, links, and status history available to the CLI.

## How do I build from a specific task?

Use `godotcoder build --task <task-id> --preview` to inspect a task-backed build, then `--apply` when you are ready to write the patch. Applied builds link their patch and validation records back to the task record.

## What does `godotcoder playtest` do?

It runs a short headless playtest, simulates input, records a timeline, and stores logs plus frame or visual validation artifacts under `.godotcoder/playtests/`. Use `--suggest-tasks` for task suggestions from bad signals, or `playtest feedback <note>` for manual feedback; applied feedback is logged to `.godotcoder/playtests/feedback.md`. The latest playtest summary and recent manual feedback are also fed into later build prompts.

## What should I commit?

Commit the durable project artifacts under `.godotcoder/`, including planning files, `tasks.md`, `tasks.json`, runtime profile data, and patch records when they are part of the intended project history. Do not commit local machine state under `.godotcoder.local/`.

## What is the current next slice?

The beginner TUI roadmap and manual playtest feedback loop are complete through guided setup, guided brownfield preview, compact preview review, session dashboard, task suggestions, feedback logging, build context, and editor summaries. The next product slice should be chosen after a fresh review of current gaps.
