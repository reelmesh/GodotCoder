# Hugging Face Godot Model And Dataset Research

Date: 2026-06-11

## Summary

Hugging Face has a small Godot/GDScript ecosystem. The datasets are more useful to GodotCoder than the Godot-tuned models.

Recommended use:
- Use Godot datasets for retrieval, examples, evals, and optional future fine-tuning experiments.
- Do not make a small Godot-tuned model the default coding agent.
- Use a strong general coding/instruction model through the Pi-style provider layer, then improve it with Godot-specific RAG, tools, validators, and prompts.
- Treat official Godot public documentation as the primary source for API correctness; Hugging Face datasets should supplement, not replace, official docs.

## Most Relevant Datasets

### `wallstoneai/godot-gdscript-dataset`

URL: https://huggingface.co/datasets/wallstoneai/godot-gdscript-dataset

What it is:
- GDScript code from 5k+ GitHub repositories.
- One text file per repo.
- Includes all `.gd` files and non-empty README content.
- Dataset collection date: June 2025.
- Dataset card says 5,172 projects and 660 MB.
- Hugging Face API reports Apache-2.0 and text-generation tags.

Potential value:
- Best candidate for GodotCoder's example corpus.
- Useful for local retrieval over real Godot project patterns.
- Useful for mining common scene/script structures, input patterns, player controllers, state machines, save systems, UI code, and genre templates.
- Useful for building eval prompts and regression cases.

Risks:
- Aggregated GitHub code means source-repo licensing and provenance need auditing before fine-tuning.
- Mixed Godot 3 and Godot 4 code. The dataset format includes a Godot version field, but the data still needs filtering.
- Quality will vary heavily across student projects, jam games, prototypes, abandoned repos, and tutorials.

Recommended GodotCoder use:
- Use for retrieval and examples after filtering.
- Build a cleaner derived index organized by Godot version, feature area, and quality signals.
- Do not train on it until licensing and deduplication are handled.

### `glaiveai/godot_4_docs`

URL: https://huggingface.co/datasets/glaiveai/godot_4_docs

What it is:
- Generated dataset from Godot 4 docs using Glaive.
- Hugging Face API reports 1K-10K examples, JSON format, Apache-2.0, English.

Potential value:
- Good candidate for docs-oriented RAG.
- Good candidate for question-answer pairs over Godot 4 APIs.
- Better fit for retrieval/evaluation than for training a primary model.

Risks:
- Generated from docs, so it may compress or distort details.
- It should not replace direct Godot docs retrieval when exact API behavior matters.

Recommended GodotCoder use:
- Add as an optional documentation QA retrieval source.
- Use it to seed a Godot API eval suite.
- Prefer official docs as primary source when exact version behavior matters.

### `minosu/godot_dodo_4x_60k`

URL: https://huggingface.co/datasets/minosu/godot_dodo_4x_60k

What it is:
- Instruction/output dataset.
- Hugging Face API reports 56,279 train examples and 6,254 test examples.
- MIT license on the dataset card.

Potential value:
- Useful for studying older Godot instruction-tuning structure.
- Could provide quick benchmark prompts.

Risks:
- Created in 2023, so likely predates a lot of modern Godot 4 practice.
- Exact data generation/source quality needs inspection before use.

Recommended GodotCoder use:
- Low priority.
- Use for eval ideas, not as a primary knowledge base.

### `ImJimmeh/godot-training`

URL: https://huggingface.co/datasets/ImJimmeh/godot-training

What it is:
- Small JSON instruction-finetuning/coding/Godot dataset.
- MIT license on the dataset card.

Potential value:
- Lightweight sample of instruction data.

Risks:
- Small and low activity.
- Not enough evidence that it improves real Godot coding.

Recommended GodotCoder use:
- Inspect later as prompt/eval examples only.

## Relevant Models

### `minosu/godot_dodo_4x_60k_llama_7b` and `minosu/godot_dodo_4x_60k_llama_13b`

URLs:
- https://huggingface.co/minosu/godot_dodo_4x_60k_llama_7b
- https://huggingface.co/minosu/godot_dodo_4x_60k_llama_13b

What they are:
- Older LLaMA-based text-generation models trained on `godot_dodo_4x_60k`.
- Very low recent usage on Hugging Face.

Assessment:
- Not a good default model for GodotCoder.
- Could be tested as a local curiosity, but likely inferior to modern general coding models plus good Godot RAG/tools.

