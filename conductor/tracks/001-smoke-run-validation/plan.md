# Technical Plan: Main-Scene Headless Smoke Run Validation

## Proposed Code Changes

### 1. `src/core/validation.ts`
Add a new export function `runSmokeValidation`:
```typescript
export async function runSmokeValidation(
  projectRoot: string,
  runtimeProfile: RuntimeProfile | null,
  timeoutMs: number = 3000
): Promise<ValidationReport>
```

**Execution Flow**:
- Ensure runtime profile is configured and supported.
- Assemble the execution command:
  ```typescript
  const command = [
    ...runtimeProfile.executable,
    "--headless",
    "--path",
    projectRoot
  ];
  ```
- Invoke `runProcess(command, { cwd: projectRoot, timeoutMs })`.
- Note: A healthy smoke run is expected to time out (since the game loop runs indefinitely headlessly). If the game loop finishes or crashes before the timeout, check for a non-zero exit code or explicit crash logs.
- Parse the resulting stdout and stderr using `parseGodotOutput`.
- Map findings into the `ValidationReport`. If the process exits prematurely with a non-zero code and no parsed script errors are found, append a generic runtime error finding.

### 2. `src/cli.ts` (or CLI entrypoints)
- Update `godotcoder validate` command parameters to support a `--smoke` flag.
- When `--smoke` is enabled, call `runSmokeValidation` instead of (or in addition to) standard static `runValidation`.
- Update the interactive Codex/OpenCode shell slash commands so `/validate --smoke` (or `/validate smoke`) invokes the smoke validation.

### 3. Verification & Tests
- Add smoke run tests under `test/` (e.g., simulating a process run or using the mock test suite harness) to verify:
  1. Graceful timeout completion handles as success.
  2. Immediate exit with a script runtime error is parsed correctly and flags a failed report.

## Modified Files
- `src/core/validation.ts`
- `src/cli.ts` (or command layer)
- `test/validation.test.ts` (or new test files)
