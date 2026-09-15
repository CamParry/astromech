#!/usr/bin/env node
// Installs the published packages the way a new site gets them and runs what
// `apps/docs/installation.md` tells a new user to run. Every other check runs
// against the workspace, where the demo apps link the packages, so three kinds
// of defect pass the whole gate: packaging (the files and exports a tarball
// carries), Vite pre-bundling (Vite never pre-bundles a linked package), and
// the migration generator (the demo's committed migrations stand in for what
// `db:generate` writes on a new site).
//
// `pnpm pack` makes the tarballs, and a scratch site under the OS temp
// directory installs them with `--package-manager npm` (the default) or `pnpm`.
// pnpm hoists nothing, which is where the nested `optimizeDeps` entries
// (`astromech > @astromech/admin > x`) matter most.
//
// The guide is the fixture. Its config files, its install command and its `npx
// astromech` commands are read out of the page, so the check runs the page as
// written, and an edit that breaks the check fails naming the page.
//
// After `db:generate` and `db:init`, `astro dev` serves the site and the admin
// flow in `scripts/admin-browser-check.mjs` runs against it in headless
// chromium. Then `astro build` runs against a fresh database, and the same flow
// runs against the built server. A new user sees every warning these print, so
// a deprecated package in the install, a warning line from `astro dev` or
// `astro build`, and a console warning in the browser each fail the check,
// apart from the allowlists below.
//
// The install resolves everything except the three tarballs from the npm
// registry, unpinned, as the guide's command does, so a new upstream release
// can break the guide with nothing changed here. That needs the network, which
// is why this is a CI job of its own, run weekly as well as on a push, and not
// a stage of `pnpm run verify`, which runs offline.
//
// On a failure the scratch site is kept and its path printed, since it is the
// evidence.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { closeAdminBrowser, expectAdminWorks } from './admin-browser-check.mjs';
import { expectStatus, freePort, run, step, waitForServer } from './check-helpers.mjs';
import { stopProcessGroup } from './process-group.mjs';
import { requireFreshDist } from './require-fresh-dist.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = 'apps/docs/installation.md';

/** The packages the check packs, by name: core and the two it depends on. */
const PACKED_PACKAGES = {
    astromech: join(repoRoot, 'packages', 'astromech'),
    '@astromech/admin': join(repoRoot, 'packages', 'admin'),
    '@astromech/schema-engine': join(repoRoot, 'packages', 'schema-engine'),
};

/** The files the guide must give a code block for, named in its first line. */
const GUIDE_FILES = ['astro.config.mjs', 'astromech.config.ts'];

/** The `npx astromech` commands the guide must list. */
const GUIDE_COMMANDS = ['db:generate', 'db:init'];

/** How each package manager adds packages and runs a binary the site installed. */
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
};

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
const ALLOWED_BUILD_WARNINGS = [];

// A warning or an error as Astro, Vite, Node and Better Auth print one, and the
// `(!)` Rollup puts before its chunk size warning.
const WARNING_LINE = /\b(warn|warning|error)\b|\(!\)|Some chunks are larger than/i;

/** How long a stopped server's process group gets to exit before SIGKILL. */
const STOP_GRACE_MS = 5000;

// The built server refuses every request without a secret. The site lives for
// one run, so this one signs nothing worth protecting.
const BETTER_AUTH_SECRET = 'check-install-secret-0123456789abcdef';

// The page an Astro project has before Astromech is added. The guide starts
// from an existing project, so the check makes the smallest one.
const INDEX_PAGE = `---
---
<html lang="en">
    <head><meta charset="utf-8" /><title>Site</title></head>
    <body><h1>Site</h1></body>
</html>
`;

let scratchDir = null;
let server = null;
/** The captured output of the current stage, printed if the check fails. */
let latestOutput = null;

async function main() {
    const packageManager = readPackageManager(process.argv.slice(2));
    const commands = PACKAGE_MANAGERS[packageManager];

    // The tarballs are packed from each package's `dist`, so a `src` edit since
    // the last build would otherwise install the previous build.
    await requireFreshDist();

    const guide = readGuide(await readFile(join(repoRoot, GUIDE), 'utf8'));

    scratchDir = await mkdtemp(join(tmpdir(), 'astromech-check-install-'));
    const siteDir = join(scratchDir, 'site');
    const env = siteEnvironment();
    const inSite = { cwd: siteDir, env };

    const tarballs = await stage(
        'pack',
        `packing ${Object.keys(PACKED_PACKAGES).join(', ')}`,
        () => packPackages(join(scratchDir, 'tarballs'))
    );

    await stage('site', `writing the site ${GUIDE} starts from`, () =>
        writeSite(siteDir, guide.files, packageManager, tarballs)
    );

    const packages = guide.installPackages.map((name) =>
        name === 'astromech' ? tarballs.astromech : name
    );
    const add = commands.add(packages);
    await stage('install', `installing with ${formatCommand(add)}`, async () => {
        const output = await runCaptured('install', add, inSite);
        expectNoDeprecations(output);
    });

    await stage('cli', "running the guide's astromech commands", async () => {
        for (const args of guide.cliCommands) {
            const command = commands.exec(args);
            console.log(`  $ ${formatCommand(command)}`);
            await run(...command, inSite);
        }
    });

    const devPort = await freePort();
    await stage('dev', `serving the site with astro dev on port ${devPort}`, () =>
        checkDevServer(commands, inSite, devPort)
    );

    await stage('build', 'building the site against a fresh database', async () => {
        await removeDatabase(siteDir);
        await run(...commands.exec(guide.dbInit), inSite);
        const output = await runCaptured(
            'astro build',
            commands.exec(['astro', 'build']),
            inSite
        );
        expectNoWarnings('astro build', output, ALLOWED_BUILD_WARNINGS);
    });

    const servePort = await freePort();
    await stage('serve', `starting dist/server/entry.mjs on port ${servePort}`, () =>
        checkBuiltServer(inSite, servePort)
    );
}

