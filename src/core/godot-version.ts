export const MIN_GODOT_VERSION = "4.3.0";

export interface ParsedGodotVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseGodotVersion(version: string | null | undefined): ParsedGodotVersion | null {
  if (!version) return null;
  const match = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] ? Number(match[3]) : 0,
  };
}

export function isGodotVersionSupported(version: string | null | undefined): boolean {
  const parsed = parseGodotVersion(version);
  const minimum = parseGodotVersion(MIN_GODOT_VERSION)!;
  if (!parsed) return false;
  if (parsed.major !== minimum.major) return parsed.major > minimum.major;
  if (parsed.minor !== minimum.minor) return parsed.minor > minimum.minor;
  return parsed.patch >= minimum.patch;
}

export function godotVersionPolicyText(): string {
  return `Godot ${MIN_GODOT_VERSION} or newer is required.`;
}
