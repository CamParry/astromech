# 0052 — The gate executes the admin in a browser

**Date:** 2026-08-15
**Status:** accepted

`scripts/check-boot.mjs` loads `/admin` in headless chromium through Playwright,
against the server it already started, and asserts the React app painted its
unauthenticated screen. The step always runs.

`/admin` returning 200 proves only that the shell was served: it mounts
`<AdminApp client:only="react" />`, so the app has not been evaluated when the
response is written. Nothing else in the gate evaluates it either — `tsc`
accepts a side-effect import that resolves at type level, the tsup build never
compiles `admin/` (`decisions/0033-the-repo-resolves-src-and-npm-gets-dist.md`),
and the Vitest suite does not mount the app. A broken import under
`packages/astromech/src/admin/` passed everything.

## Playwright, not the lighter drivers

puppeteer-core with a system Chrome brings no browser download, which is the
whole cost being avoided here. It also makes the check depend on a browser
nobody installed for it: the CI image's Chrome version drifts on someone else's
schedule, and a developer without one gets a failure about a missing executable
rather than about the admin. Playwright pins the browser it tests with and
`playwright install chromium` is one command with one meaning.

A bare CDP probe — launch a browser, evaluate the page, read the console over
the protocol — is perhaps sixty lines and no dependency at all. It re-implements
waiting for a selector, which is the part with the retry semantics, and it still
needs a browser from somewhere. Writing that to save one devDependency is a poor
trade for a repo that already carries Vitest and Astro.

## Mandatory, not behind a flag

`check:boot` is slow and deliberately outside the pre-commit hook, run on demand
and in CI. The browser step adds seconds to a check already measured in minutes,
so there is nothing left for a flag to save. A skippable check reports what it
was allowed to look at, which is the failure mode the whole item exists to fix.
When the browser binary is missing the check fails and names the install
command.

## The line is before login

The step asserts `#am-app form input[type="password"]`, which is the router root
plus the password field of the login or first-run setup screen. It cannot exist
in the served shell, and it distinguishes a painted screen from the placeholder
the auth layout renders while the session query is in flight.

Going further needs a seeded user and a session, which means the check owns
fixture credentials and a login sequence, and each of those is a thing that
breaks for reasons unrelated to the defect being caught. One page load catches a
broken import, an evaluation-order fault and the `ui-instance-guard` throw,
which is the whole class in scope. The script header says everything behind
login is untested rather than leaving that to be assumed.

## Why an anonymous 401 does not fail it

The unauthenticated admin asks `/api/me` who it is and is answered 401 by
design. Chromium logs every failed response as a console error, so the check
would fail on correct behaviour. Rather than match that message, the step splits
console errors by whether they carry JavaScript arguments: browser-emitted
resource messages carry none, anything `console.error` produced carries some.
The argument-less ones are printed when the mount assertion fails — a resource
that genuinely failed to load takes the mount with it — and are otherwise not
grounds to fail. A message allowlist was rejected: it grows quietly and each
entry hides whatever else matches it.
