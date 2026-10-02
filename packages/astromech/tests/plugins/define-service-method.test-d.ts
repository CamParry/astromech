/**
 * The public `defineServiceMethod` (from `astromech`, pinned to
 * `PluginContext`): the handler's types come from the schemas. `typecheck`
 * checks this file; vitest does not run it.
 */

import type { MethodContext, PluginContext } from 'astromech';
import { defineServiceMethod, z } from 'astromech';
import { describe, expectTypeOf, it } from 'vitest';

describe('defineServiceMethod', () => {
    it("types the handler's input from the input schema", () => {
        defineServiceMethod({
            access: 'public',
            input: z.object({ id: z.string(), tags: z.array(z.string()) }),
            mutates: false,
            handler: (input, ctx) => {
                expectTypeOf(input).toEqualTypeOf<{ id: string; tags: string[] }>();
                expectTypeOf(ctx).toEqualTypeOf<PluginContext & MethodContext>();
                return input.id;
            },
        });
    });

    it('rejects a handler reading a key the input schema does not declare', () => {
        defineServiceMethod({
            access: 'public',
            input: z.object({ id: z.string() }),
            mutates: false,
            // @ts-expect-error `slug` is not in the input schema.
            handler: (input) => input.slug,
        });
    });

    it('types the result from the output schema: the handler returns its input side', () => {
        const method = defineServiceMethod({
            access: 'public',
            input: z.object({ id: z.string() }),
            output: z.object({ id: z.string(), count: z.number() }),
            mutates: false,
            handler: (input) => ({ id: input.id, count: 1 }),
        });

        expectTypeOf(method.handler).returns.toEqualTypeOf<
            Promise<{ id: string; count: number }> | { id: string; count: number }
        >();
    });

    it("keeps the output schema's two sides apart when it transforms", () => {
        const method = defineServiceMethod({
            access: 'public',
            input: z.object({ id: z.string() }),
            output: z.object({ at: z.date().transform((date) => date.toISOString()) }),
            mutates: false,
            handler: () => ({ at: new Date() }),
        });

        // The handler returns a Date; a caller of the parsed result reads a string.
        expectTypeOf(method.handler).returns.toEqualTypeOf<
            Promise<{ at: Date }> | { at: Date }
        >();
        expectTypeOf(method.output).toExtend<z.ZodType<{ at: string }, { at: Date }>>();
    });

    it('rejects a handler returning a shape the output schema does not accept', () => {
        // @ts-expect-error The handler's `count` is a string; the output schema wants a number.
        defineServiceMethod({
            access: 'public',
            input: z.object({ id: z.string() }),
            output: z.object({ id: z.string(), count: z.number() }),
            mutates: false,
            handler: (input) => ({ id: input.id, count: 'one' }),
        });
    });
});
