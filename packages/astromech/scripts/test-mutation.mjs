/**
 * Runs Stryker mutation testing over one directory of core's `src`, named as
 * the only argument: `pnpm -F astromech test:mutation src/utilities`. It is a
 * manual check, not a gate step.
 *
 * A directory is required because a run over all of `src` takes hours, and
 * `stryker.config.json` mutates nothing by default for the same reason. The
 * directory becomes Stryker's `--mutate` glob. The JSON report lands in
 * `reports/mutation/`.
 *
 * Why the config looks as it does, since JSON cannot say so itself:
 * - `plugins` names the vitest runner because under pnpm Stryker does not find
 *   it on its own.
 * - `inPlace` mutates the real files rather than a copy in `.stryker-tmp/`,
 *   because the vitest aliases point outside the package (at `../admin`) and
 *   a copy breaks them. Stryker writes each file back when the run ends; a
 *   run killed partway can leave a mutant in `src`, so check `git diff -- src`.
 * - `ignoreStatic` skips mutants that only run when a module loads, which
 *   cost almost half the run time and are rarely worth reading.
 */

import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { environmentWithoutNodeEnv } from '../../../scripts/check-helpers.mjs';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strykerBin = join(packageDir, 'node_modules/@stryker-mutator/core/bin/stryker.js');

// pnpm passes a `--` on to the script, so ignore it rather than read it as the directory.
const args = process.argv.slice(2).filter((arg) => arg !== '--');

const usage =
    'Usage: pnpm -F astromech test:mutation <directory under src>, e.g. src/utilities';

if (args.length !== 1) {
    console.error(usage);
    process.exit(1);
}

const directory = relative(packageDir, resolve(packageDir, args[0])).replaceAll(
    '\\',
    '/'
);

const absolute = join(packageDir, directory);

if (
    !directory.startsWith('src/') ||
    !existsSync(absolute) ||
    !statSync(absolute).isDirectory()
) {
    console.error(`${args[0]} is not a directory under src.\n${usage}`);
    process.exit(1);
}

// One glob, since Stryker splits `--mutate` on commas and warns about any glob
// that matches nothing. A `.d.ts` file matches too, and yields no mutants.
const mutate = `${directory}/**/*.@(ts|tsx)`;

const result = spawnSync(process.execPath, [strykerBin, 'run', '--mutate', mutate], {
    cwd: packageDir,
    // Vitest keeps a `NODE_ENV` the shell sets, as the gate's suites do not.
    env: environmentWithoutNodeEnv('test:mutation'),
    stdio: 'inherit',
});

process.exit(result.status ?? 1);
