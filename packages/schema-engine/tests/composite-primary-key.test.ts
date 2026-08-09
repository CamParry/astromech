/**
 * Executable check that a composite primary key survives the whole chain.
 *
 * The unit tests assert the rendered strings; this one runs them against a real
 * libsql db, because a table-level `PRIMARY KEY` is exactly the kind of DDL that
 * renders plausibly and is then rejected — or silently not enforced — by SQLite.
 * Plain DDL only, so `:memory:` is fine.
 */

import { describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { Kysely, sql } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { renderTableStatements } from '../src/ddl';
import { diffSnapshots } from '../src/diff';
import { renderOpStatements } from '../src/render';
import { col, index, snap, table } from './_support/tables';

const edges = table(
    'edges',
    [
        col.text('source_id', { notNull: true }),
        col.text('target_id', { notNull: true }),
        col.text('label'),
    ],
    {
        primaryKey: ['source_id', 'target_id'],
        indexes: [index('idx_edges_target', ['target_id'])],
    }
);

function makeDb(): Kysely<unknown> {
    const client = createClient({ url: ':memory:' });
    return new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
}

async function run(db: Kysely<unknown>, statements: string[]): Promise<void> {
    for (const statement of statements) {
        await sql.raw(statement).execute(db);
    }
}

async function insertEdge(
    db: Kysely<unknown>,
    source: string,
    target: string
): Promise<void> {
    await sql
        .raw(
            `INSERT INTO \`edges\` (\`source_id\`, \`target_id\`) VALUES ('${source}', '${target}')`
        )
        .execute(db);
}

describe('composite primary key', () => {
    it('creates, and enforces uniqueness across the whole key', async () => {
        const db = makeDb();
        await run(db, renderTableStatements(edges));

        await insertEdge(db, 'a', 'b');
        await insertEdge(db, 'a', 'c');
        await insertEdge(db, 'd', 'b');

        await expect(insertEdge(db, 'a', 'b')).rejects.toThrow(/UNIQUE|constraint/i);
    });

    it('survives a rebuild, keeping the key and the rows', async () => {
        const db = makeDb();
        await run(db, renderTableStatements(edges));
        await insertEdge(db, 'a', 'b');

        // Dropping a column is the change SQLite can only make by rebuilding,
        // so this is the path where the table-level key must be re-rendered.
        const narrowed = table(
            'edges',
            edges.columns.filter((c) => c.name !== 'label'),
            {
                primaryKey: ['source_id', 'target_id'],
                indexes: [index('idx_edges_target', ['target_id'])],
            }
        );
        const { ops, errors } = diffSnapshots(snap(edges), snap(narrowed));
        expect(errors).toEqual([]);
        expect(ops).toHaveLength(1);
        const [op] = ops;
        if (op?.kind !== 'rebuildTable') throw new Error('expected a rebuildTable op');
        await run(db, renderOpStatements(op, 'sqlite'));

        const { rows } = await sql
            .raw<{ source_id: string }>('SELECT `source_id` FROM `edges`')
            .execute(db);
        expect(rows).toHaveLength(1);

        await expect(insertEdge(db, 'a', 'b')).rejects.toThrow(/UNIQUE|constraint/i);
    });
});
