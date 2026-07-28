import { defineAdminPage } from 'astromech';
import type { AdminPage } from 'astromech';
import * as fields from 'astromech/fields';
import { menuItemFields } from '../fields/menu-item.js';
import type { MenuConfig } from '../types.js';

/** One auto-rendered settings page per configured menu, at `/menus/<key>`. */
export function buildMenuPages(configs: MenuConfig[]): AdminPage[] {
    return configs.map(({ key, label }) =>
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
}
