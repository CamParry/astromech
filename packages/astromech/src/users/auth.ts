import { betterAuth } from 'better-auth';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { getDatabaseDriver } from '@/database/driver-registry';
import { getConfig } from '@/config/registry';
import { DEFAULT_ROLE_SLUG } from '@/permissions/index';

let _auth: Auth<BetterAuthOptions> | null = null;

function getAuth(): Auth<BetterAuthOptions> {
    if (!_auth) {
        const { basePath } = getConfig();
        _auth = betterAuth({
            baseURL: import.meta.env.BETTER_AUTH_URL,
            basePath: `${basePath}/api/auth`,
            database: {
                dialect: getDatabaseDriver().createDialect(),
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
                    // Signup inserts through better-auth's own Kysely instance,
                    // so the role it writes is declared here rather than left to
                    // a column default. `input: false` stops a signup body
                    // naming its own role.
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
                        console.log(
                            `[Astromech] Password reset URL for ${user.email}: ${url}`
                        );
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
    // _auth is guaranteed non-null after the if-block above
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return _auth!;
}

// Export a proxy that lazily initialises on first access
export const auth = new Proxy({} as Auth<BetterAuthOptions>, {
    get(_target, prop: string) {
        return getAuth()[prop as keyof Auth<BetterAuthOptions>];
    },
});
