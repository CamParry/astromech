/**
 * `forms.submit` rate limiting, driven through the registered plugin method
 * with an explicit connecting address (what the HTTP transport supplies), plus
 * the window-reset and cap rules on the counter itself.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { setEmailDriver } from '@/email/registry';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import '@/transport/local/index'; // registers the plugin client (setPluginClient)
import { entriesService as localEntries } from '@/entries/service';
import {
    createPluginContext,
    getPluginIdentity,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime';
import { forms } from '@astromech/forms';
import type { FormsOptions, SubmitResult } from '@astromech/forms';
import {
    consumeRateLimit,
    resetRateLimit,
} from '../../../../plugins/forms/src/service/rate-limit';
import type { DB } from '@/database/types';
import type { EntriesService, PluginContext } from '@/types/index';

const FORM = 'forms/form';

let db: Kysely<DB>;

/** Call the registered `submit` method with the connecting address a transport would set. */
function send(clientAddress?: string): Promise<SubmitResult> {
    const identity = getPluginIdentity('forms');
    if (!identity) throw new Error('forms plugin not registered');
    const method = getPluginServiceMethods().get(identity.namespace)?.['submit'];
    if (!method) throw new Error('forms.submit not registered');
    const handler = method.handler as (
        input: unknown,
        ctx: PluginContext
    ) => Promise<SubmitResult>;
    return handler(
        { slug: 'contact', data: { name: 'Ada' } },
        createPluginContext(identity, null, clientAddress)
    );
}

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

    it('counts each address separately', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        expect((await send('1.1.1.1')).ok).toBe(true);
        expect((await send('2.2.2.2')).ok).toBe(true);
        expect((await send('1.1.1.1')).ok).toBe(false);
    });

    it('never limits a caller with no connecting address', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        for (let i = 0; i < 5; i += 1) expect((await send()).ok).toBe(true);
        expect(await submissionCount()).toBe(5);
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

    it('evicts at the cap rather than growing without bound', () => {
        const options = { limit: 1, windowMs: 60_000 };
        for (let i = 0; i < 12_000; i += 1) {
            consumeRateLimit(`10.0.${Math.floor(i / 256)}.${i % 256}`, options);
        }

        expect(globalThis.__astromechFormsRateLimit?.windows.size).toBeLessThanOrEqual(
            10_000
        );
    });
});
