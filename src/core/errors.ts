export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
  }
}

export function formatError(error: unknown): { message: string; exitCode: number } {
  if (error instanceof CliError) {
    return { message: `${error.code}: ${error.message}`, exitCode: error.exitCode };
  }

  if (error instanceof Error) {
    return { message: error.message, exitCode: 1 };
  }

  return { message: String(error), exitCode: 1 };
}
