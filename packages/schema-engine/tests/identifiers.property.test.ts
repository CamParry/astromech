/**
 * Property tests for `capIdentifier` (`src/identifiers.ts`).
 *
 * The example cases in `identifiers.test.ts` pin the exact capped shape; these
 * state the contract over any ASCII name: the output fits the budget, a name
 * under the budget is untouched, the same name always caps the same way, and
 * two long names that only differ past the cap still come out different.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { capIdentifier, MAX_IDENTIFIER_BYTES } from '../src/identifiers';

/** Any ASCII string, control characters included, up to well past the cap. */
const asciiName = fc.string({ unit: 'binary-ascii', maxLength: 150 });

/** A name at or over the cap, so it is always capped. */
const longName = fc.string({
    unit: 'binary-ascii',
    minLength: MAX_IDENTIFIER_BYTES + 1,
    maxLength: 150,
});

describe('capIdentifier properties', () => {
    it('never returns more than MAX_IDENTIFIER_BYTES bytes', () => {
        fc.assert(
            fc.property(asciiName, (name) => {
                expect(
                    Buffer.byteLength(capIdentifier(name), 'utf8'),
                    'property: output fits the identifier budget'
                ).toBeLessThanOrEqual(MAX_IDENTIFIER_BYTES);
            })
        );
    });

    it('returns a name within the cap unchanged', () => {
        fc.assert(
            fc.property(
                fc.string({ unit: 'binary-ascii', maxLength: MAX_IDENTIFIER_BYTES }),
                (name) => {
                    expect(
                        capIdentifier(name),
                        'property: a short name is returned verbatim'
                    ).toBe(name);
                }
            )
        );
    });

    it('caps the same name the same way every time', () => {
        fc.assert(
            fc.property(asciiName, (name) => {
                expect(capIdentifier(name), 'property: capping is deterministic').toBe(
                    capIdentifier(name)
                );
            })
        );
    });

    it('keeps the start of a capped name readable', () => {
        fc.assert(
            fc.property(longName, (name) => {
                const capped = capIdentifier(name);
                expect(
                    name.startsWith(capped.slice(0, capped.lastIndexOf('_'))),
                    'property: a capped name begins with the original name'
                ).toBe(true);
                expect(
                    capped.lastIndexOf('_'),
                    'property: the hash suffix leaves most of the budget to the name'
                ).toBeGreaterThanOrEqual(MAX_IDENTIFIER_BYTES - 9);
            })
        );
    });

    it('keeps two different long names with a shared 63-byte prefix apart', () => {
        fc.assert(
            fc.property(
                longName,
                fc.string({ unit: 'binary-ascii', minLength: 1, maxLength: 40 }),
                fc.string({ unit: 'binary-ascii', minLength: 1, maxLength: 40 }),
                (prefix, tailA, tailB) => {
                    fc.pre(tailA !== tailB);
                    expect(
                        capIdentifier(prefix + tailA),
                        'property: names differing only past the cap do not collide'
                    ).not.toBe(capIdentifier(prefix + tailB));
                }
            )
        );
    });

    it('rejects any name with a non-ASCII character', () => {
        fc.assert(
            fc.property(
                asciiName,
                fc
                    .integer({ min: 0x80, max: 0x10ffff })
                    .filter((code) => code < 0xd800 || code > 0xdfff),
                asciiName,
                (head, code, tail) => {
                    const name = head + String.fromCodePoint(code) + tail;
                    expect(
                        () => capIdentifier(name),
                        'property: a non-ASCII name is rejected, not mangled'
                    ).toThrow(/non-ASCII/);
                }
            )
        );
    });
});
