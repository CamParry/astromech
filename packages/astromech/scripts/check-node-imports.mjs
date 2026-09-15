/**
 * Gate step: what an Astro config loads must load under plain Node. That is
 * core's plugin-facing subpaths, then the entry of every published plugin
 * package (each one under `packages/plugins/` that is not `private`), which
 * must also export the factory a site calls in its config.
 *
 * Each is imported in its own child process, because a failure here is a
 * module-resolution throw the parent cannot recover from. A plugin is imported
 * from its own directory, at the file its published `exports` name for `.`, so
 * its imports of `astromech` resolve the way they do in a site. Needs a built
 * `dist` for core and every plugin.
 */

import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SUBPATHS = [
    'astromech',
    'astromech/astro',
    'astromech/fields',
    'astromech/columns',
    // The browser-safe values the admin reads. Loading it in Node too keeps it
    // free of anything that needs a bundler to resolve.
    'astromech/shared',
    // The component kit, by name, so Node follows core's re-export into the
    // admin package's `dist` the way it does in a site.
    'astromech/ui',
    // Each of these imports an optional peer (`sharp`, `@libsql/client` with
    // `@libsql/kysely-libsql`, `aws4fetch`). Loading them proves the peer is
    // reachable from the driver subpath when a site installs it.
    'astromech/media/image/sharp',
    'astromech/database/libsql',
    'astromech/storage/s3',
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

for (const plugin of publishedPlugins()) {
    const result = importPlugin(plugin);
    if (result.status === 0) {
        console.log(`ok  ${plugin.name} (${plugin.exportName})`);
        continue;
    }
    failed = true;
    console.error(`FAIL ${plugin.name} — ${failureReason(result.stderr ?? '')}`);
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

/**
 * Every plugin package that is not `private`, with the file a site loads for
 * `.` and the export it calls. npm publishes `publishConfig.exports` when a
 * package has one and `exports` otherwise, so that is the order read here. The
 * factory a site calls is named after the package (`@astromech/seo` exports
 * `seo`).
 */
function publishedPlugins() {
    const pluginsRoot = resolve(packageRoot, '..', 'plugins');
    const plugins = [];
    for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
        const dir = join(pluginsRoot, entry.name);
        const manifestPath = join(dir, 'package.json');
        if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (manifest.private === true) continue;
        const exports = manifest.publishConfig?.exports ?? manifest.exports;
        const root = exports?.['.'];
        plugins.push({
            name: manifest.name,
            dir,
            entry: typeof root === 'string' ? root : (root?.import ?? root?.default),
            exportName: manifest.name.slice(manifest.name.lastIndexOf('/') + 1),
        });
    }
    return plugins;
}

/**
 * Import one plugin's published entry in a child Node process, from the
 * plugin's own directory, and fail unless it exports its factory function.
 */
function importPlugin(plugin) {
    const script = [
        `if (${JSON.stringify(plugin.entry ?? null)} === null) {`,
        `    throw new Error('no file named for "." in exports or publishConfig.exports');`,
        `}`,
        `const module = await import(${JSON.stringify(plugin.entry)});`,
        `if (typeof module[${JSON.stringify(plugin.exportName)}] !== 'function') {`,
        `    throw new Error('no ${plugin.exportName} function export');`,
        `}`,
    ].join('\n');
    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: plugin.dir,
        encoding: 'utf8',
    });
}

/** The error code Node named, or the last line it wrote. */
function failureReason(stderr) {
    const code = /\b(ERR_[A-Z_]+)\b/.exec(stderr);
    if (code !== null) return code[1];
    const lines = stderr.trim().split('\n');
    return lines[lines.length - 1] ?? 'no output';
}
