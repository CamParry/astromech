import { defineCommand, runMain } from 'citty';

const main = defineCommand({
    meta: { name: 'astromech', description: 'Astromech CMS CLI' },
    subCommands: {
        'db:init': () => import('./commands/db-init.js').then(m => m.default),
        'db:status': () => import('./commands/db-status.js').then(m => m.default),
        'users:create': () => import('./commands/users-create.js').then(m => m.default),
        'users:list': () => import('./commands/users-list.js').then(m => m.default),
        'users:get': () => import('./commands/users-get.js').then(m => m.default),
        'users:delete': () => import('./commands/users-delete.js').then(m => m.default),
        'entries:list': () => import('./commands/entries-list.js').then(m => m.default),
        'entries:get': () => import('./commands/entries-get.js').then(m => m.default),
        'entries:delete': () => import('./commands/entries-delete.js').then(m => m.default),
        'generate:types': () => import('./commands/generate-types.js').then(m => m.default),
    },
});

runMain(main);
