import { describe, expect, it } from 'vitest';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import { resolveConfig } from '@/kernel/config-resolver.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    PluginDefinition,
    StorageDriver,
} from '@/types/index.js';

// ============================================================================
// Minimal stubs — resolveConfig needs db + storage but doesn't call them here
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

// ============================================================================
// Fixtures
// ============================================================================

/** Plugin with an entry type and two service methods to cover the access branches. */
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
        readOnly: {
            access: 'public',
            mutates: false,
            handler: async () => undefined,
        },
        scoped: {
            // Bare permission key — must be plugin-scoped to match route enforcement
            access: { permission: 'manage' },
            mutates: true,
            handler: async () => undefined,
        },
    },
};

/** Config with a versioned root type, a non-versioned root type, and the test plugin. */
const rawConfig: AstromechConfig = {
    db: driver,
    storage: storageDriver,
    entries: {
        posts: {
            single: 'Post',
            plural: 'Posts',
            versioning: true,
            fields: [{ name: 'title', type: 'text' }],
        },
        pages: {
            single: 'Page',
            plural: 'Pages',
            // versioning defaults to false
            fields: [{ name: 'title', type: 'text' }],
        },
        articles: {
            single: 'Article',
            plural: 'Articles',
            versioning: true,
            staging: true,
            fields: [{ name: 'title', type: 'text' }],
        },
    },
    plugins: [testPlugin],
};

const resolved = resolveConfig(rawConfig);

/** Parse the manifest JSON once; re-used across all tests. */
function parseManifest(plugins: PluginDefinition[] = [testPlugin]) {
    const json = generateMethodManifest(resolved, plugins);
    return JSON.parse(json) as {
        version: number;
        methods: Record<string, unknown>[];
    };
}

function findMethod(
    methods: Record<string, unknown>[],
    name: string,
    entryType?: string
) {
    return methods.find(
        (m) =>
            m['name'] === name &&
            (entryType === undefined || m['entryType'] === entryType)
    );
}

// ============================================================================
// generateMethodManifest — manifest envelope
// ============================================================================

describe('generateMethodManifest', () => {
    it('should return a JSON string', () => {
        const result = generateMethodManifest(resolved, []);
        expect(typeof result).toBe('string');
        expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should set version to 2', () => {
        const { version } = parseManifest([]);
        expect(version).toBe(2);
    });

    it('should include a methods array', () => {
        const { methods } = parseManifest([]);
        expect(Array.isArray(methods)).toBe(true);
        expect(methods.length).toBeGreaterThan(0);
    });

    it('should append a trailing newline', () => {
        const result = generateMethodManifest(resolved, []);
        expect(result.endsWith('\n')).toBe(true);
    });
});

// ============================================================================
// Core methods
// ============================================================================

describe('generateMethodManifest — core methods', () => {
    it('should include users.create with source core and permission users:create', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'users.create');
        expect(m).toBeDefined();
        expect(m?.['source']).toBe('core');
        expect(m?.['permission']).toBe('users:create');
    });

    it('should include an input schema for users.create', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'users.create');
        expect(m?.['input']).not.toBeNull();
        expect(typeof m?.['input']).toBe('object');
    });

    it('should mark users.create as mutating', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'users.create');
        expect(m?.['mutates']).toBe(true);
    });

    it('should mark users.delete as destructive', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'users.delete');
        expect(m?.['destructive']).toBe(true);
    });

    it('should mark users.query as non-mutating', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'users.query');
        expect(m?.['mutates']).toBe(false);
    });

    it('should describe users.update as the METHOD { id, data }, not the body', () => {
        const { methods } = parseManifest([]);
        const input = findMethod(methods, 'users.update')?.['input'] as {
            properties?: Record<string, { properties?: Record<string, unknown> }>;
            required?: string[];
        };
        expect(Object.keys(input?.properties ?? {})).toEqual(['id', 'data']);
        expect(input?.required).toEqual(['id', 'data']);
        // The body schema is nested intact — `fields` was dropped by the
        // hand-written MCP schema this replaces.
        expect(Object.keys(input?.properties?.['data']?.properties ?? {})).toContain(
            'fields'
        );
    });

    it('should include the path param in settings.set (key + value)', () => {
        const { methods } = parseManifest([]);
        const input = findMethod(methods, 'settings.set')?.['input'] as {
            properties?: Record<string, unknown>;
        };
        expect(Object.keys(input?.properties ?? {}).sort()).toEqual(['key', 'value']);
    });

    it('should give every core method an input schema', () => {
        const { methods } = parseManifest([]);
        const core = methods.filter((m) => m['source'] === 'core');
        expect(core.length).toBeGreaterThan(0);
        for (const m of core) {
            expect(m['input'], String(m['name'])).toBeDefined();
        }
    });

    it('should derive names from the catalogue key, never "(unnamed)"', () => {
        const { methods } = parseManifest();
        expect(methods.map((m) => m['name'])).not.toContain('(unnamed)');
        expect(findMethod(methods, 'media.upload')).toBeDefined();
    });

    it('should include media and settings core methods', () => {
        const { methods } = parseManifest([]);
        expect(methods.some((m) => String(m['name']).startsWith('media.'))).toBe(true);
        expect(methods.some((m) => String(m['name']).startsWith('settings.'))).toBe(true);
    });
});

