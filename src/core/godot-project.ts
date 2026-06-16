// Barrel file for Godot project operations.
// Implementation split into:
//   - godot-config-parser.ts: parsing/serializing project.godot INI config
//   - godot-project-indexer.ts: project discovery, file walk, inspection
//   - godot-setting-editor.ts: editing project.godot settings

export type { GodotConfigValue } from "./godot-config-parser.js";
export {
  parseGodotConfig,
  serializeGodotValue,
  escapeGodotString,
  stringValue,
  numberValue,
  arrayValue,
  normalizeSection,
  normalizeKey,
  splitTopLevel,
} from "./godot-config-parser.js";

export type { ProjectIndex } from "./godot-project-indexer.js";
export {
  findGodotProjectRoot,
  tryFindGodotProjectRoot,
  inspectGodotProject,
  loadProjectIndex,
  parseProjectIndex,
} from "./godot-project-indexer.js";

export type { ProjectSettingEdit, InputActionEdit } from "./godot-setting-editor.js";
export {
  setProjectSetting,
  setInputAction,
  updateProjectGodot,
  updateGodotConfigText,
  updateGodotProjectSetting,
  updateGodotConfigTextSingle,
} from "./godot-setting-editor.js";
