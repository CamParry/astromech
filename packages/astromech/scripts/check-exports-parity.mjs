/**
 * Gate step, two checks over the `exports` maps. Needs no build.
 *
 * Keys, between the maps: the repo `exports` map points the Vite-loaded
 * subpaths at `src` so a core edit reaches `apps/demo` with no rebuild, and
 * `publishConfig.exports` restores the `dist` map npm consumers get. Two maps
 * means a new subpath can be added to one and forgotten in the other, which npm
 * would only reveal after a publish — so the key sets must match exactly.
 *
 * Conditions, within an entry: if an entry has both a `types` and a `default`
 * condition they must resolve into the same tree, both under `dist/` or both
 * under `src/`. An entry that mixes them serves edited source against types
 * that are whatever the last build emitted, and nothing else in the gate can
 * see that. Conditions are never compared *between* the maps — the repo map
 * resolving `src` where `publishConfig` resolves `dist` is the design
 * (`decisions/0033-the-repo-resolves-src-and-npm-gets-dist.md`).
 */

import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

const repoExports = manifest.exports ?? {};
const publishExports = manifest.publishConfig?.exports ?? {};

const repoKeys = Object.keys(repoExports);
const publishKeys = Object.keys(publishExports);

const failures = [];

for (const key of repoKeys.filter((key) => !publishKeys.includes(key))) {
    failures.push(`FAIL ${key} — in exports, missing from publishConfig.exports`);
}
for (const key of publishKeys.filter((key) => !repoKeys.includes(key))) {
    failures.push(`FAIL ${key} — in publishConfig.exports, missing from exports`);
}

const treeOf = (target) => (target.startsWith('./dist/') ? 'dist' : 'src');

const checkConditions = (mapName, map) => {
    for (const [key, entry] of Object.entries(map)) {
        if (typeof entry === 'string') continue;
        const { types, default: fallback } = entry;
        if (typeof types !== 'string' || typeof fallback !== 'string') continue;
        if (treeOf(types) === treeOf(fallback)) continue;
        failures.push(
            `FAIL ${key} — in ${mapName}, types resolves ${types} but default resolves ${fallback}; ` +
                'both must be under dist/ or both under src/'
        );
    }
};

checkConditions('exports', repoExports);
checkConditions('publishConfig.exports', publishExports);

if (failures.length === 0) {
    console.log(
        `ok  ${repoKeys.length} subpaths in exports and publishConfig.exports, conditions agree`
    );
    process.exit(0);
}

for (const failure of failures) {
    console.error(failure);
}
console.error(
    'Every subpath must appear in both maps, and within one entry `types` and `default` must ' +
        'resolve into the same tree: `exports` is what the repo resolves, `publishConfig.exports` ' +
        'is what npm consumers get. See ARCHITECTURE.md, "Public entry points".'
);
process.exit(1);
