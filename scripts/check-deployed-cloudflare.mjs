#!/usr/bin/env node
// Runs the checks only a deployed Worker and production D1 can answer, against
// the testing deployment of `apps/demo-cloudflare` (its `AGENTS.md`, "Testing
// deployment"). Each check prints one pass or fail line naming the roadmap
// item it answers, and the run exits 1 when any fails.
//
// Never part of `pnpm run verify` or CI: it needs the Cloudflare account and
// the credentials below, and it writes to the testing site (a cron tick, two
// refused sign-ins, a block it removes again, test images it uploads and
// deletes again, cache purges, and a draft page named `check-preview` it keeps
// and issues a new preview token for). Run it by hand with
// `pnpm run check:deployed:cloudflare` after `wrangler login`. Texts after it
// run only the checks whose item contains one, such as `caching-defects`.
//
// The test images are made with core's `sharp`, and the HEIC is core's test
// fixture. Image checks need the zone to allow Image Transformations from the
// site's own hostname (`apps/docs/deployment/cloudflare.md`).
//
// The site URL and credentials come from
// `apps/demo-cloudflare/testing-credentials.env` in the main checkout, which is
// gitignored: `SITE_URL`, `OWNER_EMAIL`, `OWNER_PASSWORD` and
// `ASTROMECH_CRON_SECRET`, and for a captcha run the provider's keys
// (`CAPTCHA_PROVIDERS`). Set `ASTROMECH_TESTING_ENV_FILE` to read another file.
//
// The site runs with no captcha, since every check above signs in with no
// token. `--captcha <provider>` runs `CAPTCHA_CHECKS` instead: the checks with
// the provider's published test keys, then, with `ASTROMECH_CAPTCHA_SECRET` set
// to the provider's secret, a deploy with the captcha on
// (`deploy:testing:captcha`), the checks against it, and a deploy without it,
// whatever failed. It leaves the secret set, which does nothing with the
// captcha off. Texts after it filter as above, and a run of test-key checks
// alone deploys nothing.
//
// Leave a minute between runs. A run makes three sign-ins from one address,
// which is Better Auth's limit per minute (`RATE_LIMIT_RULES` in
// `packages/astromech/src/auth/better-auth.ts`), and two of them fail: twenty
// failures from one address in 15 minutes block it for an hour.
//
// To add a check, add an entry to `CHECKS` (or `CAPTCHA_CHECKS`): the roadmap
// item it answers and a function that returns a line of evidence or throws.
//
// Seven checks need a special build or deploy, or a person, so they are run
// once by hand, not here. Each leaves the deployment and the database as they
// were. In `apps/demo-cloudflare`:
//
// 1. Pending migrations on a deployed Worker (`operations-defects.md`). The
//    Worker has to bundle a migration the database lacks: add
//    `'9999_check_pending': { up: async () => {} }` to the provider in
//    `migrations/index.ts`, which the config imports. Build for the
//    environment (`CLOUDFLARE_ENV=testing pnpm exec astro build`), which
//    applies no migrations to the remote database, so it does not compare the
//    provider with `journal.json` either. Note the deployed version
//    (`wrangler deployments status --env testing`), upload the build without
//    deploying it (`wrangler versions upload --env testing`), and deploy that
//    version just after a minute boundary (`wrangler versions deploy
//    <new>@100% --env testing --yes`), so fresh isolates boot before the next
//    Cron Trigger. Then start `wrangler tail
//    --env testing --format json`, wait 20 seconds (a tail delivers nothing
//    at first, and one started before the deploy saw nothing), and request
//    `/`. The first request in each new isolate logs "1 migration has not
//    been applied to this database: 9999_check_pending". Deploy the noted
//    version again (`wrangler versions deploy <old>@100%`) and revert
//    `migrations/index.ts`. No database row is touched.
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
// 4. `ctx.waitUntil` holds a tick a real Cron Trigger starts
//    (`caching-defects.md`). The handler awaits the tick too, so a normal run
//    cannot tell the two apart. Build for the environment as in 1. In
//    `dist/server/entry.mjs`, make `scheduled` call `app.scheduled(...)`
//    without awaiting it, log `typeof ctx?.waitUntil`, log "returns" before
//    the handler returns and "settled" from a `.then` on the tick. Upload and
//    deploy as in 1, start a tail, and wait for the next trigger. Its event
//    ends "ok" with the logs in the order function, returns, settled, and
//    `_astromech_cron.last_run` for `scheduled-publish` equals the event's
//    `scheduledTime`. Deploy the noted version again.
// 5. `astro build` migrates at build start and releases the local D1 before
//    the prerenderer opens it (`caching-defects.md`). Neither demo has a
//    prerendered page, so copy this app without `node_modules`, `dist`,
//    `.wrangler` and `.astro` to a scratch directory, link its
//    `node_modules` to this app's, and add a page with `export const
//    prerender = true` that reads `select count(*) from kysely_migration`
//    through `env.DB` from `cloudflare:workers`. Run `astro build` there: the
//    log shows the migrations applied before the server build, and the
//    prerendered page counts the applied migrations, read from the same
//    `.wrangler/state` while the build's own handle is closed.
// 6. `cf-connecting-ip` reaches siteverify as `remoteip` (`core-security.md`).
//    Siteverify does not echo it. Deploy with the captcha on as
//    `--captcha` does, then build for the environment with the same
//    `CAPTCHA_PROVIDER` and `CAPTCHA_SITE_KEY` set, and in each built chunk
//    holding `async function siteverify(url, params)` (grep `dist/server`), log
//    `params["remoteip"]` at its start. Upload and deploy as in 1, passing both
//    with `--var`, start a tail, and send a sign-in with any
//    `x-captcha-response` over IPv4 and over IPv6 (`curl -4` and `curl -6`).
//    Each logs the address `/cdn-cgi/trace` shows for that family, the value
//    of the request's `cf-connecting-ip`. A captcha run deploys again from
//    source.
// 7. A real token, in a real browser (`core-security.md`). A managed widget
//    asks automated chromium to tick a box, so these are done in Chrome while
//    the captcha is on: after `pnpm run deploy:testing:captcha`, and with
//    `pnpm run deploy:testing` (neither variable set) after. Sign in at
//    `/cms/login` and request a reset at `/cms/forgot-password`: each
//    succeeds only when the token's action and hostname pass behind
//    Cloudflare with the secret the Worker read. For the raw answer, solve the
//    widget, read the token with `turnstile.getResponse()` in the console,
//    post it to siteverify with the secret from the env file, and reload
//    before signing in, since a token works once: the answer names the action
//    (`sign_in` or `password_reset`) and the hostname. Then leave a solved
//    widget for six minutes and submit: the token expires after 300 seconds,
//    so the submit succeeds only if the widget fetched a new one.
import { Buffer, File } from 'node:buffer';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';
import { parseEnv } from 'node:util';
import { REQUEST_TIMEOUT_MS, sleep } from './check-helpers.mjs';

