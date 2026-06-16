# Track Spec: Main-Scene Headless Smoke Run Validation

## Overview
Static validation (i.e. launching Godot in check mode and quitting) catches compile-time syntax errors and missing resources. However, it does not catch runtime script errors or engine crashes that occur during initialization (e.g. in `_init()`, `_ready()`, or early `_process()` frames). This feature introduces an active runtime "smoke run" check that launches the game headlessly, collects output for a defined period, and inspects stdout/stderr for runtime issues.

## Goals & Requirements
1. **Headless Execution**: Launch Godot headlessly using the configured runtime profile.
2. **Process Timeout**: Automatically terminate the Godot process after a specified duration (default: 3000ms).
3. **Log & Console Extraction**: Read all stdout and stderr output generated during execution.
4. **Exception Parsing**: Detect common runtime errors:
   - Null instance access (e.g. `Invalid get index '...' on base 'Nil'`)
   - Invalid typecast / class type mismatch errors
   - Script crash/abort stack traces
   - Out of bounds or key-not-found exceptions
5. **Unified Reporting**: Output findings as standard `ValidationFinding` items in the `ValidationReport`.
6. **CLI Integration**: Expose as a `--smoke` flag on `godotcoder validate` and `godotcoder pipeline`.

## Acceptance Criteria
- Running `godotcoder validate --smoke` inside a healthy project exits successfully with zero errors.
- Running inside a project with a runtime script crash (e.g., in `_ready()`) lists the crash stack trace and lines as `error` severity findings.
- The command terminates gracefully after the specified timeout without locking up.
