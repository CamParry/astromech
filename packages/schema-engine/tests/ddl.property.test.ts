import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { renderLiteral } from '../src/ddl';

/**
 * Property tests for `renderLiteral` (`src/ddl.ts`), checked against real
 * SQLite rather than against an expected string.
 *
 * A rendered literal is spliced into DDL (`DEFAULT …`) and into a rebuild's
 * `COALESCE(…, …)`, so its contract is that SQLite reads it back as the value
 * it came from, and that no value ends the literal early and lets the rest of
 * the statement through. Each property selects the literal next to a sentinel
 * column: a value that broke out would change the row or fail to parse.
 */

/** In-memory SQLite. `bigint` mode keeps a large integer exact on the way back. */
function makeClient(): Client {
    return createClient({ url: ':memory:', intMode: 'bigint' });
}

/** `SELECT <literal>, 'sentinel'` and return the one row's two values. */
async function selectLiteral(
    client: Client,
    literal: string
): Promise<{ value: unknown; sentinel: unknown; rowCount: number }> {
    const result = await client.execute(`SELECT ${literal} AS v, 'sentinel' AS s`);
    const [row] = result.rows;
    return { value: row?.v, sentinel: row?.s, rowCount: result.rows.length };
}

/** SQLite hands an integer back as a bigint and a real as a number. */
function asNumber(value: unknown): number {
    return typeof value === 'bigint' ? Number(value) : (value as number);
}

describe('renderLiteral properties', () => {
    it('round-trips any string through SQLite without breaking out', async () => {
        const client = makeClient();
        await fc.assert(
            fc.asyncProperty(
                // Full Unicode, NUL excluded (refused, see the case below),
                // weighted toward the characters that matter to SQL quoting.
                fc.string({
                    unit: fc.oneof(
                        fc.constantFrom("'", '"', '`', '\\', ';', '-', '\n', ')'),
                        fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 })
                    ),
                    maxLength: 30,
                }),
                async (value) => {
                    const row = await selectLiteral(client, renderLiteral(value));
                    expect(
                        row,
                        'property: a string literal reads back as itself'
                    ).toEqual({ value, sentinel: 'sentinel', rowCount: 1 });
                }
            )
        );
        client.close();
    });

    it('round-trips any integer through SQLite exactly', async () => {
        const client = makeClient();
        await fc.assert(
            fc.asyncProperty(
                fc.oneof(fc.integer(), fc.maxSafeInteger()),
                async (value) => {
                    const row = await selectLiteral(client, renderLiteral(value));
                    expect(
                        row,
                        'property: an integer literal reads back as itself'
                    ).toEqual({
                        value: BigInt(value),
                        sentinel: 'sentinel',
                        rowCount: 1,
                    });
                }
            )
        );
        client.close();
    });

    it('round-trips a decimal number as typed through SQLite exactly', async () => {
        const client = makeClient();
        await fc.assert(
            fc.asyncProperty(
                // A default as a person writes one: up to 9 digits, scaled.
                fc
                    .tuple(
                        fc.integer({ min: -999_999_999, max: 999_999_999 }),
                        fc.integer({ min: -12, max: 6 })
                    )
                    .map(([digits, exponent]) => Number(`${digits}e${exponent}`)),
                async (value) => {
                    const row = await selectLiteral(client, renderLiteral(value));
                    expect(row.sentinel, 'property: a number does not break out').toBe(
                        'sentinel'
                    );
                    // `===` rather than `toBe`: SQLite has no negative zero.
                    expect(
                        asNumber(row.value) === value,
                        `property: ${value} reads back as itself, got ${String(row.value)}`
                    ).toBe(true);
                }
            )
        );
        client.close();
    });

    it('round-trips any normal double through SQLite to within two ULP', async () => {
        const client = makeClient();
        await fc.assert(
            fc.asyncProperty(
                fc
                    .double({ noNaN: true, noDefaultInfinity: true })
                    .filter((value) => value === 0 || Math.abs(value) >= 2 ** -1022),
                async (value) => {
                    const row = await selectLiteral(client, renderLiteral(value));
                    expect(row.sentinel, 'property: a double does not break out').toBe(
                        'sentinel'
                    );
                    // `String(value)` is the shortest form that parses back
                    // exactly, but SQLite's own parser misses by up to two ULP
                    // past about 1e±20 (and further for subnormals, left out).
                    const got = asNumber(row.value);
                    expect(
                        Math.abs(got - value),
                        `property: ${value} reads back as itself, got ${String(row.value)}`
                    ).toBeLessThanOrEqual(2 * Math.abs(value) * Number.EPSILON);
                }
            )
        );
        client.close();
    });

    it('renders a boolean as the integer SQLite stores it as', async () => {
        const client = makeClient();
        await fc.assert(
            fc.asyncProperty(fc.boolean(), async (value) => {
                const row = await selectLiteral(client, renderLiteral(value));
                expect(row, 'property: a boolean reads back as 1 or 0').toEqual({
                    value: value ? 1n : 0n,
                    sentinel: 'sentinel',
                    rowCount: 1,
                });
            })
        );
        client.close();
    });

    it('round-trips any string as a column DEFAULT', async () => {
        const client = makeClient();
        let run = 0;
        await fc.assert(
            fc.asyncProperty(
                fc.string({ unit: 'grapheme', maxLength: 30 }),
                async (value) => {
                    const name = `t${run++}`;
                    await client.execute(
                        `CREATE TABLE \`${name}\` (\`id\` integer, \`v\` text DEFAULT ${renderLiteral(value)})`
                    );
                    await client.execute(`INSERT INTO \`${name}\` (\`id\`) VALUES (1)`);
                    const result = await client.execute(`SELECT \`v\` FROM \`${name}\``);
                    expect(
                        result.rows.map((row) => row.v),
                        'property: a DEFAULT literal is stored as the value'
                    ).toEqual([value]);
                }
            )
        );
        client.close();
    });

    // Found by the properties above, kept as plain cases. SQLite has no form
    // for these values: each rendered to SQL that failed to parse or, in a
    // DEFAULT, stored something other than the value. `renderLiteral` refuses
    // them, since the JSON snapshot cannot carry a non-finite number either.
    async function outcome(
        client: Client,
        value: string | number,
        readsBack: (got: unknown) => boolean
    ): Promise<string> {
        let literal: string;
        try {
            literal = renderLiteral(value);
        } catch {
            return 'rejected';
        }
        try {
            const row = await selectLiteral(client, literal);
            return readsBack(row.value)
                ? 'reads back'
                : `reads back as ${String(row.value)}`;
        } catch (error) {
            return `SQLite error: ${(error as Error).message}`;
        }
    }

    /** SQLite reads a number back. */
    function readsNumber(got: unknown): boolean {
        return typeof asNumber(got) === 'number';
    }

    it('reads a finite number back', async () => {
        const client = makeClient();
        expect(await outcome(client, 1.5, readsNumber)).toBe('reads back');
        client.close();
    });

    it.each([Number.NaN, Infinity, -Infinity])('rejects %s', async (value) => {
        const client = makeClient();
        const result = await outcome(client, value, readsNumber);
        client.close();
        expect(result).toBe('rejected');
    });

    it('reads a string without NUL back', async () => {
        const client = makeClient();
        expect(await outcome(client, 'ab', (got) => got === 'ab')).toBe('reads back');
        client.close();
    });

    it('rejects a string containing NUL', async () => {
        const client = makeClient();
        const result = await outcome(client, 'a\0b', (got) => got === 'a\0b');
        client.close();
        expect(result).toBe('rejected');
    });
});
