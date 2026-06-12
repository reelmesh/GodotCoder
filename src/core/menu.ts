import readline from "node:readline/promises";
import type { Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export interface MenuOption {
  value: string;
  label: string;
  description?: string;
}

export async function withMenu<T>(handler: (rl: Interface) => Promise<T>): Promise<T> {
  const rl = readline.createInterface({ input, output });
  try {
    return await handler(rl);
  } finally {
    rl.close();
  }
}

export async function chooseMenuOption(rl: Interface, prompt: string, options: MenuOption[]): Promise<string | null> {
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]!;
    console.log(`${index + 1}. ${option.label}${option.description ? `  ${option.description}` : ""}`);
  }
  console.log("0. Back");

  const answer = (await rl.question(`${prompt} ▸ `)).trim();
  if (answer === "0" || answer.toLowerCase() === "q" || answer.toLowerCase() === "back") {
    return null;
  }

  return options[Number(answer) - 1]?.value ?? options.find((option) => option.value === answer)?.value ?? null;
}
