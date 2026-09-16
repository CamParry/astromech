/**
 * Better Auth, wired to Astromech's user, session, account and verification
 * tables. It builds on first ask, so the config and database driver registries
 * must already be filled; the built instance is held in a registry.
 */

import type { BuiltInRoleSlug } from '@/permissions/roles';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { APIError, betterAuth, getCurrentAdapter } from 'better-auth';
import { claimFirstAdmin, releaseFirstAdminClaim } from '@/auth/first-admin-claim';
import { getDefaultContentLocale } from '@/config/content-locale';
import { getConfig } from '@/config/registry';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { createRepository } from '@/database/repository/create-repository';
import { userContentTable } from '@/database/tables';
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
                    // The first account gets `admin`; once any user exists, every
                    // Better Auth sign-up is refused. Admins create the rest
                    // through the users service, which does not run this hook.
                    before: async (user, context) => {
                        // The adapter Better Auth's own insert uses next.
                        const { adapter } =
                            context?.context ?? (await getAuth().$context);
                        const current = await getCurrentAdapter(adapter);
                        await assertFirstSignUp(() => current.count({ model: 'user' }));
                        return {
                            data: { ...user, role: 'admin' satisfies BuiltInRoleSlug },
                        };
                    },
                    // better-auth inserts the account row with its own queries,
                    // not through the users service, so the default-locale
                    // content row that every other create path writes is
                    // written here.
                    after: async (user: { id: string }) => {
                        await createRepository(userContentTable).create({
                            userId: user.id,
                            locale: getDefaultContentLocale(),
                            fields: {},
                        });
                        // A user exists now, so the count refuses every later
                        // sign-up and the claim is no longer needed.
                        await releaseFirstAdminClaim();
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
                // better-auth builds its own inserts, not through the users
                // service, so the role column is declared here. `input: false`
                // stops a sign-up body naming its own role; `create.before`
                // sets the one written.
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

/**
 * Refuse a sign-up unless it is the first account. Better Auth runs no
 * transaction, so two sign-ups on an empty install can both count zero; only
 * the one holding the first-admin claim goes on.
 */
async function assertFirstSignUp(countUsers: () => Promise<number>): Promise<void> {
    if ((await countUsers()) > 0) throw signUpClosed();
    if (!(await claimFirstAdmin(new Date()))) throw signUpClosed();
    // Another sign-up may have finished and released its claim between the
    // first count and ours. Releasing is safe: a user exists, so every later
    // sign-up is refused at its first count, and one already past it re-counts.
    if ((await countUsers()) > 0) {
        await releaseFirstAdminClaim();
        throw signUpClosed();
    }
}

function signUpClosed(): APIError {
    return new APIError('FORBIDDEN', {
        code: 'SIGN_UP_CLOSED',
        message: 'Sign-up is closed. Ask an administrator to create your account.',
    });
}
