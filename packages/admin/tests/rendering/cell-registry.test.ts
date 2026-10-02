/**
 * The cell registry as the admin fills it. The registry is shared by every file
 * in the worker, so this reads the real registrations rather than writing its own.
 */

import type { CellKind } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { getCellRenderer } from '@/admin/rendering/cell-registry';
import { BadgeCell } from '@/admin/rendering/cells/badge-cell';
import { TextCell } from '@/admin/rendering/cells/text-cell';
import '@/admin/rendering/cells/register-cells';

describe('cell-registry', () => {
    it('returns a registered renderer', () => {
        expect(getCellRenderer('badge')).toBe(BadgeCell);
    });

    it('falls back to the text renderer for unknown kinds', () => {
        // A kind from a stale config, outside the union the type allows.
        expect(getCellRenderer('sparkline' as CellKind)).toBe(TextCell);
    });
});
