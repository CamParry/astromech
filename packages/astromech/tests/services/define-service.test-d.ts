/**
 * `defineServiceMethod`'s input types. `typecheck` checks this file; vitest does
 * not run it.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineServiceMethod } from '@/services/define-service-method';

/** A method whose schema defaults `limit`, so its two input types differ. */
const defaulted = defineServiceMethod({
    access: 'public',
    input: z.object({ limit: z.number().default(10) }),
    output: z.number(),
    mutates: false,
    handler: async (input): Promise<number> => input.limit,
});

describe('defineServiceMethod input types', () => {
    it('reads a defaulted key as set for the handler and optional for the caller', () => {
        // The handler runs after the parse, so the default is already applied.
        expectTypeOf(defaulted.handler).parameter(0).toEqualTypeOf<{ limit: number }>();
        // A caller passes what the schema accepts, where the key is optional.
        expectTypeOf(defaulted.input).toExtend<
            z.ZodType<unknown, { limit?: number | undefined }>
        >();
    });
});
