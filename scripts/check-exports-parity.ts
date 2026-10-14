/**
 * Gate step, two checks over the `exports` maps of each package that keeps
 * two: core and the admin. Needs no build.
 *
 *     pnpm run check:exports
 *
 * The pre-commit hook runs it too. Exit codes: 0 when both checks pass for
 * both packages, 1 when one fails, 2 on a usage error.
 *
 * Keys, between the maps: the repo `exports` map may point a Vite-loaded
 * subpath at `src` so an edit reaches `apps/demo` with no rebuild, and
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
 * (`decisions/core-has-two-export-maps.md`).
 */
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = 'usage: pnpm run check:exports';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDirs = ['astromech', 'admin'].map((name) =>
    resolve(repoRoot, 'packages', name)
);

/** An `exports` map: each subpath's target, or its targets by condition. */
type ExportsMap = Record<string, string | Record<string, unknown>>;

type Manifest = {
    name: string;
    exports?: ExportsMap;
    publishConfig?: { exports?: ExportsMap };
};

const treeOf = (target: string): string =>
    target.startsWith('./dist/') ? 'dist' : 'src';

if (!parseArguments()) {
    process.exitCode = 2;
} else {
    process.exitCode = check();
}

/**
 * Whether the arguments are valid: there are none. pnpm passes a `--` on to
 * the script, so every `--` is dropped.
 */
function parseArguments(): boolean {
    try {
        parseArgs({
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            strict: true,
            options: {},
        });
        return true;
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return false;
    }
}

/** Runs the check, and returns its exit code. */
function check(): number {
    let failed = false;
    for (const packageDir of packageDirs) {
        const manifest = JSON.parse(
            readFileSync(resolve(packageDir, 'package.json'), 'utf8')
        ) as Manifest;
        const failures = checkManifest(manifest);
        if (failures.length === 0) {
            const count = Object.keys(manifest.exports ?? {}).length;
            console.log(
                `ok   ${manifest.name}: ${count} subpaths in exports and publishConfig.exports, conditions agree`
            );
            continue;
        }
        failed = true;
        for (const failure of failures) {
            console.error(`FAIL ${manifest.name} ${failure}`);
        }
    }
    if (!failed) return 0;
    console.error(
        'Every subpath must appear in both maps, and within one entry `types` and `default` must ' +
            'resolve into the same tree: `exports` is what the repo resolves, `publishConfig.exports` ' +
            'is what npm consumers get. See ARCHITECTURE.md, "Public entry points".'
    );
    return 1;
}

/** What is wrong with one manifest's two exports maps, one line per problem. */
function checkManifest(manifest: Manifest): string[] {
    const repoExports = manifest.exports ?? {};
    const publishExports = manifest.publishConfig?.exports ?? {};
    const repoKeys = Object.keys(repoExports);
    const publishKeys = Object.keys(publishExports);
    const failures: string[] = [];

    for (const key of repoKeys.filter((key) => !publishKeys.includes(key))) {
        failures.push(`${key}: in exports, missing from publishConfig.exports`);
    }
    for (const key of publishKeys.filter((key) => !repoKeys.includes(key))) {
        failures.push(`${key}: in publishConfig.exports, missing from exports`);
    }

    for (const [mapName, map] of [
        ['exports', repoExports],
        ['publishConfig.exports', publishExports],
    ] as const) {
        for (const [key, entry] of Object.entries(map)) {
            if (typeof entry === 'string') continue;
            const { types, default: fallback } = entry;
            if (typeof types !== 'string' || typeof fallback !== 'string') continue;
            if (treeOf(types) === treeOf(fallback)) continue;
            failures.push(
                `${key}: in ${mapName}, types resolves ${types} but default resolves ${fallback}; ` +
                    'both must be under dist/ or both under src/'
            );
        }
    }

    return failures;
}
