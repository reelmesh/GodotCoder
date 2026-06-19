import { spawn } from "node:child_process";

export interface ProcessResult {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error: string | null;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export function runProcess(command: string[], options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const MAX_BUFFER = 512 * 1024;
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let sigkillTimer: ReturnType<typeof setTimeout> | null = null;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          sigkillTimer = setTimeout(() => {
            child.kill("SIGKILL");
          }, 5000);
        }, options.timeoutMs)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_BUFFER) stdout += chunk;
      else stdoutTruncated = true;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_BUFFER) stderr += chunk;
      else stderrTruncated = true;
    });

    child.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      resolve({
        command,
        exitCode: null,
        stdout: stdout + (stdoutTruncated ? `\nOutput truncated at ${MAX_BUFFER} bytes.` : ""),
        stderr,
        timedOut,
        error: err.message,
        stdoutTruncated,
        stderrTruncated,
      });
    });

    child.on("close", (exitCode) => {
      if (timeout) clearTimeout(timeout);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      resolve({
        command,
        exitCode,
        stdout: stdout + (stdoutTruncated ? `\nOutput truncated at ${MAX_BUFFER} bytes.` : ""),
        stderr: stderr + (timedOut ? "\nTimed out." : "") + (stderrTruncated ? `\nStderr truncated at ${MAX_BUFFER} bytes.` : ""),
        timedOut,
        error: null,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}
