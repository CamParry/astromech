/**
 * `astromech db:generate`
 *
 * Schema generation lands in step 4 (homegrown generator).
 */

import { defineCommand } from 'citty';

export default defineCommand({
    meta: {
        name: 'db:generate',
        description: 'Generate migrations for this app (core + plugin schemas)',
    },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run() {
        console.log(
            '[astromech db:generate] schema generation lands in step 4 (homegrown generator)'
        );
    },
});
