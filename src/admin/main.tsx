/**
 * Astromech Admin SPA — root React component
 *
 * Mounted by `src/admin/shell.astro` via `client:only="react"`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import adminConfig from 'virtual:astromech/admin-config';
import { Astromech } from '@/client/index.js';
import { setDateLocale } from '../support/dates.js';
import { resolveContentLocale } from '../support/locale.js';
import { createAppRouter } from './router.js';
import './definitions/cells/register-cells.js';
import './definitions/register-fields.js';
import './i18n.js';
import './styles/main.css';

declare const __ASTROMECH_API_ROUTE__: string;

Astromech.configure({ baseUrl: __ASTROMECH_API_ROUTE__ });

// Dates render in the install's configured locale (e.g. en-GB → `14 Jun 2026`).
setDateLocale(adminConfig.defaultLocale);

if (import.meta.env.DEV && resolveContentLocale(adminConfig.defaultLocale, adminConfig.locales) === undefined) {
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
