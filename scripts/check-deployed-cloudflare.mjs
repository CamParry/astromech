#!/usr/bin/env node
// Runs the checks only a deployed Worker and production D1 can answer, against
// the testing deployment of `apps/demo-cloudflare` (its `AGENTS.md`, "Testing
// deployment"). Each check prints one pass or fail line naming the roadmap
// item it answers, and the run exits 1 when any fails.
//
// Never part of `pnpm run verify` or CI: it needs the Cloudflare account and
// the credentials below, and it writes to the testing site (a cron tick, two
// refused sign-ins, a block it removes again). Run it by hand with
// `pnpm run check:deployed:cloudflare` after `wrangler login`.
//
// The site URL and credentials come from `apps/demo-cloudflare/.env.testing`
// in the main checkout, which is gitignored: `SITE_URL`, `OWNER_EMAIL`,
// `OWNER_PASSWORD` and `ASTROMECH_CRON_SECRET`. Set
// `ASTROMECH_TESTING_ENV_FILE` to read another file.
//
// Leave a minute between runs. A run makes three sign-ins from one address,
// which is Better Auth's limit per minute (`RATE_LIMIT_RULES` in
// `packages/astromech/src/auth/better-auth.ts`), and two of them fail: twenty
// failures from one address in 15 minutes block it for an hour.
//
// To add a check, add an entry to `CHECKS`: the roadmap item it answers and a
// function that returns a line of evidence or throws.
//
// Three checks need a special build or deploy, so they are run once by hand,
// not here. Each leaves the deployment and the database as they were. In
// `apps/demo-cloudflare`:
//
// 1. Pending migrations on a deployed Worker (`operations-defects.md`). The
//    Worker has to bundle a migration the database lacks. Build for the
//    environment (`CLOUDFLARE_ENV=testing pnpm exec astro build`) while the
//    database is current, so the build's own migration step changes nothing.
//    In the built chunk holding `migrationNames = ["0000_migration"]` (grep
//    `dist/server`), add a name such as "9999_check_pending". Note the
//    deployed version (`wrangler deployments status --env testing`), upload
//    the build without deploying it (`wrangler versions upload --env
//    testing`), and deploy that version just after a minute boundary
//    (`wrangler versions deploy <new>@100% --env testing --yes`), so fresh
//    isolates boot before the next Cron Trigger. Then start `wrangler tail
//    --env testing --format json`, wait 20 seconds (a tail delivers nothing
//    at first, and one started before the deploy saw nothing), and request
//    `/`. The first request in each new isolate logs "1 migration has not
//    been applied to this database: 9999_check_pending". Deploy the noted
//    version again (`wrangler versions deploy <old>@100%`) and restore the
//    chunk. No database row is touched.
// 2. The cron secret comparison without `nodejs_compat` (`operations-defects.md`).
//    The demo cannot run without the flag: `wrangler versions upload` of a
//    build with `nodejs_compat` removed from `dist/server/wrangler.json` is
//    refused at validation (`No such module "node:events"`, from unenv's
//    `process` polyfill; Astromech's chunks import `node:async_hooks` too),
//    and nothing is deployed. So the comparison is checked alone: a Worker
//    whose `wrangler.json` sets only `name`, `main` and `compatibility_date`,
//    importing `timingSafeEqual` from `hono/dist/utils/buffer.js` by absolute
//    path, served with `wrangler dev --local`, answers true for equal values
//    and false for unequal ones, with no `process` global.
// 3. The `better-auth/plugins` import adds only `openAPI` to the Worker bundle
//    (`write-race-and-data-loss-defects.md`). After any build, search
//    `dist/server` for each plugin's `id: "<name>"` (the plugin folders under
//    `better-auth/dist/plugins`): only `open-api` is found.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseEnv } from 'node:util';
import { REQUEST_TIMEOUT_MS, sleep } from './check-helpers.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo-cloudflare');

/** The wrangler environment the testing deployment is. */
const WRANGLER_ENV = 'testing';

/** How long each isolate keeps the block and allow lists (`packages/astromech/src/security/address-lists.ts`). */
const ADDRESS_LIST_TTL_MS = 60_000;
/** Allowed past the lifetime for a request in flight. */
const LATENCY_SLACK_MS = 5000;
/** How long the unblock check keeps watching once the lifetime has passed. */
const WATCH_AFTER_TTL_MS = 15_000;
const BLOCK_POLL_INTERVAL_MS = 3000;

