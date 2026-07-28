/**
 * @astromech/menus — developer-declared navigation menus stored as settings
 * blobs, edited through generated per-menu admin pages, and read via a public
 * service method that resolves entry refs to front-end URLs.
 *
 * Usage:
 *   menus({ menus: [{ key: 'main', label: 'Main Navigation' }, ...] })
 *
 * Service:
 *   const items = await Astromech.plugins.menus.get({ key: 'main', locale: 'en' });
 *   // → [{ label, url?, newTab?, children: [...] }]
 */

import { defineAdminPage, definePlugin, defineServiceMethod } from 'astromech';
import type { ServiceInterface } from 'astromech';
import * as fields from 'astromech/fields';
import { buildMenusService } from './service/menus.js';
import type { MenusOptions, MenuItem } from './types.js';

/** The node schema used at every depth of the menu item tree. */
const menuItemFields = [
    fields.text('label', { label: 'Label', translatable: true }),
    fields.relationship('entry', { label: 'Entry (internal link)' }),
    fields.url('url', { label: 'URL (external link)', translatable: true }),
    fields.boolean('newTab', { label: 'Open in new tab' }),
];

/** Typed service shape — used only for the module augmentation. */
const _menusServiceTyped = {
    get: defineServiceMethod<{ key: string; locale?: string }, MenuItem[] | null>({
        access: 'public',
        handler: async () => null,
    }),
};

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        menus: ServiceInterface<typeof _menusServiceTyped>;
    }
}

export type { MenuItem, MenuConfig, MenusOptions } from './types.js';

export const menus = definePlugin((options?: MenusOptions) => {
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

    const service = buildMenusService(menuConfigs);

    return {
        package: '@astromech/menus',
        version: '0.1.0',
        label: 'Menus',
        icon: 'Menu',
        admin: {
            pages,
        },
        service,
    };
});

export default menus;
