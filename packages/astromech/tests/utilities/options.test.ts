/**
 * `withDefaults`: caller options merged onto a complete defaults object, where
 * an absent or `undefined` option keeps its default.
 */

import { describe, expect, it } from 'vitest';
import { withDefaults } from '@/utilities/options';

type Options = { label: string; limit: number; enabled: boolean };

const defaults: Required<Options> = { label: 'Posts', limit: 10, enabled: true };

describe('withDefaults', () => {
    it('returns a copy of the defaults when no options are given', () => {
        const result = withDefaults(defaults);

        expect(result).toEqual(defaults);
        expect(result).not.toBe(defaults);
    });

    it('replaces a default with the option given for it', () => {
        expect(withDefaults(defaults, { label: 'Notes' })).toEqual({
            label: 'Notes',
            limit: 10,
            enabled: true,
        });
    });

    it('keeps the default for an option set to undefined', () => {
        expect(withDefaults<Options>(defaults, { limit: undefined }).limit).toBe(10);
    });

    it('applies false, 0 and the empty string rather than treating them as absent', () => {
        expect(withDefaults(defaults, { label: '', limit: 0, enabled: false })).toEqual({
            label: '',
            limit: 0,
            enabled: false,
        });
    });

    it('leaves the defaults object unchanged', () => {
        withDefaults(defaults, { label: 'Notes' });

        expect(defaults.label).toBe('Posts');
    });
});
