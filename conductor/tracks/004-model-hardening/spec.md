# Track Spec: LLM Provider Hardening & Context Enrichment

## Overview
Controlled LLM output from local engines (like Ollama or LM Studio) can be brittle. This track hardens JSON extraction and repair rules (especially for newer reasoning models like DeepSeek-R1 that emit `<think>` blocks), and enriches prompt generation by dynamically injecting cached official Godot documentation excerpts directly into the prompt context.

## Goals & Requirements
1. **Dynamic Excerpt Injection**: Upgrade documentation context in the system prompt to fetch and inline raw text excerpts from the local `.godotcoder/cache/docs/` directory when available.
2. **Thinking Blocks Stripping**: Ensure any `<think>...</think>` tags or intermediate reasoning tokens are stripped prior to JSON extraction.
3. **JSON Repair Hardening**: Improve `repairLooseJson` to escape raw tab characters and handle minor string syntax errors.
4. **Clean Code Generation**: Verify that no extra prose or markdown comments corrupt the final parsed patch.

## Acceptance Criteria
- Generating an LLM build prompt dynamically inserts cached documentation excerpts (if cached docs exist for search terms).
- JSON extraction successfully parses and cleans replies containing `<think>...</think>` blocks.
- Passing raw tab characters or loose trailing commas in JSON replies is repaired and successfully parsed without throwing validation errors.
