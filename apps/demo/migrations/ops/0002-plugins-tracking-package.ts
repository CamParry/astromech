/**
 * Hand-authored ops for `0002_plugins-tracking-package`.
 *
 * This is a RECORD of how that migration was produced, not a script to re-run —
 * running it again would append another migration doing the same thing. It
 * lives here so the next person facing a transition the differ refuses has a
 * worked example instead of reinventing one.
 *
 * Why the differ refused: `_astromech_plugins` moved its primary key from
 * `alias` to `package` and gained a NOT NULL `namespace`. The generator has no
 * rename op (by design — renames are indistinguishable from drop+add in a
 * snapshot diff) and its rebuild path copies same-named columns only, so
 * neither column had a derivable source.
 *
 * Why DROP + CREATE is safe HERE: the table is bookkeeping that `bootPlugins`
 * re-upserts on every boot. The only thing lost is `installedAt` history. A
 * migration that drops data has to be able to say why the loss is acceptable —
 * if it can't, it is the wrong migration.
 *
 * Note what is NOT hand-written: the SQL, `journal.json`, `snapshot.json` and
 * `index.ts` all still come from the engine's renderers. The snapshot is
 * written from the live descriptors either way, so `db:generate` reporting "no
 * changes" afterwards — plus the chain ↔ descriptor parity test, which executes
 * the real SQL — is what proves these ops actually reach the target state.
 *
 *     npm run db:generate -- --ops migrations/ops/0002-plugins-tracking-package.ts \
 *         --name plugins-tracking-package
 */

import type { MigrationOpsAuthor } from '@astromech/schema-engine/generate';

const TABLE = '_astromech_plugins';

const author: MigrationOpsAuthor = ({ next }) => {
    const table = next.tables[TABLE];
    if (!table) {
        throw new Error(`${TABLE} is absent from the descriptor snapshot`);
    }
    // Build the CREATE from `next`, never from a literal: the table that lands
    // is then the same one `renderCreateTable` emits everywhere else.
    return [
        { kind: 'dropTable', name: TABLE },
        { kind: 'createTable', table },
    ];
};

export default author;
