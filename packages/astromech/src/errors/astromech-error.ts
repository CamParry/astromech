/**
 * The base for errors Astromech throws on purpose: a broken invariant, a
 * misconfiguration, a driver failure. `name` marks the origin on any console
 * that prints an uncaught error (Astro, Workers, the CLI, MCP), and `name` is
 * never serialised into an HTTP response, so the marker stays off the wire.
 */
export class AstromechError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'AstromechError';
    }
}
