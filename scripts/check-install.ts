/**
 * Installs the published packages the way a new site gets them and runs what
 * `apps/docs/installation.md` tells a new user to run.
 *
 *     pnpm run check:install
 *     pnpm run check:install:pnpm
 *
 * Exit codes: 0 when every stage passed, 1 when one failed, 2 on a usage error.
 *
 * Each script runs the check as a Turborepo task of the scripts package
 * (`scripts/turbo.json`), with `--package-manager npm` or `--package-manager
 * pnpm`, after the build of every published package, so the tarballs hold the
 * `dist` their sources make. The task is never cached. Both take the run lock
 * (`scripts/turbo.ts --lock`).
 *
 * Every other check runs against the workspace, where the demo apps link the
 * packages, so three kinds
 * of defect pass the whole gate: packaging (the files and exports a tarball
 * carries), Vite pre-bundling (Vite never pre-bundles a linked package), and
 * the migration generator (the demo's committed migrations stand in for what
 * `db:generate` writes on a new site).
 *
 * `pnpm pack` makes a tarball of every published package, and publint
 * (https://publint.dev) lints each: its `package.json` as packed against the
 * files it holds. A warning or an error fails the check. A scratch site under
 * the OS temp directory installs four of them with `--package-manager npm`
 * (the default) or `pnpm`.
 * pnpm hoists nothing, which is where the nested `optimizeDeps` entries
 * (`astromech > @astromech/admin > x`) matter most.
 *
 * The guide is the fixture. Its files (the two configs and the empty
 * migrations index), its install command and its `npx astromech` commands are
 * read out of the page, so the check runs the page as written, and an edit that
 * breaks the check fails naming the page. Where the guide's
 * `security.allowedDomains` names the site's own domain, the check names the
 * address it serves the site on instead.
 *
 * A site adds plugins the same way, so the check installs `@astromech/backups`
 * from its tarball on top of the guide and registers it in the config. Its
 * admin page and one of its raw routes are called in the admin flow, which
 * covers a plugin installed from npm rather than linked.
 *
 * After `db:generate` and `db:init`, `astro dev` serves the site and the admin
 * flow in `scripts/lib/admin-browser-check.ts` runs against it in headless
 * chromium. Then `astro build` runs against a fresh database, and the same flow
 * runs against the built server. A new user sees every warning these print, so
 * a deprecated package in the install, a warning line from `astro dev` or
 * `astro build`, and a console warning in the browser each fail the check,
 * apart from the allowlists below.
 *
 * The install resolves everything except the four tarballs from the npm
 * registry, unpinned, as the guide's command does, so a new upstream release
 * can break the guide with nothing changed here. That needs the network, which
 * is why this is a CI job of its own, run weekly as well as on a push, and not
 * a stage of `pnpm run verify`, which runs offline.
 *
 * On a failure the scratch site is kept and its path printed, since it is the
 * evidence.
 */
import type { StartedProcess } from './lib/run.ts';
import type { WorkspacePackage } from './lib/workspace-packages.ts';
import type { SpawnOptions } from 'node:child_process';
import console from 'node:console';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';
import { closeAdminBrowser, expectAdminWorks } from './lib/admin-browser-check.ts';
import {
    betterAuthSecret,
    environmentWithoutNodeEnv,
    expectStatus,
    freePort,
    step,
    waitForServer,
} from './lib/check-helpers.ts';
import { stopProcessGroup } from './lib/process-group.ts';
import { run, start } from './lib/run.ts';
import { workspacePackages } from './lib/workspace-packages.ts';

const NAME = 'check:install';
const USAGE = 'usage: node scripts/check-install.ts [--package-manager npm | pnpm]';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = 'apps/docs/installation.md';

// The plugin the site adds after the guide: it has a table with its own
// migrations, an admin page and raw routes, so each is installed from npm.
const PLUGIN = '@astromech/backups';

/** The files the guide must give a code block for, named in its first line. */
const GUIDE_FILES = ['astro.config.mjs', 'astromech.config.ts', 'migrations/index.ts'];