// The captcha checks pass functions to chromium, which run in the page.
/* global window, document */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(repoRoot, 'apps', 'demo-cloudflare');
const coreDir = join(repoRoot, 'packages', 'astromech');

// Core's own sharp (a dev dependency there), to make the test images and read
// the variants back.
const sharp = createRequire(join(coreDir, 'package.json'))('sharp');

/** A 1200×800 HEIC, core's test fixture. */
const HEIC_FIXTURE = join(
    coreDir,
    'tests/media/serving/image/fixtures/grid-1200x800.heic'
);

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
const CACHING = 'caching-defects.md';
const IMAGES = 'image-metadata-defects.md';

/** The media route, `mediaRoute` in `packages/astromech/src/config/resolve.ts`. */
const MEDIA_ROUTE = '/_media';
/** The `Cache-Control` of a variant and of an original (`media/serving/handler.ts`). */
const VARIANT_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const SHORT_CACHE_CONTROL = 'public, max-age=300, must-revalidate';
/** How long a purge gets to reach the edge before the check fails. */
const PURGE_WAIT_MS = 15_000;
/** The draft page the preview read uses, kept between runs. */
const PREVIEW_SLUG = 'check-preview';

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
        item: `${CACHING}: Cache-Tag astromech:media:<id> with the media Cache-Control, and a purge by it`,
        run: checkMediaPurge,
    },
    {
        item: `${CACHING}: with cacheCloudflare(), nothing stored for the admin, the API, a media 404 or a preview read`,
        run: checkNothingStored,
    },
    {
        item: `${IMAGES}: a replaced image gets new variants`,
        run: (context) =>
            withMedia(
                context,
                { name: 'check-replace.jpg', bytes: () => jpeg(640, 320) },
                async (media) => {
                    const before = await variantSize(context, media, 320);
                    const replaced = await context.http(
                        'POST',
                        `/cms/api/media/${media.id}/replace`,
                        {
                            cookie: await context.session(),
                            form: fileForm('check-replace.jpg', await jpeg(640, 480)),
                        }
                    );
                    const after = replaced.json?.data;
                    if (replaced.status !== 200 || after === undefined) {
                        throw new Error(
                            `the replace answered ${replaced.status}: ${replaced.text.slice(0, 300)}`
                        );
                    }
                    const now = await variantSize(context, after, 320);
                    // The old variant is 320×160 and the new one 320×240, so
                    // an old transform served under the new URL shows here.
                    if (
                        after.metadata.version === media.metadata.version ||
                        before.height !== 160 ||
                        now.height !== 240
                    ) {
                        throw new Error(
                            `version ${media.metadata.version} gave 320×${before.height} and version ${after.metadata.version} gave 320×${now.height}, expected 160 then 240`
                        );
                    }
                    return `the 320px WebP variant was 320×160 at version ${media.metadata.version} and 320×240 at ${after.metadata.version} after the replace`;
                }
            ),
    },
    {
        item: `${IMAGES}: cf.image keeps an animated WebP animated for format webp`,
        run: (context) =>
            withMedia(
                context,
                { name: 'check-animated.webp', bytes: () => animatedWebp(400, 200) },
                async (media) => {
                    const response = await fetchVariant(context, media, 320, 'webp');
                    const meta = await sharp(response.body, {
                        animated: true,
                    }).metadata();
                    if (
                        response.headers['content-type'] !== 'image/webp' ||
                        meta.pages !== 3 ||
                        meta.width !== 320
                    ) {
                        throw new Error(
                            `the variant is ${response.headers['content-type']}, ${meta.width}px wide with ${meta.pages ?? 1} frame(s), expected image/webp, 320px and 3 frames`
                        );
                    }
                    return `a three-frame WebP gave a 320px image/webp variant of ${meta.pages} frames`;
                }
            ),
    },
    {
        item: `${IMAGES}: HEIC input transforms`,
        run: (context) =>
            withMedia(
                context,
                { name: 'check-heic.heic', bytes: () => readFile(HEIC_FIXTURE) },
                async (media) => {
                    const response = await fetchVariant(context, media, 320, 'webp');
                    const type = response.headers['content-type'];
                    const meta =
                        type === 'image/webp'
                            ? await sharp(response.body).metadata()
                            : {};
                    // 800 × 320 / 1200 is 213.3, rounded either way.
                    if (meta.width !== 320 || Math.abs(meta.height - 213) > 1) {
                        throw new Error(
                            `the 320px WebP variant of a 1200×800 HEIC answered ${response.status} ${type}${meta.width === undefined ? '' : `, ${meta.width}×${meta.height}`}, cf-resized: ${response.headers['cf-resized'] ?? 'none'}`
                        );
                    }
                    return `a 1200×800 HEIC gave a 320×${meta.height} image/webp variant`;
                }
            ),
    },
    {
        item: `${IMAGES}: the variant ETag gives 304s through the edge cache`,
        run: (context) =>
            withMedia(
                context,
                { name: 'check-etag.jpg', bytes: () => jpeg(640, 320) },
                async (media) => {
                    const first = await fetchVariant(context, media, 320, 'webp');
                    const etag = first.headers.etag;
                    const path = variantPath(media, 320, 'webp');
                    const again = await context.http('GET', path, {
                        headers: { 'If-None-Match': etag },
                    });
                    const status = again.headers['cf-cache-status'];
                    if (
                        !etag?.endsWith('-cloudflare-images"') ||
                        again.status !== 304 ||
                        status !== 'HIT'
                    ) {
                        throw new Error(
                            `ETag ${etag}; If-None-Match answered ${again.status}, cf-cache-status ${status}, expected 304 from a HIT`
                        );
                    }
                    return `ETag ${etag.replace(media.metadata.version, '<version>')}; If-None-Match answered 304 with cf-cache-status HIT`;
                }
            ),
    },
    {
        item: `${SECURITY}: an unblock reaches other isolates within 60 seconds`,
        run: checkUnblock,
    },
];

