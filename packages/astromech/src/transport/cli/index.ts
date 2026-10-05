import { defineCommand, runMain } from 'citty';
import { disposeBindings } from '@/integrations/cloudflare/bindings';

const main = defineCommand({
    meta: { name: 'astromech', description: 'Astromech CMS CLI' },
    // Runs after any command, finished or failed. A command that resolved a
    // Cloudflare binding left wrangler's platform proxy open, which keeps the
    // process alive. `mcp` returns once its server is connected, and the server
    // is long-lived, so it disposes the bindings on shutdown instead.
    async cleanup({ rawArgs }) {
        if (rawArgs[0] !== 'mcp') await disposeBindings();
    },
    subCommands: {
        'db:init': () => import('./commands/db-init').then((m) => m.default),
        'db:status': () => import('./commands/db-status').then((m) => m.default),
        'users:create': () => import('./commands/users-create').then((m) => m.default),
        'users:list': () => import('./commands/users-list').then((m) => m.default),
        'users:get': () => import('./commands/users-get').then((m) => m.default),
        'users:delete': () => import('./commands/users-delete').then((m) => m.default),
        'entries:list': () => import('./commands/entries-list').then((m) => m.default),
        'entries:get': () => import('./commands/entries-get').then((m) => m.default),
        'entries:delete': () =>
            import('./commands/entries-delete').then((m) => m.default),
        'entries:create': () =>
            import('./commands/entries-create').then((m) => m.default),
        'entries:update': () =>
            import('./commands/entries-update').then((m) => m.default),
        'entries:publish': () =>
            import('./commands/entries-status').then((m) => m.publishCommand),
        'entries:unpublish': () =>
            import('./commands/entries-status').then((m) => m.unpublishCommand),
        'generate:types': () =>
            import('./commands/generate-types').then((m) => m.default),
        'generate:manifest': () =>
            import('./commands/generate-manifest').then((m) => m.default),
        'db:generate': () => import('./commands/db-generate').then((m) => m.default),
        'db:rebaseline': () => import('./commands/db-rebaseline').then((m) => m.default),
        'index:rebuild': () => import('./commands/index-rebuild').then((m) => m.default),
        'plugin:generate': () =>
            import('./commands/plugin-generate').then((m) => m.default),
        'plugin:purge': () => import('./commands/plugin-purge').then((m) => m.default),
        call: () => import('./commands/call').then((m) => m.default),
        methods: () => import('./commands/methods').then((m) => m.default),
        permissions: () => import('./commands/permissions').then((m) => m.default),
        validate: () => import('./commands/validate').then((m) => m.default),
        mcp: () => import('./commands/mcp').then((m) => m.default),
    },
});

runMain(main);
