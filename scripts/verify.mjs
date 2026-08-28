/**
 * Runs the gate, in stages, with everything that can overlap overlapping.
 *
 * `--fast` runs only the stages that need no build: the published packages'
 * typechecks, their test suites, and lint. That is the loop to run while
 * working. The full run adds the build and everything downstream of it.
 *
 * Two things decide the stage boundaries, and neither is arbitrary:
 *
 * - Anything reading `dist` waits for `build`.
 * - `tsr generate` writes `packages/astromech/src/admin/routeTree.gen.ts`, and
 *   so does the TanStack Router Vite plugin inside each app build. `typecheck`
 *   gets a stage of its own for this reason. The two boot checks then run
 *   together, but only after a `routes:generate` stage writes that file first:
 *   the generator reads the existing file and skips the write when the content
 *   is unchanged, so once it is current both app builds read it and neither
 *   writes, and the race is gone.
 */

import { spawn } from 'node:child_process';
import console from 'node:console';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const fast = process.argv.includes('--fast');

/** Each stage runs in parallel; stages run in order. */
const stages = fast
    ? [
          [
              ['typecheck:packages', 'pnpm -r -F "./packages/**" typecheck'],
              [
                  'test:packages',
                  'pnpm -F @astromech/schema-engine test:run && pnpm -F astromech test:run',
              ],
              ['lint', 'pnpm run lint'],
          ],
      ]
    : [
          [['build', 'pnpm run build']],
          [
              ['test:run', 'pnpm run test:run'],
              ['lint', 'pnpm run lint'],
              ['check:node-imports', 'pnpm run check:node-imports'],
              ['check:exports', 'pnpm run check:exports'],
              ['check:docs', 'pnpm run check:docs'],
          ],
          [['typecheck', 'pnpm run typecheck']],
          // Prime routeTree.gen.ts so the two boot builds below both read it
          // unchanged and neither writes it. See the header comment.
          [['routes:generate', 'pnpm -F astromech routes:generate']],
          [
              ['check:boot', 'pnpm run check:boot'],
              ['check:boot:cloudflare', 'pnpm run check:boot:cloudflare'],
          ],
      ];

const run = (name, command) =>
    new Promise((done) => {
        const started = Date.now();
        const child = spawn(command, {
            cwd: repoRoot,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.on('close', (code) => {
            const seconds = ((Date.now() - started) / 1000).toFixed(1);
            console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${name} (${seconds}s)`);
            done({ name, code, output });
        });
    });

const failures = [];

for (const stage of stages) {
    const results = await Promise.all(stage.map(([name, command]) => run(name, command)));
    failures.push(...results.filter((result) => result.code !== 0));
    if (failures.length > 0) break;
}

if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`\n----- ${failure.name} -----\n${failure.output}`);
    }
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
}

console.log(fast ? '\nFast checks passed.' : '\nGate passed.');