/**
 * The providers `--captcha <provider>` can turn on: the env file's names for
 * the real keys, where the widget's frames load from, and the provider's
 * published test keys for the checks that use them. Only Turnstile's entry has
 * been run; reCAPTCHA's waits for keys.
 */
const CAPTCHA_PROVIDERS = {
    turnstile: {
        siteKeyVar: 'TURNSTILE_SITE_KEY',
        secretVar: 'TURNSTILE_SECRET',
        frameOrigin: 'https://challenges.cloudflare.com',
        // Cloudflare's published test keys: a visible widget that always
        // passes, and a secret that accepts its token and answers the hostname
        // example.com.
        test: {
            global: 'turnstile',
            script: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
            siteverify: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            siteKey: '1x00000000000000000000AA',
            secret: '1x0000000000000000000000000000000AA',
            token: 'XXXX.DUMMY.TOKEN.XXXX',
            hostname: 'example.com',
        },
    },
    recaptcha: {
        siteKeyVar: 'RECAPTCHA_SITE_KEY',
        secretVar: 'RECAPTCHA_SECRET',
        frameOrigin: 'https://www.google.com',
    },
};

/** How long a deploy or a secret change gets to reach the site. */
const DEPLOY_WAIT_MS = 90_000;
const BROWSER_TIMEOUT_MS = 30_000;

/**
 * The checks a `--captcha <provider>` run makes. `test` needs the provider's
 * test keys and runs before the deploy; `deployed` runs while the testing
 * deployment has the captcha on.
 */
const CAPTCHA_CHECKS = [
    {
        item: `${SECURITY}: \`hostnames\` with Turnstile's test secret, which answers example.com`,
        test: true,
        run: checkTestSecretHostnames,
    },
    {
        item: `${SECURITY}: two widgets on one page with render=explicit, and a reset`,
        test: true,
        run: checkTwoWidgets,
    },
    {
        item: `${SECURITY}: the admin's sign-in and forgot-password widgets under the documented security.csp`,
        deployed: true,
        run: checkAdminWidgets,
    },
    {
        item: `${SECURITY}: ASTROMECH_CAPTCHA_SECRET is read on the Worker, and its absence refuses requests`,
        deployed: true,
        run: checkCaptchaSecret,
    },
];

/**
 * Core's `verifyCaptcha` against the provider's real siteverify with its test
 * secret, which answers the hostname example.com: passed with `hostnames:
 * ['example.com']`, refused with the default, the request's own hostname.
 * Core's source runs under tsx, as the demos' CLI scripts do.
 */
async function checkTestSecretHostnames(context) {
    const { test } = context.captcha.provider;
    const answer = await siteverifyAnswer(test.siteverify, test.secret, test.token);
    const probe = `
        const { setConfig } = await import('./packages/astromech/src/config/registry.ts');
        const { verifyCaptcha } = await import('./packages/astromech/src/security/captcha/verify.ts');
        const { provider, siteKey, secret, token, hostname, hostnames } = JSON.parse(process.env.CAPTCHA_PROBE);
        process.env.ASTROMECH_CAPTCHA_SECRET = secret;
        const verdicts = [];
        for (const list of [hostnames, undefined]) {
            setConfig({ security: { captcha: { provider, siteKey, hostnames: list } } });
            verdicts.push(await verifyCaptcha({ token, action: 'sign_in', hostname }));
        }
        console.log(JSON.stringify(verdicts));
    `;
    const { code, output } = await capture(
        'pnpm',
        ['exec', 'tsx', '--input-type=module', '-e', probe],
        {
            cwd: repoRoot,
            env: {
                ...process.env,
                TSX_TSCONFIG_PATH: join(coreDir, 'tsconfig.json'),
                CAPTCHA_PROBE: JSON.stringify({
                    provider: context.captcha.name,
                    siteKey: test.siteKey,
                    secret: test.secret,
                    token: test.token,
                    hostname: new URL(context.siteUrl).hostname,
                    hostnames: [test.hostname],
                }),
            },
        }
    );
    if (code !== 0) throw new Error(`the verifyCaptcha probe exited ${code}:\n${output}`);
    const [listed, byDefault] = JSON.parse(output.trim().split('\n').at(-1));
    const evidence = `siteverify answered ${JSON.stringify(answer)}; verifyCaptcha with hostnames ['${test.hostname}'] answered ${JSON.stringify(listed)}, and with the default ${JSON.stringify(byDefault)}`;
    if (
        answer.hostname !== test.hostname ||
        listed.ok !== true ||
        byDefault.ok !== false ||
        byDefault.reason !== `Hostname ${test.hostname} is not allowed`
    ) {
        throw new Error(
            `${evidence}; expected a pass, then a refusal of ${test.hostname}`
        );
    }
    return evidence;
}

