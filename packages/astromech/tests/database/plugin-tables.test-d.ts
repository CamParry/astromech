/**
 * Type-level checks on `AstromechPluginTables`. They read the augmentation that
 * `plugin-tables.test.ts` declares, which is in the same `typecheck` program.
 * `typecheck` checks this file; vitest does not run it.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { describe, expectTypeOf, it } from 'vitest';

function selectLabels(db: Kysely<DB>) {
    return db.selectFrom('pluginAcmeWidgetsWidgets').select('label').execute();
}

describe('AstromechPluginTables', () => {
    it("keeps core's tables", () => {
        expectTypeOf<DB>().toHaveProperty('entries');
    });

    it('lets a Kysely<DB> query the augmented table', () => {
        expectTypeOf(selectLabels).returns.resolves.toEqualTypeOf<{ label: string }[]>();
    });
});
