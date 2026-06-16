# Technical Plan: LLM Provider Hardening & Context Enrichment

## Proposed Code Changes

### 1. `src/core/godot-docs.ts`
Implement and export a new helper function:
```typescript
export async function docsPromptContextWithExcerpts(
  projectRoot: string,
  query: string,
  limit = 5
): Promise<string>
```
- It searches Godot docs using `searchGodotDocs(query, limit)`.
- For each matched document, it checks for cached metadata in `.godotcoder/cache/docs/<id>.json` using `loadCachedGodotDoc`.
- If cached excerpts are found, it appends them under a `"Excerpts:"` header.
- Returns a single formatted string.

### 2. `src/core/llm-build.ts`
- Import `docsPromptContextWithExcerpts` from `./godot-docs.js`.
- Update `generateLlmBuild` to:
  ```typescript
  const docsContext = await docsPromptContextWithExcerpts(projectRoot, prompt);
  const userPrompt = buildPrompt({ prompt, projectIndex, artifacts, docsContext });
  ```
- Modify `buildPrompt` to accept `docsContext` as a parameter and embed it.
- Modify `extractJson` to strip `<think>...</think>` tags using a regex:
  ```typescript
  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  ```
- Modify `repairLooseJson` to escape raw tab characters:
  ```typescript
  return value
    .replace(/\t/g, "\\t")
    .replace(/,\s*([}\]])/g, "$1")
    ...
  ```

### 3. Tests
- Update `test/smoke.test.mjs` to test:
  1. `docsPromptContextWithExcerpts` properly formats cached docs context.
  2. `parseLlmBuildReply` handles thinking blocks and raw tab characters cleanly.
