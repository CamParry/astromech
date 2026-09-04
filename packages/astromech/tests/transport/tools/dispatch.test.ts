/**
 * buildScopedDispatch — the dispatch a caller acting on behalf of a role
 * gets. Everything buildDispatch decides is unchanged; what differs is that
 * `invoke` goes through `scopedServices`, so a refusal comes from the handle.
 */
import type { ToolDefinition } from '@/transport/tools/dispatch';
import type {
    CoreManifestMethod,
    JsonSchemaObject,
    ManifestMethod,
    Permission,
    PluginManifestMethod,
    Role,
} from '@/types/index';
import { setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionDeniedError } from '@/errors/permission';
import { buildDispatch, buildScopedDispatch } from '@/transport/tools/dispatch';
import { usersService } from '@/users/service';

// The scoped handle resolves the users service at CALL time, so a stub is enough
// to observe whether a refusal happened before the service was entered.
vi.mock('@/users/service', () => ({
    usersService: {
        query: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
    },
}));

const objectSchema: JsonSchemaObject = {
    type: 'object',
    properties: {},
    additionalProperties: false,
};

/**
 * `permission: null` deliberately: the manifest says this method is ungated, so
 * any refusal below can only have come from the contract the scoped handle
 * reads, never from dispatch.ts consulting the manifest.
 */
const usersQuery: CoreManifestMethod = {
    id: 'users.query',
    name: 'users.query',
    summary: 'List users.',
    source: 'core',
    module: 'users',
    method: 'query',
    permission: null,
    mutates: false,
    destructive: false,
    idempotent: false,
    input: objectSchema,
};

const pluginMethod: PluginManifestMethod = {
    id: 'plugins.foo.bar',
    name: 'plugins.foo.bar',
    summary: 'A plugin method.',
    source: 'plugin',
    plugin: 'foo',
    serviceKey: 'foo',
    method: 'bar',
    access: 'authenticated',
    permission: null,
    mutates: true,
    destructive: false,
    idempotent: false,
    input: objectSchema,
};

const binaryMethod: CoreManifestMethod = {
    ...usersQuery,
    id: 'media.upload',
    name: 'media.upload',
    module: 'media',
    method: 'upload',
    binaryInput: true,
};

/** No `input` — omitted, not undefined: `exactOptionalPropertyTypes`. */
const schemalessMethod: CoreManifestMethod = (() => {
    const { input: _input, ...rest } = usersQuery;
    return { ...rest, id: 'users.schemaless', name: 'users.schemaless' };
})();

function role(...permissions: Permission[]): Role {
    return { slug: 'test', name: 'Test', permissions, isBuiltIn: false };
}

/** Build a scoped dispatch, failing the test if it produced no tool. */
function scopedTool(
    manifest: ManifestMethod,
    actingRole: Role | undefined
): ToolDefinition {
    const result = buildScopedDispatch(manifest, actingRole);
    if (!result.ok) expect.unreachable(`expected a tool, got: ${result.reason}`);
    return result.tool;
}

beforeEach(() => {
    setupTestConfig();
    vi.mocked(usersService.query).mockClear();
});

describe('buildScopedDispatch', () => {
    it('refuses a method the role does not hold, from the scoped handle', async () => {
        const tool = scopedTool(usersQuery, role('users:create'));

        await expect(tool.invoke({})).rejects.toThrow(PermissionDeniedError);
        expect(usersService.query).not.toHaveBeenCalled();
    });

    it('calls through when the role holds the permission', async () => {
        const tool = scopedTool(usersQuery, role('users:read'));

        await expect(tool.invoke({ limit: 10 })).resolves.toEqual({
            items: [],
            total: 0,
        });
        expect(usersService.query).toHaveBeenCalledWith({ limit: 10 });
    });

    it('refuses when there is no role — allowed nothing, not trusted', async () => {
        const tool = scopedTool(usersQuery, undefined);

        await expect(tool.invoke({})).rejects.toThrow(PermissionDeniedError);
        expect(usersService.query).not.toHaveBeenCalled();
    });

    it('refuses a plugin method that buildDispatch dispatches', () => {
        const scoped = buildScopedDispatch(pluginMethod, role('*'));

        expect(scoped.ok).toBe(false);
        expect(scoped.ok === false && scoped.reason).toMatch(/plugin/);
        expect(buildDispatch(pluginMethod).ok).toBe(true);
    });

    it('skips exactly what buildDispatch skips, with the same reason', () => {
        for (const manifest of [binaryMethod, schemalessMethod]) {
            const scoped = buildScopedDispatch(manifest, role('*'));

            expect(scoped.ok).toBe(false);
            expect(scoped).toEqual(buildDispatch(manifest));
        }
    });
});
