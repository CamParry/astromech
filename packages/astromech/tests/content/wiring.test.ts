/**
 * The content domain's reach: descriptors → manifest → MCP tools → confirm gate.
 *
 * Nothing here is content-specific machinery — the point is that registering the
 * catalogue and the service is the whole wiring, so these assertions are about
 * the generic path actually carrying the three operations.
 */

import { describe, expect, it, vi } from 'vitest';

// The dispatcher resolves the service at CALL time, so a stub is enough to
// observe what a tool passes it — and keeps the DB and the model provider out.
vi.mock('@/content/service.js', () => ({
    contentApi: {
        translate: (params: unknown) => Promise.resolve({ called: 'translate', params }),
        transform: (params: unknown) => Promise.resolve({ called: 'transform', params }),
        generate: (params: unknown) => Promise.resolve({ called: 'generate', params }),
    },
}));

import { generateMethodManifest } from '@/codegen/method-manifest.js';
import { resolveConfig } from '@/boot/config-resolver.js';
import { contentDescriptors } from '@/content/descriptors.js';
import { evaluateConfirmation, triggersConfirmation } from '@/policies/confirm-gate.js';
import { buildDispatch } from '@/transport/mcp/dispatch.js';
import { buildTools } from '@/transport/mcp/tools.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    ManifestMethod,
    MethodManifest,
    StorageDriver,
} from '@/types/index.js';

// ============================================================================
// Fixture — resolveConfig needs a db + storage but never calls them here
// ============================================================================

const driver: DatabaseDriver = {
    type: 'test',
    getInstance() {
        throw new Error('not called');
    },
    createDialect() {
        throw new Error('not called');
    },
};

const storageDriver: StorageDriver = {
    name: 'noop',
    async put() {
        return undefined;
    },
    async get() {
        return null;
    },
    async stat() {
        return null;
    },
    async delete() {
        return undefined;
    },
    async list() {
        return { keys: [] };
    },
};

const resolved = resolveConfig({
    db: driver,
    storage: storageDriver,
    entries: {
        posts: {
            single: 'Post',
            plural: 'Posts',
            fields: [{ name: 'title', type: 'text' }],
        },
    },
} satisfies AstromechConfig);

const manifest = JSON.parse(generateMethodManifest(resolved, [])) as MethodManifest;

const OPERATIONS = ['translate', 'transform', 'generate'] as const;

function find(id: string): ManifestMethod {
    const method = manifest.methods.find((m) => m.id === id);
    if (!method) throw new Error(`${id} is not in the manifest`);
    return method;
}

// ============================================================================
// Manifest
// ============================================================================

describe('content methods in the method manifest', () => {
    it('carries all three as core methods on the `content` domain', () => {
        for (const operation of OPERATIONS) {
            const method = find(`content.${operation}`);
            expect(method.source).toBe('core');
            expect(method).toMatchObject({
                name: `content.${operation}`,
                domain: 'content',
                method: operation,
                permission: `content:${operation}`,
                mutates: true,
                destructive: false,
            });
        }
    });

    it('gives each one a usable input schema describing the METHOD', () => {
        for (const operation of OPERATIONS) {
            const input = find(`content.${operation}`).input as {
                type?: string;
                properties?: Record<string, unknown>;
                required?: string[];
            };
            expect(input, operation).toBeDefined();
            expect(input.type).toBe('object');
            // `type` and `id` are path params on the wire; the descriptor still
            // declares the whole argument object.
            expect(Object.keys(input.properties ?? {})).toEqual(
                expect.arrayContaining(['type', 'id', 'paths', 'instruction'])
            );
            expect(input.required).toEqual(expect.arrayContaining(['type', 'id']));
        }
    });

    it('requires a locale on translate and an instruction on transform/generate', () => {
        const translate = find('content.translate').input as { required?: string[] };
        expect(translate.required).toContain('locale');
        expect(translate.required).not.toContain('instruction');

        for (const operation of ['transform', 'generate'] as const) {
            const input = find(`content.${operation}`).input as { required?: string[] };
            expect(input.required).toContain('instruction');
        }
    });

    it('says in each summary that it does not publish', () => {
        // The summary is what a model reads to choose a tool, so the staging
        // behaviour has to be in it rather than only in the docs.
        for (const operation of OPERATIONS) {
            expect(find(`content.${operation}`).summary).toMatch(/published/i);
        }
        expect(find('content.translate').summary).toMatch(/structure is preserved/i);
    });
});

// ============================================================================
// MCP
// ============================================================================

describe('content methods as MCP tools', () => {
    const { tools, dispatch, skipped } = buildTools(manifest);

    it('surfaces one tool per operation, schema passed through unchanged', () => {
        for (const operation of OPERATIONS) {
            const tool = tools.find((t) => t.name === `content_${operation}`);
            expect(tool, operation).toBeDefined();
            expect(tool?.inputSchema).toEqual(find(`content.${operation}`).input);
            expect(tool?.annotations.readOnlyHint).toBe(false);
        }
        expect(skipped.map((s) => s.id)).not.toContain('content.translate');
    });

    it('dispatches to the content service, arguments intact', async () => {
        const invoke = dispatch.get('content_transform');
        expect(invoke).toBeDefined();

        const result = await invoke?.({
            type: 'posts',
            id: 'abc',
            instruction: 'shorter',
        });
        expect(result).toEqual({
            called: 'transform',
            params: { type: 'posts', id: 'abc', instruction: 'shorter' },
        });
    });

    it('resolves a service for the domain rather than skipping it', () => {
        // A domain missing from CORE_SERVICES builds no tool at all, and the
        // reason it gives names the domain — the failure this pins.
        const result = buildDispatch(find('content.generate'));
        expect(result.ok).toBe(true);
    });
});

// ============================================================================
// Confirm gate
// ============================================================================

describe('content methods under the confirm gate', () => {
    it('are gated by the `mutating` preset with no special-casing', () => {
        for (const operation of OPERATIONS) {
            expect(triggersConfirmation(find(`content.${operation}`), {})).toBe(true);
        }
    });

    it('turns an unanswered call back with the method and its target', () => {
        const decision = evaluateConfirmation(
            find('content.translate'),
            { type: 'posts', id: 'abc', locale: 'de' },
            { trigger: 'mutating' }
        );

        expect(decision.proceed).toBe(false);
        if (decision.proceed) return;
        expect(decision.outcome.status).toBe('input_required');
        if (decision.outcome.status !== 'input_required') return;
        const request = decision.outcome.requests[0];
        expect(request?.method).toBe('content.translate');
        expect(request?.message).toContain('content.translate');
        expect(request?.message).toContain('type "posts", id "abc"');
        expect(request?.destructive).toBe(false);
    });

    it('advertises the reserved answer key on the gated tool', () => {
        const { tools } = buildTools(manifest, { trigger: 'mutating' });
        const tool = tools.find((t) => t.name === 'content_generate');
        const properties = tool?.inputSchema['properties'] as Record<string, unknown>;
        expect(Object.keys(properties)).toContain('_confirm');
    });
});

// ============================================================================
// Descriptors ↔ service
// ============================================================================

describe('content descriptors', () => {
    it('names one descriptor per operation and nothing else', () => {
        expect(Object.keys(contentDescriptors).sort()).toEqual([...OPERATIONS].sort());
    });
});
