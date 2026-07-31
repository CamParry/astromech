/**
 * Descriptor ↔ MCP tool-schema parity.
 *
 * Every MCP tool's `inputSchema` must be exactly the manifest method's `input`.
 *
 * The absence of this test is why MCP's `users.update` tool drifted from its
 * descriptor and shipped: the adapter carried a hand-written schema literal that
 * dropped `fields` and the email format, and declared `additionalProperties:
 * false`, so setting a custom user field through MCP was rejected outright. The
 * correct schema sat in the manifest, unread, with nothing asserting the two
 * agreed.
 *
 * This runs against a REAL generated manifest rather than a fixture, so a
 * descriptor change that an adapter fails to follow fails here.
 */

import { describe, expect, it } from 'vitest';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import { resolveConfig } from '@/kernel/config-resolver.js';
import { buildDispatch } from '@/transport/mcp/dispatch.js';
import { buildTools } from '@/transport/mcp/tools.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    MethodManifest,
    PluginDefinition,
    StorageDriver,
} from '@/types/index.js';

// ============================================================================
// Stubs — resolveConfig requires a db + storage but never calls them here
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

/** A plugin-mounted entry type, so qualified type ids are covered too. */
const testPlugin: PluginDefinition = {
    package: '@test/my-plugin',
    entries: [
        {
            type: 'widget',
            single: 'Widget',
            plural: 'Widgets',
            fields: [{ name: 'title', type: 'text' }],
        },
    ],
    service: {
        doSomething: {
            access: { permission: 'plugins:x:do' },
            summary: 'Do something.',
            mutates: true,
            handler: async () => undefined,
        },
    },
};

const resolved = resolveConfig({
    db: driver,
    storage: storageDriver,
    entries: {
        posts: {
            single: 'Post',
            plural: 'Posts',
            versioning: true,
            staging: true,
            fields: [{ name: 'title', type: 'text' }],
        },
        pages: {
            single: 'Page',
            plural: 'Pages',
            fields: [{ name: 'title', type: 'text' }],
        },
    },
    plugins: [testPlugin],
} satisfies AstromechConfig);

const manifest = JSON.parse(
    generateMethodManifest(resolved, [testPlugin])
) as MethodManifest;

// ============================================================================
// Tests
// ============================================================================

describe('descriptor ↔ MCP tool schema parity', () => {
    it('the fixture manifest is non-trivial', () => {
        // Guards the assertions below against silently passing on an empty list.
        expect(manifest.methods.length).toBeGreaterThan(20);
        expect(manifest.methods.filter((m) => m.input).length).toBeGreaterThan(20);
    });

    it('every dispatchable method’s tool schema IS its manifest input', () => {
        const checked: string[] = [];

        for (const method of manifest.methods) {
            const dispatch = buildDispatch(method);
            if (dispatch === null) continue;

            // Identity, not equivalence: the adapter must pass the manifest's
            // schema through, never restate or "improve" it.
            expect(
                dispatch.inputSchema,
                `${method.id} tool schema diverges from its descriptor input`
            ).toEqual(method.input);
            checked.push(method.id);
        }

        expect(checked.length).toBeGreaterThan(20);
    });

    it('no tool is emitted without a schema from the manifest', () => {
        const { tools } = buildTools(manifest);
        const inputsById = new Map(manifest.methods.map((m) => [m.id, m.input]));

        for (const tool of tools) {
            expect(tool.inputSchema).toBeDefined();
            expect(tool.inputSchema).not.toBeNull();
            // Every emitted schema must be some manifest method's input.
            const matches = [...inputsById.values()].some(
                (input) => JSON.stringify(input) === JSON.stringify(tool.inputSchema)
            );
            expect(matches, `${tool.name} has a schema no descriptor declares`).toBe(
                true
            );
        }
    });

    it('a method whose input the manifest omits is skipped, never synthesised', () => {
        // The failure mode this whole test exists to prevent: an adapter filling
        // in a schema of its own when the descriptor did not declare one.
        const stripped: MethodManifest = {
            ...manifest,
            methods: manifest.methods.map((m) => {
                const { input: _input, ...rest } = m;
                return rest as typeof m;
            }),
        };
        const { tools, skipped } = buildTools(stripped);
        expect(tools).toHaveLength(0);
        expect(skipped.length).toBe(manifest.methods.length);
    });

    it('users.update carries `fields` and the email format — the shipped drift', () => {
        // The concrete regression. The hand-written adapter schema declared only
        // id/name/email/roleSlug with additionalProperties:false, so a custom user
        // field could not be set through MCP at all.
        const method = manifest.methods.find((m) => m.id === 'users.update');
        expect(method).toBeDefined();

        const dispatch = method ? buildDispatch(method) : null;
        expect(dispatch).not.toBeNull();

        const schema = dispatch?.inputSchema as {
            properties: { data: { properties: Record<string, unknown> } };
        };
        const data = schema.properties.data.properties;
        expect(Object.keys(data)).toContain('fields');
        expect(data['email']).toMatchObject({ format: 'email' });
    });
});
