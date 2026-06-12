import { createInterface } from "node:readline/promises";
import type { Interface } from "node:readline/promises";
import { cursorTo, emitKeypressEvents, moveCursor, clearScreenDown } from "node:readline";
import { stdin as input, stdout as output } from "node:process";

export interface MenuOption {
  value: string;
  label: string;
  description?: string;
}

export async function withMenu<T>(handler: (rl: Interface) => Promise<T>): Promise<T> {
  const rl = createInterface({ input, output });
  try {
    return await handler(rl);
  } finally {
    rl.close();
  }
}

export async function chooseMenuOption(rl: Interface, prompt: string, options: MenuOption[]): Promise<string | null> {
  if (!input.isTTY) {
    return chooseMenuOptionFallback(rl, prompt, options);
  }

  return await new Promise<string | null>((resolve) => {
    emitKeypressEvents(input);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();

    let index = 0;
    let renderedLines = 0;
    let active = true;

    const render = () => {
      cursorTo(output, 0, 0);
      clearScreenDown(output);
      output.write(`${prompt}\n`);
      output.write("Use arrow keys, space, enter.\n");
      for (let i = 0; i < options.length; i += 1) {
        const option = options[i]!;
        const selected = i === index;
        output.write(`${selected ? "[*]" : "[ ]"} ${option.label}${option.description ? `  ${option.description}` : ""}\n`);
      }
      output.write("[ ] Back\n");
      renderedLines = options.length + 3;
    };

    const cleanup = (value: string | null) => {
      if (!active) return;
      active = false;
      input.off("keypress", onKeypress);
      if (!wasRaw) {
        input.setRawMode(false);
      }
      moveCursor(output, 0, renderedLines);
      output.write("\n");
      resolve(value);
    };

    const onKeypress = (_str: string, key: import("node:readline").Key) => {
      if (key.name === "up") {
        index = index <= 0 ? options.length - 1 : index - 1;
        render();
        return;
      }
      if (key.name === "down") {
        index = index >= options.length - 1 ? 0 : index + 1;
        render();
        return;
      }
      if (key.name === "space") {
        cleanup(options[index]?.value ?? null);
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup(options[index]?.value ?? null);
        return;
      }
      if (key.name === "escape" || key.name === "q") {
        cleanup(null);
      }
    };

    input.on("keypress", onKeypress);
    render();
  });
}

async function chooseMenuOptionFallback(rl: Interface, prompt: string, options: MenuOption[]): Promise<string | null> {
  console.log(prompt);
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]!;
    console.log(`${index + 1}. ${option.label}${option.description ? `  ${option.description}` : ""}`);
  }
  console.log("0. Back");

  const answer = (await rl.question("Choice ▸ ")).trim();
  if (answer === "0" || answer.toLowerCase() === "q" || answer.toLowerCase() === "back") {
    return null;
  }

  return options[Number(answer) - 1]?.value ?? options.find((option) => option.value === answer)?.value ?? null;
}
