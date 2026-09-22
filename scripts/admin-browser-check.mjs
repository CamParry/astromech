/**
 * The admin flow `check:boot` and `check:install` run in headless chromium,
 * from the first `/cms` load through first-run setup to a post's edit page.
 */
import { URL } from 'node:url';
import { REQUEST_TIMEOUT_MS, step } from './check-helpers.mjs';

// The admin fetches its session before it can decide which screen to show, so
// the mounted-app selector arrives a round trip after navigation, not with it.
const MOUNT_TIMEOUT_MS = 30_000;

// Every screen after the first waits on at least one API round trip of its
// own (the sign-up and sign-in, the list query, the entry loader), so each
// gets the same allowance as the mount.
const SCREEN_TIMEOUT_MS = 30_000;

// `#am-app` is the router root (`packages/admin/src/pages/__root.tsx`) and the password
// field belongs to the unauthenticated screen. On an empty database that is
// the setup form: `/cms` redirects an anonymous visitor to `/login`, which
// sends them on to `/setup` while no user exists. Neither can exist in the served shell, and
// the pair distinguishes a painted screen from the pending placeholder the
// auth layout renders while the session query is in flight.
const MOUNTED_SELECTOR = '#am-app form input[type="password"]';

// The first user, created through the setup form on the empty database.
const FIRST_ADMIN = {
    name: 'Check Boot',
    email: 'check-boot@example.com',
    password: 'check-boot-password-0123',
};

const POST_TITLE = 'Check boot post';

let browser = null;

/**
 * Load `/cms` in headless chromium, assert the React app rendered and landed on
 * first-run setup, sign in through it, check the first account and closed
 * sign-up, then load the app shell, the `post` list and one post's edit page.
 * `pluginPage` adds the backups plugin's page. `failOnWarnings` fails on a
 * console warning as well as a console error.
 *
 * Runs against a server the caller started on an empty database. The browser
 * outlives a failure, so the caller runs `closeAdminBrowser` on every exit path.
 */