/** The provider's siteverify answer for `token`, without the secret. */
async function siteverifyAnswer(url, secret, token) {
    const response = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.json();
}

/**
 * Core's `renderCaptcha` in chromium with the provider's test site key: two
 * widgets on one page load one script with `render=explicit` and each give a
 * token, and a reset clears one widget's token until its next callback. The
 * callbacks are logged by code appended to the provider's script, since
 * `renderCaptcha` is what renders each widget. A test key's token never
 * expires (watched for six minutes on 2026-10-13), so expiry is checked by
 * hand with the real widget (the header's list).
 */
async function checkTwoWidgets(context) {
    const { test } = context.captcha.provider;
    const client = stripTypeScriptTypes(
        await readFile(join(coreDir, 'src/security/captcha/client.ts'), 'utf8')
    );
    const origin = 'http://localhost';
    const page = `<!doctype html><html><body><div id="a"></div><div id="b"></div>
        <script type="module">
            import { renderCaptcha } from '/client.js';
            const widget = { provider: ${JSON.stringify(context.captcha.name)}, siteKey: ${JSON.stringify(test.siteKey)} };
            window.handles = await Promise.all([
                renderCaptcha(document.querySelector('#a'), { ...widget, action: 'sign_in' }),
                renderCaptcha(document.querySelector('#b'), { ...widget, action: 'password_reset' }),
            ]);
        </script></body></html>`;
    // Each event names the widget's container and the milliseconds since the
    // page started.
    const logCallbacks = `;(() => {
        const api = window[${JSON.stringify(test.global)}];
        const render = api.render.bind(api);
        api.render = (container, options) => {
            const log = (event) => window.events.push({ event, widget: container.id, at: Date.now() - window.start });
            return render(container, {
                ...options,
                callback: (token) => { log('callback'); options.callback(token); },
                'expired-callback': () => { log('expired'); options['expired-callback'](); },
                'error-callback': (code) => { log('error ' + code); options['error-callback'](code); },
            });
        };
    })();`;

    return withBrowser(async (browser) => {
        const browserContext = await browser.newContext();
        await browserContext.addInitScript(() => {
            window.events = [];
            window.start = Date.now();
        });
        await browserContext.route(`${test.script}*`, async (route) => {
            const response = await route.fetch();
            await route.fulfill({
                response,
                body: (await response.text()) + logCallbacks,
            });
        });
        await browserContext.route(`${origin}/**`, (route) =>
            new URL(route.request().url()).pathname === '/client.js'
                ? route.fulfill({ contentType: 'text/javascript', body: client })
                : route.fulfill({ contentType: 'text/html', body: page })
        );
        const tab = await browserContext.newPage();
        await tab.goto(`${origin}/captcha-check`);
        await tab.waitForFunction(() => window.handles !== undefined, null, {
            timeout: BROWSER_TIMEOUT_MS,
        });

        const tokens = await tab.evaluate(() =>
            Promise.all(window.handles.map((handle) => handle.getToken()))
        );
        const scripts = await tab.evaluate(() =>
            [...document.querySelectorAll('script[src]')].map((script) => script.src)
        );
        const frames = tab
            .frames()
            .filter((frame) =>
                frame.url().startsWith(context.captcha.provider.frameOrigin)
            );
        if (
            scripts.length !== 1 ||
            !scripts[0].startsWith(test.script) ||
            !scripts[0].includes('render=explicit') ||
            frames.length !== 2 ||
            tokens.some((token) => typeof token !== 'string' || token === '')
        ) {
            throw new Error(
                `scripts ${JSON.stringify(scripts)}, ${frames.length} widget frames, tokens ${JSON.stringify(tokens)}; expected one script with render=explicit, two frames and two tokens`
            );
        }

        const reset = await tab.evaluate(async () => {
            const resetAt = Date.now() - window.start;
            window.handles[0].reset();
            await window.handles[0].getToken();
            const answeredAt = Date.now() - window.start;
            const callback = window.events.find(
                (event) =>
                    event.widget === 'a' &&
                    event.event === 'callback' &&
                    event.at >= resetAt
            );
            return { resetAt, answeredAt, callbackAt: callback?.at };
        });
        if (reset.callbackAt === undefined || reset.answeredAt < reset.callbackAt) {
            throw new Error(
                `after a reset, getToken answered at ${reset.answeredAt}ms before the widget's next callback (${reset.callbackAt ?? 'none'}); events ${JSON.stringify(await tab.evaluate(() => window.events))}`
            );
        }

        return `one script (${new URL(scripts[0]).search}) rendered two widgets that each gave a token, and after a reset getToken waited ${reset.answeredAt - reset.resetAt}ms for the widget's next callback`;
    });
}

/**
 * The admin's sign-in and forgot-password pages on the deployed site, in
 * chromium: each renders the provider's widget, which the build put in the
 * admin's config, under the policy the site sends, and the policy blocks
 * nothing. A sign-in without a token is refused, so the Worker has the captcha
 * too. Nothing is submitted: a real widget may ask automated chromium to prove
 * it is human, and the check does not try.
 */
