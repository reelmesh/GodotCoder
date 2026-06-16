export function timestampId(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "_").replace(/\.(\d+)Z$/, "_$1");
}
