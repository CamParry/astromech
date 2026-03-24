import { betterAuth } from 'better-auth';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '@/db/registry.js';
import * as schema from '@/db/schema.js';

const apiRoute = process.env.ASTROMECH_API_ROUTE ?? '/api/cms';

let _auth: Auth<BetterAuthOptions> | null = null;

function getAuth(): Auth<BetterAuthOptions> {
    if (!_auth) {
        _auth = betterAuth({
            basePath: `${apiRoute}/auth`,
            database: drizzleAdapter(getDb(), {
                provider: 'sqlite',
                schema: {
                    user: schema.usersTable,
                    session: schema.sessionsTable,
                    account: schema.accountsTable,
                    verification: schema.verificationsTable,
                },
            }),
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
                    // TODO: Wire up email system when implemented
                    console.log(`[Astromech] Password reset URL for ${user.email}: ${url}`);
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
