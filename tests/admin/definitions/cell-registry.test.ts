import { describe, expect, it } from 'vitest';
import type { CellRenderer } from '@/types/index.js';
import { getCellRenderer, registerCell } from '@/admin/definitions/cell-registry.js';

describe('cell-registry', () => {
    it('returns a registered renderer', () => {
        const renderer: CellRenderer = () => 'badge';
        registerCell('badge', renderer);
        expect(getCellRenderer('badge')).toBe(renderer);
    });

    it('falls back to the text renderer for unknown kinds', () => {
        const text: CellRenderer = () => 'text';
        registerCell('text', text);
        expect(getCellRenderer('relationship')).toBe(text);
    });

    it('returns a no-op renderer when nothing is registered', () => {
        const renderer = getCellRenderer('number');
        expect(typeof renderer).toBe('function');
        expect(() =>
            renderer({
                entry: {} as never,
                column: {} as never,
                value: undefined,
                ctx: { basePath: '', configuredLocales: [], isTrash: false },
            })
        ).not.toThrow();
    });
});
