# 0070 — Drop dependency-cruiser

**Date:** 2026-08-19
**Status:** accepted
**Supersedes:** 0036

`pnpm run lint:deps` ran dependency-cruiser over `packages/astromech/src`,
enforcing generated no-upward layer rules, pure leaves, a
directory-must-be-in-a-layer check, `no-circular`, and the browser boundary.
The tool, its config, the script and its CI step are removed. The layer list
stays in `ARCHITECTURE.md` as a documented convention.

## Why

The ruleset cost more than it caught, and the record shows it:

- Of the four dependency-inversion ports the plugin runtime carried to satisfy
  the no-upward rules, three (`NotifyAccess`, `ClientAccess`,
  `PluginMethodsAccess`) guarded no real import cycle. They were paperwork for
  a boundary drawn where no hazard existed.
- The config carried four standing exemptions (`NO_UPWARD_EXEMPT`) and four
  hand-written rule variants (`HAND_WRITTEN_NO_UPWARD`), each with prose
  explaining why the table could not express it.
- Roughly one in eight decision records (0036, 0038, 0039, 0042, 0053, 0057,
  0061, 0064) is partly or wholly about managing the ruleset rather than the
  product.
- `no-circular` excluded the domains — the one place cycles would plausibly
  form — because they had pre-existing internal cycles. The tool was strict
  where it did not matter and silent where it was installed to matter.
- The disease the tool was bought for was functionality in the wrong files,
  and the config's own header conceded no dependency rule can detect that.
  What fixed the spaghetti was moving the code, naming the domains and writing
  `ARCHITECTURE.md`; that structure now lives in the directory layout and in
  review, which is how comparable projects (Payload, Strapi, Directus, Astro)
  hold their shape. None of them ships dependency-cruiser; the ecosystem's
  enforcement unit is the package boundary.

## What is lost, and what covers it

- **The browser boundary** was the one rule catching a real defect: server
  code in the admin bundle passes typecheck and build and fails only in a
  browser. Until the admin ships as its own package
  (`roadmap/planned/admin-as-its-own-package.md`, one of the next items to be
  tackled), the runtime check covers it: `check:boot` loads the admin in a
  headless browser and asserts it painted. The package split then makes the
  boundary structural — a browser package cannot import server code it does
  not declare.
- **Cycle detection** goes. Cycles have not been the failure mode here: the
  breakage class that matters (a module-evaluation-time read across a cycle)
  has not occurred, and the call-time references the codebase uses are
  cycle-tolerant in Node and every bundler in play.

## Rejected alternatives

- **Keep a browser-boundary-only config.** Honest but short-lived: the admin
  split replaces it structurally, and keeping the tool, the config and the CI
  step for one interim rule preserves exactly the maintenance surface this
  record removes. The runtime check already exists.
- **Replace `no-circular` with eslint's `import/no-cycle`.** The same fight
  with a slower tool, for a failure mode that has not appeared.
- **Keep everything and relax case by case.** That was the trajectory being
  corrected — each relaxation had produced a new exemption list and a new
  record.

Re-adding a dependency lint later, as a hardening layer once development
shifts from building to correctness-hardening, stays open —
`roadmap/backlog.md` holds the line.
