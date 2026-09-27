/**
 * The `scheduled-publish` job: every due scheduled row goes live, entries and
 * globals alike.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { systemAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { scheduledPublishJob } from '@/content/jobs/scheduled-publish';
import { globalRepository } from '@/globals/repository';
import { makeGlobalsConfig } from '../../globals/globals-config';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

describe('scheduledPublishJob', () => {
    it('publishes a due scheduled entry and a due scheduled global', async () => {
        const past = new Date(Date.now() - 60_000);
        const entry = await currentServices.entries.create({
            type: 'post',
            data: { title: 'Due', status: 'scheduled', publishedAt: past },
        });
        await globalRepository.create(
            { key: 'legal' },
            { fields: { terms: 'Terms' }, status: 'scheduled', publishedAt: past }
        );

        await scheduledPublishJob.handler(systemAppContext());

        const liveEntry = await currentServices.entries.get({
            type: 'post',
            id: entry.id,
            full: true,
        });
        expect(liveEntry?.status).toBe('published');
        expect((await globalRepository.findByKey('legal'))?.status).toBe('published');
        expect(await currentServices.globals.get({ key: 'legal' })).not.toBeNull();
    });
});