/** The `npx astromech` commands the guide must list. */
const GUIDE_COMMANDS = ['db:generate', 'db:init'];

/** A command and its arguments. */
type Command = [command: string, args: string[]];

/** How a package manager adds packages and runs a binary the site installed. */
type PackageManager = {
    add: (packages: string[]) => Command;
    exec: (args: string[]) => Command;
};

const PACKAGE_MANAGERS = {
    npm: {
        add: (packages) => ['npm', ['install', ...packages]],
        // `--no` makes a missing binary fail rather than fetch a package of the
        // same name from the registry.
        exec: (args) => ['npx', ['--no', ...args]],
    },
    pnpm: {
        add: (packages) => ['pnpm', ['add', ...packages]],
        exec: (args) => ['pnpm', ['exec', ...args]],
    },
} satisfies Record<string, PackageManager>;

type PackageManagerName = keyof typeof PACKAGE_MANAGERS;

// Packages the install may report as deprecated. Each comes through a
// dependency outside this repo, so it is named with the path it arrives by.
const ALLOWED_DEPRECATIONS = [
    // `@libsql/kysely-libsql` 0.4.1 depends on `@libsql/client` 0.8, which
    // reaches it through `@libsql/hrana-client`, `node-fetch` and `fetch-blob`.
    'node-domexception',
];

// Dependencies whose build scripts the pnpm install may run. pnpm 11 fails an
// install when a dependency has a build script nobody approved, and a pnpm user
// approves one with `pnpm approve-builds`, which writes the same `allowBuilds`
// entry. npm runs every build script, so it needs no list.
const ALLOWED_BUILDS = [
    // Through `astro` and `vite`, so every Astro site on pnpm approves it.
    'esbuild',
];

// Lines `astro dev` may print that read as a warning or an error.
const ALLOWED_DEV_WARNINGS = [
    // Better Auth takes the origin from each request when `BETTER_AUTH_URL` is
    // unset, and logs this. Section 4 of the guide documents it.
    'Base URL is not set',
];

// Lines `astro build` may print that read as a warning or an error.
const ALLOWED_BUILD_WARNINGS: string[] = [];

// A warning or an error as Astro, Vite, Node and Better Auth print one, and the
// `(!)` Rollup puts before its chunk size warning.
const WARNING_LINE = /\b(warn|warning|error)\b|\(!\)|Some chunks are larger than/i;

/** How long a stopped server's process group gets to exit before SIGKILL. */
const STOP_GRACE_MS = 5000;

// The page an Astro project has before Astromech is added. The guide starts
// from an existing project, so the check makes the smallest one.
const INDEX_PAGE = `---
---
<html lang="en">
    <head><meta charset="utf-8" /><title>Site</title></head>
    <body><h1>Site</h1></body>
</html>
`;

/** What the check takes from the guide. */
type Guide = {
    files: Map<string, string>;
    installPackages: string[];
    cliCommands: string[][];
    dbInit: string[];
};

/** A command's or a server's kept output, with the label a failure prints it under. */
type Output = { label: string; process: StartedProcess };

let scratchDir: string | undefined;
let server: Output | undefined;
/** The output of the current stage's command or server, printed if the check fails. */
let latestOutput: Output | undefined;

const packageManager = parseArguments();
if (packageManager === undefined) {
    process.exitCode = 2;
} else {
    process.exitCode = await check(packageManager);
}

/**
 * The `--package-manager` flag, `npm` unless given, or undefined after
 * printing the usage. pnpm passes a `--` on to the script, so every `--` is
 * dropped.
 */
function parseArguments(): PackageManagerName | undefined {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            strict: true,
            options: { 'package-manager': { type: 'string', default: 'npm' } },
        });
        const name = values['package-manager'];
        if (!Object.hasOwn(PACKAGE_MANAGERS, name)) {
            throw new Error(
                `--package-manager must be ${Object.keys(PACKAGE_MANAGERS).join(' or ')}, not ${name}`
            );
        }
        return name as PackageManagerName;
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return undefined;
    }
}

