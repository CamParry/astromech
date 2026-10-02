/**
 * Run a CLI command in process, and lay out a site for it to load.
 *
 * `run` parses an argv with citty, as `astromech <command> …` would, and
 * reports what the command printed and the code the process would exit with.
 *
 * `createTempSite` and `writeSiteConfig` lay out a site in the run's temp dir:
 * a real `astromech.config.mjs` the CLI loads the way it loads a site's, over a
 * real libsql file database.
 *
 * How the temp config finds its dependencies: the site's `node_modules` is a
 * symlink to core's, and the config imports `kysely` and
 * `@libsql/kysely-libsql` by name, as a site's config does. This was chosen
 * over `require.resolve` absolute paths in a `.cjs` config and over a stub
 * database, because the migration chain `db:generate` writes into the site
 * imports `kysely` by name too: only a `node_modules` the site can resolve
 * through lets `db:init` load that chain and apply it to a real database. The
 * config cannot import core's own `libsql` driver: without `dist`, its source
 * imports through the `@/` alias, which the CLI's loader cannot resolve.
 */

// Declares `testDbDir` on vitest's `ProvidedContext`, for `inject` below.
import type {} from './global-setup';
import type { ArgsDef, CommandDef } from 'citty';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { format } from 'node:util';
import { runCommand } from 'citty';
import { inject, vi } from 'vitest';

/** Core's installed dependencies, which a temp site resolves its imports through. */
const NODE_MODULES = join(import.meta.dirname, '../../node_modules');

/** What one command run printed, line by line, and the code it exits with. */
export type CliResult = {
    /** `console.log`, `console.info` and `console.debug` lines. */
    stdout: string[];
    /** `console.error` and `console.warn` lines, and `process.stderr.write` text split into lines. */
    stderr: string[];
    /**
     * The code passed to `process.exit`, else `process.exitCode`, else 0. A bare
     * `process.exit()` reports `process.exitCode ?? 0`, as Node exits with.
     */
    exitCode: number;
};

/** Thrown in place of `process.exit`, so the command stops where a process would. */
class ProcessExit extends Error {
    constructor(readonly code: number) {
        super(`process.exit(${code})`);
    }
}

/**
 * Run `command` with `argv` (`['--config', path, '--collapse']`), parsed by
 * citty as the CLI parses it. `process.exit(n)` throws a value the run catches
 * and reports as exit code `n`. Output after `process.exit` is dropped, as a
 * real process would have ended: a command whose own `catch` swallows the
 * thrown value (`withApplication`) can still print, but a site never sees it.
 * Any other error is rethrown. Console methods, `process.stderr.write`,
 * `process.exit` and `process.exitCode` are restored afterwards.
 *
 * Output is captured, so the console guard never sees it: a test reads all of
 * `stderr`, or runs through `runOk`.
 */
export async function run<T extends ArgsDef>(
    command: CommandDef<T>,
    argv: string[]
): Promise<CliResult> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let exitedWith: number | undefined;
    const capture =
        (lines: string[]) =>
        (...args: unknown[]): void => {
            if (exitedWith === undefined) lines.push(format(...args));
        };
    const spies = [
        vi.spyOn(console, 'log').mockImplementation(capture(stdout)),
        vi.spyOn(console, 'info').mockImplementation(capture(stdout)),
        vi.spyOn(console, 'debug').mockImplementation(capture(stdout)),
        vi.spyOn(console, 'error').mockImplementation(capture(stderr)),
        vi.spyOn(console, 'warn').mockImplementation(capture(stderr)),
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk, ...rest) => {
            if (exitedWith === undefined) {
                const text =
                    typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
                stderr.push(...text.replace(/\n$/, '').split('\n'));
            }
            const callback = rest.find((arg) => typeof arg === 'function');
            callback?.();
            return true;
        }),
        vi.spyOn(process, 'exit').mockImplementation((code) => {
            exitedWith ??= Number(code ?? process.exitCode ?? 0);
            throw new ProcessExit(exitedWith);
        }),
    ];
    const exitCodeBefore = process.exitCode;
    process.exitCode = undefined;
    let exitCode: number;
    try {
        await runCommand(command, { rawArgs: argv });
    } catch (error) {
        if (!(error instanceof ProcessExit)) throw error;
    } finally {
        for (const spy of spies) spy.mockRestore();
        exitCode = exitedWith ?? Number(process.exitCode ?? 0);
        process.exitCode = exitCodeBefore;
    }
    return { stdout, stderr, exitCode };
}

