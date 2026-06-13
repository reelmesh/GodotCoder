import { createInterface } from "node:readline/promises";
import type { Interface } from "node:readline/promises";
import { cursorTo, emitKeypressEvents, moveCursor, clearScreenDown } from "node:readline";
import { stdin as input, stdout as output } from "node:process";

export interface MenuOption {
  value: string;
  label: string;
  description?: string;
}

const BACK_VALUE = "__back__";

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
    rl.pause();
    emitKeypressEvents(input);
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();

    let index = 0;
    let renderedLines = 0;
    let active = true;
    const menuItems = [...options, { value: BACK_VALUE, label: "Back" }];
    let filterText = "";
    let filterTimer: NodeJS.Timeout | null = null;

    const render = () => {
      cursorTo(output, 0, 0);
      clearScreenDown(output);
      output.write(`${prompt}\n`);
      output.write("Use arrow keys, type to jump, space, enter.\n");
      if (filterText) {
        output.write(`Filter: ${filterText}\n`);
      }
      for (let i = 0; i < menuItems.length; i += 1) {
        const option = menuItems[i]!;
        const selected = i === index;
        output.write(`${selected ? "[*]" : "[ ]"} ${option.label}${option.description ? `  ${option.description}` : ""}\n`);
      }
      renderedLines = menuItems.length + 2 + (filterText ? 1 : 0);
    };

    const resetFilter = () => {
      if (filterTimer) {
        clearTimeout(filterTimer);
      }
      filterTimer = setTimeout(() => {
        filterText = "";
        filterTimer = null;
        render();
      }, 800);
    };

    const matchIndex = (query: string): number | null => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return null;
      const exact = menuItems.findIndex((option) => option.label.toLowerCase().startsWith(normalized) || option.value.toLowerCase().startsWith(normalized));
      if (exact >= 0) return exact;
      const partial = menuItems.findIndex((option) => option.label.toLowerCase().includes(normalized) || option.value.toLowerCase().includes(normalized) || (option.description ?? "").toLowerCase().includes(normalized));
      return partial >= 0 ? partial : null;
    };

    const cleanup = (value: string | null) => {
      if (!active) return;
      active = false;
      input.off("keypress", onKeypress);
      if (filterTimer) {
        clearTimeout(filterTimer);
      }
      if (!wasRaw) {
        input.setRawMode(false);
      }
      rl.resume();
      moveCursor(output, 0, renderedLines);
      output.write("\n");
      resolve(value);
    };

    const onKeypress = (str: string, key: import("node:readline").Key) => {
      if (key.name === "up") {
        index = index <= 0 ? menuItems.length - 1 : index - 1;
        render();
        return;
      }
      if (key.name === "down") {
        index = index >= menuItems.length - 1 ? 0 : index + 1;
        render();
        return;
      }
      if (key.name === "escape" || key.name === "q") {
        cleanup(null);
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        filterText = filterText.slice(0, -1);
        const found = matchIndex(filterText);
        if (found !== null) index = found;
        resetFilter();
        render();
        return;
      }
      if (key.name === "tab") {
        const query = filterText.trim();
        const candidates = menuItems
          .map((option, optionIndex) => ({ option, optionIndex }))
          .filter(({ option }) =>
            !query ||
            option.label.toLowerCase().startsWith(query.toLowerCase()) ||
            option.value.toLowerCase().startsWith(query.toLowerCase()) ||
            (option.description ?? "").toLowerCase().includes(query.toLowerCase()),
          );
        if (candidates.length > 0) {
          const current = candidates.findIndex(({ optionIndex }) => optionIndex === index);
          const next = candidates[(current + 1) % candidates.length]!;
          index = next.optionIndex;
          render();
        }
        return;
      }
      if (typeof str === "string" && str.length === 1 && !key.ctrl && !key.meta && !key.shift && !/[\r\n\t]/.test(str)) {
        filterText += str;
        const found = matchIndex(filterText);
        if (found !== null) index = found;
        resetFilter();
        render();
        return;
      }
      if (key.name === "space") {
        cleanup(menuItems[index]?.value === BACK_VALUE ? null : (menuItems[index]?.value ?? null));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup(menuItems[index]?.value === BACK_VALUE ? null : (menuItems[index]?.value ?? null));
        return;
      }
    };

    input.on("keypress", onKeypress);
    render();
  });
}

export async function askMenuQuestion(rl: Interface, prompt: string): Promise<string> {
  if (input.isTTY && input.isRaw) {
    input.setRawMode(false);
  }
  rl.resume();
  return await rl.question(prompt);
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
