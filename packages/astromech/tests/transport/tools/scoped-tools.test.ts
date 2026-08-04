/**
 * buildScopedTools — the composition a caller acting for a role gets:
 * which manifest methods survive to become dispatches, and in what order the
 * four seams are applied. Each seam's own behaviour is tested beside it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/codegen/manifest-registry.js', () => ({ getMethodManifest: vi.fn() }));
vi.mock('@/policies/method-filter.js', () => ({ filterMethods: vi.fn() }));
vi.mock('@/policies/annotate-manifest.js', () => ({ annotateManifest: vi.fn() }));
vi.mock('@/transport/tools/dispatch.js', () => ({ buildScopedDispatch: vi.fn() }));

import { getMethodManifest } from '@/codegen/manifest-registry.js';
import { filterMethods } from '@/policies/method-filter.js';
import { annotateManifest } from '@/policies/annotate-manifest.js';
import { buildScopedDispatch } from '@/transport/tools/dispatch.js';
import { buildScopedTools } from '@/transport/tools/scoped-tools.js';
import type { ManifestMethod, Role, ToolDefinition } from '@/types/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const role: Role = { slug: 'editor', name: 'Editor', permissions: [], isBuiltIn: true };

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
        access: 'permission',
        permission: 'backups:use',
        mutates: false,
        destructive: false,
        idempotent: false,
    };
}

/** A dispatch for one method, named after it. */
function dispatchFor(method: ManifestMethod): ToolDefinition {
    return {
        name: method.id.replace('.', '_'),
        id: method.id,
        description: `Calls ${method.id}.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
        permission: null,
        permissionDynamic: false,
        confirmMessage: () => `Run "${method.id}"?`,
        invoke: () => Promise.resolve({ ok: true }),
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
    vi.mocked(filterMethods).mockImplementation((methods) => ({ methods, excluded: [] }));
    vi.mocked(annotateManifest).mockImplementation((methods) =>
        methods.map((method) => ({ ...method, allowed: true }))
    );
    vi.mocked(buildScopedDispatch).mockImplementation((method) => ({
        ok: true,
        tool: dispatchFor(method),
    }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildScopedTools', () => {
    it('throws when the manifest is missing', () => {
        vi.mocked(getMethodManifest).mockReturnValue(undefined);

        expect(() => buildScopedTools(role)).toThrow(/populated at runtime boot/);
    });

    it('drops plugin methods before filtering', () => {
        vi.mocked(getMethodManifest).mockReturnValue({
            version: 1,
            methods: [
                coreMethod('users.query'),
                pluginMethod('plugins.backups.list'),
                coreMethod('media.query'),
            ],
        });

        const tools = buildScopedTools(role);

        expect(ids(vi.mocked(filterMethods).mock.calls[0]?.[0] ?? [])).toEqual([
            'users.query',
            'media.query',
        ]);
        expect(tools.map((tool) => tool.name)).toEqual(['users_query', 'media_query']);
    });

    it('passes readOnly through to the method filter', () => {
        buildScopedTools(role, { readOnly: true });

        expect(vi.mocked(filterMethods).mock.calls[0]?.[1]).toEqual({ readOnly: true });
    });

    it('leaves readOnly undefined when no options are given', () => {
        buildScopedTools(role);

        expect(vi.mocked(filterMethods).mock.calls[0]?.[1]).toEqual({
            readOnly: undefined,
        });
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

        const tools = buildScopedTools(role);

        const dispatched = vi
            .mocked(buildScopedDispatch)
            .mock.calls.map((call) => call[0].id);
        expect(dispatched).toEqual(['media.query', 'settings.get']);
        expect(tools).toHaveLength(2);
    });

    it('annotates and dispatches against the role it was given', () => {
        buildScopedTools(role);

        expect(vi.mocked(annotateManifest).mock.calls[0]?.[1]).toBe(role);
        expect(vi.mocked(buildScopedDispatch).mock.calls[0]?.[1]).toBe(role);
    });

    it('skips a method dispatch refuses to build', () => {
        vi.mocked(buildScopedDispatch).mockImplementation((method) =>
            method.id === 'users.query'
                ? { ok: false, reason: 'No service for this method.' }
                : { ok: true, tool: dispatchFor(method) }
        );

        const tools = buildScopedTools(role);

        expect(tools.map((tool) => tool.name)).toEqual(['media_query']);
    });
});
