/**
 * The SEO overview page: it shows the totals and per-entry health the server
 * returns, says so when no entry type carries the SEO field or the request
 * fails, and opens an entry when the user clicks its row.
 */

import type { RenderAdminResult } from '../../../../admin/tests/_support/render-admin';
import type { SeoOverview, SeoOverviewItem } from '../../src/types';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPluginPage } from '../../../../admin/tests/_support/render-admin';
import SeoOverviewPage from '../../src/admin/pages/overview-page';
import en from '../../src/locales/en.json';

const { seo } = vi.hoisted(() => ({
    seo: { getOverview: vi.fn<() => Promise<unknown>>() },
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, plugins: { seo } },
    };
});

afterEach(() => {
    seo.getOverview.mockReset();
});

function overviewItem(
    overrides: Partial<SeoOverviewItem> & Pick<SeoOverviewItem, 'id' | 'title'>
): SeoOverviewItem {
    return {
        type: 'posts',
        slug: null,
        entryStatus: 'published',
        metaTitle: { length: 50, status: 'good' },
        metaDescription: { length: 140, status: 'good' },
        ...overrides,
    };
}

function renderPage(): RenderAdminResult {
    return renderPluginPage(<SeoOverviewPage />, {
        plugin: { namespace: 'seo', serviceKey: 'seo', permissionNamespace: 'seo' },
        translations: en,
    });
}

/** The table row holding `text`, once the overview has loaded. */
async function findRow(text: string): Promise<HTMLElement> {
    const cell = await screen.findByRole('cell', { name: text });
    const row = cell.closest('tr');
    if (row === null) throw new Error(`no row holds "${text}"`);
    return row;
}

/** The text of each cell in `row`, in column order. */
function cellsOf(row: HTMLElement): (string | null)[] {
    return within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
}

/** The number shown beside a total's label. */
function totalBeside(label: string): string | null | undefined {
    return screen.getByText(label).previousElementSibling?.textContent;
}

describe('SeoOverviewPage', () => {
    it('shows the totals and each entry’s health from the server', async () => {
        const overview: SeoOverview = {
            totals: { entries: 3, complete: 1, needsAttention: 2 },
            items: [
                overviewItem({ id: 'entry_1', title: 'Hello world' }),
                overviewItem({
                    id: 'entry_2',
                    title: 'About us',
                    type: 'pages',
                    entryStatus: 'draft',
                    metaTitle: { length: 0, status: 'empty' },
                    metaDescription: { length: 20, status: 'short' },
                }),
                overviewItem({
                    id: 'entry_3',
                    title: 'Launch notes',
                    metaTitle: { length: 90, status: 'long' },
                }),
            ],
        };
        seo.getOverview.mockResolvedValue(overview);
        renderPage();

        // Each row's cells in column order, so a badge in the wrong column fails.
        expect(cellsOf(await findRow('Hello world'))).toEqual([
            'Hello world',
            'posts',
            'published',
            'Good',
            'Good',
        ]);
        expect(cellsOf(await findRow('About us'))).toEqual([
            'About us',
            'pages',
            'draft',
            'Missing',
            'Short',
        ]);
        expect(cellsOf(await findRow('Launch notes'))).toEqual([
            'Launch notes',
            'posts',
            'published',
            'Too long',
            'Good',
        ]);

        expect(totalBeside('Entries')).toBe('3');
        expect(totalBeside('Complete')).toBe('1');
        expect(totalBeside('Needs attention')).toBe('2');
    });

    it('says so when no entry type includes the SEO field', async () => {
        seo.getOverview.mockResolvedValue({
            totals: { entries: 0, complete: 0, needsAttention: 0 },
            items: [],
        } satisfies SeoOverview);
        renderPage();

        expect(await screen.findByText('Nothing to analyse')).not.toBeNull();
        expect(
            screen.getByText(
                "No entry types include the SEO field yet. Add seo.section() to an entry type's fields."
            )
        ).not.toBeNull();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('says so when the overview fails to load', async () => {
        seo.getOverview.mockRejectedValue(new Error('500'));
        renderPage();

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe('Could not load the SEO overview.');
    });

    it('opens an entry when the user clicks its row', async () => {
        seo.getOverview.mockResolvedValue({
            totals: { entries: 1, complete: 1, needsAttention: 0 },
            items: [overviewItem({ id: 'entry_1', title: 'Hello world' })],
        } satisfies SeoOverview);
        const { user, pathname } = renderPage();

        await user.click(await findRow('Hello world'));

        await waitFor(() => {
            expect(pathname()).toBe('/entries/posts/entry_1');
        });
    });
});
