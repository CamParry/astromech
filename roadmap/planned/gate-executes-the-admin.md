# The gate executes the admin

`npm run check:boot` builds `apps/demo`, starts the built server, and asserts
`/admin` returns 200. `admin/shell.astro` mounts `<AdminApp client:only="react" />`,
so that 200 is the shell: an html document, a stylesheet link and a script tag.
The React app has not been evaluated when the response is written, and the
assertion passes whether or not it can be.

**A broken import anywhere in `src/admin/` therefore passes the entire gate.**
`tsc` accepts a side-effect import that resolves at type level, the tsup library
build never compiles `admin/` at all (it is consumer-Vite territory —
`decisions/0033-the-repo-resolves-src-and-npm-gets-dist.md` covers why), the
Vitest suite does not mount the app, and `check:boot` sees a live shell. Only
opening a browser catches it.

This is the defect `roadmap/planned/admin-as-its-own-package.md` wants to fix by
moving 196 files into a package with its own build. A headless check that
executes the mounted admin fixes it directly, without moving anything.

## Change

- [ ] After `check:boot`'s existing assertions, load `/admin` in a headless
      browser and assert the app actually mounted — a selector that only exists
      once React has rendered, not merely a 200.
- [ ] Fail on any console error and on any uncaught page error, since a broken
      import surfaces as one of the two and not as a missing element.
- [ ] Pick the driver against what the check needs, which is one page load and
      no interaction. Playwright is the obvious default and brings a browser
      download; whether that cost belongs in CI, in the on-demand path, or
      behind a flag is the decision to make.
- [ ] Assert past the login screen or stop before it, explicitly. The demo's
      `/admin` renders an unauthenticated shell, so "React mounted" is
      reachable without a session while "the entries list rendered" is not.
      Whichever line is chosen, say so in the script header, because the
      untested half is the half that will rot.

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