/** Runs the check, and returns its exit code. */
async function check(name: PackageManagerName): Promise<number> {
    // The servers run in process groups of their own, so a Ctrl-C does not
    // reach them. Stop them here.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            void cleanUp(false).finally(() =>
                process.exit(128 + constants.signals[signal])
            );
        });
    }

    let passed = false;
    try {
        await main(name);
        passed = true;
        console.log(`\nok   ${NAME}`);
        return 0;
    } catch (error) {
        if (latestOutput !== undefined) {
            console.error(`\n--- ${latestOutput.label} output ---`);
            console.error(latestOutput.process.output);
        }
        console.error(`\nFAIL ${NAME}: ${(error as Error).message}`);
        return 1;
    } finally {
        await cleanUp(passed);
    }
}

async function main(name: PackageManagerName): Promise<void> {
    const commands: PackageManager = PACKAGE_MANAGERS[name];

    const guide = readGuide(await readFile(join(repoRoot, GUIDE), 'utf8'));

    scratchDir = await mkdtemp(join(tmpdir(), 'astromech-check-install-'));
    const siteDir = join(scratchDir, 'site');
    const tarballDir = join(scratchDir, 'tarballs');
    const env = siteEnvironment();
    const inSite: SpawnOptions = { cwd: siteDir, env };

    const published = workspacePackages(repoRoot).filter(
        ({ manifest }) => manifest.private !== true
    );
    const tarballs = await stage(
        'pack',
        `packing ${published.map(({ name }) => name).join(', ')}`,
        () => packPackages(published, tarballDir)
    );
    await stage('publint', 'linting each tarball with publint', () =>
        lintTarballs(tarballs)
    );

    // Both ports are picked before the site is written, since the guide's
    // `security.allowedDomains` names the addresses the site is served on.
    const devPort = await freePort();
    const servePort = await freePort();
    await stage('site', `writing the site ${GUIDE} starts from`, async () => {
        await writeSite(siteDir, guide.files, name, tarballs);
        await setAllowedDomains(siteDir, [devPort, servePort]);
    });

    const packages = guide.installPackages.map((each) =>
        each === 'astromech' ? tarball(tarballs, 'astromech') : each
    );
    const add = commands.add(packages);
    await stage('install', `installing with ${formatCommand(add)}`, async () => {
        const output = await runCaptured('install', add, inSite);
        expectNoDeprecations(output);
    });

    const addPlugin = commands.add([tarball(tarballs, PLUGIN)]);
    await stage('plugin', `adding ${PLUGIN} to the site`, async () => {
        const output = await runCaptured(`install ${PLUGIN}`, addPlugin, inSite);
        expectNoDeprecations(output);
        await addPluginToConfig(siteDir);
    });

    await stage('cli', "running the guide's astromech commands", async () => {
        for (const args of guide.cliCommands) {
            const [command, commandArgs] = commands.exec(args);
            console.log(`  $ ${formatCommand([command, commandArgs])}`);
            await run(command, commandArgs, inSite);
        }
    });

    await stage('dev', `serving the site with astro dev on port ${devPort}`, () =>
        checkDevServer(commands, inSite, devPort)
    );

    await stage('build', 'building the site against a fresh database', async () => {
        await removeDatabase(siteDir);
        const [command, args] = commands.exec(guide.dbInit);
        await run(command, args, inSite);
        const output = await runCaptured(
            'astro build',
            commands.exec(['astro', 'build']),
            inSite
        );
        expectNoWarnings('astro build', output, ALLOWED_BUILD_WARNINGS);
    });

    await stage('serve', `starting dist/server/entry.mjs on port ${servePort}`, () =>
        checkBuiltServer(inSite, servePort)
    );
}

/**
 * What the check takes from the guide: the files it writes, the packages its
 * install command names, and its `npx astromech` commands in order.
 */