async function checkAdminWidgets(context) {
    const refused = await signInWithoutToken(context);
    if (refused !== 'CAPTCHA_FAILED') {
        throw new Error(
            `a sign-in without a token answered ${refused}, expected 403 CAPTCHA_FAILED`
        );
    }
    const { frameOrigin } = context.captcha.provider;
    return withBrowser(async (browser) => {
        const browserContext = await browser.newContext();
        await browserContext.addInitScript(() => {
            window.violations = [];
            document.addEventListener('securitypolicyviolation', (event) => {
                window.violations.push(
                    `${event.violatedDirective} blocked ${event.blockedURI}`
                );
            });
        });
        const tab = await browserContext.newPage();
        const seen = [];
        const blocked = [];
        for (const path of ['/cms/login', '/cms/forgot-password']) {
            const response = await tab.goto(`${context.siteUrl}${path}`);
            const policy = response.headers()['content-security-policy'] ?? '';
            if (!policy.includes(`frame-src ${frameOrigin}`)) {
                throw new Error(
                    `${path} sent no frame-src for ${frameOrigin}: ${policy}`
                );
            }
            const start = Date.now();
            let frames = 0;
            while (frames === 0 && Date.now() - start < BROWSER_TIMEOUT_MS) {
                await sleep(500);
                frames = tab
                    .frames()
                    .filter((frame) => frame.url().startsWith(frameOrigin)).length;
            }
            if (frames === 0) {
                throw new Error(`${path} rendered no widget from ${frameOrigin}`);
            }
            const violations = await tab.evaluate(() => window.violations);
            blocked.push(...violations.map((violation) => `${path}: ${violation}`));
            seen.push(`${path} rendered ${frames} frame(s) from ${frameOrigin}`);
        }
        const evidence = `a sign-in without a token answered 403 CAPTCHA_FAILED; ${seen.join(', ')}`;
        if (blocked.length > 0) {
            throw new Error(`${evidence}, but the policy blocked: ${blocked.join('; ')}`);
        }
        return `${evidence}, and the policy blocked nothing`;
    });
}

/**
 * With the captcha on, the Worker serves only while it has the secret: delete
 * it and an admin page, a site page and the API answer 500; put it back and
 * they answer as before. The 200s before the delete are the secret being read.
 * A secret change deploys a new version of the Worker, with the deploy's vars.
 */
async function checkCaptchaSecret(context) {
    // A fresh query on each request to `/`, which the site's route rule
    // stores for a minute.
    const names = ['/cms', '/?captcha-check=<random>', '/cms/api/entries/page'];
    const statuses = async () => {
        const paths = [
            '/cms',
            `/?captcha-check=${randomBytes(4).toString('hex')}`,
            '/cms/api/entries/page',
        ];
        const responses = await Promise.all(
            paths.map((path) => context.http('GET', path))
        );
        return responses.map((response) => response.status).join(', ');
    };
    const before = await statuses();
    if (before !== '200, 200, 401') {
        throw new Error(
            `with the secret set, ${names.join(', ')} answered ${before}, expected 200, 200, 401`
        );
    }
    await wrangler([
        'secret',
        'delete',
        'ASTROMECH_CAPTCHA_SECRET',
        '--env',
        WRANGLER_ENV,
    ]);
    let without;
    try {
        without = await until(statuses, (now) => now === '500, 500, 500');
    } finally {
        await putCaptchaSecret(context);
    }
    const after = await until(statuses, (now) => now === before);
    const refused = await signInWithoutToken(context);
    const evidence = `${names.join(', ')} answered ${before} with the secret set, ${without.answer} once it was deleted, and ${after.answer} once it was put back`;
    if (!without.met || !after.met || refused !== 'CAPTCHA_FAILED') {
        throw new Error(
            `${evidence} (the last answers within ${seconds(DEPLOY_WAIT_MS)} of each change); a sign-in without a token then answered ${refused}, expected CAPTCHA_FAILED`
        );
    }
    return `${evidence}, with the captcha still on`;
}

/** The `code` a sign-in with no captcha token answers, with its status when it has none. */
async function signInWithoutToken(context) {
    const response = await context.http('POST', '/cms/api/auth/sign-in/email', {
        json: { email: 'captcha-check@example.com', password: 'not-a-password' },
    });
    return response.json?.code ?? `${response.status}`;
}

/**
 * Poll `probe` until `done` holds for its answer or `DEPLOY_WAIT_MS` passes.
 * `answer` is the last one, and `met` whether `done` held for it.
 */
async function until(probe, done) {
    const start = Date.now();
    for (;;) {
        const answer = await probe();
        if (done(answer)) return { answer, met: true };
        if (Date.now() - start >= DEPLOY_WAIT_MS) return { answer, met: false };
        await sleep(3000);
    }
}

/** Launch chromium, run `fn`, and close it whatever happens. */
async function withBrowser(fn) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
        return await fn(browser);
    } finally {
        await browser.close();
    }
}

/** Run wrangler in the demo, failing with its output on a non-zero exit. */
async function wrangler(args, input) {
    const { code, output } = await capture('npx', ['wrangler', ...args], {
        cwd: demoDir,
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
        input,
    });
    if (code !== 0)
        throw new Error(`wrangler ${args.join(' ')} exited ${code}:\n${output}`);
}

/** Set the Worker's `ASTROMECH_CAPTCHA_SECRET` to the provider's secret from the env file. */
function putCaptchaSecret(context) {
    return wrangler(
        ['secret', 'put', 'ASTROMECH_CAPTCHA_SECRET', '--env', WRANGLER_ENV],
        context.captcha.secret
    );
}

/**
 * Deploy the testing site with the captcha on (`deploy:testing:captcha`) or
 * off (`deploy:testing`). Neither the build nor the Worker may see a provider
 * from the shell when it is off, or the two disagree.
 */
