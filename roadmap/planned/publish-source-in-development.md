# Publish source in development, `dist` on publish

`apps/demo` loads the integration from `packages/astromech/dist`, so any core
change needs a root `npm run build` plus a dev-server restart before the demo
reflects it. The same indirection is why a worktree cannot verify its own work:
`.claude/worktrees/*` resolve `node_modules` and `dist` to the main checkout, so
a worktree build passes without deps and the demo runs `main`'s code rather than
the branch's.

## The pattern

Payload 4 points its `exports` map at `./src/*.ts` in the repo, and swaps the
whole map to `./dist/*.js` through `publishConfig.exports` at publish time:

```jsonc
{
    "exports": { ".": { "import": "./src/index.ts", "types": "./src/index.ts" } },
    "publishConfig": {
        "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
    },
}
```

In-repo consumers compile core from source through their own bundler. The built
artifact exists only for npm consumers, so the local rebuild loop disappears and
`dist` staleness stops being a class of bug.

## What Astromech can and cannot take

The two halves of core load differently, and only one of them can do this:

| half                    | loader                    | can point at source? |
| ----------------------- | ------------------------- | -------------------- |
| integration / config    | plain Node at config time | no — needs built JS  |
| runtime injected routes | Vite                      | yes                  |

`astromech/astro`, and anything `astromech.config.ts` reaches, must stay on
`dist`. `boot/astro.ts` already injects runtime routes at package **source**
(`pkgSrc`), so that half is halfway there — the gap is the subpaths the demo and
the plugin packages import.

## Change

- [ ] Audit each `exports` subpath and classify it Node-loaded or Vite-loaded.
      The Node-loaded set is already enumerated by `npm run check:node-imports`.
- [ ] Point the Vite-loaded subpaths at `src/` in the repo `exports`, and add a
      `publishConfig.exports` that restores the full `dist/` map.
- [ ] Confirm `npm run check:node-imports` still runs against built `dist` — it
      must keep testing what npm consumers get, not what the repo resolves.
- [ ] Add a check that `exports` and `publishConfig.exports` have identical key
      sets, so a new subpath cannot be added to one and forgotten in the other.
- [ ] Verify by browser-checking `apps/demo` on port 4323 after a core edit with
      no rebuild.

## Notes / caveats

- This narrows the worktree verification trap but does not close it. Anything
  reaching a Node-loaded subpath still resolves through the main checkout's
  `dist`.
- `packages/plugins/*` import `astromech` and `astromech/ui`, both of which load
  under plain Node, so the plugin packages see no change.
- The DTS build is unaffected; it still runs for publish.
