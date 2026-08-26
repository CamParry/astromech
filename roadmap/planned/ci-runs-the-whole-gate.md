# CI runs the whole gate

`AGENTS.md` documents thirteen checks that must pass before a change lands.
`.github/workflows/ci.yml` runs seven of them. This file is about which checks
run at all and on which runtimes. Making the gate fast, and having CI call the
same scripts a developer calls instead of its own hand-written job list, is
[verification-gate-speed](../in-progress/verification-gate-speed.md).

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

- [ ] Add `check:boot:cloudflare`. It needs no Cloudflare account and no
      network, so it is an ordinary job.
- [ ] Add `check:exports`, `check:docs`, `check:config`, `check:node-imports`
      and `lint:css`. The first two are fast and buildless; the middle two need
      the build; `lint:css` belongs with `lint`.
- [ ] Once every check has a home, the AGENTS.md claim that "CI runs them" is
      true for the first time. Check the gate table's prose against the workflow
      and correct whatever else has drifted.
- [ ] Decide whether the build is shared between jobs (upload and download an
      artifact) or repeated. Repeating it is defensible if the jobs are meant to
      be independent; five copies of a thirty-second build is not free either
      way, so it should be a decision rather than an accident.

## Why it was left

Nothing here is deployed, so a red `main` has never cost anything yet. That
changes the moment something is published from it.
