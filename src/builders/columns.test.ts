import { describe, expect, it } from 'vitest';
import type { AdminColumn } from '@/types/config.js';
import { t } from './fields.js';
import { badge, boolean, text } from './columns.js';

// Compile-proof: factory output is assignable to adminColumns.
const _cols: AdminColumn[] = [text('from'), badge('status'), boolean('enabled')];
void _cols;

describe('column factories', () => {
    it('text(field, options) sets kind + chrome', () => {
        expect(text('from', { label: 'From', sortable: true })).toEqual({
            field: 'from',
            kind: 'text',
            label: 'From',
            sortable: true,
        });
    });

    it('badge(field) defaults to a bare badge column', () => {
        expect(badge('status')).toEqual({ field: 'status', kind: 'badge' });
    });

    it('carries a t() label descriptor through to the column', () => {
        expect(text('from', { label: t('redirects.column.from') })).toEqual({
            field: 'from',
            kind: 'text',
            label: { $t: 'redirects.column.from' },
        });
    });
});
