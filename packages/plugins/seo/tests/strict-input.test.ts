/**
 * Every method input refuses a key it does not declare, at every depth, as
 * core's do. A record's keys are data, so a record is skipped.
 */

import { methodInputs, openInputObjects } from '@tests/strict-input';
import { describe, expect, it } from 'vitest';
import { seo } from '../src/index';

describe('seo method inputs', () => {
    it('refuse unknown keys', () => {
        const inputs = methodInputs(seo().service ?? {});

        expect(Object.keys(inputs).length).toBeGreaterThan(0);
        expect(openInputObjects(inputs)).toEqual([]);
    });
});
