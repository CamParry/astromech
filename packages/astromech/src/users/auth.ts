/**
 * Better Auth, wired to Astromech's user, session, account and verification
 * tables. It builds on first ask, so the config and database driver registries
 * must already be filled; the built instance is held in a registry.
 */

import type { BuiltInRoleSlug } from '@/permissions/roles';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { APIError, betterAuth, getCurrentAdapter } from 'better-auth';
import { getDefaultContentLocale } from '@/config/content-locale';
import { getConfig } from '@/config/registry';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { createRepository } from '@/database/repository/create-repository';
import { userContentTable } from '@/database/tables';
import { resolveEnv } from '@/env';
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

/** Configure Better Auth against the registered config and database driver. */
function buildAuth(): Auth<BetterAuthOptions> {
    const { basePath } = getConfig();
    return betterAuth({
        baseURL: resolveEnv('BETTER_AUTH_URL'),
        basePath: `${basePath}/api/auth`,
        database: {
            dialect: getDatabaseDriverOrThrow().createDialect(),
            type: 'sqlite',
        },
        databaseHooks: {
            user: {
                create: {
                    // The first account gets `admin`; once any user exists, every
                    // Better Auth sign-up is refused. Admins create the rest
                    // through the users service, which does not run this hook.
                    before: async (user, context) => {
                        // The adapter Better Auth's own insert uses next. It runs no
                        // transaction, so two sign-ups racing on an empty install
                        // can both count zero and both get `admin`.
                        const { adapter } =
                            context?.context ?? (await getAuth().$context);
                        const current = await getCurrentAdapter(adapter);
                        if ((await current.count({ model: 'user' })) > 0) {
                            throw new APIError('FORBIDDEN', {
                                code: 'SIGN_UP_CLOSED',
                                message:
                                    'Sign-up is closed. Ask an administrator to create your account.',
                            });
                        }
                        return {
                            data: { ...user, role: 'admin' satisfies BuiltInRoleSlug },
                        };
                    },
                    // better-auth inserts the account row through its own
                    // Kysely instance, so the default-locale content row that
                    // every other create path writes is written here.
                    after: async (user: { id: string }) => {
                        await createRepository(userContentTable).create({
                            userId: user.id,
                            locale: getDefaultContentLocale(),
                            fields: {},
                        });
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
                // better-auth inserts through its own Kysely instance, so the
                // role column is declared here. `input: false` stops a sign-up
                // body naming its own role; `create.before` sets the one written.
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
