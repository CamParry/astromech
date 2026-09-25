/**
 * Shim for virtual:astromech/admin-config under vitest.
 *
 * The admin SPA imports its config from `virtual:astromech/admin-config`,
 * injected by the Astro integration at build time. Under vitest there is no
 * integration, so the vitest config aliases that specifier here.
 *
 * Only the fields touched by registration-chain modules are needed, plus a
 * site type and global and a plugin's, which the admin path helpers look up,
 * and a plugin with admin resources, which the resource pages look up.
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
    plugins: [
        {
            namespace: 'redirects',
            serviceKey: 'redirects',
            label: 'Redirects',
            permissionNamespace: 'redirects',
            nav: [],
            pages: [],
            resources: [
                {
                    name: 'rules',
                    label: 'Rules',
                    labelSingular: 'Rule',
                    fields: [
                        { name: 'from', type: 'text', label: 'From' },
                        { name: 'to', type: 'text', label: 'To' },
                        {
                            name: 'statusCode',
                            type: 'select',
                            label: 'Status',
                            options: [
                                { value: '301', label: 'Permanent' },
                                { value: '302', label: 'Temporary' },
                            ],
                        },
                    ],
                    columns: [
                        { field: 'from', sortable: true },
                        { field: 'to', sortable: false },
                        { field: 'statusCode', sortable: false },
                    ],
                    search: true,
                    methods: {
                        list: { name: 'list', permission: 'plugin:redirects:read' },
                        get: { name: 'get', permission: 'plugin:redirects:read' },
                        create: { name: 'create', permission: 'plugin:redirects:write' },
                        update: { name: 'update', permission: 'plugin:redirects:write' },
                        delete: { name: 'remove', permission: 'plugin:redirects:write' },
                    },
                },
                {
                    name: 'hits',
                    label: 'Hits',
                    labelSingular: 'Hit',
                    fields: [{ name: 'path', type: 'text', label: 'Path' }],
                    columns: [{ field: 'path', sortable: false }],
                    search: false,
                    methods: {
                        list: { name: 'listHits', permission: 'plugin:redirects:read' },
                        get: { name: 'getHit', permission: 'plugin:redirects:read' },
                    },
                },
                {
                    name: 'events',
                    label: 'Events',
                    labelSingular: 'Event',
                    fields: [{ name: 'message', type: 'text', label: 'Message' }],
                    columns: [{ field: 'message', sortable: false }],
                    search: false,
                    methods: {
                        list: { name: 'listEvents', permission: 'plugin:redirects:read' },
                    },
                },
            ],
        },
    ],
} as unknown as AdminConfig;

export default config;
