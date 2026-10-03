/**
 * Astromech's console output. Owns the one `[Astromech]` prefix and writes
 * `info`, `warn` and `error` to stderr, as the MCP server owns stdout; `debug`
 * goes to `console.debug`. Errors carry their origin in their type instead.
 */
const PREFIX = '[Astromech]';

export const log = {
    debug: (message: string, ...rest: unknown[]): void =>
        console.debug(`${PREFIX} ${message}`, ...rest),
    info: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
    warn: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
    error: (message: string, ...rest: unknown[]): void =>
        console.error(`${PREFIX} ${message}`, ...rest),
};