async function deployTesting(captcha) {
    const {
        NODE_ENV: _nodeEnv,
        CAPTCHA_PROVIDER: _provider,
        CAPTCHA_SITE_KEY: _siteKey,
        ...env
    } = process.env;
    const script = captcha === undefined ? 'deploy:testing' : 'deploy:testing:captcha';
    if (captcha !== undefined) {
        env.CAPTCHA_PROVIDER = captcha.name;
        env.CAPTCHA_SITE_KEY = captcha.siteKey;
    }
    console.log(`deploying with \`pnpm run ${script}\``);
    const { code, output } = await capture('pnpm', ['run', script], {
        cwd: demoDir,
        env: { ...env, WRANGLER_SEND_METRICS: 'false' },
    });
    if (code !== 0) {
        throw new Error(`pnpm run ${script} exited ${code}:\n${output.slice(-3000)}`);
    }
}

/** The site with the captcha on, once a sign-in without a token is refused for it. */
async function deployWithCaptcha(context) {
    await putCaptchaSecret(context);
    await deployTesting(context.captcha);
    const refused = await until(
        () => signInWithoutToken(context),
        (code) => code === 'CAPTCHA_FAILED'
    );
    if (!refused.met) {
        throw new Error(
            `${seconds(DEPLOY_WAIT_MS)} after the deploy, a sign-in without a token still answered ${refused.answer}, not CAPTCHA_FAILED`
        );
    }
}

/**
 * The site with the captcha off again, once a sign-in without a token reaches
 * Better Auth. That counts as a refused sign-in, so the next run waits its
 * minute as usual.
 */
async function deployWithoutCaptcha(context) {
    await deployTesting(undefined);
    const answered = await until(
        () => signInWithoutToken(context),
        (code) => code !== 'CAPTCHA_FAILED'
    );
    if (!answered.met) {
        throw new Error(
            `${seconds(DEPLOY_WAIT_MS)} after the deploy without the captcha, sign-ins were still refused for it`
        );
    }
}

/**
 * The `--captcha <provider>` run: the checks that use the provider's test keys,
 * then the captcha deploy, the checks against it, and a deploy without it,
 * whatever failed.
 */
async function runCaptchaChecks(context, checks) {
    const { provider } = context.captcha;
    let failures = 0;
    const report = async (check) => {
        try {
            console.log(`pass  ${check.item} — ${await check.run(context)}`);
        } catch (error) {
            failures += 1;
            console.log(`FAIL  ${check.item} — ${error.message}`);
        }
    };
    for (const check of checks.filter((candidate) => candidate.test)) {
        if (provider.test === undefined) {
            console.log(
                `skip  ${check.item} — no test keys for ${context.captcha.name} here`
            );
        } else {
            await report(check);
        }
    }
    const deployed = checks.filter((check) => check.deployed);
    if (deployed.length === 0) return failures;
    try {
        await deployWithCaptcha(context);
        for (const check of deployed) await report(check);
    } catch (error) {
        failures += 1;
        console.log(`FAIL  the captcha deploy — ${error.message}`);
    } finally {
        try {
            await deployWithoutCaptcha(context);
            console.log('the testing site is deployed without the captcha again');
        } catch (error) {
            failures += 1;
            console.log(
                `FAIL  the deploy without the captcha — ${error.message}\nRun \`pnpm run deploy:testing\` in apps/demo-cloudflare with CAPTCHA_PROVIDER unset.`
            );
        }
    }
    return failures;
}

/**
 * Upload a test image, fill the edge cache with its original and two
 * variants, purge an unrelated tag (each stays a HIT), then the item's own tag
 * (each misses). The demo purges through its `/api/invalidate` route: a
 * Worker's cache is purged from inside the Worker only.
 */
function checkMediaPurge(context) {
    return withMedia(
        context,
        { name: 'check-purge.jpg', bytes: () => jpeg(1000, 500) },
        async (media) => {
            const urls = [
                [originalPath(media), SHORT_CACHE_CONTROL],
                [variantPath(media, 320, 'webp'), VARIANT_CACHE_CONTROL],
                [variantPath(media, 640, 'avif'), VARIANT_CACHE_CONTROL],
            ];
            const fetchAll = () =>
                Promise.all(
                    urls.map(async ([path]) => {
                        const response = await context.http('GET', path);
                        if (response.status !== 200) {
                            throw new Error(`${path} answered ${response.status}`);
                        }
                        return response;
                    })
                );
            const statuses = async () =>
                (await fetchAll()).map((response) => response.headers['cf-cache-status']);
            const first = await fetchAll();
            const filled = await statuses();
            if (filled.some((status) => status !== 'HIT')) {
                throw new Error(
                    `never stored: the second requests were ${filled.join(', ')}`
                );
            }
            urls.forEach(([path, cacheControl], index) => {
                const response = first[index];
                if (path.includes('&f=')) assertTransformed(response, media, path);
                if (response.headers['cache-control'] !== cacheControl) {
                    throw new Error(
                        `${path} sent Cache-Control ${response.headers['cache-control']}, expected ${cacheControl}`
                    );
                }
            });
            await purge(
                context,
                `astromech:media:check-${randomBytes(4).toString('hex')}`
            );
            const control = await statuses();
            if (control.some((status) => status !== 'HIT')) {
                throw new Error(`a purge of another tag left ${control.join(', ')}`);
            }
            await purge(context, `astromech:media:${media.id}`);
            // The purge reaches each data center in turn, and a miss stores
            // the URL again, so each one is watched until it misses once.
            const start = Date.now();
            const missedAfter = new Map();
            while (missedAfter.size < urls.length && Date.now() - start < PURGE_WAIT_MS) {
                const after = await statuses();
                after.forEach((status, index) => {
                    if (status !== 'HIT' && !missedAfter.has(index)) {
                        missedAfter.set(index, Date.now() - start);
                    }
                });
                if (missedAfter.size < urls.length) await sleep(500);
            }
            const stored = urls.filter((_, index) => !missedAfter.has(index));
            if (stored.length > 0) {
                throw new Error(
                    `${seconds(PURGE_WAIT_MS)} after the item's purge, still a HIT every time: ${stored.map(([path]) => path).join(', ')}`
                );
            }
            return `the original and two variants were HIT with their Cache-Control, stayed HIT after another tag's purge, and each missed within ${seconds(Math.max(...missedAfter.values()))} of the item's`;
        }
    );
}

