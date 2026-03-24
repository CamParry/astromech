/**
 * Astromech Admin SPA — root React component
 *
 * Mounted by `src/admin/shell.astro` via `client:only="react"`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Astromech } from '../sdk/client/index.js';
import { router } from './router.js';
import './i18n.js';
import './styles/main.css';

declare const __ASTROMECH_API_ROUTE__: string;

Astromech.configure({ baseUrl: __ASTROMECH_API_ROUTE__ });

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

export default function AdminApp() {
    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
}