export async function expectAdminWorks(
    admin,
    { pluginPage = false, failOnWarnings = false } = {}
) {
    step('loading /cms in headless chromium');
    const { chromium } = await import('playwright');

    try {
        browser = await chromium.launch();
    } catch (error) {
        // The npm install brings the driver, not the browser binary.
        throw new Error(
            `could not launch chromium: run \`pnpm exec playwright install chromium\` (${error.message})`,
            { cause: error }
        );
    }

    const page = await browser.newPage();

    // A broken import surfaces as a console error or an uncaught page error,
    // not as a missing element, so both are collected from before navigation
    // and reported after the last screen. A timeout prints them too, because
    // the missing element is the more useful message when both happen.
    //
    // Until sign-in, the admin asks `/cms/api/me` who it is and is answered
    // 401, by design, and chromium logs every failed response as a console
    // error. Those messages carry no JavaScript arguments because no script
    // emitted them; anything `console.error` produced does. So before sign-in,
    // argument-less messages are recorded for the diagnostics but do not fail
    // the check on their own. After sign-in nothing should answer 401, so every
    // console error fails the check.
    //
    // With `failOnWarnings`, every console warning fails the check too. Under
    // `astro dev`, Vite forwards the browser's warnings to the terminal only
    // when it detects an AI agent, so the dev output cannot be relied on to
    // show them.
    const errors = [];
    const notes = [];
    let signedIn = false;
    page.on('console', (message) => {
        if (failOnWarnings && message.type() === 'warning') {
            errors.push(`console warning: ${message.text()} (${message.location().url})`);
            return;
        }
        if (message.type() !== 'error') return;
        const line = `console: ${message.text()} (${message.location().url})`;
        if (!signedIn && message.args().length === 0) notes.push(line);
        else errors.push(line);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    /** Wait for `locator` to be visible, naming what it stands for if that fails. */
    async function waitFor(locator, description, timeout = SCREEN_TIMEOUT_MS) {
        try {
            await locator.waitFor({ state: 'visible', timeout });
        } catch (error) {
            // Playwright's first line says what went wrong: a timeout, or
            // something else such as a strict-mode violation.
            const reason = error.message.split('\n')[0];
            throw new Error(
                `waiting for ${description} at ${page.url()} failed: ${reason}${formatLines([...errors, ...notes])}`,
                { cause: error }
            );
        }
    }

    await page.goto(admin, { waitUntil: 'commit', timeout: REQUEST_TIMEOUT_MS });
    // `.first()` because the setup form has two password fields, and a locator
    // matching more than one element fails Playwright's strict mode.
    await waitFor(
        page.locator(MOUNTED_SELECTOR).first(),
        `the unauthenticated screen (\`${MOUNTED_SELECTOR}\`)`,
        MOUNT_TIMEOUT_MS
    );
    console.log('  ok  the admin app mounts and renders its unauthenticated screen');

    step('completing first-run setup');
    // Nothing navigates here: landing on the setup form from `/cms` is what
    // proves the login route sends a first-time visitor to setup.
    await waitFor(
        page.getByLabel('Name', { exact: true }),
        'the first-run setup form, reached from /cms'
    );
    if (!page.url().startsWith(`${admin}/setup`)) {
        throw new Error(
            `expected /cms to land on ${admin}/setup, landed on ${page.url()}`
        );
    }
    console.log('  ok  /cms sends a first-time visitor to first-run setup');
    await page.getByLabel('Name', { exact: true }).fill(FIRST_ADMIN.name);
    await page.getByLabel('Email', { exact: true }).fill(FIRST_ADMIN.email);
    await page.getByLabel('Password', { exact: true }).fill(FIRST_ADMIN.password);
    await page.getByLabel('Confirm password', { exact: true }).fill(FIRST_ADMIN.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // The sidebar's primary navigation is rendered by `AppShell`, which only
    // `pages/_protected/route.tsx` mounts, and only for a signed-in admin.
    await waitFor(
        page.getByRole('navigation', { name: 'Primary' }),
        'the app shell after first-run setup'
    );
    signedIn = true;
    console.log('  ok  first-run setup signs the new admin in and renders the app shell');

    step('checking the first account and closed sign-up');
    // `page.request` shares the page's cookies, so this reads the session
    // first-run setup created.
    const meUrl = `${admin}/api/me`;
    const me = await page.request.get(meUrl, { timeout: REQUEST_TIMEOUT_MS });
    if (me.status() !== 200) {
        throw new Error(
            `GET ${meUrl} returned ${me.status()}, expected 200: ${await me.text()}`
        );
    }
    const { data: session } = await me.json();
    if (session.role.slug !== 'admin') {
        throw new Error(
            `the first account holds role "${session.role.slug}", expected "admin"`
        );
    }
    console.log('  ok  the first account holds the admin role');

    // A plain fetch carries none of the page's cookies: an anonymous visitor
    // trying to open a second account. It sends the trusted origin, as any
    // script can, so Better Auth's origin check passes and the sign-up guard
    // answers. The code tells that refusal apart from Better Auth's own 403s.
    const signUpUrl = `${admin}/api/auth/sign-up/email`;
    const signUp = await fetch(signUpUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: new URL(admin).origin,
        },
        body: JSON.stringify({
            name: 'Second Account',
            email: 'second-account@example.com',
            password: FIRST_ADMIN.password,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const refusal = await signUp.json().catch(() => ({}));
    if (signUp.status !== 403 || refusal.code !== 'SIGN_UP_CLOSED') {
        throw new Error(
            `POST ${signUpUrl} returned ${signUp.status} ${JSON.stringify(refusal)}, expected 403 SIGN_UP_CLOSED`
        );
    }
    console.log(`  ok  403 POST ${signUpUrl} (sign-up is closed once a user exists)`);

    step('opening the post entries list');
    const postsLink = page
        .getByRole('navigation', { name: 'Entry types' })
        .getByRole('link', { name: 'Posts', exact: true });
    await waitFor(postsLink, 'the Posts link in the sidebar');
    await postsLink.click();
    // The empty state renders in both the list and the grid view, and only once
    // the list query has answered.
    await waitFor(
        page.getByText('No posts found', { exact: true }),
        'the empty post entries list'
    );
    console.log('  ok  the post entries list renders its empty state');

    step('creating a post and opening its edit page');
    // `page.request` shares the page's cookies, so this write is made with the
    // session first-run setup created.
    const createUrl = `${admin}/api/entries/post`;
    const response = await page.request.post(createUrl, {
        data: { title: POST_TITLE },
        timeout: REQUEST_TIMEOUT_MS,
    });
    if (response.status() !== 201) {
        throw new Error(
            `POST ${createUrl} returned ${response.status()}, expected 201: ${await response.text()}`
        );
    }
    const { data: post } = await response.json();
    console.log(`  ok  201 POST ${createUrl} (the session cookie authorises a write)`);

    await page.goto(`${admin}/entries/post/${post.id}`, {
        waitUntil: 'commit',
        timeout: REQUEST_TIMEOUT_MS,
    });
    // The label reads "Title *": the asterisk marks the field required.
    const titleInput = page.getByLabel('Title *', { exact: true });
    await waitFor(titleInput, 'the post edit form');
    const title = await titleInput.inputValue();
    if (title !== POST_TITLE) {
        throw new Error(
            `the edit form's title input holds "${title}", expected "${POST_TITLE}"`
        );
    }
    console.log(
        '  ok  the edit page renders the new post with its title in the title input'
    );

    if (pluginPage) {
        step('opening a plugin admin page');
        // The backups page is the plugin's own component. It calls
        // `useAstromechPlugin()` from `astromech/ui/app`, which throws unless the
        // plugin resolved the same copy of the kit as the admin, so the admin's
        // React context is visible to it. "Run now" renders once that call has
        // worked and the plugin's own `listRuns` method has answered.
        await page.goto(`${admin}/plugin/backups`, {
            waitUntil: 'commit',
            timeout: REQUEST_TIMEOUT_MS,
        });
        await waitFor(
            page.getByRole('button', { name: 'Run now', exact: true }),
            'the backups plugin page'
        );
        await waitFor(
            page.getByText('No backups yet. Run one to get started.', { exact: true }),
            'the backups plugin page empty state'
        );
        console.log(
            '  ok  the backups plugin page renders its own component in the admin'
        );

        // A plugin's raw route, called with the admin's session. Only the
        // backups handler answers with this body: an unmounted route falls
        // through to the API's own 404, whose body names the route instead.
        const downloadUrl = `${admin}/api/plugins/backups/runs/nope/download`;
        const download = await page.request.get(downloadUrl, {
            timeout: REQUEST_TIMEOUT_MS,
        });
        const downloadBody = await download.text();
        if (
            download.status() !== 404 ||
            downloadBody !== JSON.stringify({ error: 'Backup run not found' })
        ) {
            throw new Error(
                `GET ${downloadUrl} returned ${download.status()} ${downloadBody}, expected 404 from the backups plugin's raw route`
            );
        }
        console.log(`  ok  404 GET ${downloadUrl} (the plugin raw route is mounted)`);
    }

    const reported = failOnWarnings ? 'warnings or errors' : 'errors';
    if (errors.length > 0) {
        throw new Error(
            `the admin reported ${reported} in the browser${formatLines(errors)}`
        );
    }
    console.log(
        failOnWarnings
            ? '  ok  the admin logs no console warnings, console errors or page errors'
            : '  ok  the admin logs no console or page errors'
    );
}

/** Close the browser `expectAdminWorks` launched, if it is still open. */
export async function closeAdminBrowser() {
    if (browser === null) return;
    const open = browser;
    browser = null;
    await open.close();
}

function formatLines(lines) {
    if (lines.length === 0) return '';
    return `\n${lines.map((line) => `      ${line}`).join('\n')}`;
}
