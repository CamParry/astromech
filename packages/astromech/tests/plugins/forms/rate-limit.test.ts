/**
 * `forms.submit` rate limiting, end to end through the registered plugin, plus
 * the window-reset rule on the counter itself (fake system time, so the test
 * does not wait out a real window).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { setEmailDriver } from '@/email/registry';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import '@/transport/local/index'; // registers the plugin client (setPluginClient)
import { localPlugins } from '@/transport/local/plugins';
import { entriesService as localEntries } from '@/entries/service';
import { forms } from '@astromech/forms';
import type { FormsOptions, SubmitResult } from '@astromech/forms';
import {
    consumeRateLimit,
    resetRateLimit,
} from '../../../../plugins/forms/src/service/rate-limit';
import type { DB } from '@/database/types';
import type { EntriesService } from '@/types/index';

const FORM = 'forms/form';

let db: Kysely<DB>;

type FormsService = Record<string, (input?: unknown) => Promise<unknown>>;

const submit = (input: {
    slug: string;
    data: Record<string, unknown>;
    meta?: { ip?: string };
}): Promise<SubmitResult> => {
    const service = localPlugins['forms'] as unknown as FormsService | undefined;
    const fn = service?.['submit'];
    if (!fn) throw new Error('forms.submit not registered');
    return fn(input) as Promise<SubmitResult>;
};

async function setup(options?: FormsOptions): Promise<void> {
    resetRateLimit();
    db = await createTestDb();
    setEmailDriver({ name: 'test-noop', send: async () => undefined });
    setupTestConfig({ ...makeTestConfig(), plugins: [forms(options)] });
    await (localEntries as unknown as EntriesService).create({
        type: FORM,
        title: 'Contact',
        slug: 'contact',
        status: 'published',
        fields: {
            enabled: true,
            fields: [{ _type: 'text', _id: 'b1', name: 'name', label: 'Name' }],
        },
    });
}

async function submissionCount(): Promise<number> {
    const { rows } = await sql`SELECT * FROM plugin_forms_submissions`.execute(db);
    return rows.length;
}

const send = (ip?: string): Promise<SubmitResult> =>
    submit({
        slug: 'contact',
        data: { name: 'Ada' },
        ...(ip === undefined ? {} : { meta: { ip } }),
    });

const TOO_MANY = 'Too many submissions — please try again shortly';

describe('forms.submit rate limit', () => {
    afterEach(() => {
        resetRateLimit();
    });

    it('accepts submissions up to the limit', async () => {
        await setup({ rateLimit: { limit: 2, windowMs: 60_000 } });

        expect((await send('1.1.1.1')).ok).toBe(true);
        expect((await send('1.1.1.1')).ok).toBe(true);
        expect(await submissionCount()).toBe(2);
    });

    it('rejects the submission past the limit, persisting nothing', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        expect((await send('1.1.1.1')).ok).toBe(true);
        expect(await send('1.1.1.1')).toEqual({
            ok: false,
            errors: { _form: [TOO_MANY] },
        });
        expect(await submissionCount()).toBe(1);
    });

    it('counts each ip separately', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        expect((await send('1.1.1.1')).ok).toBe(true);
        expect((await send('2.2.2.2')).ok).toBe(true);
        expect((await send('1.1.1.1')).ok).toBe(false);
    });

    it('shares one bucket across submissions carrying no ip', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        expect((await send()).ok).toBe(true);
        expect(await send()).toEqual({ ok: false, errors: { _form: [TOO_MANY] } });
    });

    it('does not limit when `rateLimit` is false', async () => {
        await setup({ rateLimit: false });

        for (let i = 0; i < 25; i += 1) expect((await send('1.1.1.1')).ok).toBe(true);
        expect(await submissionCount()).toBe(25);
    });
});

describe('consumeRateLimit', () => {
    afterEach(() => {
        resetRateLimit();
        vi.useRealTimers();
    });

    beforeEach(() => {
        resetRateLimit();
    });

    it('starts a fresh window once the old one has elapsed', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const options = { limit: 2, windowMs: 60_000 };

        expect(consumeRateLimit('1.1.1.1', options)).toBe(true);
        expect(consumeRateLimit('1.1.1.1', options)).toBe(true);
        expect(consumeRateLimit('1.1.1.1', options)).toBe(false);

        vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
        expect(consumeRateLimit('1.1.1.1', options)).toBe(true);
    });
});
