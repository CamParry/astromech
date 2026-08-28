# CI runs the whole gate

`AGENTS.md` documents thirteen checks that must pass before a change lands.
`.github/workflows/ci.yml` runs seven of them. This file is about which checks
run at all and on which runtimes. Making the gate fast, and having CI call the
same scripts a developer calls instead of its own hand-written job list, is
[verification-gate-speed](verification-gate-speed.md), which is where this work
landed: CI now runs `pnpm run verify` on the Active LTS and `verify:runtime` on
the floor version, so every documented check runs and the two lists cannot
drift. The rest of this file is the state that led to that.

## What CI does not run

| Check                   | What only it catches                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `check:boot:cloudflare` | Anything that breaks on workerd: bindings, the environment lookup, the Worker entry |
| `check:exports`         | `exports` and `publishConfig.exports` naming different subpaths, or resolving apart |
| `check:node-imports`    | A plugin-facing subpath that does not import in plain Node from built `dist`        |
| `check:config`          | A config-time import that reaches a domain service                                  |
| `check:docs`            | A repo-relative link or backticked path that no longer resolves                     |
| `lint:css`              | Anything in `packages/astromech/src/admin/styles/`                                  |

The first one is the serious gap. **No CI job runs workerd at all.**
`apps/demo-cloudflare` exists precisely because Workers is the runtime least
like the one everything else is tested on, and nothing on `main` proves it still
boots. The second is next: thirty published subpaths, and the only guard on them
runs on a developer's machine or not at all.

`check:docs` and `check:exports` are both under two seconds and need no build.
There is no cost argument for leaving them out.

## The other half of the gap

CI runs `pnpm run build` in five of its seven jobs, and `pnpm install` in all
seven. A missing check is a correctness problem and a repeated build is a cost
problem, but they have the same cause: the job list was written by hand and has
been extended by hand ever since, so it drifts from the gate every time the gate
changes.

## The work

- [x] Add `check:boot:cloudflare`. It runs on both Node versions now, inside
      `verify` (Active LTS) and `verify:runtime` (floor).
- [x] Add `check:exports`, `check:docs`, `check:node-imports` and `lint:css`.
      The first three run in `verify`; `lint:css` moved to CI's `backstop` job
      with `format:check`. `check:config` was not added: it was retired from the
      gate entirely, since `astro sync` and the boot checks already force its
      failure.
- [x] The AGENTS.md claim that "CI runs them" is now true, and the gate table's
      prose was corrected against the workflow.
- [x] Decided: the build is repeated, not shared through an artifact, but far
      less. `verify` builds once for the gate; the runtime, index and backstop
      jobs each do a `build:js` (~8s, no declarations) or no build at all, so the
      old five full builds are gone.

## Why it was left

Nothing here is deployed, so a red `main` has never cost anything yet. That
changes the moment something is published from it.
