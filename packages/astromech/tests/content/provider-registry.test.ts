import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getContentProvider, setContentProvider } from '@/content/provider.js';
import { createFakeContentProvider } from '@tests/fake-content-provider.js';

beforeEach(() => {
    globalThis.__astromech = undefined;
});

describe('content provider registry', () => {
    it('resolves the provider that was registered', async () => {
        const provider = createFakeContentProvider();
        setContentProvider(provider);

        expect(getContentProvider()).toBe(provider);

        const outputs = await getContentProvider().rewrite({
            instruction: 'translate to French',
            inputs: ['one', 'two'],
            format: 'text',
        });
        expect(outputs).toEqual(['rewritten:one', 'rewritten:two']);
    });

    it('throws an actionable error when nothing is registered', () => {
        expect(() => getContentProvider()).toThrow(
            "[Astromech] 'contentProvider' is not configured. Core ships no provider — call setContentProvider() from a plugin's setup() hook."
        );
    });

    it('re-registration replaces the provider cleanly', () => {
        const first = createFakeContentProvider();
        const second = createFakeContentProvider();
        setContentProvider(first);
        setContentProvider(second);

        expect(getContentProvider()).toBe(second);
    });

    it('survives a second module instance of the seam', async () => {
        const provider = createFakeContentProvider();
        setContentProvider(provider);

        // Re-evaluate the module: tsup emits several entry chunks, so the same
        // seam can exist more than once in one process.
        vi.resetModules();
        const fresh = await import('@/content/provider.js');

        expect(fresh.getContentProvider()).toBe(provider);
    });
});

describe('fake content provider', () => {
    it('records the requests it received', async () => {
        const provider = createFakeContentProvider();
        await provider.rewrite({
            instruction: 'tighten',
            inputs: ['a'],
            format: 'markdown',
            locale: 'fr',
            context: { entryType: 'post', fieldLabel: 'Body' },
        });

        expect(provider.requests).toEqual([
            {
                instruction: 'tighten',
                inputs: ['a'],
                format: 'markdown',
                locale: 'fr',
                context: { entryType: 'post', fieldLabel: 'Body' },
            },
        ]);
    });

    it('can return too few and too many outputs', async () => {
        const short = createFakeContentProvider({ outputCount: 1 });
        expect(
            await short.rewrite({ instruction: 'x', inputs: ['a', 'b'], format: 'text' })
        ).toEqual(['rewritten:a']);

        const long = createFakeContentProvider({ outputCount: 3 });
        expect(
            await long.rewrite({ instruction: 'x', inputs: ['a'], format: 'text' })
        ).toHaveLength(3);
    });

    it('uses a supplied mapping for its outputs', async () => {
        const provider = createFakeContentProvider({
            rewrite: (input, request) =>
                `${request.locale ?? 'en'}:${input.toUpperCase()}`,
        });

        expect(
            await provider.rewrite({
                instruction: 'translate',
                inputs: ['hello'],
                format: 'text',
                locale: 'de',
            })
        ).toEqual(['de:HELLO']);
    });
});
