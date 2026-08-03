/**
 * In-memory ContentProvider for tests — the suite makes no network call.
 * Records every request it receives; `outputCount` forces a reply of the wrong
 * length so operations can be exercised against a provider that breaks the contract.
 */

import type { ContentProvider, ContentRewriteRequest } from '@/content/provider.js';

export type FakeContentProvider = ContentProvider & {
    /** Every request passed to `rewrite`, in call order. */
    requests: ContentRewriteRequest[];
};

export function createFakeContentProvider(options?: {
    /** Maps one input to its output. Defaults to a `rewritten:` prefix. */
    rewrite?: (input: string, request: ContentRewriteRequest) => string;
    /** Reply length, regardless of how many inputs arrived. */
    outputCount?: number;
}): FakeContentProvider {
    const requests: ContentRewriteRequest[] = [];
    const map = options?.rewrite ?? ((input: string): string => `rewritten:${input}`);

    return {
        requests,
        rewrite(request: ContentRewriteRequest): Promise<string[]> {
            requests.push(request);
            const outputs = request.inputs.map((input) => map(input, request));
            const count = options?.outputCount ?? outputs.length;
            // Truncates or pads, so a fake can under- and over-return.
            return Promise.resolve(
                Array.from({ length: count }, (_, i) => outputs[i] ?? `extra:${i}`)
            );
        },
    };
}
