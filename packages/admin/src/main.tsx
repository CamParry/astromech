/**
 * Astromech Admin SPA — root React component
 *
 * Mounted by `shell.astro` via `client:only="react"`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { astromechClient } from 'astromech/fetch';
import { resolveContentLocale } from 'astromech/shared';
import adminConfig from 'virtual:astromech/admin-config';
import { assertSingleUiInstance } from './components/ui/instance-guard';
import { createAppRouter } from './router';
import { setDateLocale } from './utilities/dates';
import './rendering/cells/register-cells';
import './rendering/register-fields';
import './i18n';
// The typeface `styles/partials/base.css` names. Nothing else loads it.
import '@fontsource-variable/inter';
import './styles/main.css';

declare const __ASTROMECH_BASE_PATH__: string;

// The SPA imports the kit's components file by file, so it is this call rather
// than the `astromech/ui` barrel that registers the admin's own copy — without
// it a plugin resolving the kit to a stale `dist` would go unreported.
assertSingleUiInstance();

astromechClient.configure({ baseUrl: `${__ASTROMECH_BASE_PATH__}/api` });

// Dates render in the install's configured locale (e.g. en-GB → `14 Jun 2026`).
setDateLocale(adminConfig.defaultLocale);

if (
    import.meta.env.DEV &&
    resolveContentLocale(adminConfig.defaultLocale, adminConfig.locales) === undefined
) {
    console.warn(
        `[astromech] defaultLocale "${adminConfig.defaultLocale}" has no content-locale match in [${adminConfig.locales.join(', ')}]; content falls back to "${adminConfig.locales[0] ?? 'en'}".`
    );
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
        },
        mutations: {
            retry: 0,
        },
    },
});

const router = createAppRouter(queryClient);

export default function AdminApp() {
    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
}
