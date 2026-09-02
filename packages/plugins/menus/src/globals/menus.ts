import type { MenuConfig } from '../types';
import type { GlobalConfig } from 'astromech';
import { defineGlobal } from 'astromech';
import * as fields from 'astromech/fields';
import { menuItemFields } from '../fields/menu-item';

/**
 * One global per configured menu, keyed `menu-<key>`. A global key carries no
 * `/` or `:` (they separate the plugin namespace and the permission parts), so
 * the prefix keeps a menu apart from a plugin's other globals.
 */
export function buildMenuGlobals(configs: MenuConfig[]): GlobalConfig[] {
    return configs.map(({ key, label }) =>
        defineGlobal({
            key: `menu-${key}`,
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
}
