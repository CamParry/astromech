/**
 * Astromech's console output. Owns the one `[Astromech]` prefix and writes
 * to stderr — the MCP server owns stdout for JSON-RPC. Errors carry their
 * origin in their type instead (see `errors/astromech-error.ts`).
 */
const PREFIX = '[Astromech]';

export const log = {
    info: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
    warn: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
    error: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
};
