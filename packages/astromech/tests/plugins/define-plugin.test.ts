/**
 * `definePlugin`'s factory: the definition it builds, and the plugin helpers
 * it hangs off the factory bound to the plugin's resolved identity.
 */

import type { PluginFactory, ResolvedPluginIdentity } from '@/types/index';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { definePermissions } from '@/permissions/define';
import { definePlugin } from '@/plugins/define-plugin';

type Options = { suffix?: string };

describe('definePlugin', () => {
    it('builds the definition each time the factory is called', () => {
        const plugin = definePlugin((options?: Options) => ({
            package: '@acme/widgets',
            label: `Widgets${options?.suffix ?? ''}`,
        }));

        expect(plugin().label).toBe('Widgets');
        expect(plugin({ suffix: ' Pro' }).label).toBe('Widgets Pro');
    });

    it('builds the no-options definition once, when the plugin is defined', () => {
        const source = vi.fn(() => ({
            package: '@acme/widgets',
            permissions: definePermissions({ read: { label: 'Read widgets' } }),
        }));
        const plugin = definePlugin(source);

        expect(source).toHaveBeenCalledTimes(1);
        expect(source).toHaveBeenCalledWith(undefined);
        expect(plugin.permissions('read')).toEqual(['plugin:acme_widgets:read']);
        expect(source).toHaveBeenCalledTimes(1);
    });
});

describe('plugin helpers', () => {
    const plugin = definePlugin({
        package: '@acme/seo-tools',
        helpers: {
            describe: (identity: ResolvedPluginIdentity, suffix?: string) =>
                `${identity.namespace}:${identity.serviceKey}${suffix ?? ''}`,
            identity: (identity: ResolvedPluginIdentity) => identity,
        },
    });

    it("passes the plugin's resolved identity before the site's arguments", () => {
        expect(plugin.describe()).toBe('acme_seo_tools:acmeSeoTools');
        expect(plugin.describe('!')).toBe('acme_seo_tools:acmeSeoTools!');
    });

    it('passes the same identity the runtime resolves', () => {
        expect(plugin.identity()).toEqual({
            package: '@acme/seo-tools',
            namespace: 'acme_seo_tools',
            serviceKey: 'acmeSeoTools',
            permissionNamespace: 'acme_seo_tools',
        });
    });

    it('binds helpers declared by a factory-form plugin from its no-options build', () => {
        const withOptions = definePlugin((options?: Options) => ({
            package: '@acme/widgets',
            helpers: {
                label: (identity: ResolvedPluginIdentity) =>
                    `${identity.package}${options?.suffix ?? ''}`,
            },
        }));

        expect(withOptions.label()).toBe('@acme/widgets');
    });

    it.each(['permissions', 'name', 'length', 'call', 'bind', 'toString'])(
        'throws on a helper named "%s", which the factory already has',
        (key) => {
            expect(() =>
                definePlugin({
                    package: '@acme/widgets',
                    helpers: { [key]: () => undefined },
                })
            ).toThrow(`declares a helper named "${key}"`);
        }
    );

    it('types each helper as a site calls it, without the identity parameter', () => {
        expectTypeOf(plugin.describe).toEqualTypeOf<(suffix?: string) => string>();
        expectTypeOf(plugin.identity).toEqualTypeOf<() => ResolvedPluginIdentity>();
        // @ts-expect-error the site never passes the identity.
        plugin.describe({ package: 'x', namespace: 'x', serviceKey: 'x' });
        // @ts-expect-error a helper the plugin does not declare.
        expect(plugin.missing).toBeUndefined();
    });

    it('adds no helper keys to a plugin that declares none', () => {
        const bare = definePlugin({ package: '@acme/widgets' });
        expectTypeOf(bare).toEqualTypeOf<
            PluginFactory<void, { readonly package: '@acme/widgets' }>
        >();
        // @ts-expect-error no helpers declared.
        expect(bare.section).toBeUndefined();
    });
});
