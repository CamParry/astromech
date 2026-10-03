/**
 * `forms.submit` rate limiting, driven over HTTP with the connecting address in
 * `x-forwarded-for` (the site trusts one proxy). The count is kept in the
 * plugin's own table, per address and form, so every app instance shares it.
 */

import type { FormsOptions, SubmitResult } from '../src/index';
import type { PluginTestApp } from '@tests/plugin-app';
import { makeTestConfig, resetRuntime, setupTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { createHttpApp } from '@/transport/http/app';
import { forms } from '../src/index';
import { createSubmissionsRepository } from '../src/repository';

const FORM = 'forms/form';

/** Sends a request to an app's API, as `PluginTestApp.request` does. */
type Send = PluginTestApp<'forms'>['request'];

let app: PluginTestApp<'forms'>;

/**
 * Submit the form at `slug` over `send` (the test app by default), with
 * `forwardedFor` as the `x-forwarded-for` the proxy hands on when one is given.
 */
async function submit(
    forwardedFor?: string,
    { slug = 'contact', send = app.request }: { slug?: string; send?: Send } = {}
): Promise<SubmitResult> {
    const response = await send('POST', '/plugins/forms/submit', {
        body: { slug, data: { name: 'Ada' } },
        headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
    });
    return (await response.json()) as SubmitResult;
}

/** The site config the tests run, with `options` for the plugin. */
function siteConfig(options?: FormsOptions) {
    return {
        ...makeTestConfig(),
        security: { trustProxy: true },
        plugins: [forms(options)],
    };
}

async function setup(options?: FormsOptions): Promise<void> {
    app = await createPluginTestApp('forms', siteConfig(options));
    for (const slug of ['contact', 'feedback']) {
        await app.entries.create({
            type: FORM,
            data: {
                title: slug,
                slug,
                status: 'published',
                fields: {
                    enabled: true,
                    fields: [{ _type: 'text', _id: 'b1', name: 'name', label: 'Name' }],
                },
            },
        });
    }
}

async function submissionCount(): Promise<number> {
    return createSubmissionsRepository(app.db).count();
}

/** The addresses the rate limit table holds a row for. */
async function countedAddresses(): Promise<string[]> {
    const rows = await app.db
        .selectFrom('pluginFormsRateLimits')
        .select('address')
        .orderBy('address')
        .execute();
    return rows.map((row) => row.address);
}

const TOO_MANY = 'Too many submissions — please try again shortly';

describe('forms.submit rate limit', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('accepts submissions up to the limit', async () => {
        await setup({ rateLimit: { limit: 2, windowMs: 60_000 } });

        expect((await submit('1.1.1.1')).ok).toBe(true);
        expect((await submit('1.1.1.1')).ok).toBe(true);
        expect(await submissionCount()).toBe(2);
    });

    it('rejects the submission past the limit, persisting nothing', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        expect((await submit('1.1.1.1')).ok).toBe(true);
        expect(await submit('1.1.1.1')).toEqual({
            ok: false,
            errors: { _form: [TOO_MANY] },
        });
        expect(await submissionCount()).toBe(1);
    });

    it('counts each address separately', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        expect((await submit('1.1.1.1')).ok).toBe(true);
        expect((await submit('2.2.2.2')).ok).toBe(true);
        expect((await submit('1.1.1.1')).ok).toBe(false);
    });

    it('counts each form separately', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        expect((await submit('1.1.1.1', { slug: 'contact' })).ok).toBe(true);
        expect((await submit('1.1.1.1', { slug: 'feedback' })).ok).toBe(true);
        expect((await submit('1.1.1.1', { slug: 'contact' })).ok).toBe(false);
    });

    it('counts the address the proxy vouches for, whatever the client put before it', async () => {
        await setup({ rateLimit: { limit: 2, windowMs: 60_000 } });

        expect((await submit('198.51.100.1, 1.1.1.1')).ok).toBe(true);
        expect((await submit('198.51.100.2, 1.1.1.1')).ok).toBe(true);
        expect((await submit('198.51.100.3, 1.1.1.1')).ok).toBe(false);
    });

    it('shares the count between app instances on one database', async () => {
        const options = { rateLimit: { limit: 2, windowMs: 60_000 } };
        await setup(options);
        expect((await submit('1.1.1.1')).ok).toBe(true);
        expect((await submit('1.1.1.1')).ok).toBe(true);

        // A second instance on the same database: fresh registries and a new
        // HTTP app, as another process or Workers isolate builds them.
        const driver = getDatabaseDriverOrThrow();
        resetRuntime();
        const resolved = setupTestConfig({ ...siteConfig(options), db: driver });
        const second = createHttpApp(resolved);
        const sendToSecond: Send = (method, path, init = {}) =>
            Promise.resolve(
                second.request(`${resolved.basePath}/api${path}`, {
                    method,
                    headers: { 'Content-Type': 'application/json', ...init.headers },
                    body: JSON.stringify(init.body),
                })
            );

        expect(await submit('1.1.1.1', { send: sendToSecond })).toEqual({
            ok: false,
            errors: { _form: [TOO_MANY] },
        });
        expect((await submit('2.2.2.2', { send: sendToSecond })).ok).toBe(true);
    });

    it('starts a fresh window once the old one has elapsed, and deletes elapsed counts', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });
        expect((await submit('1.1.1.1')).ok).toBe(true);
        expect((await submit('2.2.2.2')).ok).toBe(true);
        expect((await submit('1.1.1.1')).ok).toBe(false);

        vi.setSystemTime(new Date('2026-01-01T00:00:59.999Z'));
        expect((await submit('1.1.1.1')).ok).toBe(false);

        vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
        expect((await submit('1.1.1.1')).ok).toBe(true);
        expect(await countedAddresses()).toEqual(['1.1.1.1']);
    });

    it('never limits a caller with no connecting address', async () => {
        await setup({ rateLimit: { limit: 1, windowMs: 60_000 } });

        for (let i = 0; i < 5; i += 1) expect((await submit()).ok).toBe(true);
        expect(await submissionCount()).toBe(5);
        expect(await countedAddresses()).toEqual([]);
    });

    it('does not limit when `rateLimit` is false', async () => {
        await setup({ rateLimit: false });

        for (let i = 0; i < 25; i += 1) expect((await submit('1.1.1.1')).ok).toBe(true);
        expect(await submissionCount()).toBe(25);
        expect(await countedAddresses()).toEqual([]);
    });
});
