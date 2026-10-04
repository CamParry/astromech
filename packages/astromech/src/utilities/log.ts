/**
 * Astromech's console output. Owns the one `[Astromech]` prefix and writes every
 * level to stderr, as stdout belongs to the MCP server and `--json` output.
 * Errors carry their origin in their type instead.
 */
const PREFIX = '[Astromech]';

export const log = {
    debug: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
    info: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
    warn: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
    error: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
};
