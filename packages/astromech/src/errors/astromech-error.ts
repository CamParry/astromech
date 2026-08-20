/**
 * The base for errors Astromech throws on purpose: a broken invariant, a
 * misconfiguration, a driver failure. `name` marks the origin in logs but is
 * never serialised into an HTTP response.
 */
export class AstromechError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'AstromechError';
    }
}
