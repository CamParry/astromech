/**
 * Runs the gate, in stages, with everything that can overlap overlapping.
 *
 * `--fast` runs only the stages that need no build: the published packages'
 * typechecks, their test suites, and lint. That is the loop to run while
 * working. The full run adds the build and everything downstream of it.
 *
 * `--runtime` runs only the checks whose result can vary with the Node version:
 * the test suites and the two boot checks, over a `build:js` (no declarations,
 * which no runtime reads). CI runs the full gate on one Node version and this
 * subset on the other, so version-invariant work is never doubled while
 * test and boot still run on both. See `.github/workflows/ci.yml`.
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

const mode = process.argv.includes('--fast')
    ? 'fast'
    : process.argv.includes('--runtime')
      ? 'runtime'
      : 'full';

/** Each stage runs in parallel; stages run in order. */
const stagesByMode = {
    fast: [
        [
            ['typecheck:packages', 'pnpm -r -F "./packages/**" typecheck'],
            [
                'test:packages',
                // The assistant is left out: its suite resolves core through
                // `dist`, which this stage does not build. Every other plugin
                // resolves core to source and needs no build.
                'pnpm -F @astromech/schema-engine test:run && pnpm -F astromech test:run && pnpm -F @astromech/forms -F @astromech/menus -F @astromech/redirects -F @astromech/backups -F @astromech/seo test:run',
            ],
            ['lint', 'pnpm run lint'],
        ],
    ],
    runtime: [
        // No declarations: nothing this mode runs reads a `.d.ts`.
        [['build:js', 'pnpm run build:js']],
        // routes:generate primes routeTree.gen.ts for the concurrent boot
        // builds below (see the header comment); test:run is independent of it.
        [
            ['test:run', 'pnpm run test:run'],
            ['routes:generate', 'pnpm -F astromech routes:generate'],
        ],
        [
            ['check:boot', 'pnpm run check:boot'],
            ['check:boot:cloudflare', 'pnpm run check:boot:cloudflare'],
        ],
    ],
    full: [
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
    ],
};

const stages = stagesByMode[mode];

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

const passed = {
    fast: '\nFast checks passed.',
    runtime: '\nRuntime checks passed.',
    full: '\nGate passed.',
};
console.log(passed[mode]);
