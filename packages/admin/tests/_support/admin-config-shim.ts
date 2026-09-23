/**
 * Shim for virtual:astromech/admin-config under vitest.
 *
 * The admin SPA imports its config from `virtual:astromech/admin-config`,
 * injected by the Astro integration at build time. Under vitest there is no
 * integration, so the vitest config aliases that specifier here.
 *
 * Only the fields touched by registration-chain modules are needed, plus a
 * site type and global and a plugin's, which the admin path helpers look up.
 */
import type { AdminConfig } from '@/types/index';

const config = {
    defaultLocale: 'en',
    locales: ['en'],
    media: { translatable: false },
    entryTypes: {
        post: { single: 'Post', plural: 'Posts' },
        'forms/form': { plugin: 'forms', single: 'Form', plural: 'Forms' },
        'forms/nested/form': { plugin: 'forms', single: 'Form', plural: 'Forms' },
    },
    globals: {
        site: { label: 'Site' },
        'seo/settings': { plugin: 'seo', label: 'Settings' },
        'menus/main/footer': { plugin: 'menus', label: 'Footer' },
    },
} as unknown as AdminConfig;

export default config;
