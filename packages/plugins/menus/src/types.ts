/**
 * Public types for the menus plugin.
 */

import type { menuItemSchema } from './service/menus';
import type { z } from 'astromech';

/** A single menu declared in plugin options. */
export type MenuConfig = {
    key: string;
    label: string;
};

/** Options passed to `menus(options)`. */
export type MenusOptions = {
    menus: MenuConfig[];
};

/** A resolved menu item as returned by `menus.get(key, { locale })`. */
export type MenuItem = z.output<typeof menuItemSchema>;
