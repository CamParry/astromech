/**
 * @vitest-environment happy-dom
 *
 * `EntryTypeIcon` renders the configured icon from the admin's icon map, and
 * the database icon for an unset name or one the map does not hold.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EntryTypeIcon } from '@/admin/components/ui/entry-type-icon';

afterEach(cleanup);

function iconClass(name?: string): string | undefined {
    const { container } = render(<EntryTypeIcon name={name} />);
    return container.querySelector('svg')?.getAttribute('class') ?? undefined;
}

describe('EntryTypeIcon', () => {
    it('renders an icon the map holds', () => {
        expect(iconClass('FileText')).toContain('lucide-file-text');
    });

    it('falls back to the database icon for a name the map does not hold', () => {
        expect(iconClass('NotAnIcon')).toContain('lucide-database');
    });

    it('falls back to the database icon when no name is set', () => {
        expect(iconClass()).toContain('lucide-database');
    });
});
