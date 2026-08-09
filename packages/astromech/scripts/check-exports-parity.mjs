/**
 * Gate step: the repo `exports` map points the Vite-loaded subpaths at `src` so
 * a core edit reaches `apps/demo` with no rebuild, and `publishConfig.exports`
 * restores the `dist` map npm consumers get. Two maps means a new subpath can be
 * added to one and forgotten in the other, which npm would only reveal after a
 * publish — so the key sets must match exactly. Needs no build.
 */

import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

const repoKeys = Object.keys(manifest.exports ?? {});
const publishKeys = Object.keys(manifest.publishConfig?.exports ?? {});

const missingFromPublish = repoKeys.filter((key) => !publishKeys.includes(key));
const missingFromRepo = publishKeys.filter((key) => !repoKeys.includes(key));

if (missingFromPublish.length === 0 && missingFromRepo.length === 0) {
    console.log(`ok  ${repoKeys.length} subpaths in exports and publishConfig.exports`);
    process.exit(0);
}

for (const key of missingFromPublish) {
    console.error(`FAIL ${key} — in exports, missing from publishConfig.exports`);
}
for (const key of missingFromRepo) {
    console.error(`FAIL ${key} — in publishConfig.exports, missing from exports`);
}
console.error(
    'Every subpath must appear in both maps: `exports` is what the repo resolves, ' +
        '`publishConfig.exports` is what npm consumers get. See ARCHITECTURE.md, "Public entry points".'
);
process.exit(1);
