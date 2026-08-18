/**
 * Astromech's console output. Owns the one `[Astromech]` prefix so core's log
 * lines are identifiable in a host app's shared stream, and writes to stderr —
 * the MCP server owns stdout for JSON-RPC. Errors do not pass through here; they
 * carry their origin in their type (see `errors/astromech-error.ts`).
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
