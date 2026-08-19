/**
 * Contract ↔ MCP tool-schema parity.
 *
 * Every MCP tool's `inputSchema` must be exactly the manifest method's `input`.
 *
 * The absence of this test is why MCP's `users.update` tool drifted from its
 * contract and shipped: the adapter carried a hand-written schema literal that
 * dropped `fields` and the email format, and declared `additionalProperties:
 * false`, so setting a custom user field through MCP was rejected outright. The
 * correct schema sat in the manifest, unread, with nothing asserting the two
 * agreed.
 *
 * This runs against a REAL generated manifest rather than a fixture, so a
 * contract change that an adapter fails to follow fails here.
 */

import type {
    AstromechConfig,
    DatabaseDriver,
    MethodManifest,
    PluginDefinition,
    StorageDriver,
} from '@/types/index';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { resolveConfig } from '@/config/resolve';
import { filterMethods } from '@/policies/method-filter';
import { buildTools } from '@/transport/mcp/tools';
import { buildDispatch } from '@/transport/tools/dispatch';

// The dispatcher resolves the entries service at CALL time, so a stub here is
// enough to observe exactly what arguments a tool passes it — which is the only
// thing the dispatcher is responsible for.
vi.mock('@/entries/service', () => ({
    entriesService: {
        get: async (params: unknown) => params,
    },
}));

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
            input: z.object({ thing: z.string() }),
            mutates: true,
            handler: async () => undefined,
        },
        // No `input` — the honest skip. A method that does not describe its call
        // cannot be projected as a tool, and never gets a synthesised stand-in.
        undescribed: {
            access: 'public',
            summary: 'Undescribed.',
            mutates: false,
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

const manifest = generateMethodManifest(resolved, [testPlugin]);

// ============================================================================
// Tests
// ============================================================================

describe('contract ↔ MCP tool schema parity', () => {
    it('the fixture manifest is non-trivial', () => {
        // Guards the assertions below against silently passing on an empty list.
        expect(manifest.methods.length).toBeGreaterThan(20);
        expect(manifest.methods.filter((m) => m.input).length).toBeGreaterThan(20);
    });

    it('every dispatchable method’s tool schema IS its manifest input', () => {
        const checked: string[] = [];

        for (const method of manifest.methods) {
            const result = buildDispatch(method);
            if (!result.ok) continue;

            // Identity, not equivalence: the dispatcher must pass the manifest's
            // schema through, never restate or "improve" it.
            expect(
                result.tool.inputSchema,
                `${method.id} tool schema diverges from its contract input`
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
            expect(matches, `${tool.name} has a schema no contract declares`).toBe(true);
        }
    });

    it('a method whose input the manifest omits is skipped, never synthesised', () => {
        // The failure mode this whole test exists to prevent: an adapter filling
        // in a schema of its own when the contract did not declare one.
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

        const result = method ? buildDispatch(method) : null;
        expect(result?.ok).toBe(true);

        const schema = (result?.ok ? result.tool.inputSchema : {}) as {
            properties: { data: { properties: Record<string, unknown> } };
        };
        const data = schema.properties.data.properties;
        expect(Object.keys(data)).toContain('fields');
        expect(data['email']).toMatchObject({ format: 'email' });
    });
});

// ============================================================================
// Coverage — the manifest and the tool list describe the same surface
// ============================================================================

describe('manifest ↔ MCP tool coverage', () => {
    const { tools, dispatch, skipped } = buildTools(manifest);

    it('accounts for every manifest method exactly once', () => {
        expect(tools.length + skipped.length).toBe(manifest.methods.length);
        expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
        expect(dispatch.size).toBe(tools.length);
    });

    it('skips only methods that declared themselves uncallable', () => {
        // The P1 acceptance condition: with one generic dispatcher, "no adapter
        // written yet" is no longer a reason anything is missing. What is left
        // out is left out because the CONTRACT said so.
        expect(skipped.map((s) => s.id).sort()).toEqual([
            'media.replace',
            'media.upload',
            'notifications.count',
            'notifications.dismiss',
            'notifications.dismissAll',
            'notifications.list',
            'plugins.testMyPlugin.undescribed',
        ]);
        expect(skipped.find((s) => s.id === 'media.upload')?.reason).toContain(
            'binary input'
        );
        expect(skipped.find((s) => s.id === 'media.replace')?.reason).toContain(
            'binary input'
        );
        // MCP is dev-only and trusted, so it runs with no signed-in user and has
        // no subject for a session-scoped method to act on.
        for (const id of ['list', 'count', 'dismiss', 'dismissAll']) {
            expect(skipped.find((s) => s.id === `notifications.${id}`)?.reason).toContain(
                'session-scoped'
            );
        }
        expect(
            skipped.find((s) => s.id === 'plugins.testMyPlugin.undescribed')?.reason
        ).toContain('no input schema');
    });

    it('projects a plugin service method that declares its input', () => {
        // Plugin methods returned null from every previous dispatcher, which is
        // the backlog item P1 closes.
        const tool = tools.find((t) => t.name === 'plugins_testMyPlugin_doSomething');
        expect(tool).toBeDefined();
        expect(tool?.inputSchema).toEqual(
            manifest.methods.find((m) => m.id === 'plugins.testMyPlugin.doSomething')
                ?.input
        );
    });

    it('projects the entries long tail, not just CRUD', () => {
        // duplicate/trash/restore/versions/staging/preview/schedule all had
        // contracts or service methods and no adapter. `posts` declares every
        // capability, so it should carry the full catalogue.
        const posts = tools
            .map((t) => t.name)
            .filter((n) => n.startsWith('entries_posts_'))
            .map((n) => n.replace('entries_posts_', ''))
            .sort();

        expect(posts).toEqual(
            [
                'create',
                'createStaged',
                'delete',
                'deleteStaged',
                'duplicate',
                'emptyTrash',
                'get',
                'getStaged',
                'incomingRelationships',
                'issuePreviewToken',
                'mergeStaged',
                'publish',
                'query',
                'restore',
                'restoreVersion',
                'revokePreviewToken',
                'schedule',
                'trash',
                'unpublish',
                'update',
                'versions',
            ].sort()
        );
    });

    it('gates a capability-bound method on the capability the SERVICE asserts', () => {
        // `pages` declares no versioning and no staging, so it has no version
        // history and no staged-entry methods — but it DOES have statuses, and
        // `operations/status.ts` gates publish on statuses. Gating publish on
        // versioning (as the contract did before P1) hid it from every
        // unversioned type while the service happily accepted the call.
        const pages = tools.map((t) => t.name);
        expect(pages).toContain('entries_pages_publish');
        expect(pages).toContain('entries_pages_unpublish');
        expect(pages).not.toContain('entries_pages_versions');
        expect(pages).not.toContain('entries_pages_createStaged');
    });

    it('pins the entry type on the call, overriding one the caller passes', async () => {
        // A client must not be able to aim the `posts` tool at another type by
        // putting `type` in its arguments — the tool's own id is pinned last.
        const invoke = dispatch.get('entries_posts_get');
        expect(invoke).toBeDefined();

        const passed = (await invoke?.({ id: 'abc', type: 'pages' })) as {
            type: string;
            id: string;
        };
        expect(passed).toEqual({ id: 'abc', type: 'posts' });
    });

    it('addresses a plugin entry type by its QUALIFIED id, not its bare one', async () => {
        const invoke = dispatch.get('entries_test_my_plugin_widget_get');
        expect(invoke).toBeDefined();

        const passed = (await invoke?.({ id: 'abc' })) as { type: string };
        expect(passed.type).toBe('test_my_plugin/widget');
    });
});

// ============================================================================
// Method filtering — the DISPATCH map is what actually lets a call through
// ============================================================================

describe('filtered methods ↔ MCP tools', () => {
    /** Filter the real manifest, then build tools from it exactly as the transport does. */
    function build(filter: Parameters<typeof filterMethods>[1]) {
        const { methods, excluded } = filterMethods(manifest.methods, filter);
        return { ...buildTools({ ...manifest, methods }), excluded };
    }

    it('an excluded method has no tool AND no dispatch entry', () => {
        // Proving the tool LIST shrank is not enough: `CallToolRequest` looks the
        // name up in the dispatch map, so a method left in the map is callable
        // by a client that simply remembers its name from a previous session.
        const { tools, dispatch } = build({ exclude: ['entries.posts.publish'] });

        expect(tools.map((t) => t.name)).not.toContain('entries_posts_publish');
        expect(dispatch.has('entries_posts_publish')).toBe(false);
        // Its sibling is untouched, so this is reduction, not a broken build.
        expect(dispatch.has('entries_posts_unpublish')).toBe(true);
    });

    it('a read-only filter leaves no mutating method dispatchable', () => {
        const full = buildTools(manifest);
        const { tools, dispatch } = build({ readOnly: true });

        expect(tools.length).toBeLessThan(full.tools.length);
        expect(dispatch.size).toBe(tools.length);

        const mutatingToolNames = new Set(
            manifest.methods
                .filter((m) => m.mutates)
                .flatMap((m) => {
                    const result = buildDispatch(m);
                    return result.ok ? [result.tool.name] : [];
                })
        );
        expect(mutatingToolNames.size).toBeGreaterThan(0);
        for (const name of mutatingToolNames) {
            expect(dispatch.has(name), `${name} is still dispatchable`).toBe(false);
        }
    });

    it('read-only wins over an explicit include, end to end', () => {
        const { tools, dispatch, excluded } = build({
            readOnly: true,
            include: ['users.create'],
        });

        expect(tools).toHaveLength(0);
        expect(dispatch.size).toBe(0);
        expect(excluded.find((e) => e.id === 'users.create')?.reason).toContain(
            'read-only'
        );
    });
});
