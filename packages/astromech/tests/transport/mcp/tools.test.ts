/**
 * Unit tests for buildTools — pure function, no I/O, no service invocation.
 */

import { describe, it, expect } from 'vitest';
import { buildTools } from '@/transport/mcp/tools';
import type {
    CoreManifestMethod,
    EntriesManifestMethod,
    JsonSchemaObject,
    MethodManifest,
    PluginManifestMethod,
} from '@/types/index';

// ============================================================================
// Sample manifest
// ============================================================================

/**
 * A tool's `inputSchema` is now the manifest's own `input`, so these fixtures
 * carry real schemas rather than relying on adapter-side literals. A method with
 * no `input` is skipped by design — `idSchema` is what most of these need.
 */
function idSchema(...extra: string[]): JsonSchemaObject {
    return {
        type: 'object',
        properties: Object.fromEntries(
            ['id', ...extra].map((k) => [k, { type: 'string' }])
        ),
        required: ['id', ...extra],
        additionalProperties: false,
    };
}

const objectSchema: JsonSchemaObject = {
    type: 'object',
    properties: {},
    additionalProperties: false,
};

function core(
    domain: string,
    method: string,
    rest: Partial<CoreManifestMethod> & Pick<CoreManifestMethod, 'mutates'>
): CoreManifestMethod {
    return {
        id: `${domain}.${method}`,
        name: `${domain}.${method}`,
        source: 'core',
        domain,
        method,
        permission: null,
        destructive: false,
        idempotent: false,
        ...rest,
    };
}

function entry(
    method: string,
    rest: Partial<EntriesManifestMethod> & Pick<EntriesManifestMethod, 'mutates'>
): EntriesManifestMethod {
    const entryType = rest.entryType ?? 'post';
    const mount = rest.mount ?? 'root';
    return {
        id: `entries.${mount}.${entryType}.${method}`,
        name: `entries.${method}`,
        source: 'entries',
        method,
        typeId: entryType,
        entryType,
        mount,
        permission: null,
        destructive: false,
        idempotent: false,
        ...rest,
    };
}

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

/** No `input` — the one honest reason a described method still gets no tool. */
const undescribedPluginMethod: PluginManifestMethod = (() => {
    // Omitted, not set to `undefined`: `exactOptionalPropertyTypes` treats an
    // absent key and an explicit undefined as different things, and the manifest
    // genuinely omits the key.
    const { input: _input, ...rest } = pluginMethod;
    return {
        ...rest,
        id: 'plugins.foo.undescribed',
        name: 'plugins.foo.undescribed',
        method: 'undescribed',
    };
})();

const sampleManifest: MethodManifest = {
    version: 2,
    methods: [
        // core — users
        core('users', 'create', {
            summary: 'Create a new CMS user.',
            mutates: true,
            input: objectSchema,
        }),
        core('users', 'get', {
            summary: 'Read one user by id.',
            mutates: false,
            input: idSchema(),
        }),
        // core — settings
        core('settings', 'set', {
            summary: 'Write a setting.',
            mutates: true,
            idempotent: true,
            input: objectSchema,
        }),
        // entries — post
        entry('create', {
            summary: 'Create a "post" entry.',
            mutates: true,
            input: objectSchema,
        }),
        entry('delete', {
            summary: 'Delete a "post" entry.',
            mutates: true,
            destructive: true,
            input: idSchema(),
        }),
        entry('get', {
            summary: 'Get a "post" entry.',
            mutates: false,
            input: idSchema(),
        }),
        entry('publish', {
            summary: 'Publish a "post" entry.',
            mutates: true,
            input: idSchema(),
        }),
        // plugin — dispatched like anything else since P1
        pluginMethod,
        // plugin with no declared input — skipped
        undescribedPluginMethod,
        // media.upload — File is not callable over JSON-RPC → skipped, and it
        // says so itself: the schema alone still renders as an object.
        core('media', 'upload', {
            summary: 'Upload a file.',
            mutates: true,
            input: objectSchema,
            binaryInput: true,
        }),
    ],
};

// ============================================================================
// Tests
// ============================================================================