/**
 * Two requests each to the admin, the API (signed in), a media 404 and a
 * preview read: the second must not be a HIT. The site's route rule stores
 * every page for a minute (`apps/demo-cloudflare/astro.config.mjs`), so `/`
 * is the control that is stored.
 */
async function checkNothingStored(context) {
    const cookie = await context.session();
    const token = await previewToken(context);
    const probes = [
        ['the admin', '/cms', 200, cookie],
        ['the API', '/cms/api/entries/page', 200, cookie],
        ['a media 404', `${MEDIA_ROUTE}/check-missing.jpg`, 404],
        ['a preview read', `/${PREVIEW_SLUG}?preview=${token}`, 200],
    ];
    const seen = [];
    for (const [name, path, expected, probeCookie] of probes) {
        const statuses = [];
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await context.http('GET', path, { cookie: probeCookie });
            if (response.status !== expected) {
                throw new Error(
                    `${name} answered ${response.status}, expected ${expected}`
                );
            }
            statuses.push(response.headers['cf-cache-status'] ?? 'none');
        }
        if (statuses.includes('HIT')) {
            throw new Error(`${name} was stored: ${statuses.join(', ')}`);
        }
        seen.push(`${name} ${statuses[1]}`);
    }
    await context.http('GET', '/');
    const control = (await context.http('GET', '/')).headers['cf-cache-status'];
    if (control !== 'HIT') throw new Error(`the control, /, was ${control}, not HIT`);
    return `${seen.join(', ')} on the second request; the control, /, HIT`;
}

/** Purge one tag through the demo's route. */
async function purge(context, tag) {
    const response = await context.http('POST', '/api/invalidate', {
        cookie: await context.session(),
        json: { tags: [tag] },
    });
    if (response.status !== 200) {
        throw new Error(
            `the purge of ${tag} answered ${response.status}: ${response.text}`
        );
    }
}

/**
 * A preview token for the draft page at `PREVIEW_SLUG`, created on the first
 * run and kept. Each token replaces the one before.
 */
async function previewToken(context) {
    const cookie = await context.session();
    const found = await context.http('POST', '/cms/api/entries/page/query', {
        cookie,
        json: { where: { slug: PREVIEW_SLUG }, full: true, limit: 1 },
    });
    let id = found.json?.data?.[0]?.id;
    if (id === undefined) {
        const created = await context.http('POST', '/cms/api/entries/page', {
            cookie,
            json: { title: 'Preview check', slug: PREVIEW_SLUG },
        });
        id = created.json?.data?.id;
        if (created.status !== 201 || id === undefined) {
            throw new Error(
                `creating the preview page answered ${created.status}: ${created.text.slice(0, 300)}`
            );
        }
    }
    const issued = await context.http(
        'POST',
        `/cms/api/entries/page/${id}/preview-token`,
        {
            cookie,
            json: {},
        }
    );
    const token = issued.json?.data?.token;
    if (issued.status !== 201 || token === undefined) {
        throw new Error(
            `issuing a preview token answered ${issued.status}: ${issued.text.slice(0, 300)}`
        );
    }
    return token;
}

/**
 * Upload a test image, run `fn` with the media item, and delete the item
 * after, whether `fn` passed or not. Each run uploads afresh, so its URLs are
 * new to the edge cache.
 */
async function withMedia(context, { name, bytes }, fn) {
    const cookie = await context.session();
    const uploaded = await context.http('POST', '/cms/api/media', {
        cookie,
        form: fileForm(name, await bytes()),
    });
    const media = uploaded.json?.data;
    if (uploaded.status !== 201 || media === undefined) {
        throw new Error(
            `the upload of ${name} answered ${uploaded.status}: ${uploaded.text.slice(0, 300)}`
        );
    }
    try {
        return await fn(media);
    } finally {
        await context.http('DELETE', `/cms/api/media/${media.id}`, { cookie });
    }
}

function fileForm(name, bytes) {
    const form = new FormData();
    form.append('file', new File([bytes], name, { type: imageType(name) }));
    return form;
}

function imageType(name) {
    const ext = name.slice(name.lastIndexOf('.') + 1);
    return { jpg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic' }[ext];
}

function mediaExt(media) {
    return media.filename.slice(media.filename.lastIndexOf('.') + 1);
}

function originalPath(media) {
    return `${MEDIA_ROUTE}/${media.id}.${mediaExt(media)}?v=${media.metadata.version}`;
}

/** The canonical variant URL (`buildVariantUrl` in `media/serving/image/url.ts`). */
function variantPath(media, width, format) {
    return `${MEDIA_ROUTE}/${media.id}.${mediaExt(media)}?w=${width}&f=${format}&v=${media.metadata.version}`;
}

async function fetchVariant(context, media, width, format) {
    const path = variantPath(media, width, format);
    const response = await context.http('GET', path);
    if (response.status !== 200) {
        throw new Error(
            `${path} answered ${response.status}: ${response.text.slice(0, 300)}`
        );
    }
    assertTransformed(response, media, path);
    return response;
}

/**
 * A variant URL answered with the original's ETag: the transform failed and
 * the media route served the original instead, logging why.
 */
function assertTransformed(response, media, path) {
    if (response.headers.etag === `"${media.metadata.version}"`) {
        throw new Error(
            `${path} served the original, so the transform failed (the Worker logs why: \`wrangler tail --env testing\`)`
        );
    }
}

/** The pixel size of a WebP variant. */
async function variantSize(context, media, width) {
    const response = await fetchVariant(context, media, width, 'webp');
    const { width: w, height } = await sharp(response.body).metadata();
    return { width: w, height };
}

/** A plain JPEG of one colour. */
function jpeg(width, height) {
    return sharp({
        create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } },
    })
        .jpeg()
        .toBuffer();
}

