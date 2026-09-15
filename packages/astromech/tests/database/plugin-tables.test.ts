/**
 * `AstromechPluginTables` is the interface a plugin package augments to put
 * its tables on a site's `db` handle. These checks are type-level: the
 * augmentation below adds one table through the `astromech` specifier, the
 * same way a plugin does, and `DB` has to pick it up next to core's tables.
 */

import type { KyselyOf } from '@/database/define-table';
import type { DB } from '@/database/types';
import type { PluginDB } from 'astromech';
import type { Kysely } from 'kysely';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { definePluginTable } from '@/database/define-plugin-table';

const widgetsTable = definePluginTable('@acme/widgets', 'widgets', ({ col }) => ({
    id: col.id(),
    label: col.text({ notNull: true }),
}));

const gadgetsTable = definePluginTable('@acme/widgets', 'gadgets', ({ col }) => ({
    id: col.id(),
}));

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
    interface AstromechPluginTables extends PluginDB<
        [typeof widgetsTable, typeof gadgetsTable]
    > {}
}

function selectLabels(db: Kysely<DB>) {
    return db.selectFrom('pluginAcmeWidgetsWidgets').select('label').execute();
}

describe('AstromechPluginTables', () => {
    it('adds every table in the array to DB under its Kysely key', () => {
        // Each key is the camel-cased SQL name.
        expect([widgetsTable.name, gadgetsTable.name]).toEqual([
            'plugin_acme_widgets_widgets',
            'plugin_acme_widgets_gadgets',
        ]);
        expectTypeOf<DB['pluginAcmeWidgetsWidgets']>().toEqualTypeOf<
            KyselyOf<typeof widgetsTable>
        >();
        expectTypeOf<DB['pluginAcmeWidgetsGadgets']>().toEqualTypeOf<
            KyselyOf<typeof gadgetsTable>
        >();
    });

    it("keeps core's tables", () => {
        expectTypeOf<DB>().toHaveProperty('entries');
    });

    it('lets a Kysely<DB> query the augmented table', () => {
        expectTypeOf(selectLabels).returns.resolves.toEqualTypeOf<{ label: string }[]>();
    });
});