describe('buildTools', () => {
    it('returns tools + dispatch + skipped', () => {
        const result = buildTools(sampleManifest);
        expect(result).toHaveProperty('tools');
        expect(result).toHaveProperty('dispatch');
        expect(result).toHaveProperty('skipped');
    });

    it('sanitizes tool names (dots → underscores)', () => {
        const { tools } = buildTools(sampleManifest);
        const names = tools.map((t) => t.name);
        expect(names).toContain('users_create');
        expect(names).toContain('entries_post_create');
        expect(names).toContain('entries_post_delete');
        // No dots in any name
        for (const name of names) {
            expect(name).not.toContain('.');
        }
    });

    it('projects a plugin method, and skips only what declares itself uncallable', () => {
        const { tools, skipped } = buildTools(sampleManifest);
        const toolNames = tools.map((t) => t.name);

        // Plugin methods used to return null from every adapter. P1 dispatches
        // them like anything else.
        expect(toolNames).toContain('plugins_foo_bar');

        // What remains skipped is skipped for a reason the METHOD stated.
        expect(skipped).toEqual([
            {
                id: 'plugins.foo.undescribed',
                reason: 'no input schema declared on the descriptor',
            },
            {
                id: 'media.upload',
                reason: 'binary input — not expressible over JSON-RPC',
            },
        ]);
        expect(toolNames).not.toContain('media_upload');
        expect(toolNames).not.toContain('plugins_foo_undescribed');
    });

    it('annotations: users_create → readOnlyHint:false', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'users_create');
        expect(tool).toBeDefined();
        expect(tool?.annotations.readOnlyHint).toBe(false);
    });

    it('annotations: users_get → readOnlyHint:true', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'users_get');
        expect(tool).toBeDefined();
        expect(tool?.annotations.readOnlyHint).toBe(true);
    });

    it('annotations: entries_post_delete → destructiveHint:true', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'entries_post_delete');
        expect(tool).toBeDefined();
        expect(tool?.annotations.destructiveHint).toBe(true);
    });

    it('annotations: settings_set → idempotentHint:true', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'settings_set');
        expect(tool).toBeDefined();
        expect(tool?.annotations.idempotentHint).toBe(true);
    });

    it('each tool has an object inputSchema', () => {
        const { tools } = buildTools(sampleManifest);
        for (const tool of tools) {
            expect(typeof tool.inputSchema).toBe('object');
            expect(tool.inputSchema).not.toBeNull();
        }
    });

    it('entries get/publish/delete tools require id in inputSchema.required', () => {
        const { tools } = buildTools(sampleManifest);

        for (const toolName of [
            'entries_post_get',
            'entries_post_publish',
            'entries_post_delete',
        ]) {
            const tool = tools.find((t) => t.name === toolName);
            expect(tool).toBeDefined();
            const required = (tool?.inputSchema as { required?: string[] }).required;
            expect(required).toContain('id');
        }
    });

    it('dispatch map contains entries for all non-skipped tools', () => {
        const { tools, dispatch } = buildTools(sampleManifest);
        for (const tool of tools) {
            expect(dispatch.has(tool.name)).toBe(true);
        }
    });

    it('entries tool with non-root mount uses mount in name', () => {
        const manifestWithMount: MethodManifest = {
            version: 2,
            methods: [
                entry('get', {
                    summary: 'Get a "redirect" entry.',
                    entryType: 'redirect',
                    mount: 'redirects',
                    typeId: 'redirects/redirect',
                    mutates: false,
                    input: idSchema(),
                }),
            ],
        };
        const { tools } = buildTools(manifestWithMount);
        expect(tools[0]?.name).toBe('entries_redirects_redirect_get');
    });

    it('a method with no input schema is skipped, not given a synthesised one', () => {
        // The adapters used to carry hand-written `inputSchema` literals, which is
        // how MCP's `users.update` tool drifted from the contract. A tool now
        // exists only if the manifest gave it a schema.
        const schemaless: MethodManifest = {
            version: 2,
            methods: [core('users', 'get', { mutates: false })],
        };
        const { tools, skipped } = buildTools(schemaless);
        expect(tools).toHaveLength(0);
        expect(skipped.map((s) => s.id)).toContain('users.get');
    });

    it('passes the manifest input through verbatim as the tool inputSchema', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'users_get');
        expect(tool?.inputSchema).toEqual(idSchema());
    });
});
