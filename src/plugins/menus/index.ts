/**
 * @astromech/menus — developer-declared navigation menus stored as settings
 * blobs, edited through generated per-menu admin pages, and read via a public
 * SDK method that resolves entry refs to front-end URLs.
 *
 * Usage:
 *   menus({ menus: [{ key: 'main', label: 'Main Navigation' }, ...] })
 *
 * SDK:
 *   const items = await Astromech.plugins.menus.get({ key: 'main', locale: 'en' });
 *   // → [{ label, url?, newTab?, children: [...] }]
 */

import { defineAdminPage, definePlugin, defineSdkMethod } from '@/index.js';
import type { PluginDefinition, SdkInterface } from '@/types/index.js';
import * as fields from '@/builders/fields.js';
import { PACKAGE, VERSION, LABEL, ICON } from './manifest.js';
import { buildMenusSdk } from './sdk/menus.js';
import type { MenusOptions, MenuItem } from './types.js';

/** The node schema used at every depth of the menu item tree. */
const menuItemFields = [
    fields.text('label', { label: 'Label', translatable: true }),
    fields.relationship('entry', { label: 'Entry (internal link)' }),
    fields.url('url', { label: 'URL (external link)', translatable: true }),
    fields.boolean('newTab', { label: 'Open in new tab' }),
];

/** Typed SDK shape — used only for the module augmentation. */
const _menusSdkTyped = {
    get: defineSdkMethod<{ key: string; locale?: string }, MenuItem[] | null>({
        access: 'public',
        handler: async () => null,
    }),
};

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginSdks {
        menus: SdkInterface<typeof _menusSdkTyped>;
    }
}

export type { MenuItem, MenuConfig, MenusOptions } from './types.js';

export const menus = definePlugin<MenusOptions>((options) => {
    const menuConfigs = options?.menus ?? [];

    const pages = menuConfigs.map(({ key, label }) =>
        defineAdminPage({
            path: `/menus/${key}`,
            label,
            icon: 'Menu',
            translatable: true,
            fields: [
                fields.tree('items', {
                    label: 'Menu Items',
                    fields: menuItemFields,
                }),
            ],
        })
    );

    const sdk = buildMenusSdk(menuConfigs);

    const definition: PluginDefinition = {
        package: PACKAGE,
        version: VERSION,
        label: LABEL,
        icon: ICON,
        admin: {
            pages,
        },
        sdk,
    };

    return definition;
});

export default menus;
