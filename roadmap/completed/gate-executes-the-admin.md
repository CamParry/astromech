# The gate executes the admin

`pnpm run check:boot` builds `apps/demo`, starts the built server, and asserts
`/admin` returns 200. `admin/shell.astro` mounts `<AdminApp client:only="react" />`,
so that 200 is the shell: an html document, a stylesheet link and a script tag.
The React app has not been evaluated when the response is written, and the
assertion passes whether or not it can be.

**A broken import anywhere in `src/admin/` therefore passes the entire gate.**
`tsc` accepts a side-effect import that resolves at type level, the tsup library
build never compiles `admin/` at all (it is consumer-Vite territory —
`DECISIONS.md` covers why), the
Vitest suite does not mount the app, and `check:boot` sees a live shell. Only
opening a browser catches it.

This is the defect `roadmap/planned/admin-as-its-own-package.md` wants to fix by
moving 196 files into a package with its own build. A headless check that
executes the mounted admin fixes it directly, without moving anything.

## Shipped (2026-08-15)

- [x] After `check:boot`'s existing assertions, load `/admin` in a headless
      browser and assert the app actually mounted — a selector that only exists
      once React has rendered, not merely a 200. The selector is
      `#am-app form input[type="password"]`: the router root from
      `packages/astromech/src/admin/pages/__root.tsx` plus the password field of
      the unauthenticated screen, so it separates a painted screen from the
      pending placeholder as well as from the shell.
- [x] Fail on any console error and on any uncaught page error, since a broken
      import surfaces as one of the two and not as a missing element. Chromium
      logs the unauthenticated `/api/me` 401 as a console error too, so messages
      that carry no JavaScript arguments — the ones no script emitted — are
      printed with a mount failure but do not fail the check by themselves.
- [x] Playwright, headless chromium, launched inside the same server lifecycle.
      puppeteer-core against a system Chrome and a bare CDP probe both avoid the
      browser download and were rejected;
      `DECISIONS.md` records why.
- [x] The step is mandatory, not behind a flag. `check:boot` is already on
      demand and in CI only, and a skippable check is the rot this file warns
      about. A missing browser binary fails with the install command in the
      message, and CI installs chromium before the run.
- [x] The line is before login, stated in the script header: everything behind
      it is untested by this check.

## What this does to the case for the split

It weakens it. `roadmap/planned/admin-as-its-own-package.md` had three
justifications; `roadmap/completed/module-boundary-enforcement.md` paid down two
of them, and this item pays down the third. If this lands, the argument for
moving the admin into its own package is prior art and file count, with no
uncaught defect class behind it.

That is the honest reading, and it belongs here rather than being discovered
after the split is half-done.

## Notes / caveats

- `check:boot` is already the slowest thing in the repo and deliberately outside
  the pre-commit hook. This adds a browser to it, so keep the browser step
  inside the same server lifecycle rather than starting a second one.
- The same check would catch the `ui-instance-guard` failure
  (`admin/support/ui-instance-guard.ts` throws when two copies of the UI barrel
  load), which today also only shows up in a browser.
- Prerequisite two for `roadmap/planned/admin-as-its-own-package.md`, and
  independently worth having whatever happens to that item.