/** The `--package-manager` flag, `npm` unless given. */
function readPackageManager(argv) {
    // `pnpm run check:install -- --package-manager pnpm` passes the `--` on to
    // the script, where npm drops it.
    const args = argv[0] === '--' ? argv.slice(1) : argv;
    const { values } = parseArgs({
        args,
        options: { 'package-manager': { type: 'string', default: 'npm' } },
    });
    const name = values['package-manager'];
    if (!Object.hasOwn(PACKAGE_MANAGERS, name)) {
        throw new Error(
            `--package-manager must be ${Object.keys(PACKAGE_MANAGERS).join(' or ')}, not ${name}`
        );
    }
    return name;
}

/**
 * What the check takes from the guide: the files it writes, the packages its
 * install command names, and its `npx astromech` commands in order.
 */
function readGuide(markdown) {
    const blocks = readFencedBlocks(markdown);
    const shellLines = blocks
        .filter((block) => block.language === 'sh')
        .flatMap((block) => block.body.split('\n').map((line) => line.trim()));
    const cliCommands = readCliCommands(shellLines);
    return {
        files: readGuideFiles(blocks),
        installPackages: readInstallPackages(shellLines),
        cliCommands,
        dbInit: cliCommands.find((args) => args[1] === 'db:init'),
    };
}

