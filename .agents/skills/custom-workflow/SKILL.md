---
name: custom-workflow
description: Guide for custom workflow development in GodotCoder using structured game development planning templates (GDD, Epics, Story Mapping).
---

# Skill: Custom Workflow Development

This skill details how to establish, customize, and enforce custom software development workflows in GodotCoder.

## 1. Core Philosophy: Intentional Planning & Traceability
The goal of custom workflows is to maintain a rigorous trace of implementation work directly back to documented design intent:
1. **Core Fantasy/Vision** -> **Game Pillars** -> **Core Loops** -> **Mechanics & Systems** -> **Epics** -> **Stories & Tasks**.
2. Avoid ad-hoc scope additions. If a mechanic isn't in the GDD, it should not be in the codebase.

## 2. Setting Up a Custom Workflow
To initialize a custom workflow, run the slash command inside the interactive shell:
```text
/workflow init --template custom
```
This generates the core planning templates at:
* **[gdd.md](file:///home/carlosm/Documents/Dev/GodotCoder/.godotcoder/gdd.md)**: Game Design Document template following strict information density (SMART criteria).
* **[epics.md](file:///home/carlosm/Documents/Dev/GodotCoder/.godotcoder/epics.md)**: Product backlog grouping requirements into user-value epics rather than technical milestones.
* **[workflow.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/workflow.md)**: Configuration rules enforcing linter gates, headless Godot checks, and commit messages.

## 3. Writing SMART Mechanics
When defining player mechanics in [gdd.md](file:///home/carlosm/Documents/Dev/GodotCoder/.godotcoder/gdd.md), follow these rules:
* **Specific & Measurable**: Use exact values instead of adjectives (e.g., *"Jump height is 3 tiles, air time is 0.55s"* instead of *"The jump feels responsive"*).
* **Engine Isolation**: Keep the design abstract. Do not leak engine APIs or node hierarchies into the GDD (e.g., avoid writing *"We use a CharacterBody2D with move_and_slide"*). These belong in the Technical Plan.

## 4. Hooking Custom Gates
You can inject custom verification scripts (e.g. static tests, style checkers) into the workflow by registering them in `~/.gemini/config/hooks.json` under the `after-tool` or `phase-gate` hook arrays.