function readGuide(markdown: string): Guide {
    const blocks = readFencedBlocks(markdown);
    const shellLines = blocks
        .filter((block) => block.language === 'sh')
        .flatMap((block) => block.body.split('\n').map((line) => line.trim()));
    const cliCommands = readCliCommands(shellLines);
    const dbInit = cliCommands.find((args) => args[1] === 'db:init');
    if (dbInit === undefined)
        throw guideError('an `sh` block line `npx astromech db:init`');
    return {
        files: readGuideFiles(blocks),
        installPackages: readInstallPackages(shellLines),
        cliCommands,
        dbInit,
    };
}

/** The fenced code blocks of a markdown document, with each one's language. */
function readFencedBlocks(markdown: string): { language: string; body: string }[] {
    return [...markdown.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map(
        ([, language = '', body = '']) => ({ language, body })
    );
}

/** Every block whose first line is a `// <file path>` comment, by that path. */
function readGuideFiles(blocks: { body: string }[]): Map<string, string> {
    const files = new Map<string, string>();
    for (const { body } of blocks) {
        const name = /^\/\/ ([\w./-]+\.\w+)\n/.exec(body)?.[1];
        if (name !== undefined) files.set(name, body);
    }
    for (const name of GUIDE_FILES) {
        if (!files.has(name)) {
            throw guideError(`a code block whose first line is \`// ${name}\``);
        }
    }
    return files;
}

/** The packages the `npm install astromech ...` line names. */
function readInstallPackages(shellLines: string[]): string[] {
    const line = shellLines.find((text) => text.startsWith('npm install astromech '));
    if (line === undefined) {
        throw guideError('an `sh` block line starting `npm install astromech`');
    }
    return line.split(/\s+/).slice(2);
}

/**
 * The `npx astromech` commands, in order, as the arguments after `npx`. A
 * command with `--config` is the example for a config kept elsewhere.
 */
function readCliCommands(shellLines: string[]): string[][] {
    const commands = shellLines
        .filter((line) => line.startsWith('npx astromech ') && !line.includes('--config'))
        .map((line) => line.split(/\s+/).slice(1));
    for (const name of GUIDE_COMMANDS) {
        if (!commands.some((args) => args[1] === name)) {
            throw guideError(`an \`sh\` block line \`npx astromech ${name}\``);
        }
    }
    return commands;
}

function guideError(expected: string): Error {
    return new Error(`${GUIDE} has no ${expected}, which this check reads from it`);
}

/**
 * The environment the site's commands run in. `pnpm run` gives its scripts
 * `npm_*` and `pnpm_config_*` variables that a child npm or pnpm would read as
 * its own config, and the guide's development steps set no Better Auth
 * variables, so neither kind is passed on. Nor is `NODE_ENV`: see
 * `environmentWithoutNodeEnv`.
 */
function siteEnvironment(): NodeJS.ProcessEnv {
    const inherited = Object.entries(environmentWithoutNodeEnv(NAME)).filter(
        ([key]) =>
            !key.startsWith('npm_') &&
            !key.startsWith('pnpm_config_') &&
            key !== 'PNPM_SCRIPT_SRC_DIR' &&
            !key.startsWith('BETTER_AUTH_')
    );
    return {
        ...Object.fromEntries(inherited),
        // Any prompt a package manager raised would read a stdin that may not
        // be a terminal and hang. This check is non-interactive; say so.
        CI: 'true',
    };
}

/** `pnpm pack` each package into a directory of its own under `dir`, by name. */
async function packPackages(
    packages: WorkspacePackage[],
    dir: string
): Promise<Record<string, string>> {
    const tarballs: Record<string, string> = {};
    for (const { name, directory: packageDir } of packages) {
        const destination = join(dir, basename(packageDir));
        await mkdir(destination, { recursive: true });
        await runCaptured(
            `pnpm pack (${name})`,
            ['pnpm', ['pack', '--pack-destination', destination]],
            { cwd: packageDir }
        );
        const [packed] = (await readdir(destination)).filter((file) =>
            file.endsWith('.tgz')
        );
        if (packed === undefined)
            throw new Error(`pnpm pack wrote no tarball for ${name}`);
        tarballs[name] = join(destination, packed);
    }
    return tarballs;
}

/**
 * Lint each tarball with publint (https://publint.dev), as Astro lints its
 * packages before a release: the `package.json` pnpm packed, with
 * `publishConfig` applied, against the files the tarball holds. A warning
 * fails the check as an error does (`strict`); a suggestion is printed.
 */
async function lintTarballs(tarballs: Record<string, string>): Promise<void> {
    const failures: string[] = [];
    for (const [name, path] of Object.entries(tarballs)) {
        // A copy, so publint gets an `ArrayBuffer` holding only the tarball.
        const tarball = new Uint8Array(await readFile(path)).buffer;
        const { messages, pkg } = await publint({ pack: { tarball }, strict: true });
        for (const message of messages) {
            const line = `${name}: ${message.type} ${message.code}: ${formatMessage(message, pkg, { color: false }) ?? ''}`;
            if (message.type === 'suggestion') console.log(`  note ${line}`);
            else failures.push(line);
        }
    }
    if (failures.length > 0) {
        throw new Error(
            `publint reported ${failures.length} problem(s):\n${failures.map((line) => `      ${line}`).join('\n')}`
        );
    }
    console.log(
        `  ok  publint reports no warning or error for the ${Object.keys(tarballs).length} tarballs`
    );
}

/** The tarball `packPackages` packed for `name`. */
function tarball(tarballs: Record<string, string>, name: string): string {
    const path = tarballs[name];
    if (path === undefined) throw new Error(`no tarball was packed for ${name}`);
    return path;
}

/**
 * Write the Astro project the guide starts from and the guide's own files.
 * Core's tarball asks for `@astromech/admin` and `@astromech/schema-engine` at
 * a version the registry may not have, so overrides point both at their
 * tarballs.
 */
async function writeSite(
    siteDir: string,
    files: Map<string, string>,
    packageManager: PackageManagerName,
    tarballs: Record<string, string>
): Promise<void> {
    await mkdir(join(siteDir, 'src', 'pages'), { recursive: true });
    const overrides = {
        '@astromech/admin': `file:${tarball(tarballs, '@astromech/admin')}`,
        '@astromech/schema-engine': `file:${tarball(tarballs, '@astromech/schema-engine')}`,
    };

    const manifest = {
        name: 'astromech-check-install-site',
        private: true,
        type: 'module',
        ...(packageManager === 'npm' ? { overrides } : {}),
    };
    await writeFile(
        join(siteDir, 'package.json'),
        `${JSON.stringify(manifest, null, 4)}\n`
    );

    if (packageManager === 'pnpm') {
        // pnpm 11 reads both settings only from `pnpm-workspace.yaml`.
        const allowBuilds = Object.fromEntries(
            ALLOWED_BUILDS.map((name) => [name, true])
        );
        await writeFile(
            join(siteDir, 'pnpm-workspace.yaml'),
            formatYamlMap('allowBuilds', allowBuilds) +
                formatYamlMap('overrides', overrides)
        );
    }

    await writeFile(join(siteDir, 'src', 'pages', 'index.astro'), INDEX_PAGE);
    for (const [name, contents] of files) {
        await mkdir(dirname(join(siteDir, name)), { recursive: true });
        await writeFile(join(siteDir, name), contents);
    }
}

/** A top-level YAML map, empty when it has no entries. JSON quoting is valid YAML. */
function formatYamlMap(key: string, entries: Record<string, unknown>): string {
    const lines = Object.entries(entries).map(
        ([name, value]) => `    ${JSON.stringify(name)}: ${JSON.stringify(value)}`
    );
    return lines.length === 0 ? '' : `${key}:\n${lines.join('\n')}\n`;
}

/** Serve the site with `astro dev`, run the admin flow, and read its output. */
async function checkDevServer(
    commands: PackageManager,
    inSite: SpawnOptions,
    port: number
): Promise<void> {
    const base = `http://127.0.0.1:${port}`;
    const dev = startServer(
        'astro dev',
        commands.exec(['astro', 'dev', '--host', '127.0.0.1', '--port', String(port)]),
        {
            ...inSite,
            env: {
                ...inSite.env,
                // Astro 7.3 runs `astro dev` as a detached background process
                // when it detects an AI agent, and on a failure prints only "Dev
                // server process exited before becoming ready." while the real
                // error goes to `.astro/dev.log`. This variable makes it serve
                // in the foreground, as it does for a user at a terminal.
                ASTRO_DEV_BACKGROUND: '1',
            },
        }
    );
    await waitForServer(base, dev);
    await expectAdminWorks(`${base}/cms`, { pluginPage: true, failOnWarnings: true });
    await closeAdminBrowser();
    expectNoWarnings('astro dev', dev.output, ALLOWED_DEV_WARNINGS);
    await stopServer();
}

/** Serve the built site, assert three routes, and run the admin flow. */
async function checkBuiltServer(inSite: SpawnOptions, port: number): Promise<void> {
    const base = `http://127.0.0.1:${port}`;
    const built = startServer(
        'dist/server/entry.mjs',
        ['node', ['./dist/server/entry.mjs']],
        {
            ...inSite,
            env: {
                ...inSite.env,
                HOST: '127.0.0.1',
                PORT: String(port),
                // Better Auth refuses a sign-up whose `Origin` is not its base URL.
                BETTER_AUTH_URL: base,
                // The built server refuses every request without a secret.
                BETTER_AUTH_SECRET: betterAuthSecret(),
            },
        }
    );
    await waitForServer(base, built);

    await expectStatus(`${base}/`, 200, 'the site renders');
    await expectStatus(`${base}/cms`, 200, 'the admin route is mounted');
    await expectStatus(
        `${base}/cms/api/entries/post`,
        401,
        'the API rejects an anonymous read'
    );

    await expectAdminWorks(`${base}/cms`, { pluginPage: true, failOnWarnings: true });
    await closeAdminBrowser();
    await stopServer();
}

/**
 * Register the plugin in the guide's `astromech.config.ts`, as the plugin's
 * README tells a site to: import its factory and call it in `plugins`.
 */
async function addPluginToConfig(siteDir: string): Promise<void> {
    const file = join(siteDir, 'astromech.config.ts');
    const config = await readFile(file, 'utf8');
    const opening = 'export default defineConfig({\n';
    if (!config.includes(opening)) {
        throw guideError(
            `an \`astromech.config.ts\` block containing \`${opening.trim()}\``
        );
    }
    const withPlugin = config.replace(opening, `${opening}    plugins: [backups()],\n`);
    await writeFile(file, `import { backups } from '${PLUGIN}';\n${withPlugin}`);
}

/**
 * Point the guide's `security.allowedDomains` at the addresses the check serves
 * the site on, as the guide tells a site to name its own domain. Astro's Node
 * adapter trusts a `Host` header only when it matches, and the built server
 * reads the list from the build.
 */
async function setAllowedDomains(siteDir: string, ports: number[]): Promise<void> {
    const file = join(siteDir, 'astro.config.mjs');
    const config = await readFile(file, 'utf8');
    const lists = config.match(/allowedDomains: \[[^\]]*\]/g) ?? [];
    const [list] = lists;
    if (lists.length !== 1 || list === undefined) {
        throw guideError(
            'an `astro.config.mjs` block with one `allowedDomains: [...]` list'
        );
    }
    const patterns = ports
        .map((port) => `{ hostname: '127.0.0.1', port: '${port}' }`)
        .join(', ');
    await writeFile(file, config.replace(list, `allowedDomains: [${patterns}]`));
}