// ============================================================================
// Root entry methods
// ============================================================================

describe('generateMethodManifest — root entries', () => {
    it('should emit entries.query for root type posts with mount root', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.query', 'posts');
        expect(m).toBeDefined();
        expect(m?.['source']).toBe('entries');
        expect(m?.['mount']).toBe('root');
    });

    it('should set permission to entry:<type>:read for entries.query', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.query', 'posts');
        expect(m?.['permission']).toBe('entry:posts:read');
    });

    it('should set permission to entry:<type>:read for entries.get', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.get', 'posts');
        expect(m?.['permission']).toBe('entry:posts:read');
    });

    it('should mark entries.query as non-mutating', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.query', 'posts');
        expect(m?.['mutates']).toBe(false);
    });

    it('should mark entries.delete as destructive', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.delete', 'posts');
        expect(m?.['destructive']).toBe(true);
        expect(m?.['mutates']).toBe(true);
    });

    it('should mark entries.update idempotent (parity with core update)', () => {
        const { methods } = parseManifest([]);
        expect(findMethod(methods, 'entries.update', 'posts')?.['idempotent']).toBe(true);
        expect(findMethod(methods, 'entries.create', 'posts')?.['idempotent']).toBe(
            false
        );
    });

    it('should emit entries.publish for versioned type posts', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.publish', 'posts');
        expect(m).toBeDefined();
        expect(m?.['permission']).toBe('entry:posts:publish');
    });

    it('should NOT emit entries.publish for non-versioned type pages', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.publish', 'pages');
        expect(m).toBeUndefined();
    });

    it('should emit all 5 non-publish methods for non-versioned type pages', () => {
        const { methods } = parseManifest([]);
        const pagesMethods = methods.filter((m) => m['entryType'] === 'pages');
        const names = pagesMethods.map((m) => m['name']);
        expect(names).toContain('entries.query');
        expect(names).toContain('entries.get');
        expect(names).toContain('entries.create');
        expect(names).toContain('entries.update');
        expect(names).toContain('entries.delete');
        expect(names).not.toContain('entries.publish');
    });

    it('should not emit contentSchema (removed in manifest v2)', () => {
        const { methods } = parseManifest([]);
        expect(methods.some((m) => 'contentSchema' in m)).toBe(false);
    });

    it('should give every root entry method an input schema naming its type', () => {
        const { methods } = parseManifest([]);
        const postMethods = methods.filter((m) => m['entryType'] === 'posts');
        expect(postMethods.length).toBeGreaterThan(0);
        for (const m of postMethods) {
            const input = m['input'] as { properties?: Record<string, unknown> };
            expect(input?.properties?.['type'], String(m['name'])).toEqual({
                type: 'string',
                const: 'posts',
            });
        }
    });

    it('should include id in the input of the id-taking entry methods', () => {
        const { methods } = parseManifest([]);
        for (const name of ['entries.get', 'entries.update', 'entries.delete']) {
            const input = findMethod(methods, name, 'posts')?.['input'] as {
                properties?: Record<string, unknown>;
                required?: string[];
            };
            expect(Object.keys(input?.properties ?? {}), name).toContain('id');
            expect(input?.required, name).toContain('id');
        }
    });

    it('should describe the update method as { type, id, data }', () => {
        const { methods } = parseManifest([]);
        const input = findMethod(methods, 'entries.update', 'posts')?.['input'] as {
            properties?: Record<string, { properties?: Record<string, unknown> }>;
        };
        expect(Object.keys(input?.properties ?? {})).toEqual(['type', 'id', 'data']);
        // `data` is the update payload, not a flattened patch.
        expect(Object.keys(input?.properties?.['data']?.properties ?? {})).toContain(
            'title'
        );
    });
});