const OPERATIONS = 'operations-defects.md';
const WRITE_RACE = 'write-race-and-data-loss-defects.md';
const SECURITY = 'core-security.md';

/**
 * Every check, in the order it runs. `item` names the roadmap file under
 * `roadmap/` and the checkbox; `run` gets the shared context and returns a line
 * of evidence, or throws.
 */
const CHECKS = [
    {
        item: `${OPERATIONS}: d1().isRemote() under CLOUDFLARE_ENV`,
        run: async () => {
            const local = await d1IsRemote(undefined);
            const testing = await d1IsRemote(WRANGLER_ENV);
            if (local !== false || testing !== true) {
                throw new Error(
                    `isRemote() answered ${local} without CLOUDFLARE_ENV and ${testing} under ${WRANGLER_ENV}, expected false and true`
                );
            }
            return `false for the local binding, true under CLOUDFLARE_ENV=${WRANGLER_ENV} ("remote": true)`;
        },
    },
    {
        item: `${OPERATIONS}: db:init refuses remote D1 without --allow-remote`,
        run: async () => {
            const { code, output } = await capture('pnpm', ['run', 'db:init'], {
                cwd: demoDir,
                env: { ...process.env, CLOUDFLARE_ENV: WRANGLER_ENV },
            });
            if (code === 0 || !output.includes('refusing to open the "d1" database')) {
                throw new Error(`db:init exited ${code}:\n${output.trim()}`);
            }
            return `exited ${code} with the refusal, before opening the database`;
        },
    },
    {
        item: `${OPERATIONS}: the cron secret comparison on workerd`,
        run: async (context) => {
            const secret = context.env.ASTROMECH_CRON_SECRET;
            // As a poller sends it: no `Origin`. Astro's `checkOrigin` refuses
            // a POST with neither an `Origin` nor a JSON `Content-Type` before
            // it reaches Astromech (`operations-defects.md`, "Left open").
            const poke = (authorization) =>
                context.http('POST', '/cms/api/cron/run', {
                    origin: false,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authorization === undefined
                            ? {}
                            : { Authorization: authorization }),
                    },
                });
            const right = await poke(`Bearer ${secret}`);
            // The same length as the real one, so only the value differs.
            const wrong = await poke(`Bearer ${'x'.repeat(secret.length)}`);
            const none = await poke(undefined);
            const statuses = [right.status, wrong.status, none.status];
            if (statuses.join() !== '200,401,401') {
                throw new Error(
                    `right, wrong and no bearer answered ${statuses.join(', ')}, expected 200, 401, 401`
                );
            }
            return 'right bearer 200, wrong bearer 401, no bearer 401';
        },
    },
    {
        item: `${OPERATIONS}: last_result and last_error on production D1`,
        run: async (context) => {
            const [rows] = await context.d1(
                "select name, last_run, last_result, last_error from _astromech_cron where name = 'scheduled-publish'"
            );
            const row = rows[0];
            if (row === undefined) throw new Error('no scheduled-publish row');
            const age = Date.now() - Date.parse(row.last_run);
            // The Cron Trigger fires every minute, and the check above ticked.
            if (
                !(age < 3 * 60_000) ||
                row.last_result !== 'ok' ||
                row.last_error !== null
            ) {
                throw new Error(`scheduled-publish row: ${JSON.stringify(row)}`);
            }
            return `scheduled-publish ran ${Math.round(age / 1000)}s ago, last_result 'ok', last_error null`;
        },
    },
    {
        item: `${OPERATIONS}: POST /entries/count on production D1`,
        run: async (context) => {
            const response = await context.http('POST', '/cms/api/entries/count', {
                cookie: await context.session(),
                json: { type: ['page'] },
            });
            const count = response.json?.data?.page;
            if (response.status !== 200 || !Number.isInteger(count)) {
                throw new Error(
                    `answered ${response.status}: ${response.text.slice(0, 500)}`
                );
            }
            return `200 { page: ${count} }`;
        },
    },
    {
        item: `${WRITE_RACE}: the OpenAPI document on workerd`,
        run: async (context) => {
            const response = await context.http('GET', '/cms/api/openapi.json', {
                cookie: await context.session(),
            });
            const paths = Object.keys(response.json?.paths ?? {});
            const auth = paths.filter((path) => path.startsWith('/auth/'));
            if (response.status !== 200 || !auth.includes('/auth/sign-in/email')) {
                throw new Error(
                    `answered ${response.status} with ${auth.length} /auth/* paths: ${response.text.slice(0, 500)}`
                );
            }
            // `auth-document.ts` leaves out the routes that always refuse.
            if (auth.includes('/auth/sign-up/email')) {
                throw new Error(
                    'the document lists /auth/sign-up/email, which always answers 403'
                );
            }
            return `200 with ${paths.length} paths, ${auth.length} under /auth/`;
        },
    },
    {
        item: `${SECURITY}: the three new tables on production D1`,
        run: async (context) => {
            const tables = ['sign_in_failures', 'blocked_addresses', 'allowed_addresses'];
            const [rows] = await context.d1(
                `select name from sqlite_master where type = 'table' and name in (${tables.map((t) => `'${t}'`).join(', ')})`
            );
            const found = rows.map((row) => row.name);
            const missing = tables.filter((table) => !found.includes(table));
            if (missing.length > 0) throw new Error(`missing: ${missing.join(', ')}`);
            return tables.join(', ');
        },
    },
    {
        item: `${SECURITY}: the sign_in_failures upsert with RETURNING`,
        run: async (context) => {
            // A fresh email per run, so its count starts at none. Unknown
            // emails are counted too (`sign-in-failures.ts`).
            const email = `check-${randomBytes(6).toString('hex')}@example.com`;
            const statuses = [];
            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await context.http(
                    'POST',
                    '/cms/api/auth/sign-in/email',
                    { json: { email, password: 'not-a-password' } }
                );
                statuses.push(response.status);
            }
            const key = `account:${createHash('sha256').update(email).digest('hex')}`;
            const [rows] = await context.d1(
                `select count from sign_in_failures where key = '${key}'`
            );
            // The second refusal takes the conflict branch, and a 500 there
            // is the upsert or its RETURNING failing on D1.
            if (statuses.join() !== '401,401' || rows[0]?.count !== 2) {
                throw new Error(
                    `two refused sign-ins answered ${statuses.join(', ')} and counted ${rows[0]?.count ?? 'no row'}, expected 401, 401 and 2`
                );
            }
            return 'two refused sign-ins answered 401, 401 and the row counts 2';
        },
    },
    {
        item: `${SECURITY}: an unblock reaches other isolates within 60 seconds`,
        run: checkUnblock,
    },
];

