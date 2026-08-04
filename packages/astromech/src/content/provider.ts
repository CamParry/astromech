/**
 * Content provider seam — the model interface core declares and never implements.
 *
 * globalThis-backed (see `@/utilities/registry.js`). `initRuntime` runs inside
 * Astro's `config:setup` — build/config time, which does not re-run per request
 * in a deployed Worker — so registration must be safe to repeat from a boot path.
 */

import { createRegistry } from '@/utilities/registry.js';

export type ContentRewriteRequest = {
    instruction: string;
    inputs: string[];
    format: 'text' | 'markdown';
    locale?: string | undefined;
    context?: { entryType: string; fieldLabel: string } | undefined;
};

export type ContentProvider = {
    /**
     * Rewrite each input independently under one instruction.
     * Returns exactly one output per input, in order.
     */
    rewrite(request: ContentRewriteRequest): Promise<string[]>;
};

const provider = createRegistry<ContentProvider>('contentProvider', {
    hint: "Core ships no provider — call setContentProvider() from a plugin's setup() hook.",
});

export const setContentProvider = provider.set;
export const getContentProvider = provider.get;
