/**
 * Shim for virtual:astromech/admin-config under vitest.
 *
 * The admin SPA imports its config from `virtual:astromech/admin-config`,
 * injected by the Astro integration at build time. Under vitest there is no
 * integration, so the vitest config aliases that specifier here, mirroring the
 * `virtual:astromech/config` → CLI-shim alias.
 *
 * Only the fields touched by registration-chain modules are needed; an empty
 * locales/defaultLocale is sufficient for tests that don't render.
 */
import type { AdminConfig } from '@/types/index.js';

const config = {
    defaultLocale: 'en',
    locales: ['en'],
} as unknown as AdminConfig;

export default config;
