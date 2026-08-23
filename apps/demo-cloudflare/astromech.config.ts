// The Cloudflare demo: the smallest site that exercises the runtime path.
// D1, R2, edge image transforms and Cron Triggers, all through bindings.
// `apps/demo` is the content showcase; this one proves the platform.
import { defineConfig } from 'astromech';
import { d1 } from 'astromech/database/d1';
import { consoleEmail } from 'astromech/email/console';
import * as fields from 'astromech/fields';
import { cloudflareImages } from 'astromech/media/image/cloudflare';
import { r2 } from 'astromech/storage/r2';

export default defineConfig({
    db: d1({ binding: 'DB' }),
    storage: r2({ binding: 'MEDIA' }),
    media: { image: { driver: cloudflareImages() } },
    email: consoleEmail({ from: 'demo@astromech.dev' }),
    // No `scheduler`: `createWorkerEntry` in `src/worker.ts` nominates
    // `cloudflareCron()`, and boot fails loudly in a Worker if it did not.
    entries: {
        page: {
            single: 'Page',
            plural: 'Pages',
            icon: 'FileText',
            url: '/{slug}',
            fields: {
                main: [fields.richtext('body', { label: 'Body' })],
            },
        },
    },
});
