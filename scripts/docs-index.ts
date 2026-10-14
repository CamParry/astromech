/**
 * Writes one of the generated indexes in the docs (`scripts/lib/docs-index.ts`):
 * `roadmap`, the progress index in `roadmap/README.md`, or `decisions`, the
 * index in `DECISIONS.md`. With no name it writes both.
 *
 *     pnpm run roadmap
 *     pnpm run decisions
 *     node scripts/docs-index.ts [roadmap | decisions] [--check]
 *
 * With `--check` it writes nothing and fails when an index is stale, as
 * `check:docs` runs it. The pre-commit hook writes both when a staged file
 * under `roadmap/` or `decisions/` changes, and stages the result.
 *
 * Exit codes: 0 when every index is current or was written, 1 when a file
 * cannot be indexed or an index is stale, 2 on a usage error.
 */
import type { DocsIndex } from './lib/docs-index.ts';
import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { INDEXES, spliceIndex } from './lib/docs-index.ts';

const USAGE = 'usage: node scripts/docs-index.ts [roadmap | decisions] [--check]';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const options = parseArguments();
if (options === undefined) {
    process.exitCode = 2;
} else {
    const results = options.indexes.map((index) => write(index, options.check));
    process.exitCode = results.every(Boolean) ? 0 : 1;
}

/**
 * The indexes to write and whether to check only, or undefined after printing
 * the usage. pnpm passes a `--` on to the script, so every `--` is dropped.
 */
function parseArguments(): { indexes: DocsIndex[]; check: boolean } | undefined {
    try {
        const { values, positionals } = parseArgs({
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            strict: true,
            allowPositionals: true,
            options: { check: { type: 'boolean' } },
        });
        if (positionals.length > 1) throw new Error('name one index, or none');
        const named = positionals[0];
        const indexes = INDEXES.filter(
            (index) => named === undefined || index.name === named
        );
        if (indexes.length === 0) throw new Error(`no index named "${named}"`);
        return { indexes, check: values.check === true };
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return undefined;
    }
}

/** Writes or checks one index, and returns whether it passed. */
function write(index: DocsIndex, check: boolean): boolean {
    const built = index.build(index.read(repoRoot));
    if ('problems' in built) {
        console.error(
            `FAIL ${index.name}: ${built.problems.length} file(s) cannot be indexed:\n`
        );
        // Each index reads the directory it is named after.
        for (const problem of built.problems) console.error(`  ${index.name}/${problem}`);
        console.error(`\n${built.hint}`);
        return false;
    }
    const path = join(repoRoot, index.target);
    const source = readFileSync(path, 'utf8');
    const updated = spliceIndex(source, index, built.index);
    if (updated === undefined) {
        console.error(
            `FAIL ${index.name}: ${index.target} is missing the ${index.start} and ${index.end} markers`
        );
        return false;
    }
    if (check) {
        if (updated !== source) {
            console.error(
                `FAIL ${index.name}: ${index.target} is stale: run \`pnpm run ${index.name}\``
            );
            return false;
        }
        console.log(`ok   ${index.name}: ${index.passed}`);
        return true;
    }
    if (updated !== source) writeFileSync(path, updated);
    console.log(`ok   ${index.name}: wrote the index in ${index.target}`);
    return true;
}
