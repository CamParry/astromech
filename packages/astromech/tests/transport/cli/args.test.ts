/**
 * The shared CLI flags: `--confirm`, the `--read-only`/`--include`/`--exclude`
 * trio and `--allow-remote`, each read off citty's parsed args.
 */

import { describe, expect, it } from 'vitest';
import { toConfirmOptions } from '@/transport/cli/confirm-args';
import { toMethodFilter } from '@/transport/cli/filter-args';
import { toAllowRemoteOption } from '@/transport/cli/remote-args';

describe('toConfirmOptions', () => {
    it('is off when the flag is absent', () => {
        expect(toConfirmOptions(undefined)).toBeUndefined();
        expect(toConfirmOptions(false)).toBeUndefined();
    });

    it('takes the mutating mode for a bare flag', () => {
        expect(toConfirmOptions(true)).toEqual({ trigger: 'mutating' });
        expect(toConfirmOptions('')).toEqual({ trigger: 'mutating' });
    });

    it('takes a named mode', () => {
        expect(toConfirmOptions('destructive')).toEqual({ trigger: 'destructive' });
        expect(toConfirmOptions('mutating')).toEqual({ trigger: 'mutating' });
    });

    it('refuses an unknown mode, naming it', () => {
        expect(() => toConfirmOptions('always')).toThrow(
            'Unknown --confirm mode "always"'
        );
    });
});

describe('toMethodFilter', () => {
    it('reads nothing off absent flags', () => {
        expect(toMethodFilter({})).toEqual({ readOnly: false, include: [], exclude: [] });
    });

    it('splits the lists, dropping blanks and trimming each id', () => {
        expect(
            toMethodFilter({
                'read-only': true,
                include: 'entries.*, users.query,,',
                exclude: ' media.update ',
            })
        ).toEqual({
            readOnly: true,
            include: ['entries.*', 'users.query'],
            exclude: ['media.update'],
        });
    });
});

describe('toAllowRemoteOption', () => {
    it('allows a remote database only when the flag is set', () => {
        expect(toAllowRemoteOption({})).toEqual({ allowRemote: false });
        expect(toAllowRemoteOption({ 'allow-remote': true })).toEqual({
            allowRemote: true,
        });
    });
});
