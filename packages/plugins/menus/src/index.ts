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

import { definePlugin, defineServiceMethod } from 'astromech';
import type { ServiceInterface } from 'astromech';
import { buildMenusService } from './service/menus.js';
import { buildMenuPages } from './pages/menus.js';
import type { MenusOptions, MenuItem } from './types.js';

/** Typed service shape — used only for the module augmentation. */
const _menusServiceTyped = {
    get: defineServiceMethod<{ key: string; locale?: string }, MenuItem[] | null>({
        access: 'public',
        summary: 'Resolve a configured menu into a nested tree of menu items.',
        mutates: false,
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

    const pages = buildMenuPages(menuConfigs);

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
