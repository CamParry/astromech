/**
 * @vitest-environment happy-dom
 *
 * The modal the entry create page opens for a non-default locale. It offers
 * the default-locale entries as sources, and each choice makes its own
 * request: a translation updates the chosen entry in the new locale and opens
 * it, a blank row joins the chosen entry on save, and a standalone entry is a
 * create in that locale. Cancel returns to the list; a refusal is shown and
 * the modal stays open.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type { AdminEntryType, Entry } from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryNewPage } from '@/admin/components/entries/entry-new-page';
import { AstromechApiError } from '@/transport/http/client';
import { renderAdmin } from '../../_support/render-admin';

const { entries, adminConfig } = vi.hoisted(() => ({
    entries: {
        query: vi.fn<(params: unknown) => Promise<unknown>>(),
        create: vi.fn<(params: unknown) => Promise<unknown>>(),
        update: vi.fn<(params: unknown) => Promise<unknown>>(),
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

/** A translatable type without statuses, so the page saves with one button. */
const POST: AdminEntryType = {
    single: 'Post',
    plural: 'Posts',
    versioning: false,
    translatable: true,
    slug: null,
    adminColumns: [],
    fields: { main: [], sidebar: [] },
    url: null,
    capabilities: {
        statuses: false,
        slug: false,
        translatable: true,
        versioning: false,
        staging: false,
        trash: true,
    },
    titleField: 'title',
};

const TITLE = 'Create in FR';

