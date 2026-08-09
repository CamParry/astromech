/**
 * The glue between core's scoped dispatches and the AI SDK's tool set: what a
 * wrapped tool returns, what it returns when its call throws, and which tools
 * the approval gate holds back by declaring no `execute`. Building the surface
 * is core's job and is tested there.
 */

import { describe, expect, it } from 'vitest';

import type { ToolDefinition } from 'astromech';
import { TOOL_SEARCH_KEY, toToolSet } from '../../src/loop/tools';

/** A dispatch whose `invoke` resolves to `result`. */
function dispatchFor(
    name: string,
    options: { readOnly?: boolean; result?: unknown } = {}
): ToolDefinition {
    return {
        name,
        id: name.replaceAll('_', '.'),
        description: `Calls ${name}.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: {
            readOnlyHint: options.readOnly ?? true,
            destructiveHint: false,
            idempotentHint: true,
        },
        permission: null,
        permissionDynamic: false,
        confirmMessage: (args) => `Run "${name}" with ${JSON.stringify(args)}?`,
        invoke: () => Promise.resolve(options.result ?? { ok: true }),
    };
}

/** Minimal execution options a wrapped tool's `execute` is called with. */
const EXECUTION_OPTIONS = { toolCallId: 'toolu_1', messages: [] } as never;

describe('toToolSet', () => {
    it('wraps one tool per dispatch, keyed by name', () => {
        const tools = toToolSet([dispatchFor('users_query'), dispatchFor('media_query')]);

        expect(Object.keys(tools)).toEqual(
            expect.arrayContaining(['users_query', 'media_query'])
        );
    });

    it('holds only the search tool for an empty surface', () => {
        expect(Object.keys(toToolSet([]))).toEqual([TOOL_SEARCH_KEY]);
    });

    it('defers every wrapped tool, so the catalogue costs no context until searched', () => {
        const tools = toToolSet([dispatchFor('users_query'), dispatchFor('media_query')]);

        expect(tools.users_query?.providerOptions?.anthropic?.deferLoading).toBe(true);
        expect(tools.media_query?.providerOptions?.anthropic?.deferLoading).toBe(true);
    });

    it('declares a read-only tool with `execute`, so it runs without a pause', () => {
        const tools = toToolSet([dispatchFor('entries_page_query', { readOnly: true })]);

        expect(tools.entries_page_query?.execute).toBeTypeOf('function');
    });

    it('declares a mutating tool with no `execute`, which is the approval gate', () => {
        const tools = toToolSet([
            dispatchFor('entries_page_update', { readOnly: false }),
        ]);

        expect(tools.entries_page_update?.execute).toBeUndefined();
    });

    it('returns the invoke result as JSON', async () => {
        const result = { items: [{ id: 'abc' }], total: 1 };
        const tools = toToolSet([dispatchFor('users_query', { result })]);

        await expect(tools.users_query?.execute?.({}, EXECUTION_OPTIONS)).resolves.toBe(
            JSON.stringify(result)
        );
    });

    it('returns a thrown error as a message, never a stack', async () => {
        const error = new Error('Permission denied');
        error.stack =
            'Error: Permission denied\n    at RECOGNISABLE_FRAME (/internal/secret.ts:1:1)';
        const dispatch: ToolDefinition = {
            ...dispatchFor('users_query'),
            invoke: () => Promise.reject(error),
        };
        const tools = toToolSet([dispatch]);

        const output = await tools.users_query?.execute?.({}, EXECUTION_OPTIONS);

        expect(output).toBe('Error: Permission denied');
        expect(output).not.toContain('RECOGNISABLE_FRAME');
    });
});

describe('TOOL_SEARCH_KEY', () => {
    it('is not deferred, which is what keeps the request valid', () => {
        const tools = toToolSet([]);

        expect(
            tools[TOOL_SEARCH_KEY]?.providerOptions?.anthropic?.deferLoading
        ).toBeUndefined();
    });
});
