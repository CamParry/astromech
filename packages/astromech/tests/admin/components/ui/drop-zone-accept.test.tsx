/**
 * DropZone honours `accept` and `multiple`.
 *
 * Both props were declared and never read, so the media library advertised a
 * type filter it did not apply and a single-file zone accepted a whole drop.
 */

import { describe, expect, it } from 'vitest';
import { selectDroppedFiles } from '@/admin/components/ui/drop-zone';

const png = new File(['x'], 'a.png', { type: 'image/png' });
const pdf = new File(['x'], 'b.pdf', { type: 'application/pdf' });
const txt = new File(['x'], 'c.txt', { type: 'text/plain' });

const names = (files: File[]): string[] => files.map((f) => f.name);

describe('selectDroppedFiles', () => {
    it('drops files that do not match the accept list', () => {
        expect(names(selectDroppedFiles([png, txt], 'image/*', true))).toEqual(['a.png']);
    });

    it('matches an extension token', () => {
        expect(names(selectDroppedFiles([png, pdf], '.pdf', true))).toEqual(['b.pdf']);
    });

    it('matches an exact mime token', () => {
        expect(names(selectDroppedFiles([png, pdf], 'application/pdf', true))).toEqual([
            'b.pdf',
        ]);
    });

    it('matches any token in a comma-separated list', () => {
        expect(names(selectDroppedFiles([png, pdf, txt], 'image/*,.pdf', true))).toEqual([
            'a.png',
            'b.pdf',
        ]);
    });

    it('accepts everything when no accept list is given', () => {
        expect(selectDroppedFiles([png, txt], undefined, true)).toHaveLength(2);
        expect(selectDroppedFiles([png, txt], '', true)).toHaveLength(2);
    });

    it('takes only the first matching file when multiple is false', () => {
        expect(names(selectDroppedFiles([png, pdf], undefined, false))).toEqual([
            'a.png',
        ]);
    });

    it('caps to the first file that matches, not the first file dropped', () => {
        expect(names(selectDroppedFiles([txt, pdf], '.pdf', false))).toEqual(['b.pdf']);
    });

    it('returns nothing when every file is filtered out', () => {
        expect(selectDroppedFiles([txt], 'image/*', true)).toEqual([]);
    });

    it('ignores case in both the token and the filename', () => {
        const upper = new File(['x'], 'D.PDF', { type: 'APPLICATION/PDF' });
        expect(names(selectDroppedFiles([upper], '.pdf', true))).toEqual(['D.PDF']);
        expect(names(selectDroppedFiles([upper], 'application/pdf', true))).toEqual([
            'D.PDF',
        ]);
    });
});
