/**
 * The glue between the method manifest and the Anthropic tool runner: which
 * manifest methods become tools, and what a tool returns when its call throws.
 * Core's seams are mocked — their own behaviour is tested in core.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astromech/methods', () => ({
    getMethodManifest: vi.fn(),
    reduceSurface: vi.fn(),
    annotateManifest: vi.fn(),
    buildScopedDispatch: vi.fn(),
}));

import {
    annotateManifest,
    buildScopedDispatch,
    getMethodManifest,
    reduceSurface,
} from 'astromech/methods';
import type { ToolDispatch } from 'astromech/methods';
import type { ManifestMethod, Role } from 'astromech';
import { buildAuthoringTools } from '../../src/loop/tools.js';
import type { ResolvedAuthoringOptions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const options: ResolvedAuthoringOptions = {
    model: 'claude-opus-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    effort: 'medium',
    readOnly: true,
};

const role: Role = {
    slug: 'editor',
    name: 'Editor',
    permissions: [],
    isBuiltIn: true,
};

/** A core manifest method — the shape `buildScopedDispatch` accepts. */
function coreMethod(id: string): ManifestMethod {
    return {
        id,
        name: id,
        source: 'core',
        domain: id.split('.')[0] ?? 'users',
        method: id.split('.')[1] ?? 'query',
        permission: null,
        mutates: false,
        destructive: false,
        idempotent: false,
    };
}

/** A plugin manifest method — dispatch refuses every one of these. */
function pluginMethod(id: string): ManifestMethod {
    return {
        id,
        name: id,
        source: 'plugin',
        plugin: 'backups',
        serviceKey: 'backups',
        method: 'list',
        access: { permission: 'use' },
        permission: null,
        mutates: false,
        destructive: false,
        idempotent: false,
    };
}

/** A dispatch whose `invoke` resolves to `result`. */
function dispatchFor(
    method: ManifestMethod,
    result: unknown = { ok: true }
): ToolDispatch {
    return {
        toolName: method.id.replace('.', '_'),
        description: `Calls ${method.id}.`,
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

const ids = (methods: ManifestMethod[]): string[] => methods.map((method) => method.id);

beforeEach(() => {
    // Call history is asserted on, so it must not carry between tests.
    vi.clearAllMocks();
    vi.mocked(getMethodManifest).mockReturnValue({
        version: 1,
        methods: [coreMethod('users.query'), coreMethod('media.query')],
    });
    vi.mocked(reduceSurface).mockImplementation((methods) => ({ methods, excluded: [] }));
    vi.mocked(annotateManifest).mockImplementation((methods) =>
        methods.map((method) => ({ ...method, allowed: true }))
    );
    vi.mocked(buildScopedDispatch).mockImplementation((method) => ({
        ok: true,
        tool: dispatchFor(method),
    }));
});

// ---------------------------------------------------------------------------
// Building the surface
// ---------------------------------------------------------------------------

describe('buildAuthoringTools', () => {
    it('throws when the manifest is missing', () => {
        vi.mocked(getMethodManifest).mockReturnValue(undefined);

        expect(() => buildAuthoringTools(role, options)).toThrow(
            /populated at runtime boot/
        );
    });

    it('drops plugin methods before reducing the surface', () => {
        vi.mocked(getMethodManifest).mockReturnValue({
            version: 1,
            methods: [
                coreMethod('users.query'),
                pluginMethod('plugins.backups.list'),
                coreMethod('media.query'),
            ],
        });

        buildAuthoringTools(role, options);

        expect(ids(vi.mocked(reduceSurface).mock.calls[0]?.[0] ?? [])).toEqual([
            'users.query',
            'media.query',
        ]);
    });

    it('passes readOnly through to the surface reduction', () => {
        buildAuthoringTools(role, { ...options, readOnly: false });

        expect(vi.mocked(reduceSurface).mock.calls[0]?.[1]).toEqual({ readOnly: false });
    });

    // `allowed: null` is an input-derived permission only the scoped handle can
    // decide, so it must survive the annotation filter.
    it('drops methods annotated as denied and keeps input-derived ones', () => {
        vi.mocked(getMethodManifest).mockReturnValue({
            version: 1,
            methods: [
                coreMethod('users.query'),
                coreMethod('media.query'),
                coreMethod('settings.get'),
            ],
        });
        const allowedById: Record<string, boolean | null> = {
            'users.query': false,
            'media.query': null,
            'settings.get': true,
        };
        vi.mocked(annotateManifest).mockImplementation((methods) =>
            methods.map((method) => ({
                ...method,
                allowed: allowedById[method.id] ?? null,
            }))
        );

        const tools = buildAuthoringTools(role, options);

        const dispatched = vi
            .mocked(buildScopedDispatch)
            .mock.calls.map((call) => call[0].id);
        expect(dispatched).toEqual(['media.query', 'settings.get']);
        expect(tools).toHaveLength(2);
    });

    it('skips a method dispatch refuses to build', () => {
        vi.mocked(buildScopedDispatch).mockImplementation((method) =>
            method.id === 'users.query'
                ? { ok: false, reason: 'No service for this method.' }
                : { ok: true, tool: dispatchFor(method) }
        );

        const tools = buildAuthoringTools(role, options);

        expect(tools).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Running a tool
// ---------------------------------------------------------------------------

describe('the runnable tool', () => {
    it('returns the invoke result as JSON', async () => {
        const result = { items: [{ id: 'abc' }], total: 1 };
        vi.mocked(buildScopedDispatch).mockImplementation((method) => ({
            ok: true,
            tool: dispatchFor(method, result),
        }));

        const [tool] = buildAuthoringTools(role, options);

        await expect(tool?.run({})).resolves.toBe(JSON.stringify(result));
    });

    it('returns a thrown error as a message, never a stack', async () => {
        const error = new Error('Permission denied');
        error.stack =
            'Error: Permission denied\n    at RECOGNISABLE_FRAME (/internal/secret.ts:1:1)';
        vi.mocked(buildScopedDispatch).mockImplementation((method) => ({
            ok: true,
            tool: { ...dispatchFor(method), invoke: () => Promise.reject(error) },
        }));

        const [tool] = buildAuthoringTools(role, options);
        const output = await tool?.run({});

        expect(output).toBe('Error: Permission denied');
        expect(output).not.toContain('RECOGNISABLE_FRAME');
    });
});
