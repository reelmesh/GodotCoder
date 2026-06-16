const supportsColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

const codes = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  gray: "\u001b[90m",
};

export function color(text: string, code: keyof typeof codes): string {
  if (!supportsColor) return text;
  return `${codes[code]}${text}${codes.reset}`;
}

export function clearScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write("\u001b[2J\u001b[H");
}

export function separator(width = 72): string {
  return color("─".repeat(width), "gray");
}

export function logo(): string {
  if (!supportsColor) {
    return color("  GodotCoder", "bold");
  }
  const c = (t: string, code: keyof typeof codes) => `${codes[code]}${t}${codes.reset}`;
  const cyan = (t: string) => c(t, "cyan");
  const gray = (t: string) => c(t, "gray");

  return [
    cyan("   ██████╗  ██████╗  ██████╗   ██████╗ ████████╗     ██████╗  ██████╗  ██████╗  ███████╗ ██████╗ "),
    cyan("  ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔═══██╗╚══██╔══╝    ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝ ██╔══██╗"),
    cyan("  ██║  ███╗██║   ██║ ██║  ██║ ██║   ██║   ██║       ██║      ██║   ██║ ██║  ██║ █████╗   ██████╔╝"),
    cyan("  ██║   ██║██║   ██║ ██║  ██║ ██║   ██║   ██║       ██║      ██║   ██║ ██║  ██║ ██╔══╝   ██╔══██╗"),
    cyan("  ╚██████╔╝╚██████╔╝ ██████╔╝ ╚██████╔╝   ██║       ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗ ██║  ██║"),
    cyan("   ╚═════╝  ╚═════╝  ╚═════╝   ╚═════╝    ╚═╝        ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝ ╚═╝  ╚═╝"),
    "",
    gray("     LLM-driven Godot game builder \u00b7 Linux-first \u00b7 GDScript-first"),
  ].join("\n");
}
