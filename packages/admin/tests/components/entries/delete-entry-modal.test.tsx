/**
 * @vitest-environment happy-dom
 *
 * The delete confirmation, opened from a row of the entries list: it names the
 * entry, warns that every locale and every reference goes with it, and sends
 * nothing on cancel. Confirming trashes the entry, or deletes it for good when
 * the type has no trash, then closes; a refusal keeps it open and says why.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type { AdminEntryType, Entry, QueryResult, User } from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { validateEntriesListSearch } from '@/admin/utilities/entry-admin-path';
import { AstromechApiError } from '@/transport/http/client';
import { createTestQueryClient, renderAdmin } from '../../_support/render-admin';

const { entries, adminConfig } = vi.hoisted(() => ({
    entries: {
        query: vi.fn<(params: unknown) => Promise<unknown>>(),
        usedBy: vi.fn<(params: unknown) => Promise<unknown>>(),
        trash: vi.fn<(params: unknown) => Promise<unknown>>(),
        delete: vi.fn<(params: unknown) => Promise<unknown>>(),
    },
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, entries },
    };
});

function postType(trash: boolean): AdminEntryType {
    return {
        single: 'Post',
        plural: 'Posts',
        versioning: false,
        translatable: false,
        adminColumns: [],
        fields: { main: [], sidebar: [] },
        url: null,
        capabilities: {
            statuses: true,
            slug: false,
            translatable: false,
            versioning: false,
            staging: false,
            trash,
        },
        titleField: 'title',
    };
}

const ENTRY = {
    id: 'e1',
    type: 'post',
    locale: 'en',
    locales: ['en', 'fr'],
    title: 'Hello world',
    status: 'published',
    fields: {},
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
} as unknown as Entry;

afterEach(() => {
    for (const fn of Object.values(entries)) fn.mockReset();
    adminConfig.entryTypes = {};
});

/** Mount the list with one entry, as a type with or without a trash. */
function mountList({ trash }: { trash: boolean }): RenderAdminResult {
    adminConfig.entryTypes = { post: postType(trash) };
    entries.query.mockResolvedValue({
        data: [ENTRY],
        pagination: { page: 1, pages: 1, total: 1, limit: 20 },
    });
    entries.usedBy.mockResolvedValue([
        {
            sourceKind: 'entry',
            sourceType: 'page',
            sourceId: 'pg1',
            sourceTitle: 'Home',
            schemaPath: 'featured',
            instancePath: 'featured',
        },
        {
            sourceKind: 'entry',
            sourceType: 'page',
            sourceId: 'pg2',
            sourceTitle: 'About',
            schemaPath: 'related',
            instancePath: 'related',
        },
    ]);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<QueryResult<User>>(queryKeys.users.list({ limit: 'all' }), {
        data: [],
        pagination: null,
    });
    return renderAdmin(
        [
            {
                path: '/entries/$type',
                validateSearch: validateEntriesListSearch,
                component: () => <EntriesListPage type="post" />,
            },
        ],
        { url: '/entries/post', queryClient }
    );
}

const TRASH_TITLE = 'Move to trash?';
const FORCE_TITLE = 'Delete permanently?';

/**
 * Open the row's actions and choose `action`, then return the dialog titled
 * `title` it opens. A toast is a dialog too, so the modal is found by name.
 */
async function openDelete(
    page: RenderAdminResult,
    action: string,
    title: string
): Promise<HTMLElement> {
    await screen.findByText('Hello world');
    await page.user.click(screen.getAllByRole('button', { name: 'Actions' })[0]!);
    await page.user.click(await screen.findByRole('menuitem', { name: action }));
    return screen.findByRole('dialog', { name: title });
}

describe('the delete entry modal', () => {
    it('names the entry, its locales and the references that will be lost', async () => {
        const page = mountList({ trash: true });

        const dialog = await openDelete(page, 'Move to trash', TRASH_TITLE);

        expect(
            within(dialog).getByText('This post will be moved to the trash.')
        ).not.toBeNull();
        expect(within(dialog).getByText('Hello world')).not.toBeNull();
        expect(
            within(dialog).getByText('This entry has 2 locales. All of them go with it.')
        ).not.toBeNull();
        expect(
            await within(dialog).findByText(
                '2 references point at this entry and will be lost:'
            )
        ).not.toBeNull();
        expect(within(dialog).getByText(/Home/)).not.toBeNull();
        expect(within(dialog).getByText(/About/)).not.toBeNull();
        expect(entries.usedBy).toHaveBeenCalledWith({ type: 'post', id: 'e1' });
    });

    it('closes on cancel without sending a delete', async () => {
        const page = mountList({ trash: true });
        const dialog = await openDelete(page, 'Move to trash', TRASH_TITLE);

        await page.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: TRASH_TITLE })).toBeNull()
        );
        expect(entries.trash).not.toHaveBeenCalled();
        expect(entries.delete).not.toHaveBeenCalled();
    });

    it('moves the entry to the trash on confirm, then closes', async () => {
        entries.trash.mockResolvedValue(undefined);
        const page = mountList({ trash: true });
        const dialog = await openDelete(page, 'Move to trash', TRASH_TITLE);

        await page.user.click(
            within(dialog).getByRole('button', { name: 'Move to trash' })
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: TRASH_TITLE })).toBeNull()
        );
        expect(entries.trash).toHaveBeenCalledWith({ type: 'post', id: 'e1' });
        expect(entries.delete).not.toHaveBeenCalled();
        expect(await screen.findByText('Post moved to trash.')).not.toBeNull();
    });

    it('deletes the entry for good when the type has no trash', async () => {
        entries.delete.mockResolvedValue(undefined);
        const page = mountList({ trash: false });
        const dialog = await openDelete(page, 'Delete permanently', FORCE_TITLE);

        expect(within(dialog).getByText('This action cannot be undone.')).not.toBeNull();
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Delete permanently' })
        );

        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: FORCE_TITLE })).toBeNull()
        );
        expect(entries.delete).toHaveBeenCalledWith({ type: 'post', id: 'e1' });
        expect(entries.trash).not.toHaveBeenCalled();
        expect(await screen.findByText('Post permanently deleted.')).not.toBeNull();
    });

    it('stays open and shows the server’s reason when it refuses', async () => {
        entries.trash.mockRejectedValue(
            new AstromechApiError({
                id: 'err1',
                code: 'CONFLICT',
                message: 'Entry is locked by another editor',
                status: 409,
            })
        );
        const page = mountList({ trash: true });
        const dialog = await openDelete(page, 'Move to trash', TRASH_TITLE);

        await page.user.click(
            within(dialog).getByRole('button', { name: 'Move to trash' })
        );

        expect(
            await screen.findByText('Entry is locked by another editor')
        ).not.toBeNull();
        expect(screen.getByRole('dialog', { name: TRASH_TITLE })).toBe(dialog);
    });
});
