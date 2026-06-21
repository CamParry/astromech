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
};

const storageDriver: StorageDriver = {
    name: 'noop',
    async put() {
        return undefined;
    },
    async get() {
        return null;
    },
    async delete() {
        return undefined;
    },
    async list() {
        return [];
    },
};

// ============================================================================
// Fixtures
// ============================================================================

/** Plugin with an entry type and two SDK methods to cover the access branches. */
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
    sdk: {
        doSomething: {
            access: { permission: 'plugins:x:do' },
            summary: 'Do something.',
            // mutates intentionally omitted — should default to true, effectDeclared false
            handler: async () => undefined,
        },
        readOnly: {
            access: 'public',
            mutates: false, // explicitly declared
            handler: async () => undefined,
        },
        scoped: {
            // Bare permission key — must be plugin-scoped to match route enforcement
            access: { permission: 'manage' },
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

    it('should set version to 1', () => {
        const { version } = parseManifest([]);
        expect(version).toBe(1);
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

    it('should set contentSchema to null for root entries', () => {
        const { methods } = parseManifest([]);
        const m = findMethod(methods, 'entries.query', 'posts');
        expect(m?.['contentSchema']).toBeNull();
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
        // @test/my-plugin → test-my-plugin
        expect(m?.['mount']).toBe('test-my-plugin');
    });

    it('should set plugin field for plugin entry methods', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.query', 'widget');
        expect(m?.['plugin']).toBe('my-plugin');
    });

    it('should set permission using pluginEntryPermission format', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.create', 'widget');
        expect(m?.['permission']).toBe('plugin:test-my-plugin:entry:widget:create');
    });

    it('should set permission using read action for entries.get on plugin entries', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.get', 'widget');
        expect(m?.['permission']).toBe('plugin:test-my-plugin:entry:widget:read');
    });

    it('should set contentSchema to null for plugin entries', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'entries.query', 'widget');
        expect(m?.['contentSchema']).toBeNull();
    });
});

// ============================================================================
// Plugin SDK methods
// ============================================================================

describe('generateMethodManifest — plugin SDK methods', () => {
    it('should emit plugins.my-plugin.doSomething with source plugin', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.doSomething');
        expect(m).toBeDefined();
        expect(m?.['source']).toBe('plugin');
    });

    it('should set access to permission for object-form access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.doSomething');
        expect(m?.['access']).toBe('permission');
    });

    it('should set permission string from object-form access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.doSomething');
        expect(m?.['permission']).toBe('plugins:x:do');
    });

    it('should default mutates to true when not declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.doSomething');
        expect(m?.['mutates']).toBe(true);
    });

    it('should set effectDeclared to false when mutates is not declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.doSomething');
        expect(m?.['effectDeclared']).toBe(false);
    });

    it('should set access to public for string-form access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.readOnly');
        expect(m?.['access']).toBe('public');
    });

    it('should set permission to null for public access', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.readOnly');
        expect(m?.['permission']).toBeNull();
    });

    it('should set mutates to false when explicitly declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.readOnly');
        expect(m?.['mutates']).toBe(false);
    });

    it('should set effectDeclared to true when mutates is explicitly declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.readOnly');
        expect(m?.['effectDeclared']).toBe(true);
    });

    it('should include the summary when declared', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.doSomething');
        expect(m?.['summary']).toBe('Do something.');
    });

    it('should plugin-scope a bare permission key to match route enforcement', () => {
        const { methods } = parseManifest();
        const m = findMethod(methods, 'plugins.my-plugin.scoped');
        // @test/my-plugin → permissionNamespace test-my-plugin; bare `manage` → plugin:test-my-plugin:manage
        expect(m?.['permission']).toBe('plugin:test-my-plugin:manage');
    });
});