/**
 * `run` for a setup step: throws, with what the command printed, unless it
 * exits 0 with nothing on stderr. A setup run's output is captured and never
 * read, so this is what stops an unexpected warning there from passing.
 */
export async function runOk<T extends ArgsDef>(
    command: CommandDef<T>,
    argv: string[]
): Promise<CliResult> {
    const result = await run(command, argv);
    if (result.exitCode !== 0 || result.stderr.length > 0) {
        throw new Error(
            `setup run [${argv.join(' ')}] exited ${result.exitCode} with stderr:\n` +
                result.stderr.join('\n')
        );
    }
    return result;
}

/**
 * A new directory in the run's temp dir, which global setup removes, with
 * `node_modules` linked to core's so a config or migration in it can import
 * `kysely` by name.
 */
export async function createTempSite(): Promise<string> {
    const site = await mkdtemp(join(inject('testDbDir'), 'site-'));
    await symlink(NODE_MODULES, join(site, 'node_modules'), 'dir');
    return site;
}

/** What `writeSiteConfig` puts in the config. */
export type SiteConfigOptions = {
    /**
     * The libsql database file the config's driver opens. Leave it out for a
     * command that never queries the database (codegen): `getInstance()` then
     * returns a stand-in that throws on any property read, so no file is
     * opened and a query fails the run.
     */
    database?: string;
    /** The config's `migrationsDir`. */
    migrationsDir?: string;
    /** The config's `entries`, as plain data. */
    entries?: Record<string, unknown>;
    /** The config's `globals`, as plain data. Left out of the config when absent. */
    globals?: unknown[];
    /** The config's `roles`, as plain data. Left out of the config when absent. */
    roles?: Record<string, unknown>;
    /** What the driver's `isRemote()` returns. */
    remote?: boolean;
    /** Make `getInstance()` throw, so a test sees a refusal come before the database opens. */
    throwOnOpen?: boolean;
};

/**
 * Write `astromech.config.mjs` in `site` and return its path. Its `db` is a
 * libsql driver built from `kysely` and `@libsql/kysely-libsql` the way core's
 * `libsql` driver builds one, opening one Kysely instance on first use.
 */
export async function writeSiteConfig(
    site: string,
    options: SiteConfigOptions
): Promise<string> {
    const file = join(site, 'astromech.config.mjs');
    const open =
        options.database === undefined
            ? `instance ??= new Proxy({}, {
                get(_, key) {
                    throw new Error('read ' + String(key) + ' on the stand-in database: give writeSiteConfig a database for a command that queries it');
                },
            });`
            : `instance ??= new Kysely({
                dialect: new LibsqlDialect({ url: ${JSON.stringify(`file:${options.database}`)} }),
                plugins: [new CamelCasePlugin()],
            });`;
    const optional = [
        options.migrationsDir !== undefined
            ? `    migrationsDir: ${JSON.stringify(options.migrationsDir)},\n`
            : '',
        options.globals !== undefined
            ? `    globals: ${JSON.stringify(options.globals)},\n`
            : '',
        options.roles !== undefined
            ? `    roles: ${JSON.stringify(options.roles)},\n`
            : '',
    ].join('');
    await writeFile(
        file,
        `import { LibsqlDialect } from '@libsql/kysely-libsql';
import { CamelCasePlugin, Kysely } from 'kysely';

let instance;
export default {
    db: {
        type: 'libsql',
        isRemote: () => ${options.remote === true},
        getInstance() {
            if (${options.throwOnOpen === true}) throw new Error('opened the database');
            ${open}
            return instance;
        },
    },
${optional}    entries: ${JSON.stringify(options.entries ?? {})},
};
`
    );
    return file;
}
