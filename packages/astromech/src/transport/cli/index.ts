import { defineCommand, runMain } from 'citty';

const main = defineCommand({
    meta: { name: 'astromech', description: 'Astromech CMS CLI' },
    subCommands: {
        'db:init': () => import('./commands/db-init.js').then((m) => m.default),
        'db:status': () => import('./commands/db-status.js').then((m) => m.default),
        'users:create': () => import('./commands/users-create.js').then((m) => m.default),
        'users:list': () => import('./commands/users-list.js').then((m) => m.default),
        'users:get': () => import('./commands/users-get.js').then((m) => m.default),
        'users:delete': () => import('./commands/users-delete.js').then((m) => m.default),
        'entries:list': () => import('./commands/entries-list.js').then((m) => m.default),
        'entries:get': () => import('./commands/entries-get.js').then((m) => m.default),
        'entries:delete': () =>
            import('./commands/entries-delete.js').then((m) => m.default),
        'entries:create': () =>
            import('./commands/entries-create.js').then((m) => m.default),
        'entries:update': () =>
            import('./commands/entries-update.js').then((m) => m.default),
        'entries:publish': () =>
            import('./commands/entries-publish.js').then((m) => m.default),
        'entries:unpublish': () =>
            import('./commands/entries-unpublish.js').then((m) => m.default),
        'generate:types': () =>
            import('./commands/generate-types.js').then((m) => m.default),
        'generate:manifest': () =>
            import('./commands/generate-manifest.js').then((m) => m.default),
        'db:generate': () => import('./commands/db-generate.js').then((m) => m.default),
        methods: () => import('./commands/methods.js').then((m) => m.default),
        mcp: () => import('./commands/mcp.js').then((m) => m.default),
    },
});

runMain(main);