### `minosu/godot_dodo_4x_60k_starcoder_15b_*`

URLs:
- https://huggingface.co/minosu/godot_dodo_4x_60k_starcoder_15b_1ep
- https://huggingface.co/minosu/godot_dodo_4x_60k_starcoder_15b_2ep
- https://huggingface.co/minosu/godot_dodo_4x_60k_starcoder_15b_3ep

What they are:
- StarCoder 15B fine-tunes over the Godot Dodo dataset.

Assessment:
- More relevant than LLaMA for code shape, but still old and large.
- Not recommended as a default agent model.

### `Dragma/godot`

URL: https://huggingface.co/Dragma/godot

What it is:
- Listed as a Llama 3.1 8B Instruct fine-tune using `glaiveai/godot_4_docs` and `CheesymoonBrainstorms/Godot4-dataset`.
- MIT license on model card metadata.
- API reports zero downloads at time of research and no stored model weights in the inspected metadata.

Assessment:
- Interesting direction, but not usable enough to depend on without deeper inspection.

### `Faith1712/multi-qa-mpnet-glaive-godotdocs-dot`

URL: https://huggingface.co/Faith1712/multi-qa-mpnet-glaive-godotdocs-dot

What it is:
- Sentence-transformers embedding/reranking-style model fine-tuned on `glaiveai/godot_4_docs`.
- Dataset size tag: 3,494.

Potential value:
- More useful than the generation models for GodotCoder's immediate needs.
- Candidate for documentation retrieval experiments.

Assessment:
- Worth benchmarking against a strong general embedding model.
- Do not assume it wins just because it is Godot-specific.

## Not Directly Useful For GodotCoder MVP

Several Hugging Face results are Godot RL environments or robotics datasets. They are useful for reinforcement learning experiments but not for the current CLI agent that builds games.

Examples:
- `edbeeching/godot_rl_*`
- `jtatman/godot_rl_*`
- `Miauuuuuuu/godot-*`

These may become relevant only if GodotCoder later supports training agents inside Godot simulations.

## Decision

For GodotCoder MVP:

1. Use a strong modern coding model through the Pi-style provider layer.
2. Add Godot-specific knowledge through RAG, curated skill docs, project indexing, and tool validation.
3. Treat `wallstoneai/godot-gdscript-dataset` as the main candidate corpus for examples and pattern mining.
4. Treat `glaiveai/godot_4_docs` and possibly `Faith1712/multi-qa-mpnet-glaive-godotdocs-dot` as docs retrieval/eval candidates.
5. Do not make any Hugging Face Godot fine-tuned generation model the default until it passes a practical benchmark against general coding models.
6. Add official Godot docs ingestion as the first trusted knowledge-source implementation.

## Proposed Benchmark

Create a small GodotCoder model evaluation harness with these tasks:

- Generate a Godot 4 `CharacterBody2D` controller.
- Convert a Godot 3 `KinematicBody2D` script to Godot 4.
- Add input map actions to `project.godot`.
- Diagnose a common signal connection error.
- Explain and fix a scene path/preload issue.
- Generate a minimal UI `Control` scene with anchors.
- Write a save/load resource pattern.
- Produce a patch instead of a full-file rewrite.

Score each model/source on:
- Godot 4 API correctness.
- Patch quality.
- Ability to preserve existing project structure.
- Error diagnosis accuracy.
- Whether output passes Godot validation.
- Token/cost/latency.

## Sources

- Hugging Face model search API: https://huggingface.co/api/models?search=godot&limit=20
- Hugging Face dataset search API: https://huggingface.co/api/datasets?search=godot&limit=50
- Hugging Face GDScript dataset search API: https://huggingface.co/api/datasets?search=gdscript&limit=50
- `wallstoneai/godot-gdscript-dataset`: https://huggingface.co/datasets/wallstoneai/godot-gdscript-dataset
- `glaiveai/godot_4_docs`: https://huggingface.co/datasets/glaiveai/godot_4_docs
- `minosu/godot_dodo_4x_60k`: https://huggingface.co/datasets/minosu/godot_dodo_4x_60k
- `ImJimmeh/godot-training`: https://huggingface.co/datasets/ImJimmeh/godot-training
- `Faith1712/multi-qa-mpnet-glaive-godotdocs-dot`: https://huggingface.co/Faith1712/multi-qa-mpnet-glaive-godotdocs-dot
