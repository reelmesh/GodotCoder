# Track Spec: Export Preset Validation

## Overview
Ensuring that a Godot game builds and exports successfully is key to delivering a playable game. Static checking of code and scenes is not enough to verify that export settings, resource pack exclusions, and export configurations are valid. This track implements export preset validation, which parses `export_presets.cfg`, runs headless export pack compilation checks for each preset, and surfaces export compilation warnings/errors as standard validation findings.

## Goals & Requirements
1. **Config Verification**: Ensure `export_presets.cfg` is present and contains valid preset configurations.
2. **Headless PCK Compilation Check**: Launch Godot headlessly with `--export-pack "<preset_name>" <tmp_path>` for each defined preset.
3. **No SDK Dependency**: Using `--export-pack` only packages game resources (including compiling GDScript to bytecode) without requiring platform-specific compilers or export template binaries to be installed.
4. **Log Analysis**: Catch compiler and packager errors (e.g. invalid resources, packaging errors, missing export settings).
5. **CLI CLI/Session integration**: Integrate as a `--export` flag on `godotcoder validate`.

## Acceptance Criteria
- Running `godotcoder validate --export` in a project with no export configurations warns the user that no presets are defined.
- In a project with a valid preset, it compiles the PCK headlessly to a temp file, validates it, and exits with 0 errors.
- Any packager/export compile errors are parsed and logged as validation errors.