/** Remove the SQLite file the guide's config names, and any journal beside it. */
async function removeDatabase(siteDir: string): Promise<void> {
    for (const file of await readdir(siteDir)) {
        if (file.startsWith('database.db')) await rm(join(siteDir, file));
    }
}

/**
 * Fail on a deprecated package outside `ALLOWED_DEPRECATIONS`, naming each one
 * found, and name the allowed ones that were reported so a stale entry shows.
 */
function expectNoDeprecations(output: string): void {
    const reported = [...new Set(findDeprecatedPackages(output))];
    const unexpected = reported.filter((name) => !ALLOWED_DEPRECATIONS.includes(name));
    if (unexpected.length > 0) {
        throw new Error(
            `the install reported deprecated packages: ${unexpected.join(', ')}`
        );
    }
    const allowed = reported.length > 0 ? ` (allowed: ${reported.join(', ')})` : '';
    console.log(`  ok  the install reports no unexpected deprecated package${allowed}`);
}

/**
 * The names of the packages an install reported as deprecated. npm prints
 * `npm warn deprecated name@version: reason` for each. pnpm prints `WARN
 * deprecated name@version` for a direct dependency, and one `WARN N deprecated
 * subdependencies found: a@1.0.0, b@2.0.0` line for the rest.
 */
