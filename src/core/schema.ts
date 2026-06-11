import { CliError } from "./errors.js";

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("SCHEMA_INVALID", `${label} must be an object.`);
  }
  return value as JsonObject;
}

export function asLiteral<T extends string | number | boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new CliError("SCHEMA_INVALID", `${label} must be ${String(expected)}.`);
  }
  return expected;
}

export function asNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new CliError("SCHEMA_INVALID", `${label} must be a string or null.`);
  }
  return value;
}

export function asNullableNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CliError("SCHEMA_INVALID", `${label} must be a finite number or null.`);
  }
  return value;
}

export function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new CliError("SCHEMA_INVALID", `${label} must be a string.`);
  }
  return value;
}

export function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new CliError("SCHEMA_INVALID", `${label} must be an array of strings.`);
  }
  return value;
}

export function asOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new CliError("SCHEMA_INVALID", `${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}
