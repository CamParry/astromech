/**
 * The Backups admin page: it lists the runs the server returns, runs a backup
 * on demand, links each stored backup to its download route, and deletes or
 * restores one only after the user confirms. Restore streams, so it posts with
 * a raw `fetch` rather than through the plugin's client.
 */

import type { RenderAdminResult } from '../../../../admin/tests/_support/render-admin';
import type { BackupRun, ListRunsResult } from '../../src/service/backups';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPluginPage } from '../../../../admin/tests/_support/render-admin';
import BackupsPage from '../../src/admin/pages/backups-page';
import en from '../../src/locales/en.json';

const { backups } = vi.hoisted(() => ({
    backups: {
        list: vi.fn<() => Promise<unknown>>(),
        run: vi.fn<() => Promise<unknown>>(),
        delete: vi.fn<(input: { id: string }) => Promise<unknown>>(),
    },
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, plugins: { backups } },
    };
});

afterEach(() => {
    backups.list.mockReset();
    backups.run.mockReset();
    backups.delete.mockReset();
    vi.unstubAllGlobals();
});

function backupRun(overrides: Partial<BackupRun> & Pick<BackupRun, 'id'>): BackupRun {
    return {
        key: `backups/${overrides.id}.sql.gz`,
        status: 'success',
        trigger: 'scheduled',
        sizeBytes: 1536,
        error: null,
        startedAt: new Date('2026-09-01T03:00:00Z'),
        finishedAt: new Date('2026-09-01T03:00:05Z'),
        artifactDeletedAt: null,
        ...overrides,
    };
}

function listing(runs: BackupRun[]): ListRunsResult {
    return { runs, capabilities: { canDump: true, canRestore: true } };
}

function renderPage(): RenderAdminResult {
    return renderPluginPage(<BackupsPage />, {
        plugin: {
            namespace: 'backups',
            serviceKey: 'backups',
            permissionNamespace: 'backups',
        },
        translations: en,
    });
}

/** The table row holding `text`, once the list has loaded. */
async function findRow(text: string): Promise<HTMLElement> {
    const cell = await screen.findByRole('cell', { name: text });
    const row = cell.closest('tr');
    if (row === null) throw new Error(`no row holds "${text}"`);
    return row;
}

describe('BackupsPage', () => {
    it('lists the runs the server returns', async () => {
        backups.list.mockResolvedValue(
            listing([
                backupRun({ id: 'run_1' }),
                backupRun({
                    id: 'run_2',
                    status: 'failed',
                    trigger: 'manual',
                    key: null,
                    // The run has a size, but no stored file, so the page hides it.
                    sizeBytes: 1536,
                }),
            ])
        );
        renderPage();

        const stored = await findRow('Scheduled');
        expect(within(stored).getByText('Success')).not.toBeNull();
        expect(within(stored).getByRole('cell', { name: '1.5 KB' })).not.toBeNull();

        const failed = await findRow('Manual');
        expect(within(failed).getByText('Failed')).not.toBeNull();
        expect(within(failed).getByRole('cell', { name: '—' })).not.toBeNull();
        expect(within(failed).queryByRole('link', { name: 'Download' })).toBeNull();
    });

    it('says so when there are no backups', async () => {
        backups.list.mockResolvedValue(listing([]));
        renderPage();

        expect(
            await screen.findByText('No backups yet. Run one to get started.')
        ).not.toBeNull();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('runs a backup and shows the new run', async () => {
        const manual = backupRun({ id: 'run_new', trigger: 'manual' });
        backups.list
            .mockResolvedValueOnce(listing([]))
            .mockResolvedValue(listing([manual]));
        backups.run.mockResolvedValue({ ok: true, run: manual });
        const { user } = renderPage();

        await screen.findByText('No backups yet. Run one to get started.');
        await user.click(screen.getByRole('button', { name: 'Run now' }));

        const row = await findRow('Manual');
        expect(within(row).getByText('Success')).not.toBeNull();
        expect(backups.run).toHaveBeenCalledTimes(1);
    });

    it('links a stored backup to its download route', async () => {
        backups.list.mockResolvedValue(listing([backupRun({ id: 'run_1' })]));
        renderPage();

        const link = await screen.findByRole('link', { name: 'Download' });
        expect(link.getAttribute('href')).toBe(
            '/cms/api/plugins/backups/runs/run_1/download'
        );
    });

    it('deletes a backup only after the user confirms', async () => {
        backups.list
            .mockResolvedValueOnce(listing([backupRun({ id: 'run_1' })]))
            .mockResolvedValue(listing([]));
        backups.delete.mockResolvedValue({ ok: true, id: 'run_1' });
        const { user } = renderPage();

        const row = await findRow('Scheduled');
        await user.click(within(row).getByRole('button', { name: 'Delete' }));
        const dialog = await screen.findByRole('alertdialog', {
            name: 'Delete this backup?',
        });
        expect(
            within(dialog).getByText(
                'The backup artifact will be permanently deleted. This cannot be undone.'
            )
        ).not.toBeNull();
        expect(backups.delete).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

        expect(await screen.findByText('Backup deleted.')).not.toBeNull();
        expect(backups.delete).toHaveBeenCalledWith({ id: 'run_1' });
        expect(
            await screen.findByText('No backups yet. Run one to get started.')
        ).not.toBeNull();
    });

    it('restores a backup with a POST to its restore route after the user confirms', async () => {
        backups.list.mockResolvedValue(listing([backupRun({ id: 'run_1' })]));
        const restoreUrl = '/cms/api/plugins/backups/runs/run_1/restore';
        const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
            if (input !== restoreUrl)
                throw new Error(`unmocked request: ${String(input)}`);
            return new Response(null, { status: 204 });
        });
        vi.stubGlobal('fetch', fetch);
        const { user } = renderPage();

        const row = await findRow('Scheduled');
        await user.click(within(row).getByRole('button', { name: 'Restore' }));
        const dialog = await screen.findByRole('alertdialog', {
            name: 'Restore this backup?',
        });
        expect(fetch).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

        expect(
            await screen.findByText(
                'Restore complete. Everyone has been signed out, so sign in again to continue.'
            )
        ).not.toBeNull();
        expect(fetch.mock.calls).toEqual([
            [restoreUrl, { credentials: 'include', method: 'POST' }],
        ]);
        await waitFor(() => {
            expect(
                screen.queryByRole('alertdialog', { name: 'Restore this backup?' })
            ).toBeNull();
        });
    });

    it('shows why a restore failed', async () => {
        backups.list.mockResolvedValue(listing([backupRun({ id: 'run_1' })]));
        const reason =
            'the backup records a migration this site does not have (9999_later): ' +
            'restore it with the code and plugins that wrote it';
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof globalThis.fetch>(async () =>
                Response.json({ error: reason }, { status: 500 })
            )
        );
        const { user } = renderPage();

        const row = await findRow('Scheduled');
        await user.click(within(row).getByRole('button', { name: 'Restore' }));
        const dialog = await screen.findByRole('alertdialog', {
            name: 'Restore this backup?',
        });
        await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

        expect(await screen.findByText(`Restore failed: ${reason}`)).not.toBeNull();
    });
});
