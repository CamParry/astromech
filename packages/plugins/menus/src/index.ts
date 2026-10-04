/**
 * @astromech/menus — developer-declared navigation menus, each stored as a
 * translatable global the plugin generates from its config, and read via a
 * public service method that resolves entry refs to front-end URLs.
 */

import type { MenusOptions } from './types';
import type { ServiceInterface } from 'astromech';
import { definePlugin } from 'astromech';
import { version } from '../package.json';
import { buildMenuGlobals } from './globals/menus';
import { createMenusService } from './service/menus';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        menus: ServiceInterface<ReturnType<typeof createMenusService>>;
    }
}

export type { MenuItem, MenuConfig, MenusOptions } from './types';

export const menus = definePlugin((options?: MenusOptions) => {
    const menuConfigs = options?.menus ?? [];

    const service = createMenusService(menuConfigs);

    return {
        package: '@astromech/menus',
        version,
        label: 'Menus',
        icon: 'Menu',
        globals: buildMenuGlobals(menuConfigs),
        service,
    };
});

export default menus;
