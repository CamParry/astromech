import { describe, expect, it } from 'vitest';
import { defineGlobal } from '@/config/define-global';
import { resolvePluginGlobals } from '@/config/plugin-globals';
import { definePlugin } from '@/plugins/define-plugin';

const settings = () =>
    defineGlobal({
        key: 'settings',
        label: 'Settings',
        fields: [{ name: 'title', type: 'text' }],
    });

describe('resolvePluginGlobals', () => {
    it('qualifies each plugin global with its namespace', () => {
        const a = definePlugin({ package: '@astromech/seo', globals: [settings()] })();
        const b = definePlugin({
            package: '@astromech/backups',
            globals: [settings()],
        })();

        const resolved = resolvePluginGlobals([a, b]);

        expect(resolved['seo']?.['settings']?.id).toBe('seo/settings');
        expect(resolved['backups']?.['settings']?.id).toBe('backups/settings');
    });

    it('skips a plugin that declares no globals', () => {
        const plugin = definePlugin({ package: '@astromech/redirects' })();

        expect(resolvePluginGlobals([plugin])).toEqual({});
    });

    it('rejects a key declared twice within one plugin, naming the package', () => {
        const plugin = definePlugin({
            package: '@astromech/seo',
            globals: [settings(), settings()],
        })();

        expect(() => resolvePluginGlobals([plugin])).toThrow(
            /plugin "@astromech\/seo" declares the global key "settings" twice/
        );
    });
});
