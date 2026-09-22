/**
 * Better Auth, wired to Astromech's user, session, account and verification
 * tables. It builds on first ask, so the config and database driver registries
 * must already be filled; the built instance is held in a registry.
 */

import type { Auth, BetterAuthOptions } from 'better-auth';
import { APIError, betterAuth } from 'better-auth';
import { SIGN_UP_CLOSED } from '@/auth/setup';
import { getConfig } from '@/config/registry';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { resolveEnv, resolveNodeEnv } from '@/env';
import { AstromechError } from '@/errors/astromech-error';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { createRegistry } from '@/registry';
import { log } from '@/utilities/log';

const authRegistry = createRegistry<Auth<BetterAuthOptions>>('auth', {
    required: false,
});

/** Better Auth for this process, built on first ask. */
export function getAuth(): Auth<BetterAuthOptions> {
    const existing = authRegistry.get();
    if (existing) return existing;
    const auth = buildAuth();
    authRegistry.set(auth);
    return auth;
}

/**
 * Refuse to serve without `BETTER_AUTH_SECRET` outside development and tests.
 * Without it Better Auth signs sessions with its built-in secret, which is
 * public, and only refuses that when `NODE_ENV` is `production`, which a
 * Worker never sets.
 */
export function assertAuthSecret(): void {
    if (resolveNodeEnv() !== 'production') return;
    if (resolveEnv('BETTER_AUTH_SECRET') !== undefined) return;
    throw new AstromechError(
        'Astromech requires missing env var: BETTER_AUTH_SECRET. It signs sessions. ' +
            'Generate one with `openssl rand -base64 32` and set it in your environment ' +
            'or .env file, or on Cloudflare Workers with `wrangler secret put BETTER_AUTH_SECRET`.'
    );
}

/** Configure Better Auth against the registered config and database driver. */
function buildAuth(): Auth<BetterAuthOptions> {
    const { basePath } = getConfig();
    return betterAuth({
        // Read here rather than left to Better Auth, which reads `process.env`
        // only, so a Worker's secret arrives from the env source it registers.
        secret: resolveEnv('BETTER_AUTH_SECRET'),
        baseURL: resolveEnv('BETTER_AUTH_URL'),
        basePath: `${basePath}/api/auth`,
        // Better Auth queries through the app's Kysely instance, so one Kysely
        // lock covers auth and app queries. A second instance's write fails with
        // SQLITE_BUSY on a local file while an app transaction is open.
        // `withoutPlugins()` because Better Auth names its own snake_case
        // columns and reads rows by those names, which `CamelCasePlugin` would
        // rename. No `transaction` option is passed: D1 has no interactive
        // transactions, and a Better Auth transaction would hold the lock, so
        // an app query made inside one of its hooks would wait forever.
        database: {
            db: getDatabaseDriverOrThrow().getInstance().withoutPlugins(),
            type: 'sqlite',
        },
        databaseHooks: {
            user: {
                create: {
                    // Every account is written by first-run setup or by the
                    // users service, and neither runs this hook, so Better
                    // Auth's own sign-up is refused whatever the database holds.
                    before: () => {
                        throw new APIError('FORBIDDEN', SIGN_UP_CLOSED);
                    },
                },
            },
        },
        user: {
            modelName: 'users',
            fields: {
                emailVerified: 'email_verified',
                createdAt: 'created_at',
                updatedAt: 'updated_at',
            },
            additionalFields: {
                // better-auth reads the role off the user row a session names,
                // so the column is declared here. `input: false` keeps it off
                // every better-auth write path.
                role: {
                    type: 'string',
                    input: false,
                    defaultValue: DEFAULT_ROLE_SLUG,
                },
            },
        },
        session: {
            modelName: 'sessions',
            fields: {
                userId: 'user_id',
                expiresAt: 'expires_at',
                createdAt: 'created_at',
                updatedAt: 'updated_at',
                ipAddress: 'ip_address',
                userAgent: 'user_agent',
            },
        },
        account: {
            modelName: 'accounts',
            fields: {
                accountId: 'account_id',
                providerId: 'provider_id',
                userId: 'user_id',
                accessToken: 'access_token',
                refreshToken: 'refresh_token',
                idToken: 'id_token',
                accessTokenExpiresAt: 'access_token_expires_at',
                refreshTokenExpiresAt: 'refresh_token_expires_at',
                createdAt: 'created_at',
                updatedAt: 'updated_at',
            },
        },
        verification: {
            modelName: 'verifications',
            fields: {
                expiresAt: 'expires_at',
                createdAt: 'created_at',
                updatedAt: 'updated_at',
            },
        },
        emailAndPassword: {
            enabled: true,
            sendResetPassword: async ({
                user,
                url,
            }: {
                user: { email: string };

                url: string;
                token: string;
            }) => {
                const { getEmailDriver } = await import('@/email/registry');
                const { renderEmail } = await import('@/email/render');
                const { PasswordResetEmail } =
                    await import('@/email/components/password-reset');
                const { getEmailOverride } = await import('@/email/email-overrides');
                const driver = getEmailDriver();
                if (!driver) {
                    log.info(`Password reset URL for ${user.email}: ${url}`);
                    return;
                }
                const subject = 'Reset your password';
                const Override = getEmailOverride('password-reset');
                const { createElement } = await import('react');
                const element = Override
                    ? createElement(Override, { url })
                    : createElement(PasswordResetEmail, { url });
                const { html, text } = await renderEmail(element);
                await driver.send({ to: user.email, subject, html, text });
            },
        },
    }) as unknown as Auth<BetterAuthOptions>;
}
