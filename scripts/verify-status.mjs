/**
 * Says whether the gate's last passing run in this worktree still holds:
 * whether the stamp `scripts/verify.mjs` wrote matches the working tree's
 * current content, committed or not. Exits 0 when it matches and 1 otherwise.
 * It runs no check, so it costs a moment rather than a gate.
 *
 * With no flag, a passing run of any mode matches, and the line printed names
 * the mode. `--fast`, `--runtime` or `--full` asks for a run that covers that
 * mode: a full run covers all three. `scripts/verify-stamp.mjs` has the detail.
 *
 *     pnpm run verify:status --fast
 */
import console from 'node:console';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { stampStatus } from './verify-stamp.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const mode = ['fast', 'runtime', 'full'].find((name) =>
    process.argv.includes(`--${name}`)
);

const { matches, message } = stampStatus(repoRoot, mode);
const wanted = mode === undefined ? '' : ` (${mode})`;
console.log(`${matches ? 'match' : 'no match'}${wanted}: ${message}`);
process.exitCode = matches ? 0 : 1;
