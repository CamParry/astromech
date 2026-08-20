/**
 * Better Auth, wired to Astromech's user, session, account and verification
 * tables. It builds on first ask, so the config and database driver registries
 * must already be filled; the built instance is held in a registry.
 */

import type { Auth, BetterAuthOptions } from 'better-auth';
import { betterAuth } from 'better-auth';
import { getConfig } from '@/config/registry';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { DEFAULT_ROLE_SLUG } from '@/permissions/index';
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
        baseURL: import.meta.env.BETTER_AUTH_URL,
        basePath: `${basePath}/api/auth`,
        database: {
            dialect: getDatabaseDriverOrThrow().createDialect(),
            type: 'sqlite',
        },
        user: {
            modelName: 'users',
            fields: {
                emailVerified: 'email_verified',
                createdAt: 'created_at',
                updatedAt: 'updated_at',
            },
            additionalFields: {
                // Signup inserts through better-auth's own Kysely instance, so
                // the role it writes is declared here rather than left to a
                // column default. `input: false` stops a signup body naming its own role.
                roleSlug: {
                    type: 'string',
                    fieldName: 'role_slug',
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
