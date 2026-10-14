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
 * `dist` for core and every plugin. The imports run in parallel, as many at
 * once as the machine has cores.
 *
 *     pnpm run check:node-imports
 *
 * Exit codes: 0 when every import loads, 1 when one fails, 2 on a usage error.
 */
import console from 'node:console';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { start } from './lib/run.ts';

const USAGE = 'usage: pnpm run check:node-imports';

const SUBPATHS: readonly string[] = [
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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = join(repoRoot, 'packages', 'astromech');

/** A published plugin, with the file a site loads for `.` and the factory it calls. */
type Plugin = {
    name: string;
    dir: string;
    entry: string | undefined;
    exportName: string;
};

/** One import to try: its label, the script that does it and the directory it runs in. */
type ImportCheck = { label: string; script: string; cwd: string };

if (!parseArguments()) {
    process.exitCode = 2;
} else {
    process.exitCode = await check();
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

/** Runs every import, prints a line for each in order, and returns the exit code. */
async function check(): Promise<number> {
    const checks: ImportCheck[] = [
        ...SUBPATHS.map((subpath) => ({
            label: subpath,
            script: `await import(${JSON.stringify(subpath)});`,
            cwd: packageRoot,
        })),
        ...publishedPlugins().map((plugin) => ({
            label: `${plugin.name} (${plugin.exportName})`,
            script: pluginScript(plugin),
            cwd: plugin.dir,
        })),
    ];
    const results = await mapInParallel(checks, availableParallelism(), runImport);
    let failed = false;
    for (const [index, { label }] of checks.entries()) {
        const output = results[index];
        if (output === undefined) {
            console.log(`ok   ${label}`);
            continue;
        }
        failed = true;
        console.error(`FAIL ${label}: ${failureReason(output)}`);
        console.error(output);
    }
    if (!failed) return 0;
    console.error(
        'A plugin package and an Astro config load these in plain Node. See ARCHITECTURE.md, "Plugin runtime boundary".'
    );
    return 1;
}

/** Runs one import in a child Node process: undefined when it loads, else its output. */
async function runImport({ script, cwd }: ImportCheck): Promise<string | undefined> {
    const child = start(process.execPath, ['--input-type=module', '-e', script], { cwd });
    try {
        await child.done;
        return undefined;
    } catch {
        return child.output;
    }
}

/** `work` over each item, at most `limit` at once, with the results in the items' order. */
async function mapInParallel<Item, Result>(
    items: readonly Item[],
    limit: number,
    work: (item: Item) => Promise<Result>
): Promise<Result[]> {
    const results: Result[] = [];
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next++;
            results[index] = await work(items[index] as Item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}
/** A subpath's target in an `exports` map, or its targets by condition. */
type ExportTarget = string | { import?: string; default?: string } | undefined;

/**
 * Every plugin package that is not `private`, with the file a site loads for
 * `.` and the export it calls. npm publishes `publishConfig.exports` when a
 * package has one and `exports` otherwise, so that is the order read here. The
 * factory a site calls is named after the package (`@astromech/seo` exports
 * `seo`).
 */
function publishedPlugins(): Plugin[] {
    const pluginsRoot = join(repoRoot, 'packages', 'plugins');
    const plugins: Plugin[] = [];
    for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
        const dir = join(pluginsRoot, entry.name);
        const manifestPath = join(dir, 'package.json');
        if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            name: string;
            private?: boolean;
            exports?: Record<string, ExportTarget>;
            publishConfig?: { exports?: Record<string, ExportTarget> };
        };
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
 * The script that imports one plugin's published entry, run from the plugin's
 * own directory, and fails unless it exports its factory function.
 */
function pluginScript(plugin: Plugin): string {
    return [
        `if (${JSON.stringify(plugin.entry ?? null)} === null) {`,
        `    throw new Error('no file named for "." in exports or publishConfig.exports');`,
        `}`,
        `const module = await import(${JSON.stringify(plugin.entry)});`,
        `if (typeof module[${JSON.stringify(plugin.exportName)}] !== 'function') {`,
        `    throw new Error('no ${plugin.exportName} function export');`,
        `}`,
    ].join('\n');
}

/** The error code Node named, or the last line it wrote. */
function failureReason(output: string): string {
    const code = /\b(ERR_[A-Z_]+)\b/.exec(output)?.[1];
    if (code !== undefined) return code;
    return output.trim().split('\n').at(-1) || 'no output';
}
