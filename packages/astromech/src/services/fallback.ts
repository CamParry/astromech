/**
 * The recoverable tier of an output schema: `withFallback` puts the default in
 * place of a stored value its schema refuses, and counts it for the parse
 * `countFallbacks` is running, which `parseOutput` logs.
 */

import { z } from '@hono/zod-openapi';
import { globals } from '@/registry';
import { toJsonSchema } from '@/services/json-schema';

/**
 * `schema`, with a value it refuses replaced by `value`. A missing key still fails
 * unless `schema` accepts `undefined`. The OpenAPI document shows `schema` itself.
 */
export function withFallback<S extends z.ZodType>(
    schema: S,
    value: z.output<S>
): WithFallback<S> {
    // Inside the document the document's dialect applies, so it names none.
    const { $schema: _dialect, ...converted } = toJsonSchema(schema, { io: 'output' });
    const documented = nullAsTypeArray(converted);
    const caught = schema.catch(fallback(value));
    if (schema.safeParse(undefined).success) {
        return caught.openapi(documented) as WithFallback<S>;
    }
    // The generator calls a key optional when `undefined` parses, which a
    // `.catch` alone would allow; the presence check refuses it first.
    const present = z.custom<z.input<S>>((input) => input !== undefined, {
        message: 'Expected a value, received undefined',
    });
    return z.pipe(present, caught).openapi(documented) as WithFallback<S>;
}

/**
 * `schema` with a null option written as the OpenAPI generator writes one, a type
 * array (`type: ['string', 'null']`), rather than zod's `anyOf` with a null
 * branch: the generator takes a schema from metadata only when it has a `type`.
 */
function nullAsTypeArray(schema: Record<string, unknown>): Record<string, unknown> {
    const { anyOf, ...rest } = schema;
    if (!Array.isArray(anyOf) || anyOf.length !== 2) return schema;
    const options = anyOf as Record<string, unknown>[];
    const value = options.find((option) => option['type'] !== 'null');
    const type = value?.['type'];
    if (
        typeof type !== 'string' ||
        options.every((option) => option['type'] !== 'null')
    ) {
        return schema;
    }
    return { ...rest, ...value, type: [type, 'null'] };
}

/**
 * What `withFallback` builds: a `.catch` when `S` accepts `undefined`, else a
 * presence check piped into one.
 */
type WithFallback<S extends z.ZodType> =
    undefined extends z.input<S>
        ? z.ZodCatch<S>
        : z.ZodPipe<z.ZodCustom<z.input<S>, z.input<S>>, z.ZodCatch<S>>;

/**
 * A `.catch` handler answering `value`. Each call is counted while
 * `countFallbacks` runs; outside one it only substitutes.
 */
function fallback<T>(value: T): () => T {
    return () => {
        const namespace = globals();
        if (namespace.outputFallbacks !== undefined) namespace.outputFallbacks += 1;
        return value;
    };
}

/**
 * Run a synchronous parse and count the fallbacks its `.catch` handlers took.
 * The count lives on the shared namespace, so a schema from a second copy of
 * the package still reports to this parse.
 */
export function countFallbacks<T>(parse: () => T): { result: T; fallbacks: number } {
    const namespace = globals();
    const outer = namespace.outputFallbacks;
    namespace.outputFallbacks = 0;
    try {
        const result = parse();
        return { result, fallbacks: namespace.outputFallbacks };
    } finally {
        namespace.outputFallbacks = outer;
    }
}