// ============================================================================
// Forward versioning (staged entries) methods
// ============================================================================

describe('generateMethodManifest — staged-entry methods', () => {
    const STAGING_ACTIONS: Record<string, string> = {
        createStaged: 'update',
        getStaged: 'read',
        mergeStaged: 'publish',
        deleteStaged: 'update',
        issuePreviewToken: 'update',
        revokePreviewToken: 'update',
    };

    it('emits each staged-entry method for a staging type with the right permission action', () => {
        const { methods } = parseManifest([]);
        for (const [method, action] of Object.entries(STAGING_ACTIONS)) {
            const m = findMethod(methods, `entries.${method}`, 'articles');
            expect(m, method).toBeDefined();
            expect(m?.['permission']).toBe(`entry:articles:${action}`);
            expect(m?.['mutates']).toBe(method !== 'getStaged');
        }
    });

    it('does NOT emit staged-entry methods for a type without the staging capability', () => {
        const { methods } = parseManifest([]);
        for (const method of Object.keys(STAGING_ACTIONS)) {
            expect(findMethod(methods, `entries.${method}`, 'posts')).toBeUndefined();
            expect(findMethod(methods, `entries.${method}`, 'pages')).toBeUndefined();
        }
    });

    it('still emits publish (versioning) for the staging type', () => {
        const { methods } = parseManifest([]);
        expect(findMethod(methods, 'entries.publish', 'articles')).toBeDefined();
    });
});

// ============================================================================
// Plugin entry methods
// ============================================================================

describe('generateMethodManifest — plugin entries', () => {
    it('should emit entries.query for plugin entry type widget', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.query', 'widget');
        expect(m).toBeDefined();
        expect(m?.['source']).toBe('entries');
    });

    it('should set mount to the plugin permissionNamespace for plugin entries', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.query', 'widget');
        // @test/my-plugin → test_my_plugin
        expect(m?.['mount']).toBe('test_my_plugin');
    });

    it('should set plugin field for plugin entry methods', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.query', 'widget');
        expect(m?.['plugin']).toBe('test_my_plugin');
    });

    it('should set permission using pluginEntryPermission format', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.create', 'widget');
        expect(m?.['permission']).toBe('plugin:test_my_plugin:entry:widget:create');
    });

    it('should set permission using read action for entries.get on plugin entries', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.get', 'widget');
        expect(m?.['permission']).toBe('plugin:test_my_plugin:entry:widget:read');
    });

    it('should name the QUALIFIED type in a plugin entry method input', () => {
        const { methods } = parseManifest();
        const input = findMethod(methods, 'entries.get', 'widget')?.['input'] as {
            properties?: Record<string, unknown>;
        };
        expect(input?.properties?.['type']).toEqual({
            type: 'string',
            const: 'test_my_plugin/widget',
        });
    });
});

// ============================================================================
// Plugin service methods
// ============================================================================

describe('generateMethodManifest — plugin service methods', () => {
    it('should emit plugins.testMyPlugin.doSomething (service key) with source plugin', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.doSomething');
        expect(m).toBeDefined();
        expect(m?.['source']).toBe('plugin');
    });

    it('should set access to permission for object-form access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.doSomething');
        expect(m?.['access']).toBe('permission');
    });

    it('should set permission string from object-form access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.doSomething');
        expect(m?.['permission']).toBe('plugins:x:do');
    });

    it('should set mutates to true when explicitly declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.doSomething');
        expect(m?.['mutates']).toBe(true);
    });

    it('should set access to public for string-form access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.readOnly');
        expect(m?.['access']).toBe('public');
    });

    it('should set permission to null for public access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.readOnly');
        expect(m?.['permission']).toBeNull();
    });

    it('should set mutates to false when explicitly declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.readOnly');
        expect(m?.['mutates']).toBe(false);
    });

    it('should include the summary when declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.doSomething');
        expect(m?.['summary']).toBe('Do something.');
    });

    it('should plugin-scope a bare permission key to match route enforcement', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.testMyPlugin.scoped');
        // @test/my-plugin → permissionNamespace test_my_plugin; bare `manage` → plugin:test_my_plugin:manage
        expect(m?.['permission']).toBe('plugin:test_my_plugin:manage');
    });
});
