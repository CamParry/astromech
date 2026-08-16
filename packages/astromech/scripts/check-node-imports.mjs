/**
 * Gate step: the subpaths a plugin package or an Astro config may import must
 * load under plain Node. Each is imported in its own child process, because a
 * failure here is a module-resolution throw the parent cannot recover from.
 * Needs a built `dist`.
 */

import { spawnSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SUBPATHS = [
    'astromech',
    'astromech/astro',
    'astromech/fields',
    'astromech/columns',
    // The component kit. `astromech/ui` resolves to source in this repo and to
    // dist for npm (decisions/0033), so Node is pointed at what npm publishes.
    './dist/admin/components/ui/index.js',
];

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;
for (const subpath of SUBPATHS) {
    const result = importSubpath(subpath);
    if (result.status === 0) {
        console.log(`ok  ${subpath}`);
        continue;
    }
    failed = true;
    console.error(`FAIL ${subpath} — ${failureReason(result.stderr ?? '')}`);
    console.error(result.stderr);
}

if (failed) {
    console.error(
        'A plugin package and an Astro config load these in plain Node. See ARCHITECTURE.md, "Plugin runtime boundary".'
    );
    process.exit(1);
}

/** Import one subpath in a child Node process, returning what it printed. */
function importSubpath(subpath) {
    return spawnSync(
        process.execPath,
        ['--input-type=module', '-e', `await import(${JSON.stringify(subpath)});`],
        { cwd: packageRoot, encoding: 'utf8' }
    );
}

/** The error code Node named, or the last line it wrote. */
function failureReason(stderr) {
    const code = /\b(ERR_[A-Z_]+)\b/.exec(stderr);
    if (code !== null) return code[1];
    const lines = stderr.trim().split('\n');
    return lines[lines.length - 1] ?? 'no output';
}
