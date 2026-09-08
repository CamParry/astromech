/**
 * `defineService` assembly: a method's id comes from its position in the
 * catalogue, the catalogue holds the objects that were passed in, and binding
 * parses the call against the method's own schema before the handler runs.
 */

import type { AppContext, MethodsFor } from '@/types/index';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '@/errors/validation';
import { defineService } from '@/services/define-service';
import { defineServiceMethod, noInput } from '@/services/define-service-method';

type FakeService = {
    get(input: { id: string }): Promise<string>;
    list(input: { limit: number }): Promise<string[]>;
};

const get = defineServiceMethod({
    access: 'public',
    input: z.object({ id: z.string() }),
    mutates: false,
    handler: async (input, ctx): Promise<string> =>
        `${ctx.method.name}:${input.id}:${ctx.role?.slug}`,
});

const list = defineServiceMethod({
    access: 'settings:read',
    input: z.object({ limit: z.number() }),
    mutates: false,
    handler: async (input): Promise<string[]> =>
        Array.from({ length: input.limit }, (_, i) => String(i)),
});

/**
 * A context whose lazy member throws on read, so a binding that evaluated the
 * getters fails loudly rather than silently reaching a registry.
 */
function unreadableContext(): AppContext {
    const base: Pick<AppContext, 'user' | 'role'> = {
        user: null,
        role: { slug: 'editor', name: 'Editor', permissions: [], isBuiltIn: false },
    };
    return Object.defineProperties(base as AppContext, {
        db: {
            get(): never {
                throw new Error('the context’s `db` getter was read');
            },
            enumerable: true,
        },
    });
}

describe('defineService', () => {
    it('stamps each catalogue entry with its dotted id', () => {
        const definition = defineService<FakeService>('fake', { get, list });

        expect(definition.name).toBe('fake');
        expect(definition.catalogue.get.name).toBe('fake.get');
        expect(definition.catalogue.list.name).toBe('fake.list');
    });

    it('keeps the objects it was passed, rather than copies of them', () => {
        const definition = defineService<FakeService>('fake', { get, list });

        expect(definition.catalogue.get).toBe(get);
        expect(definition.catalogue.list).toBe(list);
    });

    it('hands the handler its input and a context naming the method', async () => {
        const service = defineService<FakeService>('fake', { get, list }).bind(
            unreadableContext()
        );

        expect(await service.get({ id: 'a' })).toBe('fake.get:a:editor');
        expect(await service.list({ limit: 3 })).toEqual(['0', '1', '2']);
    });

    it('refuses a record that does not match the interface', () => {
        // @ts-expect-error `list` is missing from the record.
        const missing = defineService<FakeService>('fake', { get });

        const wrongOutput = defineService<FakeService>('fake', {
            get,
            list: {
                access: 'public',
                input: z.object({ limit: z.number() }),
                mutates: false,
                // @ts-expect-error the interface answers `string[]`, not `number`.
                handler: async () => 42,
            },
        });

        expect(Object.keys(missing.catalogue)).toEqual(['get']);
        expect(Object.keys(wrongOutput.catalogue)).toEqual(['get', 'list']);
    });
});

/** A service of one method, bound over a context nothing reads. */
function bindOne<Input, Output>(
    method: MethodsFor<{ run(input: Input): Promise<Output> }>['run']
): { run(input: Input): Promise<Output> } {
    return defineService<{ run(input: Input): Promise<Output> }>('fake', {
        run: method,
    }).bind(unreadableContext());
}

describe('defineService input validation', () => {
    it('throws a ValidationError before the handler runs', async () => {
        const handler = vi.fn(async (input: { id: string }) => input.id);
        const service = bindOne<{ id: string }, string>(
            defineServiceMethod({
                access: 'public',
                input: z.object({ id: z.string() }),
                mutates: false,
                handler,
            })
        );

        expect(() => service.run({ id: 42 } as unknown as { id: string })).toThrow(
            ValidationError
        );
        expect(handler).not.toHaveBeenCalled();
    });

    it('hands the handler the parsed value, defaults applied', async () => {
        const service = bindOne<{ limit?: number | undefined }, number>(defaulted);

        expect(await service.run({})).toBe(10);
    });

    it('resolves `noInput()` to undefined rather than the empty object', async () => {
        const service = bindOne<unknown, string>(
            defineServiceMethod({
                access: 'public',
                input: noInput(),
                mutates: false,
                handler: async (input): Promise<string> => String(input),
            })
        );

        expect(await service.run(undefined)).toBe('undefined');
    });

    it('strips a key the schema does not declare', async () => {
        const service = bindOne<{ id: string }, Record<string, unknown>>(
            defineServiceMethod({
                access: 'public',
                input: z.object({ id: z.string() }),
                mutates: false,
                handler: async (input): Promise<Record<string, unknown>> => input,
            })
        );

        expect(
            await service.run({ id: 'a', smuggled: true } as unknown as { id: string })
        ).toEqual({ id: 'a' });
    });
});

/** A method whose schema defaults `limit`, so its two input types differ. */
const defaulted = defineServiceMethod({
    access: 'public',
    input: z.object({ limit: z.number().default(10) }),
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