function findDeprecatedPackages(output: string): string[] {
    const names: string[] = [];
    for (const line of stripVTControlCharacters(output).split('\n')) {
        const summary = /deprecated subdependencies found:(.*)$/.exec(line)?.[1];
        if (summary !== undefined) {
            for (const [, name] of summary.matchAll(/(@?[^@\s,]+)@[^\s,]+/g)) {
                if (name !== undefined) names.push(name);
            }
            continue;
        }
        const single = /\bwarn\b.*\bdeprecated (@?[^@\s]+)@/i.exec(line)?.[1];
        if (single !== undefined) names.push(single);
    }
    return names;
}

/** Fail naming every line of `output` that reads as a warning, apart from `allowed`. */
function expectNoWarnings(source: string, output: string, allowed: string[]): void {
    const lines = stripVTControlCharacters(output)
        .split('\n')
        .filter((line) => WARNING_LINE.test(line))
        .filter((line) => !allowed.some((text) => line.includes(text)));
    if (lines.length > 0) {
        const listed = lines.map((line) => `      ${line.trim()}`).join('\n');
        throw new Error(`${source} printed warning or error lines:\n${listed}`);
    }
    console.log(`  ok  ${source} prints no warning outside the allowlist`);
}

/** Run one stage under a step line, then print how long it took. */
async function stage<T>(
    name: string,
    message: string,
    body: () => Promise<T>
): Promise<T> {
    step(message);
    latestOutput = undefined;
    const started = Date.now();
    const result = await body();
    console.log(`  ${name} took ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return result;
}

/**
 * Run a command to completion with its output kept rather than printed,
 * resolving with the output. It is printed only if the check fails.
 */
async function runCaptured(
    label: string,
    [command, args]: Command,
    options: SpawnOptions
): Promise<string> {
    const started = start(command, args, options);
    latestOutput = { label, process: started };
    await started.done;
    return started.output;
}

/**
 * Start a server with its output kept. It leads its own process group, so
 * `stopServer` also stops what it starts (`npx` starts Astro).
 */
function startServer(
    label: string,
    [command, args]: Command,
    options: SpawnOptions
): StartedProcess {
    const started = start(command, args, { ...options, detached: true });
    server = { label, process: started };
    latestOutput = server;
    return started;
}

async function stopServer(): Promise<void> {
    if (server === undefined) return;
    await stopProcessGroup(server.process.child, STOP_GRACE_MS);
    server = undefined;
}

function formatCommand([command, args]: Command): string {
    return [command, ...args].join(' ');
}

/**
 * Close the browser and stop the server on every exit path. The scratch
 * directory is removed only when the check passed, since on a failure the site
 * in it is the evidence.
 */
async function cleanUp(passed: boolean): Promise<void> {
    await closeAdminBrowser();
    await stopServer();
    if (scratchDir === undefined) return;
    if (passed) await rm(scratchDir, { recursive: true, force: true });
    else console.error(`\nThe scratch site is kept at ${join(scratchDir, 'site')}`);
}
