import { describe, expect, it } from 'vitest';
import type { PluginDefinition } from '@/types/index';
import {
    assertNoPluginCollisions,
    checkPluginDependencies,
    pluginNamespace,
    pluginServiceKey,
    resolvePluginIdentity,
    satisfiesRange,
} from '@/plugins/runtime/plugin-identity';

const def = (
    partial: Partial<PluginDefinition> & { package: string }
): PluginDefinition => ({
    ...partial,
});

describe('pluginNamespace', () => {
    // The derivation table from specs/plugin-identity.md §2 — the contract a
    // plugin author reads to know what namespace their package will get.
    it.each([
        ['@astromech/redirects', 'redirects'],
        ['@astromech/backups', 'backups'],
        ['@acme/seo', 'acme_seo'],
        ['acme-seo', 'acme_seo'],
        ['@acme-digital/seo-tools', 'acme_digital_seo_tools'],
        ['redirects', 'redirects'],
        ['@Scope/Foo-Bar', 'scope_foo_bar'],
        ['@astromech/My-Plugin', 'my_plugin'],
    ])('%s → %s', (pkg, namespace) => {
        expect(pluginNamespace(pkg)).toBe(namespace);
    });

    it('is lossy for exactly one pair — @acme/seo and unscoped acme-seo', () => {
        expect(pluginNamespace('@acme/seo')).toBe(pluginNamespace('acme-seo'));
    });

    it('never yields a hyphen — hyphens do not survive snake-case mapping', () => {
        expect(pluginNamespace('@acme-digital/seo-tools')).not.toContain('-');
    });
});

describe('pluginServiceKey', () => {
    it.each([
        ['redirects', 'redirects'],
        ['acme_seo', 'acmeSeo'],
        ['acme_digital_seo_tools', 'acmeDigitalSeoTools'],
    ])('%s → %s', (namespace, key) => {
        expect(pluginServiceKey(namespace)).toBe(key);
    });

    // A separator before a character with no uppercase form collapses, so the
    // mapping has no inverse. Nothing may reconstruct a namespace from a
    // service key — the collision check below is what makes the key safe to
    // use as the one lookup identifier on the API surface.
    it('is lossy when a separator precedes a digit', () => {
        expect(pluginServiceKey('acme_2fa')).toBe('acme2fa');
        expect(pluginServiceKey('acme2fa')).toBe('acme2fa');
    });
});

describe('resolvePluginIdentity', () => {
    it('derives every form from the package alone', () => {
        const id = resolvePluginIdentity(def({ package: '@astromech/redirects' }));
        expect(id).toEqual({
            package: '@astromech/redirects',
            namespace: 'redirects',
            serviceKey: 'redirects',
            permissionNamespace: 'redirects',
        });
    });

    it('keeps the scope for a third-party package and carries version', () => {
        const id = resolvePluginIdentity(def({ package: '@x/y-z', version: '1.2.3' }));
        expect(id.namespace).toBe('x_y_z');
        expect(id.serviceKey).toBe('xYZ');
        expect(id.permissionNamespace).toBe('x_y_z');
        expect(id.version).toBe('1.2.3');
    });
});

describe('assertNoPluginCollisions', () => {
    it('passes when derived namespaces are unique', () => {
        expect(() =>
            assertNoPluginCollisions([
                def({ package: '@a/seo' }),
                def({ package: '@b/redirects' }),
            ])
        ).not.toThrow();
    });

    it('passes for two packages whose last segments match but whose scopes differ', () => {
        expect(() =>
            assertNoPluginCollisions([
                def({ package: '@a/seo' }),
                def({ package: '@b/seo' }),
            ])
        ).not.toThrow();
    });

    it('throws on the one lossy case, naming both packages', () => {
        expect(() =>
            assertNoPluginCollisions([
                def({ package: '@acme/seo' }),
                def({ package: 'acme-seo' }),
            ])
        ).toThrow(/@acme\/seo.*acme-seo|acme-seo.*@acme\/seo/s);
    });

    it('says the collision is the package authors\u2019 to resolve, not the site\u2019s', () => {
        expect(() =>
            assertNoPluginCollisions([
                def({ package: '@acme/seo' }),
                def({ package: 'acme-seo' }),
            ])
        ).toThrow(/cannot be overridden/);
    });

    // `acme_2fa` and `acme2fa` are distinct namespaces that derive one service
    // key. Left unchecked they would silently share an `Astromech.plugins.acme2fa`
    // property and one HTTP route segment, so the second plugin installed would
    // shadow the first.
    it('throws when two distinct namespaces derive the same service key', () => {
        const identities = [
            resolvePluginIdentity(def({ package: '@acme/2fa' })),
            resolvePluginIdentity(def({ package: 'acme2fa' })),
        ];
        expect(identities[0]?.namespace).not.toBe(identities[1]?.namespace);
        expect(identities[0]?.serviceKey).toBe(identities[1]?.serviceKey);

        expect(() =>
            assertNoPluginCollisions([
                def({ package: '@acme/2fa' }),
                def({ package: 'acme2fa' }),
            ])
        ).toThrow(/service key collision.*acme2fa/s);
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
    it('passes when a declared dependency is present, in range, and listed first', () => {
        expect(() =>
            checkPluginDependencies([
                def({ package: '@astromech/seo', version: '1.4.0' }),
                def({
                    package: '@astromech/forms',
                    dependsOn: { '@astromech/seo': '^1.0.0' },
                }),
            ])
        ).not.toThrow();
    });

    it('throws when a dependency is missing', () => {
        expect(() =>
            checkPluginDependencies([
                def({
                    package: '@astromech/forms',
                    dependsOn: { '@astromech/seo': '^1.0.0' },
                }),
            ])
        ).toThrow(/not installed/i);
    });

    it('throws when an installed dependency is out of range', () => {
        expect(() =>
            checkPluginDependencies([
                def({ package: '@astromech/seo', version: '1.4.0' }),
                def({
                    package: '@astromech/forms',
                    dependsOn: { '@astromech/seo': '^2.0.0' },
                }),
            ])
        ).toThrow(/version 1\.4\.0/i);
    });

    it('only checks existence and ordering when the dependency declares no version', () => {
        expect(() =>
            checkPluginDependencies([
                def({ package: '@astromech/seo' }),
                def({
                    package: '@astromech/forms',
                    dependsOn: { '@astromech/seo': '^2.0.0' },
                }),
            ])
        ).not.toThrow();
    });

    it('throws when a dependency is listed after its dependent', () => {
        expect(() =>
            checkPluginDependencies([
                def({
                    package: '@astromech/forms',
                    dependsOn: { '@astromech/seo': '^1.0.0' },
                }),
                def({ package: '@astromech/seo', version: '1.4.0' }),
            ])
        ).toThrow(/move "@astromech\/seo" before "@astromech\/forms"/i);
    });
});
