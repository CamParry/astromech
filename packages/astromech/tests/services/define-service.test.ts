/**
 * `defineService` assembly: a method's id comes from its position in the
 * catalogue, the catalogue holds the objects that were passed in, and binding
 * hands each handler the context without reading any of it.
 */

import type { AppContext, MethodsFor } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { defineService } from '@/services/define-service';

type FakeService = {
    get(input: { id: string }): Promise<string>;
    list(input: { limit: number }): Promise<string[]>;
};

const get: MethodsFor<FakeService>['get'] = {
    access: 'public',
    mutates: false,
    handler: async (input, ctx) => `${ctx.method.name}:${input.id}:${ctx.role?.slug}`,
};

const list: MethodsFor<FakeService>['list'] = {
    access: 'settings:read',
    mutates: false,
    handler: async (input) => Array.from({ length: input.limit }, (_, i) => String(i)),
};

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
                mutates: false,
                // @ts-expect-error the interface answers `string[]`, not `number`.
                handler: async () => 42,
            },
        });

        expect(Object.keys(missing.catalogue)).toEqual(['get']);
        expect(Object.keys(wrongOutput.catalogue)).toEqual(['get', 'list']);
    });
});
