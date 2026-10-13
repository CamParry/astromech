/**
 * Says whether the gate has already passed on the working tree's current
 * content, committed or not: whether every task a run would run is a cache
 * hit in Turborepo's shared cache. Exits 0 when it is and 1 otherwise. It runs
 * no check and does not wait for the run lock, so it costs a few seconds
 * rather than a gate.
 *
 *     pnpm run verify:status [--fast | --runtime | --full] [--all]
 *
 * `--fast`, `--runtime` or `--full` asks about that mode, scoped as
 * `pnpm run verify` scopes it (`--affected` against `origin/main`, or every
 * task with `--all`). With no mode flag it prints a line for each mode and
 * exits 0 when any matches. `scripts/gate.mjs` has the detail.
 */
import console from 'node:console';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gateStatus, MODES } from './gate.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const asked = MODES.filter((name) => process.argv.includes(`--${name}`));
const all = process.argv.includes('--all');

let matched = false;
for (const mode of asked.length > 0 ? asked : MODES) {
    const { matches, message } = gateStatus(repoRoot, mode, { all });
    matched ||= matches;
    console.log(`${matches ? 'match' : 'no match'} (${mode}): ${message}`);
}
process.exitCode = matched ? 0 : 1;
