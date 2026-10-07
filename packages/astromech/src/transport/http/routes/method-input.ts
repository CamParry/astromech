/**
 * How a REST route reads a method's input schema, for serving
 * (`rest-route.ts`) and for documenting (`rest-route-document.ts`) alike.
 */

import { z } from '@hono/zod-openapi';

/** The method input's keys, or none when the input is not an object. */
export function inputShape(input: z.ZodType | undefined): Record<string, z.ZodType> {
    return input instanceof z.ZodObject ? input.shape : {};
}

/**
 * Whether `schema`, under any optional, default or catch wrapper, is a `kind`
 * or a union with one among its options.
 */
export function accepts(
    schema: z.ZodType | undefined,
    kind: typeof z.ZodBoolean | typeof z.ZodNumber
): boolean {
    let inner: unknown = schema;
    while (
        inner instanceof z.ZodOptional ||
        inner instanceof z.ZodNullable ||
        inner instanceof z.ZodDefault ||
        inner instanceof z.ZodCatch
    ) {
        inner = inner.unwrap();
    }
    if (inner instanceof z.ZodUnion) {
        return (inner.options as z.ZodType[]).some((option) => accepts(option, kind));
    }
    return inner instanceof kind;
}
