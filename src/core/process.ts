import { spawn } from "node:child_process";

export interface ProcessResult {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function runProcess(command: string[], options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, options.timeoutMs)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        command,
        exitCode: null,
        stdout,
        stderr: stderr + error.message + (timedOut ? "\nTimed out." : ""),
      });
    });

    child.on("close", (exitCode) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        command,
        exitCode,
        stdout,
        stderr: stderr + (timedOut ? "\nTimed out." : ""),
      });
    });
  });
}
