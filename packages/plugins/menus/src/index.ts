/**
 * @astromech/menus — developer-declared navigation menus, each stored as a
 * translatable global the plugin generates from its config, and read via a
 * public service method that resolves entry refs to front-end URLs.
 */

import type { MenuItem, MenusOptions } from './types';
import type { ServiceInterface } from 'astromech';
import { definePlugin, defineServiceMethod } from 'astromech';
import { buildMenuGlobals } from './globals/menus';
import { buildMenusService } from './service/menus';

/** Typed service shape — used only for the module augmentation. */
const _menusServiceTyped = {
    get: defineServiceMethod<
        { key: string; locale?: string | undefined },
        MenuItem[] | null
    >({
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

export type { MenuItem, MenuConfig, MenusOptions } from './types';

export const menus = definePlugin((options?: MenusOptions) => {
    const menuConfigs = options?.menus ?? [];

    const service = buildMenusService(menuConfigs);

    return {
        package: '@astromech/menus',
        version: '0.1.0',
        label: 'Menus',
        icon: 'Menu',
        globals: buildMenuGlobals(menuConfigs),
        service,
    };
});

export default menus;