/**
 * Block this machine's IPv6 address in a request over IPv4, wait for the block
 * to apply, unblock it, and watch IPv6 requests for a while after. The isolate
 * that serves the unblock drops its copy of the lists at once; every other one
 * keeps its copy for up to `ADDRESS_LIST_TTL_MS`, so a refusal more than that
 * after the unblock fails the check. Which isolate answers is Cloudflare's
 * choice, so a pass followed by a refusal is the sign that more than one
 * answered. The block expires in ten minutes, so a run that stops halfway
 * locks nothing out for long.
 */
async function checkUnblock(context) {
    const v6 = await traceAddress(context, 6);
    const v4 = await traceAddress(context, 4);
    if (v6 === undefined || v4 === undefined) {
        throw new Error(
            `needs both IPv4 and IPv6 to the site (found ${v4 ?? 'no IPv4'} and ${v6 ?? 'no IPv6'})`
        );
    }
    const cookie = await context.session();
    const probe = async () =>
        (await context.http('GET', '/cms/api/entries/page', { family: 6 })).status;

    const blocked = await context.http('POST', '/cms/api/security/blocked', {
        family: 4,
        cookie,
        json: {
            address: v6,
            reason: 'check:deployed:cloudflare',
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
    });
    const id = blocked.json?.data?.id;
    if (blocked.status !== 201 || typeof id !== 'string') {
        throw new Error(
            `the block answered ${blocked.status}: ${blocked.text.slice(0, 500)}`
        );
    }
    // Unblocked whether or not the block applied, and before any failure is
    // reported, so a failed run leaves the address blocked no longer than it must.
    const applied = await refusedWithin(
        probe,
        ADDRESS_LIST_TTL_MS + LATENCY_SLACK_MS
    ).catch((error) => error);
    const unblocked = await context.http('DELETE', `/cms/api/security/blocked/${id}`, {
        family: 4,
        cookie,
    });
    if (unblocked.status >= 300) {
        throw new Error(
            `the unblock answered ${unblocked.status}, so the block stays until it expires: ${unblocked.text}`
        );
    }
    if (applied instanceof Error) throw applied;
    if (!applied) throw new Error('the IPv6 address was never refused after the block');

    const watched = await watch(probe, ADDRESS_LIST_TTL_MS + WATCH_AFTER_TTL_MS);
    // An anonymous read answers 401 once the address passes.
    const unexpected = watched.find((probed) => ![401, 403].includes(probed.status));
    if (unexpected !== undefined) {
        throw new Error(
            `an IPv6 request answered ${unexpected.status} after the unblock`
        );
    }
    const refused = watched.filter((probed) => probed.status === 403);
    const lastRefused = refused.at(-1)?.at ?? 0;
    const summary =
        refused.length === 0
            ? `none of ${watched.length} IPv6 requests refused after the unblock`
            : `${refused.length} of ${watched.length} IPv6 requests refused, the last ${seconds(lastRefused)} after the unblock`;
    if (lastRefused > ADDRESS_LIST_TTL_MS + LATENCY_SLACK_MS) throw new Error(summary);
    return `${summary}; all passed from then to ${seconds(watched.at(-1).at)}`;
}

/** Whether `probe` answers 403 within `ms`. */
async function refusedWithin(probe, ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if ((await probe()) === 403) return true;
        await sleep(BLOCK_POLL_INTERVAL_MS);
    }
    return false;
}

