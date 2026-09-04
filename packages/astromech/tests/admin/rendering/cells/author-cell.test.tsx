/**
 * @vitest-environment happy-dom
 *
 * The author cell shows a name for a resolvable user id and nothing at all
 * otherwise, so a raw id never reaches the table.
 */

import type { CellRenderContext, Entry, TableColumn } from '@/types/index';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthorCell } from '@/admin/rendering/cells/author-cell';

afterEach(cleanup);

const COLUMN: TableColumn = {
    key: 'updatedBy',
    label: 'entries.columnUpdatedBy',
    kind: 'author',
    source: 'entry',
    sortable: false,
    system: true,
    requires: null,
};

function renderCell(value: unknown, names: [string, string][]) {
    const ctx: CellRenderContext = {
        basePath: '/entries/post',
        configuredLocales: ['en'],
        isTrash: false,
        authorNames: new Map(names),
    };
    return render(
        <AuthorCell
            entry={{ id: 'e1' } as unknown as Entry}
            column={COLUMN}
            value={value}
            ctx={ctx}
        />
    );
}

describe('AuthorCell', () => {
    it('renders the name for a resolvable id', () => {
        const { container } = renderCell('u1', [['u1', 'Ada Lovelace']]);
        expect(container.textContent).toBe('Ada Lovelace');
    });

    it('renders nothing for an id with no known user', () => {
        const { container } = renderCell('u2', [['u1', 'Ada Lovelace']]);
        expect(container.innerHTML).toBe('');
    });

    it('renders nothing for a null author', () => {
        const { container } = renderCell(null, [['u1', 'Ada Lovelace']]);
        expect(container.innerHTML).toBe('');
    });
});
