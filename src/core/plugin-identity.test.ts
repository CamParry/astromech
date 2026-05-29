import { describe, expect, it } from 'vitest';
import type { PluginDefinition } from '@/types/index.js';
import {
    assertNoPluginCollisions,
    checkPluginDependencies,
    derivePluginName,
    resolvePluginIdentity,
    sanitisePackage,
    satisfiesRange,
} from '@/core/plugin-identity.js';

const def = (partial: Partial<PluginDefinition> & { package: string }): PluginDefinition => ({
    ...partial,
});

describe('sanitisePackage', () => {
    it('strips @, lowercases, and replaces / with -', () => {
        expect(sanitisePackage('@astromech/redirects')).toBe('astromech-redirects');
        expect(sanitisePackage('@Scope/Foo-Bar')).toBe('scope-foo-bar');
        expect(sanitisePackage('redirects')).toBe('redirects');
    });
});

describe('derivePluginName', () => {
    it('takes the last path segment', () => {
        expect(derivePluginName('@astromech/redirects')).toBe('redirects');
        expect(derivePluginName('redirects')).toBe('redirects');
        expect(derivePluginName('@scope/foo-bar')).toBe('foo-bar');
    });
});

describe('resolvePluginIdentity', () => {
    it('defaults name to the last segment and namespace to the sanitised package', () => {
        const id = resolvePluginIdentity(def({ package: '@astromech/redirects' }));
        expect(id).toMatchObject({
            package: '@astromech/redirects',
            name: 'redirects',
            alias: 'redirects',
            permissionNamespace: 'astromech-redirects',
        });
    });

    it('prefers alias over name over derived name', () => {
        const id = resolvePluginIdentity(
            def({ package: '@astromech/redirects', name: 'redir', alias: 'my-redirects' })
        );
        expect(id.name).toBe('my-redirects');
    });

    it('honours an explicit permissionNamespace and carries version', () => {
        const id = resolvePluginIdentity(
            def({ package: '@x/y', permissionNamespace: 'custom', version: '1.2.3' })
        );
        expect(id.permissionNamespace).toBe('custom');
        expect(id.version).toBe('1.2.3');
    });
});

describe('assertNoPluginCollisions', () => {
    it('passes when access keys are unique', () => {
        expect(() =>
            assertNoPluginCollisions([def({ package: '@a/seo' }), def({ package: '@b/redirects' })])
        ).not.toThrow();
    });

    it('throws when two packages resolve to the same access key', () => {
        expect(() =>
            assertNoPluginCollisions([def({ package: '@a/seo' }), def({ package: '@b/seo' })])
        ).toThrow(/collision/i);
    });

    it('lets an alias resolve a collision', () => {
        expect(() =>
            assertNoPluginCollisions([
                def({ package: '@a/seo' }),
                def({ package: '@b/seo', alias: 'seo-b' }),
            ])
        ).not.toThrow();
    });
});

describe('satisfiesRange', () => {
    it('treats *, empty, and latest as any', () => {
        expect(satisfiesRange('1.2.3', '*')).toBe(true);
        expect(satisfiesRange('1.2.3', '')).toBe(true);
    });

    it('handles caret ranges', () => {
        expect(satisfiesRange('1.5.0', '^1.2.3')).toBe(true);
        expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
        expect(satisfiesRange('1.2.2', '^1.2.3')).toBe(false);
        expect(satisfiesRange('0.2.9', '^0.2.1')).toBe(true);
        expect(satisfiesRange('0.3.0', '^0.2.1')).toBe(false);
    });

    it('handles tilde and comparison ranges', () => {
        expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true);
        expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
        expect(satisfiesRange('2.0.0', '>=1.0.0')).toBe(true);
        expect(satisfiesRange('1.0.0', '>1.0.0')).toBe(false);
        expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    });
});

describe('checkPluginDependencies', () => {
    it('passes when a declared dependency is present and in range', () => {
        expect(() =>
            checkPluginDependencies([
                def({ package: '@astromech/forms', dependsOn: { '@astromech/seo': '^1.0.0' } }),
                def({ package: '@astromech/seo', version: '1.4.0' }),
            ])
        ).not.toThrow();
    });

    it('throws when a dependency is missing', () => {
        expect(() =>
            checkPluginDependencies([
                def({ package: '@astromech/forms', dependsOn: { '@astromech/seo': '^1.0.0' } }),
            ])
        ).toThrow(/not installed/i);
    });

    it('throws when an installed dependency is out of range', () => {
        expect(() =>
            checkPluginDependencies([
                def({ package: '@astromech/forms', dependsOn: { '@astromech/seo': '^2.0.0' } }),
                def({ package: '@astromech/seo', version: '1.4.0' }),
            ])
        ).toThrow(/version 1\.4\.0/i);
    });

    it('only checks existence when the dependency declares no version', () => {
        expect(() =>
            checkPluginDependencies([
                def({ package: '@astromech/forms', dependsOn: { '@astromech/seo': '^2.0.0' } }),
                def({ package: '@astromech/seo' }),
            ])
        ).not.toThrow();
    });
});