/** A WebP of three frames, red, green and blue, as core's sharp driver test makes. */
function animatedWebp(width, height) {
    const frame = (r, g, b) =>
        Buffer.alloc(width * height * 4, Buffer.from([r, g, b, 255]));
    const pixels = Buffer.concat([frame(255, 0, 0), frame(0, 255, 0), frame(0, 0, 255)]);
    return sharp(pixels, {
        raw: { width, height: height * 3, channels: 4, pageHeight: height },
    })
        .webp({ loop: 0, delay: [100, 100, 100] })
        .toBuffer();
}

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

/** Run a command and collect its exit code and combined output. `input` is written to its stdin. */
function capture(command, args, { input, ...options }) {
    return new Promise((fulfil, reject) => {
        const child = spawn(command, args, options);
        child.stdin.end(input);
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
    return join(dirname(commonDir), 'apps', 'demo-cloudflare', 'testing-credentials.env');
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
     * `json` is sent as the body, or `form` (a `FormData`) as multipart. The
     * answer's bytes are in `body`, and a JSON answer is parsed into `json`.
     * `origin: false` leaves out the `Origin` a write otherwise sends.
     */
    async function http(method, path, options = {}) {
        const url = new URL(path, siteUrl);
        let body;
        let contentType;
        if (options.json !== undefined) {
            body = JSON.stringify(options.json);
            contentType = 'application/json';
        } else if (options.form !== undefined) {
            // `Response` writes the multipart body and its boundary.
            const encoded = new Response(options.form);
            body = Buffer.from(await encoded.arrayBuffer());
            contentType = encoded.headers.get('content-type');
        }
        // A write carries the site's `Origin`, as the admin's does: Astro's
        // `checkOrigin` and Better Auth refuse one from elsewhere.
        const sendOrigin = method !== 'GET' && options.origin !== false;
        const headers = {
            ...(sendOrigin ? { Origin: siteUrl } : {}),
            ...(contentType === undefined ? {} : { 'Content-Type': contentType }),
            ...(options.cookie === undefined ? {} : { Cookie: options.cookie }),
            ...options.headers,
        };
        return new Promise((fulfil, reject) => {
            const req = httpsRequest(
                url,
                { method, headers, family: options.family, timeout: REQUEST_TIMEOUT_MS },
                (res) => {
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        const bytes = Buffer.concat(chunks);
                        const text = bytes.toString('utf8');
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch {
                            json = undefined;
                        }
                        fulfil({
                            status: res.statusCode,
                            headers: res.headers,
                            body: bytes,
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

/**
 * The provider `--captcha <provider>` names, with its keys from the env file,
 * or undefined for the default run.
 */
function captchaOption(args, env) {
    const index = args.indexOf('--captcha');
    if (index === -1) return undefined;
    const name = args[index + 1];
    const provider = CAPTCHA_PROVIDERS[name];
    if (provider === undefined) {
        throw new Error(
            `--captcha takes one of ${Object.keys(CAPTCHA_PROVIDERS).join(', ')}, not ${name}`
        );
    }
    const siteKey = env[provider.siteKeyVar];
    const secret = env[provider.secretVar];
    if (!siteKey || !secret) {
        throw new Error(
            `--captcha ${name} needs ${provider.siteKeyVar} and ${provider.secretVar} in the env file`
        );
    }
    return { name, provider, siteKey, secret };
}

// `pnpm run check:deployed:cloudflare <text>…` runs only the checks whose item
// contains one of the texts, such as a roadmap file's name. With `--captcha
// <provider>`, it runs the captcha checks instead.
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const captchaIndex = args.indexOf('--captcha');
const filters =
    captchaIndex === -1
        ? args
        : args.filter((_, index) => index !== captchaIndex && index !== captchaIndex + 1);
const selected = (captchaIndex === -1 ? CHECKS : CAPTCHA_CHECKS).filter(
    (check) => filters.length === 0 || filters.some((text) => check.item.includes(text))
);

let failures = 0;
try {
    const path = envFilePath();
    const env = await readEnvFile(path);
    const context = { ...createContext(env), captcha: captchaOption(args, env) };
    console.log(
        `check:deployed:cloudflare: ${context.siteUrl}, credentials from ${path}` +
            (context.captcha === undefined ? '\n' : `, captcha ${context.captcha.name}\n`)
    );
    if (context.captcha === undefined) {
        for (const check of selected) {
            try {
                const evidence = await check.run(context);
                console.log(`pass  ${check.item} — ${evidence}`);
            } catch (error) {
                failures += 1;
                console.log(`FAIL  ${check.item} — ${error.message}`);
            }
        }
    } else {
        failures = await runCaptchaChecks(context, selected);
    }
} catch (error) {
    console.error(`check:deployed:cloudflare could not start: ${error.message}`);
    process.exit(1);
}
console.log(
    failures === 0
        ? `\ncheck:deployed:cloudflare passed (${selected.length} checks)`
        : `\ncheck:deployed:cloudflare: ${failures} of ${selected.length} checks failed`
);
process.exitCode = failures === 0 ? 0 : 1;