/** Each status `probe` answers over `ms`, with the milliseconds since the watch began. */
async function watch(probe, ms) {
    const start = Date.now();
    const watched = [];
    while (Date.now() - start < ms) {
        const status = await probe();
        watched.push({ status, at: Date.now() - start });
        await sleep(BLOCK_POLL_INTERVAL_MS);
    }
    return watched;
}

function seconds(ms) {
    return `${Math.round(ms / 1000)}s`;
}

/** This machine's address as the site sees it over IPv4 or IPv6, or undefined when it has none. */
async function traceAddress(context, family) {
    try {
        const response = await context.http('GET', '/cdn-cgi/trace', { family });
        return /^ip=(.+)$/m.exec(response.text)?.[1];
    } catch {
        return undefined;
    }
}

/** What `d1({ binding: 'DB' }).isRemote()` answers in the demo, with or without `CLOUDFLARE_ENV`. */
async function d1IsRemote(cloudflareEnv) {
    const { CLOUDFLARE_ENV: _ignored, ...env } = process.env;
    if (cloudflareEnv !== undefined) env.CLOUDFLARE_ENV = cloudflareEnv;
    const { code, output } = await capture(
        'node',
        [
            '--input-type=module',
            '-e',
            "import { d1 } from 'astromech/database/d1'; console.log(JSON.stringify(await d1({ binding: 'DB' }).isRemote()));",
        ],
        { cwd: demoDir, env }
    );
    if (code !== 0) throw new Error(`the isRemote() probe exited ${code}:\n${output}`);
    return JSON.parse(output.trim().split('\n').at(-1));
}

/** Run a command and collect its exit code and combined output. */
function capture(command, args, options) {
    return new Promise((fulfil, reject) => {
        const child = spawn(command, args, options);
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.on('error', reject);
        child.on('exit', (code) => fulfil({ code, output }));
    });
}

/** The env file's path: `ASTROMECH_TESTING_ENV_FILE`, or the main checkout's. */
function envFilePath() {
    if (process.env.ASTROMECH_TESTING_ENV_FILE) {
        return resolve(process.env.ASTROMECH_TESTING_ENV_FILE);
    }
    // A worktree has no copy of the gitignored file, so read the main
    // checkout's: the parent of the repository's shared `.git`.
    const commonDir = execFileSync(
        'git',
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        { cwd: repoRoot, encoding: 'utf8' }
    ).trim();
    return join(dirname(commonDir), 'apps', 'demo-cloudflare', '.env.testing');
}

