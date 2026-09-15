/**
 * The password reset flow over HTTP, for an account the users service created:
 * it has no password until a reset sets one, and can then sign in.
 */

import type { EmailDriver, PluginDefinition } from '@/types/index';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ReactElement } from 'react';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usersService } from '@/app-context/services';
import { getEmailOverride } from '@/email/email-overrides';
import { setEmailDriver } from '@/email/registry';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { createHttpApp } from '@/transport/http/app';

type EmailMessage = Parameters<EmailDriver['send']>[0];

const EMAIL = 'invited@test.dev';
const PASSWORD = 'new-password-123';

let app: OpenAPIHono;
let basePath: string;
let sent: EmailMessage[];

// Better Auth binds to the database registered when it is first asked for, so
// the registry slot is cleared with each fresh database.
beforeEach(async () => {
    delete globalThis.__astromech?.auth;
    await createTestDb();
    const resolved = setupTestConfig(makeTestConfig());
    basePath = resolved.basePath;
    app = createHttpApp(resolved) as unknown as OpenAPIHono;
    sent = [];
    setEmailDriver({
        name: 'capture',
        send: async (message) => {
            sent.push(message);
        },
    });
});

async function postAuth(path: string, body: unknown): Promise<Response> {
    return app.request(`${basePath}/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('password reset for an admin-created user', () => {
    it('sets a first password through the emailed link, and the user can then sign in', async () => {
        const user = await usersService.create({
            data: { email: EMAIL, name: 'Invited', role: DEFAULT_ROLE_SLUG },
        });
        const before = await postAuth('sign-in/email', {
            email: EMAIL,
            password: PASSWORD,
        });
        expect(before.status).toBe(401);

        // The body the admin's forgot-password form sends.
        const requested = await postAuth('request-password-reset', {
            email: EMAIL,
            redirectTo: `${basePath}/reset-password`,
        });
        expect(requested.status).toBe(200);
        expect(sent.map((message) => message.to)).toEqual([EMAIL]);

        const link =
            /https?:\/\/[^"\s]+\/reset-password\/[A-Za-z0-9]+\?callbackURL=[^"\s&]+/.exec(
                sent[0]?.html ?? ''
            )?.[0];
        expect(link).toBeDefined();

        // Following the link lands on the admin's reset page with the token in
        // the query string, which is where `reset-password.tsx` reads it.
        const followed = await app.request(link ?? '');
        expect(followed.status).toBe(302);
        const landing = new URL(
            followed.headers.get('location') ?? '',
            'http://localhost'
        );
        expect(landing.pathname).toBe(`${basePath}/reset-password`);
        const token = landing.searchParams.get('token');
        expect(token).toBeTruthy();

        // The body the admin's reset-password form sends.
        const reset = await postAuth('reset-password', { token, newPassword: PASSWORD });
        expect(reset.status).toBe(200);

        const signIn = await postAuth('sign-in/email', {
            email: EMAIL,
            password: PASSWORD,
        });
        expect(signIn.status).toBe(200);
        const body = (await signIn.json()) as { user: { id: string } };
        expect(body.user.id).toBe(user.id);
    });
});

/** Stands in for the built-in reset email, so the sent HTML shows which one rendered. */
function CustomResetEmail({ url }: Record<string, unknown>): ReactElement {
    return createElement('p', null, `Custom reset: ${String(url)}`);
}

const overridingPlugin: PluginDefinition = {
    package: 'test-reset-email',
    emails: [{ name: 'password-reset', component: CustomResetEmail }],
};

describe('a plugin email override', () => {
    it('is registered with the plugins and renders the password reset email', async () => {
        const resolved = setupTestConfig({
            ...makeTestConfig(),
            plugins: [overridingPlugin],
        });
        app = createHttpApp(resolved) as unknown as OpenAPIHono;
        expect(getEmailOverride('password-reset')).toBe(CustomResetEmail);

        await usersService.create({
            data: { email: EMAIL, name: 'Invited', role: DEFAULT_ROLE_SLUG },
        });
        const requested = await postAuth('request-password-reset', {
            email: EMAIL,
            redirectTo: `${basePath}/reset-password`,
        });
        expect(requested.status).toBe(200);
        expect(sent[0]?.html).toContain('Custom reset: ');
    });

    it('is dropped when the plugins are registered again without it', () => {
        setupTestConfig({ ...makeTestConfig(), plugins: [overridingPlugin] });
        setupTestConfig(makeTestConfig());
        expect(getEmailOverride('password-reset')).toBeUndefined();
    });
});
