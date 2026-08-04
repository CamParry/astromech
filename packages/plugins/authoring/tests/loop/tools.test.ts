/**
 * The glue between core's scoped dispatches and the Anthropic tool runner:
 * what a wrapped tool returns, and what it returns when its call throws.
 * Building the surface is core's job and is tested there.
 */

import { describe, expect, it } from 'vitest';

import type { ToolDispatch } from 'astromech';
import { TOOL_SEARCH_TOOL, toRunnableTools } from '../../src/loop/tools.js';

/** A dispatch whose `invoke` resolves to `result`. */
function dispatchFor(name: string, result: unknown = { ok: true }): ToolDispatch {
    return {
        toolName: name,
        description: `Calls ${name}.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        permission: null,
        permissionDynamic: false,
        invoke: () => Promise.resolve(result),
    };
}

describe('toRunnableTools', () => {
    it('wraps one runnable tool per dispatch, keeping its name', () => {
        const tools = toRunnableTools([
            dispatchFor('users_query'),
            dispatchFor('media_query'),
        ]);

        expect(tools.map((tool) => tool.name)).toEqual(['users_query', 'media_query']);
    });

    it('returns nothing for an empty surface', () => {
        expect(toRunnableTools([])).toEqual([]);
    });

    it('defers every tool, so the catalogue costs no context until searched', () => {
        const tools = toRunnableTools([
            dispatchFor('users_query'),
            dispatchFor('media_query'),
        ]);

        expect(tools.every((tool) => tool.defer_loading === true)).toBe(true);
    });

    it('returns the invoke result as JSON', async () => {
        const result = { items: [{ id: 'abc' }], total: 1 };

        const [tool] = toRunnableTools([dispatchFor('users_query', result)]);

        await expect(tool?.run({})).resolves.toBe(JSON.stringify(result));
    });

    it('returns a thrown error as a message, never a stack', async () => {
        const error = new Error('Permission denied');
        error.stack =
            'Error: Permission denied\n    at RECOGNISABLE_FRAME (/internal/secret.ts:1:1)';
        const dispatch: ToolDispatch = {
            ...dispatchFor('users_query'),
            invoke: () => Promise.reject(error),
        };

        const [tool] = toRunnableTools([dispatch]);
        const output = await tool?.run({});

        expect(output).toBe('Error: Permission denied');
        expect(output).not.toContain('RECOGNISABLE_FRAME');
    });
});

describe('TOOL_SEARCH_TOOL', () => {
    it('is not deferred, which is what keeps the request valid', () => {
        expect(TOOL_SEARCH_TOOL.defer_loading).toBeUndefined();
    });
});