async function readEnvFile(path) {
    const env = parseEnv(await readFile(path, 'utf8'));
    const required = [
        'SITE_URL',
        'OWNER_EMAIL',
        'OWNER_PASSWORD',
        'ASTROMECH_CRON_SECRET',
    ];
    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) throw new Error(`${path} sets no ${missing.join(', ')}`);
    return env;
}

/**
 * The context each check gets: the env file's values, an HTTPS client for the
 * site, the owner's session, and remote D1 reads.
 */
function createContext(env) {
    const siteUrl = env.SITE_URL.replace(/\/$/, '');
    let sessionCookie;

    /**
     * A request to the site. `family` pins IPv4 or IPv6, which `fetch` cannot;
     * `json` is sent as the body, and a JSON answer is parsed into `json`.
     * `origin: false` leaves out the `Origin` a write otherwise sends.
     */
    function http(method, path, options = {}) {
        const url = new URL(path, siteUrl);
        const body =
            options.json === undefined ? undefined : JSON.stringify(options.json);
        // A write carries the site's `Origin`, as the admin's does: Astro's
        // `checkOrigin` and Better Auth refuse one from elsewhere.
        const sendOrigin = method !== 'GET' && options.origin !== false;
        const headers = {
            ...(sendOrigin ? { Origin: siteUrl } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(options.cookie === undefined ? {} : { Cookie: options.cookie }),
            ...options.headers,
        };
        return new Promise((fulfil, reject) => {
            const req = httpsRequest(
                url,
                { method, headers, family: options.family, timeout: REQUEST_TIMEOUT_MS },
                (res) => {
                    let text = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => (text += chunk));
                    res.on('end', () => {
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch {
                            json = undefined;
                        }
                        fulfil({
                            status: res.statusCode,
                            headers: res.headers,
                            text,
                            json,
                        });
                    });
                }
            );
            req.on('timeout', () =>
                req.destroy(
                    new Error(`${method} ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`)
                )
            );
            req.on('error', reject);
            req.end(body);
        });
    }

    /**
     * The owner's session cookie, signed in once per run: a run has a sign-in
     * to spare under the limit, not two. The cookie is not tied to an address.
     */
    function session() {
        sessionCookie ??= signIn();
        return sessionCookie;
    }

    async function signIn() {
        const response = await http('POST', '/cms/api/auth/sign-in/email', {
            json: { email: env.OWNER_EMAIL, password: env.OWNER_PASSWORD },
        });
        if (response.status !== 200) {
            throw new Error(
                `the owner's sign-in answered ${response.status}` +
                    (response.status === 429 ? ' (rate limited: wait a minute)' : '') +
                    `: ${response.text.slice(0, 300)}`
            );
        }
        return (response.headers['set-cookie'] ?? [])
            .map((cookie) => cookie.split(';')[0])
            .join('; ');
    }

    /** Run SQL on the testing database; one array of rows per statement. */
    async function d1(sql) {
        const { code, output } = await capture(
            'npx',
            [
                'wrangler',
                'd1',
                'execute',
                'DB',
                '--remote',
                '--env',
                WRANGLER_ENV,
                '--json',
                '--command',
                sql,
            ],
            { cwd: demoDir, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
        );
        if (code !== 0) throw new Error(`wrangler d1 execute exited ${code}:\n${output}`);
        // Wrangler can print lines before the JSON.
        return JSON.parse(output.slice(output.indexOf('['))).map(
            (result) => result.results
        );
    }

    return { env, siteUrl, http, session, d1 };
}

let failures = 0;
try {
    const path = envFilePath();
    const context = createContext(await readEnvFile(path));
    console.log(
        `check:deployed:cloudflare: ${context.siteUrl}, credentials from ${path}\n`
    );
    for (const check of CHECKS) {
        try {
            const evidence = await check.run(context);
            console.log(`pass  ${check.item} — ${evidence}`);
        } catch (error) {
            failures += 1;
            console.log(`FAIL  ${check.item} — ${error.message}`);
        }
    }
} catch (error) {
    console.error(`check:deployed:cloudflare could not start: ${error.message}`);
    process.exit(1);
}
console.log(
    failures === 0
        ? `\ncheck:deployed:cloudflare passed (${CHECKS.length} checks)`
        : `\ncheck:deployed:cloudflare: ${failures} of ${CHECKS.length} checks failed`
);
process.exitCode = failures === 0 ? 0 : 1;
