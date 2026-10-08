/**
 * @vitest-environment happy-dom
 *
 * The entry create page: it renders the type's own fields beside the title,
 * a publish sends a create with them and opens the new entry, Save creates
 * the status the select holds, a schedule needs a date only when the save
 * sends it, a user without publish can only save unpublished, a 422 lands on
 * the field it names and the page stays put, a user who may not create is sent
 * back to the list, and the title input is described by its error.
 */

import type { AdminEntryType, Entry } from '@/types/index';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryNewPage } from '@/admin/components/entries/entry-new-page';
import { AstromechApiError } from '@/transport/http/client';
import { renderAdmin } from '../../_support/render-admin';

const { entries, adminConfig } = vi.hoisted(() => ({
    entries: { create: vi.fn<(params: unknown) => Promise<unknown>>() },
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

// The page creates the entry through the client; everything else is real.
vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, entries },
    };
});

const POST: AdminEntryType = {
    single: 'Post',
    plural: 'Posts',
    versioning: false,
    translatable: false,
    adminColumns: [],
    fields: {
        main: [{ name: 'excerpt', type: 'text', label: 'Excerpt' }],
        sidebar: [],
    },
    url: null,
    capabilities: {
        statuses: true,
        slug: false,
        translatable: false,
        versioning: false,
        staging: false,
        trash: true,
    },
    titleField: 'title',
};

afterEach(() => {
    entries.create.mockReset();
    adminConfig.entryTypes = {};
});

function mountPage(permissions?: string[]) {
    adminConfig.entryTypes = { post: POST };
    return renderAdmin(<EntryNewPage type="post" requestedLocale={undefined} />, {
        url: '/entries/post/new',
        ...(permissions !== undefined ? { permissions } : {}),
    });
}

describe('EntryNewPage', () => {
    it('publishes the title and the type’s fields, then opens the new entry', async () => {
        entries.create.mockResolvedValue({ id: 'p1', locale: 'en' } as Entry);
        const page = mountPage();

        expect(await screen.findByText('Excerpt')).not.toBeNull();
        await page.user.type(screen.getByLabelText(/Title/), 'Hello world');
        await page.user.type(
            await screen.findByRole('textbox', { name: 'Excerpt' }),
            'A short summary'
        );
        await page.user.click(screen.getByRole('button', { name: 'Publish' }));

        await waitFor(() => expect(page.location()).toBe('/entries/post/p1?locale=en'));
        expect(entries.create).toHaveBeenCalledWith({
            type: 'post',
            data: {
                title: 'Hello world',
                fields: { excerpt: 'A short summary' },
                status: 'published',
            },
        });
        expect(await screen.findByText('Post created.')).not.toBeNull();
    });

    it('saves unpublished without publish, offering no Publish and a read-only status', async () => {
        entries.create.mockResolvedValue({ id: 'p1', locale: 'en' } as Entry);
        const page = mountPage(['entry:post:read', 'entry:post:create']);

        await page.user.type(await screen.findByLabelText(/Title/), 'Hello world');
        expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
        expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
        const select = screen.getByRole('combobox', { name: 'Status' });
        expect(select.textContent).toContain('Unpublished');
        expect(select.getAttribute('aria-readonly')).toBe('true');
        expect(
            screen.getByText('Only users who can publish can change the status.')
        ).not.toBeNull();
        await page.user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(page.location()).toBe('/entries/post/p1?locale=en'));
        expect(entries.create).toHaveBeenCalledWith({
            type: 'post',
            data: { title: 'Hello world', fields: {}, status: 'unpublished' },
        });
    });

    it('saves the status the select holds', async () => {
        entries.create.mockResolvedValue({ id: 'p1', locale: 'en' } as Entry);
        const page = mountPage();

        await page.user.type(await screen.findByLabelText(/Title/), 'Hello world');
        await page.user.click(screen.getByRole('combobox', { name: 'Status' }));
        await page.user.click(await screen.findByRole('option', { name: 'Scheduled' }));
        await page.user.type(screen.getByLabelText('Publish date'), '2027-02-01T09:00');
        await page.user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(entries.create).toHaveBeenCalledTimes(1));
        expect(entries.create).toHaveBeenCalledWith({
            type: 'post',
            data: {
                title: 'Hello world',
                fields: {},
                status: 'scheduled',
                publishedAt: new Date('2027-02-01T09:00'),
            },
        });
    });

    it('refuses a save that schedules with no date, and publishes without one', async () => {
        entries.create.mockResolvedValue({ id: 'p1', locale: 'en' } as Entry);
        const page = mountPage();

        await page.user.type(await screen.findByLabelText(/Title/), 'Hello world');
        await page.user.click(screen.getByRole('combobox', { name: 'Status' }));
        await page.user.click(await screen.findByRole('option', { name: 'Scheduled' }));
        await page.user.click(screen.getByRole('button', { name: 'Save' }));
        expect(
            await screen.findByText('Publish date is required when scheduled')
        ).not.toBeNull();
        expect(await screen.findByText('Please fix Publish date.')).not.toBeNull();
        expect(entries.create).not.toHaveBeenCalled();

        await page.user.click(screen.getByRole('button', { name: 'Publish' }));

        await waitFor(() => expect(entries.create).toHaveBeenCalledTimes(1));
        expect(entries.create).toHaveBeenCalledWith({
            type: 'post',
            data: { title: 'Hello world', fields: {}, status: 'published' },
        });
    });

    it('puts a 422 field error on the field it names and stays on the page', async () => {
        entries.create.mockRejectedValue(
            new AstromechApiError({
                id: 'e1',
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                status: 422,
                details: { fields: { excerpt: ['Excerpt is too short'] } },
            })
        );
        const page = mountPage();

        await page.user.type(await screen.findByLabelText(/Title/), 'Hello world');
        await page.user.type(
            await screen.findByRole('textbox', { name: 'Excerpt' }),
            'Hi'
        );
        await page.user.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Excerpt is too short')).not.toBeNull();
        const excerpt = await screen.findByRole('textbox', { name: 'Excerpt' });
        expect(excerpt.getAttribute('aria-invalid')).toBe('true');
        expect(page.location()).toBe('/entries/post/new');
    });

    it('sends a user who may not create back to the list, saying why', async () => {
        const page = mountPage(['entry:post:read']);

        await waitFor(() => expect(page.location()).toBe('/entries/post'));
        expect(
            await screen.findByText("You don't have permission to access this page.")
        ).not.toBeNull();
    });

    it('describes the title input by its error', async () => {
        const page = mountPage();

        const title = await screen.findByLabelText(/Title/);
        await page.user.type(title, 'A');
        await page.user.clear(title);

        const message = await screen.findByText('Title is required');
        expect(title.getAttribute('aria-invalid')).toBe('true');
        expect(title.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
    });
});
