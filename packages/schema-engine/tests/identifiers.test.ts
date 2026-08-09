/**
 * Unit tests for the identifier budget (`src/identifiers.ts`).
 *
 * The load-bearing case is the last one in `capIdentifier`: two names that are
 * identical for their first 63 bytes MUST cap to different strings. That is the
 * exact Postgres failure this module exists to prevent — PG truncates at
 * `NAMEDATALEN - 1` with a NOTICE, not an error, so two such indexes collapse
 * into one another and the second `CREATE` dies with "relation already exists".
 */

import { describe, expect, it } from 'vitest';
import { capIdentifier, hash8, isAscii, MAX_IDENTIFIER_BYTES } from '../src/identifiers';

const repeat = (length: number): string => 'a'.repeat(length);

describe('MAX_IDENTIFIER_BYTES', () => {
    it("is Postgres' NAMEDATALEN - 1", () => {
        expect(MAX_IDENTIFIER_BYTES).toBe(63);
    });
});

describe('hash8', () => {
    it('returns 8 lowercase hex digits', () => {
        expect(hash8('plugin_acme_seo_settings')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('is stable across calls — a capped name must not churn between generations', () => {
        expect(hash8('some_long_index_name')).toBe(hash8('some_long_index_name'));
    });

    it('distinguishes different inputs', () => {
        expect(hash8('a')).not.toBe(hash8('b'));
    });
});

describe('isAscii', () => {
    it('accepts ASCII and rejects multi-byte characters', () => {
        expect(isAscii('plugin_acme_seo_settings')).toBe(true);
        expect(isAscii('café')).toBe(false);
    });
});

describe('capIdentifier', () => {
    it('returns a 62-byte name verbatim', () => {
        const name = repeat(62);
        expect(capIdentifier(name)).toBe(name);
    });

    it('returns a name at exactly the limit verbatim', () => {
        const name = repeat(MAX_IDENTIFIER_BYTES);
        expect(capIdentifier(name)).toBe(name);
        expect(capIdentifier(name)).toHaveLength(63);
    });

    it('caps a 64-byte name', () => {
        const name = repeat(64);
        const capped = capIdentifier(name);
        expect(capped).not.toBe(name);
        expect(capped).toBe(`${repeat(54)}_${hash8(name)}`);
    });

    it('produces output of exactly the limit when capping', () => {
        for (const length of [64, 80, 200]) {
            expect(capIdentifier(repeat(length))).toHaveLength(MAX_IDENTIFIER_BYTES);
        }
    });

    it('distinguishes two names that differ only past byte 63', () => {
        const shared = repeat(63);
        const a = capIdentifier(`${shared}_alpha`);
        const b = capIdentifier(`${shared}_beta`);

        expect(a).not.toBe(b);
        expect(a).toHaveLength(MAX_IDENTIFIER_BYTES);
        expect(b).toHaveLength(MAX_IDENTIFIER_BYTES);
    });

    it('hashes the full logical name, so the same input always caps the same way', () => {
        const name = `plugin_acme_seo_${repeat(60)}_unique`;
        expect(capIdentifier(name)).toBe(capIdentifier(name));
    });

    it('rejects non-ASCII rather than slicing mid-character', () => {
        expect(() => capIdentifier(`caf€${repeat(80)}`)).toThrow(/non-ASCII/);
    });
});