function makeEntry(id: string, title: string, locales: string[]): Entry {
    return {
        id,
        type: 'post',
        locale: 'en',
        locales,
        title,
        status: 'published',
        fields: {},
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as Entry;
}

afterEach(() => {
    for (const fn of Object.values(entries)) fn.mockReset();
    adminConfig.entryTypes = {};
});

/** Mount the create page in French over these English entries; return the modal. */
async function mountInFrench(
    sources: Entry[]
): Promise<{ page: RenderAdminResult; modal: HTMLElement }> {
    adminConfig.entryTypes = { post: POST };
    entries.query.mockResolvedValue({
        data: sources,
        pagination: { page: 1, pages: 1, total: sources.length, limit: 0 },
    });
    const page = renderAdmin(<EntryNewPage type="post" requestedLocale="fr" />, {
        url: '/entries/post/new?locale=fr',
    });
    const modal = await screen.findByRole('dialog', { name: TITLE });
    return { page, modal };
}

/** Choose `mode`, then pick the source entry titled `title` from the picker. */
async function chooseSource(
    page: RenderAdminResult,
    modal: HTMLElement,
    mode: string,
    title: string
): Promise<void> {
    await page.user.click(within(modal).getByRole('radio', { name: new RegExp(mode) }));
    await page.user.click(within(modal).getByRole('combobox'));
    await page.user.click(await screen.findByRole('option', { name: title }));
}

/** The modal's proceed button. */
function continueButton(modal: HTMLElement): HTMLElement {
    return within(modal).getByRole('button', { name: 'Continue' });
}

/** The source entries the picker offers, by label. */
async function pickerOptions(page: RenderAdminResult, modal: HTMLElement) {
    await page.user.click(
        within(modal).getByRole('radio', { name: /Translate an existing entry/ })
    );
    await page.user.click(within(modal).getByRole('combobox'));
    await screen.findAllByRole('option');
    return screen.getAllByRole('option').map((option) => option.textContent);
}

describe('the create-in-locale modal', () => {
    it('offers the default-locale entries as sources', async () => {
        const { page, modal } = await mountInFrench([
            makeEntry('e1', 'Hello', ['en']),
            makeEntry('e2', 'Goodbye', ['en']),
        ]);

        expect(await pickerOptions(page, modal)).toEqual(['Hello', 'Goodbye']);
        expect(entries.query).toHaveBeenCalledWith({
            type: 'post',
            locale: 'en',
            limit: 'all',
        });
    });

    // Choosing an entry that already has the locale would send `update` over
    // that locale's existing row instead of adding one.
    it('leaves out entries that already have the requested locale', async () => {
        const { page, modal } = await mountInFrench([
            makeEntry('e1', 'Hello', ['en']),
            makeEntry('e2', 'Already French', ['en', 'fr']),
        ]);

        expect(await pickerOptions(page, modal)).toEqual(['Hello']);
    });

    it('labels the proceed button "Continue"', async () => {
        const { modal } = await mountInFrench([makeEntry('e1', 'Hello', ['en'])]);

        expect(within(modal).getByRole('button', { name: 'Continue' })).not.toBeNull();
    });

    it('translates the chosen entry into the locale and opens it', async () => {
        entries.update.mockResolvedValue({ id: 'e1', locale: 'fr' });
        const { page, modal } = await mountInFrench([makeEntry('e1', 'Hello', ['en'])]);

        await chooseSource(page, modal, 'Translate an existing entry', 'Hello');
        await page.user.click(continueButton(modal));

        await waitFor(() => expect(page.location()).toBe('/entries/post/e1?locale=fr'));
        expect(entries.update).toHaveBeenCalledWith({
            type: 'post',
            id: 'e1',
            locale: 'fr',
            data: {},
        });
        expect(entries.create).not.toHaveBeenCalled();
        expect(await screen.findByText('Post created.')).not.toBeNull();
    });

    it('adds a blank locale to the chosen entry when the form is saved', async () => {
        entries.update.mockResolvedValue({ id: 'e1', locale: 'fr' });
        const { page, modal } = await mountInFrench([makeEntry('e1', 'Hello', ['en'])]);

        await chooseSource(page, modal, 'Start blank in this locale', 'Hello');
        await page.user.click(continueButton(modal));
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull()
        );
        await page.user.type(screen.getByLabelText(/Title/), 'Bonjour');
        await page.user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(page.location()).toBe('/entries/post/e1?locale=fr'));
        expect(entries.update).toHaveBeenCalledWith({
            type: 'post',
            id: 'e1',
            locale: 'fr',
            data: { title: 'Bonjour', fields: {} },
        });
        expect(entries.create).not.toHaveBeenCalled();
    });

    it('creates a standalone entry in the locale', async () => {
        entries.create.mockResolvedValue({ id: 'n1', locale: 'fr' });
        const { page, modal } = await mountInFrench([makeEntry('e1', 'Hello', ['en'])]);

        await page.user.click(
            within(modal).getByRole('radio', { name: /Create a new standalone entry/ })
        );
        await page.user.click(continueButton(modal));
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull()
        );
        await page.user.type(screen.getByLabelText(/Title/), 'Bonjour');
        await page.user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(page.location()).toBe('/entries/post/n1?locale=fr'));
        expect(entries.create).toHaveBeenCalledWith({
            type: 'post',
            data: { title: 'Bonjour', fields: {}, locale: 'fr' },
        });
        expect(entries.update).not.toHaveBeenCalled();
    });

    it('returns to the list on cancel without writing', async () => {
        const { page, modal } = await mountInFrench([makeEntry('e1', 'Hello', ['en'])]);

        await page.user.click(within(modal).getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(page.location()).toBe('/entries/post'));
        expect(entries.create).not.toHaveBeenCalled();
        expect(entries.update).not.toHaveBeenCalled();
    });

    it('shows the server’s reason and stays open when a translation is refused', async () => {
        entries.update.mockRejectedValue(
            new AstromechApiError({
                id: 'err1',
                code: 'CONFLICT',
                message: 'This entry already has a French version',
                status: 409,
            })
        );
        const { page, modal } = await mountInFrench([makeEntry('e1', 'Hello', ['en'])]);

        await chooseSource(page, modal, 'Translate an existing entry', 'Hello');
        await page.user.click(continueButton(modal));

        expect(
            await screen.findByText('This entry already has a French version')
        ).not.toBeNull();
        expect(screen.getByRole('dialog', { name: TITLE })).toBe(modal);
        expect(page.location()).toBe('/entries/post/new?locale=fr');
    });
});
