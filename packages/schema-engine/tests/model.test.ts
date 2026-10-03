/**
 * Tests for the snapshot model (`src/model.ts`).
 */

import { describe, expect, it } from 'vitest';
import { serializeSnapshot } from '../src/model';
import { col, snap, table } from './_support/tables';

describe('serializeSnapshot', () => {
    // `JSON.stringify` writes each of these as `null`, which reads back as a
    // different snapshot.
    it.each([Number.NaN, Infinity, -Infinity])(
        'refuses a %s default, naming the column',
        (value) => {
            const snapshot = snap(
                table('posts', [col.id(), col.real('ratio', { default: value })])
            );

            expect(() => serializeSnapshot(snapshot)).toThrow(
                `[schema-engine] cannot write the default of \`posts\`.\`ratio\` to the snapshot: ${value} `
            );
        }
    );
});
