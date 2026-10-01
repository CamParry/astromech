/**
 * `forms.submit` rate limiting, driven over HTTP with the connecting address in
 * `x-forwarded-for` (the site trusts one proxy), plus the window-reset and cap
 * rules on the counter itself.
 */

import type { FormsOptions, SubmitResult } from '../src/index';
import type { PluginTestApp } from '@tests/plugin-app';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forms } from '../src/index';
import { createSubmissionsRepository } from '../src/repository';
import { consumeRateLimit, resetRateLimit } from '../src/service/rate-limit';

const FORM = 'forms/form';

let app: PluginTestApp<'forms'>;

/** Submit the contact form over HTTP, from `clientAddress` when one is given. */
async function send(clientAddress?: string): Promise<SubmitResult> {
    const response = await app.request('POST', '/plugins/forms/submit', {
        body: { slug: 'contact', data: { name: 'Ada' } },
        headers: clientAddress === undefined ? {} : { 'x-forwarded-for': clientAddress },
    });
    return (await response.json()) as SubmitResult;
}

async function setup(options?: FormsOptions): Promise<void> {
    resetRateLimit();
    app = await createPluginTestApp('forms', {
        ...makeTestConfig(),
        security: { trustProxy: true },
        plugins: [forms(options)],
    });
    await app.entries.create({
        type: FORM,
        data: {
            title: 'Contact',
            slug: 'contact',
            status: 'published',
            fields: {
                enabled: true,
                fields: [{ _type: 'text', _id: 'b1', name: 'name', label: 'Name' }],
            },
        },
    });
}

async function submissionCount(): Promise<number> {
    return createSubmissionsRepository(app.db).count();
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
