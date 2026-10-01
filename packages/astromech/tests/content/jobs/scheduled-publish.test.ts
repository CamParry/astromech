/**
 * The `scheduled-publish` job: every due scheduled row goes live through the
 * update path, entries and globals alike, keeping the date it was scheduled for.
 */

import type { PluginHooks } from '@/types/index';
import { expectConsole } from '@tests/console';
import { createTestDb, registerTestPlugins, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { systemAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { scheduledPublishJob } from '@/content/jobs/scheduled-publish';
import { globalRepository } from '@/globals/repository';
import { defineHook } from '@/plugins/define-hook';
import { makeGlobalsConfig } from '../../globals/globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

/** Register a probe plugin's hooks against the live runtime. */
function probe(hooks: PluginHooks): void {
    const resolved = setupTestConfig(makeGlobalsConfig());
    registerTestPlugins([{ package: '@test/probe', hooks }], resolved);
}

/** An entry of `post` scheduled for `publishedAt`. */
async function scheduledPost(title: string, publishedAt: Date) {
    return currentServices.entries.create({
        type: 'post',
        data: { title, status: 'scheduled', publishedAt },
    });
}

/** The stored status of a `post`, whatever its visibility. */
async function postStatus(id: string): Promise<string | undefined> {
    return (await currentServices.entries.get({ type: 'post', id, full: true }))?.status;
}

describe('scheduledPublishJob', () => {
    it('publishes a due scheduled entry and a due scheduled global', async () => {
        const past = new Date(Date.now() - 60_000);
        const entry = await scheduledPost('Due', past);
        await globalRepository.create(
            { key: 'legal' },
            { fields: { terms: 'Terms' }, status: 'scheduled', publishedAt: past }
        );

        await scheduledPublishJob.handler(systemAppContext());

        expect(await postStatus(entry.id)).toBe('published');
        expect((await globalRepository.findByKey('legal'))?.status).toBe('published');
        expect(await currentServices.globals.get({ key: 'legal' })).not.toBeNull();
    });

    it('leaves a row that is not yet due scheduled', async () => {
        const entry = await scheduledPost('Later', new Date(Date.now() + 60_000));

        await scheduledPublishJob.handler(systemAppContext());

        expect(await postStatus(entry.id)).toBe('scheduled');
    });

    it('fires the entry and global update hooks as each row goes live', async () => {
        const past = new Date(Date.now() - 60_000);
        const seen: string[] = [];
        probe([
            defineHook('entry:beforeUpdate', (ctx) => {
                seen.push(`entry before ${ctx.data.status ?? 'none'}`);
            }),
            defineHook('entry:afterUpdate', (ctx) => {
                seen.push(`entry after ${ctx.data.status ?? 'none'}`);
            }),
            defineHook('global:beforeUpdate', (ctx) => {
                seen.push(`global before ${ctx.data.status ?? 'none'}`);
            }),
            defineHook('global:afterUpdate', (ctx) => {
                seen.push(`global after ${ctx.data.status ?? 'none'}`);
            }),
        ]);
        await scheduledPost('Due', past);
        await globalRepository.create(
            { key: 'legal' },
            { fields: { terms: 'Terms' }, status: 'scheduled', publishedAt: past }
        );

        await scheduledPublishJob.handler(systemAppContext());

        expect(seen).toEqual([
            'entry before published',
            'entry after published',
            'global before published',
            'global after published',
        ]);
    });

    it('keeps the date each row was scheduled for', async () => {
        const scheduledFor = new Date(Date.now() - 5 * 60_000);
        const entry = await scheduledPost('Due', scheduledFor);
        await globalRepository.create(
            { key: 'legal' },
            {
                fields: { terms: 'Terms' },
                status: 'scheduled',
                publishedAt: scheduledFor,
            }
        );

        await scheduledPublishJob.handler(systemAppContext());

        const live = await currentServices.entries.get({
            type: 'post',
            id: entry.id,
            full: true,
        });
        expect(live?.publishedAt?.getTime()).toBe(scheduledFor.getTime());
        expect((await globalRepository.findByKey('legal'))?.publishedAt?.getTime()).toBe(
            scheduledFor.getTime()
        );
    });

    it('publishes the valid rows when another fails validation, and logs the failure', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const past = new Date(Date.now() - 60_000);
        // `announcement` requires a headline, which this row lacks.
        await globalRepository.create(
            { key: 'announcement' },
            { fields: {}, status: 'scheduled', publishedAt: past }
        );
        await globalRepository.create(
            { key: 'legal' },
            { fields: { terms: 'Terms' }, status: 'scheduled', publishedAt: past }
        );
        const entry = await scheduledPost('Due', past);

        await scheduledPublishJob.handler(systemAppContext());

        expect((await globalRepository.findByKey('announcement'))?.status).toBe(
            'scheduled'
        );
        expect((await globalRepository.findByKey('legal'))?.status).toBe('published');
        expect(await postStatus(entry.id)).toBe('published');
        expect(logged.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
            'announcement'
        );
    });

    it('publishes the other entries when a hook throws for one', async () => {
        const past = new Date(Date.now() - 60_000);
        const blocked = await scheduledPost('Blocked', past);
        const due = await scheduledPost('Due', past);
        expectConsole(
            'error',
            `entry post/${blocked.id} (en) stays scheduled. Error: blocked`
        );
        probe([
            defineHook('entry:beforeUpdate', (ctx) => {
                if (ctx.entry.id === blocked.id) throw new Error('blocked');
            }),
        ]);

        await scheduledPublishJob.handler(systemAppContext());

        expect(await postStatus(blocked.id)).toBe('scheduled');
        expect(await postStatus(due.id)).toBe('published');
    });
});