/** The fenced code blocks of a markdown document, with each one's language. */
function readFencedBlocks(markdown) {
    return [...markdown.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map(
        ([, language, body]) => ({ language, body })
    );
}

/** Every block whose first line is a `// <file name>` comment, by that name. */
function readGuideFiles(blocks) {
    const files = new Map();
    for (const { body } of blocks) {
        const name = body.match(/^\/\/ ([\w.-]+\.\w+)\n/)?.[1];
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
function readInstallPackages(shellLines) {
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
function readCliCommands(shellLines) {
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

function guideError(expected) {
    return new Error(`${GUIDE} has no ${expected}, which this check reads from it`);
}

/**
 * The environment the site's commands run in. `pnpm run` gives its scripts
 * `npm_*` and `pnpm_config_*` variables that a child npm or pnpm would read as
 * its own config, and the guide's development steps set no Better Auth
 * variables, so neither kind is passed on.
 */
function siteEnvironment() {
    const inherited = Object.entries(process.env).filter(
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
async function packPackages(dir) {
    const tarballs = {};
    for (const [name, packageDir] of Object.entries(PACKED_PACKAGES)) {
        const destination = join(dir, basename(packageDir));
        await mkdir(destination, { recursive: true });
        await runCaptured(
            `pnpm pack (${name})`,
            ['pnpm', ['pack', '--pack-destination', destination]],
            { cwd: packageDir }
        );
        const [tarball] = (await readdir(destination)).filter((file) =>
            file.endsWith('.tgz')
        );
        tarballs[name] = join(destination, tarball);
    }
    return tarballs;
}

/**
 * Write the Astro project the guide starts from and the guide's own files.
 * Core's tarball asks for `@astromech/admin` and `@astromech/schema-engine` at
 * a version the registry may not have, so overrides point both at their
 * tarballs.
 */
async function writeSite(siteDir, files, packageManager, tarballs) {
    await mkdir(join(siteDir, 'src', 'pages'), { recursive: true });
    const overrides = {
        '@astromech/admin': `file:${tarballs['@astromech/admin']}`,
        '@astromech/schema-engine': `file:${tarballs['@astromech/schema-engine']}`,
    };

    const manifest = {
        name: 'astromech-check-install-site',
        private: true,
        type: 'module',
    };
    if (packageManager === 'npm') manifest.overrides = overrides;
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
        await writeFile(join(siteDir, name), contents);
    }
}

/** A top-level YAML map, empty when it has no entries. JSON quoting is valid YAML. */
function formatYamlMap(key, entries) {
    const lines = Object.entries(entries).map(
        ([name, value]) => `    ${JSON.stringify(name)}: ${JSON.stringify(value)}`
    );
    return lines.length === 0 ? '' : `${key}:\n${lines.join('\n')}\n`;
}

/** Serve the site with `astro dev`, run the admin flow, and read its output. */
async function checkDevServer(commands, inSite, port) {
    const base = `http://127.0.0.1:${port}`;
    startServer(
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
    await waitForServer(base, server);
    await expectAdminWorks(`${base}/cms`, { failOnWarnings: true });
    await closeAdminBrowser();
    expectNoWarnings('astro dev', server.output, ALLOWED_DEV_WARNINGS);
    await stopServer();
}

/** Serve the built site, assert three routes, and run the admin flow. */
async function checkBuiltServer(inSite, port) {
    const base = `http://127.0.0.1:${port}`;
    startServer('dist/server/entry.mjs', ['node', ['./dist/server/entry.mjs']], {
        ...inSite,
        env: {
            ...inSite.env,
            HOST: '127.0.0.1',
            PORT: String(port),
            // Better Auth refuses a sign-up whose `Origin` is not its base URL.
            BETTER_AUTH_URL: base,
            BETTER_AUTH_SECRET,
        },
    });
    await waitForServer(base, server);

    await expectStatus(`${base}/`, 200, 'the site renders');
    await expectStatus(`${base}/cms`, 200, 'the admin route is mounted');
    await expectStatus(
        `${base}/cms/api/entries/post`,
        401,
        'the API rejects an anonymous read'
    );

    await expectAdminWorks(`${base}/cms`, { failOnWarnings: true });
    await closeAdminBrowser();
    await stopServer();
}

/** Remove the SQLite file the guide's config names, and any journal beside it. */
async function removeDatabase(siteDir) {
    for (const file of await readdir(siteDir)) {
        if (file.startsWith('database.db')) await rm(join(siteDir, file));
    }
}

/**
 * Fail on a deprecated package outside `ALLOWED_DEPRECATIONS`, naming each one
 * found, and name the allowed ones that were reported so a stale entry shows.
 */
function expectNoDeprecations(output) {
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
function findDeprecatedPackages(output) {
    const names = [];
    for (const line of stripVTControlCharacters(output).split('\n')) {
        const summary = line.match(/deprecated subdependencies found:(.*)$/);
        if (summary !== null) {
            for (const [, name] of summary[1].matchAll(/(@?[^@\s,]+)@[^\s,]+/g)) {
                names.push(name);
            }
            continue;
        }
        const single = line.match(/\bwarn\b.*\bdeprecated (@?[^@\s]+)@/i);
        if (single !== null) names.push(single[1]);
    }
    return names;
}

/** Fail naming every line of `output` that reads as a warning, apart from `allowed`. */
function expectNoWarnings(source, output, allowed) {
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
async function stage(name, message, body) {
    step(message);
    latestOutput = null;
    const started = Date.now();
    const result = await body();
    console.log(`  ${name} took ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return result;
}

/**
 * Run a command to completion with its output captured rather than inherited,
 * resolving with the output. It is printed only if the check fails.
 */
function runCaptured(label, [file, args], options) {
    const handle = { label, output: '' };
    latestOutput = handle;
    return new Promise((fulfil, reject) => {
        const child = spawn(file, args, {
            ...options,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', (chunk) => (handle.output += chunk));
        child.stderr.on('data', (chunk) => (handle.output += chunk));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) fulfil(handle.output);
            else reject(new Error(`${formatCommand([file, args])} exited with ${code}`));
        });
    });
}

/**
 * Start a server with its output captured. It leads its own process group, so
 * `stopServer` also stops what it starts (`npx` starts Astro).
 */
function startServer(label, [file, args], options) {
    const child = spawn(file, args, {
        ...options,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const handle = { label, child, output: '' };
    child.stdout.on('data', (chunk) => (handle.output += chunk));
    child.stderr.on('data', (chunk) => (handle.output += chunk));
    child.on('exit', (code) => {
        handle.exited = code;
    });
    server = handle;
    latestOutput = handle;
}

async function stopServer() {
    if (server === null) return;
    await stopProcessGroup(server.child, STOP_GRACE_MS);
    server = null;
}

function formatCommand([file, args]) {
    return [file, ...args].join(' ');
}

/**
 * Close the browser and stop the server on every exit path. The scratch
 * directory is removed only when the check passed, since on a failure the site
 * in it is the evidence.
 */
async function cleanUp(passed) {
    await closeAdminBrowser();
    await stopServer();
    if (scratchDir === null) return;
    if (passed) await rm(scratchDir, { recursive: true, force: true });
    else console.error(`\nThe scratch site is kept at ${join(scratchDir, 'site')}`);
}

// The servers run in process groups of their own, so a Ctrl-C does not reach
// them. Stop them here.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        void cleanUp(false).finally(() => process.exit(128 + constants.signals[signal]));
    });
}

let passed = false;
try {
    await main();
    passed = true;
    console.log('\ncheck:install passed');
} catch (error) {
    if (latestOutput !== null) {
        console.error(`\n--- ${latestOutput.label} output ---`);
        console.error(latestOutput.output);
    }
    console.error(`\ncheck:install failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await cleanUp(passed);
}
