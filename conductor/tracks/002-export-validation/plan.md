# Technical Plan: Export Preset Validation

## Proposed Code Changes

### 1. `src/core/validation.ts`
Implement and export a new function:
```typescript
export async function runExportValidation(
  projectRoot: string,
  runtimeProfile: RuntimeProfile | null,
): Promise<ValidationReport>
```

**Implementation Details**:
- Locate `export_presets.cfg`. If not present, log a `warning` finding advising the user to define export presets in Godot.
- Parse `export_presets.cfg` using `parseGodotConfig`.
- Loop through all sections matching `preset_\\d+`. Extract the exact `name` property.
- For each preset, run Godot's export pack compiler:
  ```typescript
  const tempPckPath = path.join(os.tmpdir(), "godotcoder-export-val", `export_${timestampId(new Date())}.pck`);
  const command = [
    ...runtimeProfile.executable,
    "--headless",
    "--path",
    projectRoot,
    "--export-pack",
    presetName,
    tempPckPath
  ];
  ```
- Run the command using `runProcess(command, { cwd: projectRoot, timeoutMs: 30000 })`.
- Parse output logs using `parseGodotOutput`.
- Safely clean up and delete the temporary `.pck` file/folder using `rm` or `unlink`.
- Collate all findings and return a combined `ValidationReport`.

### 2. `src/commands/validate.ts`
- Expose `--export` flag.
- Call `runExportValidation` if `--export` is present, or update options to run export checks in sequence.
- Save validation report.

### 3. CLI Interfaces & Tab-Completion
- Update `src/cli.ts` help output to document `--export`.
- Update `src/commands/session.ts` help message.
- Add `--export` to tab-completions in `src/core/completion.ts`.

### 4. Tests
- Add unit tests inside `test/smoke.test.mjs` to test export parsing, mock successful and failing export-pack process invocations, and assert correct error outputs.
