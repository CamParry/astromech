/**
 * Property tests for `dumpSchema` (`src/oracle.ts`).
 *
 * Tables are generated with column names, defaults and CHECK expressions made
 * of the characters that can confuse a column-clause splitter: commas,
 * parentheses, every SQLite quote (`'`, `"`, backticks, `[]`), doubled quotes,
 * comment markers and runs of whitespace. Comments go between the tokens of a
 * clause. Each table is built in SQLite, which decides the column names
 * (`pragma_table_info`), and the dump must hold every clause whole, without its
 * comments and with one space between tokens, listed by column name, then
 * the table constraint. The
 * defects it found are kept as example cases in `oracle.test.ts`.
 */
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import fc from 'fast-check';
import { Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { dumpSchema } from '../src/oracle';

const UNITS = [
    'a',
    'b',
    'B',
    '_',
    ' ',
    '  ',
    '\n',
    ',',
    '(',
    ')',
    "'",
    '"',
    '`',
    '[',
    ']',
];
const COMMENT_UNITS = [...UNITS, '-', '/', '*'];

const textArb = (units: string[]): fc.Arbitrary<string> =>
    fc.string({ unit: fc.constantFrom(...units), minLength: 1, maxLength: 6 });

/** A name in one of SQLite's quote styles, the closing quote doubled inside. A
 *  bare-identifier name is quoted with backticks, the form the oracle gives
 *  `"name"`. */
const quotedArb = (name: string): fc.Arbitrary<string> =>
    fc.constantFrom('"', '`', '[').map((style) => {
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `\`${name}\``;
        if (style === '[' && !name.includes(']')) return `[${name}]`;
        const quote = style === '[' ? '"' : style;
        return `${quote}${name.split(quote).join(quote + quote)}${quote}`;
    });

const literal = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** What separates two tokens of a clause: a space, or a comment with
 *  whitespace around it. */
const gapArb: fc.Arbitrary<string> = fc.oneof(
    fc.constant(' '),
    fc.constant('\n    '),
    textArb(COMMENT_UNITS)
        .filter((text) => !text.includes('*/'))
        .map((text) => ` /*${text}*/ `),
    textArb(COMMENT_UNITS.filter((unit) => unit !== '\n')).map((text) => ` --${text}\n`)
);

type Column = { name: string; tokens: string[] };

const columnArb = (name: string): fc.Arbitrary<Column> =>
    fc
        .record({
            quoted: quotedArb(name),
            fallback: textArb(UNITS),
            allowed: fc.array(textArb(UNITS), { minLength: 1, maxLength: 3 }),
            withDefault: fc.boolean(),
            withCheck: fc.boolean(),
        })
        .map(({ quoted, fallback, allowed, withDefault, withCheck }) => ({
            name,
            tokens: [
                quoted,
                'text',
                ...(withDefault ? ['DEFAULT', literal(fallback)] : []),
                ...(withCheck
                    ? ['CHECK', `(${quoted} IN (${allowed.map(literal).join(', ')}))`]
                    : []),
            ],
        }));

const tableArb = fc
    .uniqueArray(textArb(UNITS), {
        minLength: 1,
        maxLength: 5,
        // SQLite compares column names without ASCII case.
        selector: (name) => name.toLowerCase(),
    })
    .chain((names) =>
        fc.record({
            columns: fc.tuple(...names.map(columnArb)),
            // A table constraint, which the dump keeps after the columns.
            constraint: fc.option(
                fc
                    .tuple(textArb(UNITS).chain(quotedArb), textArb(UNITS))
                    .map(([quoted, value]) => [
                        'CONSTRAINT',
                        quoted,
                        'CHECK',
                        `(${literal(value)} <> ',(')`,
                    ]),
                { nil: undefined }
            ),
            gaps: fc.array(gapArb, { minLength: 40, maxLength: 40 }),
        })
    );

/** The clause as declared: each token after a gap, the first gap leading. */
function declare(tokens: string[], gaps: string[], offset: number): string {
    return tokens
        .map((token, n) => `${gaps[(offset + n) % gaps.length]}${token}`)
        .join('');
}

async function makeDb(statement: string): Promise<Kysely<unknown>> {
    const client = createClient({ url: ':memory:' });
    const db = new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
    await sql.raw(statement).execute(db);
    return db;
}

describe('dumpSchema properties', () => {
    it('recovers each clause whole, without comments, with the columns listed by name', async () => {
        await fc.assert(
            fc.asyncProperty(tableArb, async ({ columns, constraint, gaps }) => {
                const declared = columns.map((column, n) =>
                    declare(column.tokens, gaps, n * 7)
                );
                if (constraint !== undefined) declared.push(declare(constraint, gaps, 3));
                const db = await makeDb(`CREATE TABLE \`t\` (${declared.join(',')}\n)`);
                try {
                    const { rows } = await sql<{
                        name: string;
                    }>`SELECT name FROM pragma_table_info('t')`.execute(db);
                    expect(
                        rows.map((row) => row.name),
                        'SQLite reads the generated names'
                    ).toEqual(columns.map((column) => column.name));

                    const byName = [...columns].sort((a, b) =>
                        a.name < b.name ? -1 : 1
                    );
                    const clauses = [
                        ...byName.map((column) => column.tokens.join(' ')),
                        ...(constraint === undefined ? [] : [constraint.join(' ')]),
                    ];
                    const [row] = await dumpSchema(db);
                    expect(row?.sql).toBe(`CREATE TABLE \`t\` (${clauses.join(', ')})`);
                } finally {
                    await db.destroy();
                }
            }),
            { numRuns: 200 }
        );
    });
});
