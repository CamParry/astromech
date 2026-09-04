# Publishing hygiene

Eight packages are marked public and none of them is ready to be published. This
file covers the package metadata, the version line, the readmes and the
dependency declarations. It does not cover the release process itself (who runs
`pnpm run release`, and when), which nothing has designed yet.

## What is actually true today

**Five of the six plugins cannot be tested at all.** Only `@astromech/assistant`
has `test` and `test:run` scripts. The tests for `forms`, `menus`, `redirects`
and `backups` live in `packages/astromech/tests/plugins/`, and thirteen import
statements in the `forms` suite climb out of the core package into a sibling's
source:

```ts
import { compileFormFields } from '../../../../plugins/forms/src/fields/compile';
```

A published package that cannot be verified on its own has no way to prove it
still works when only it has changed. Moving those suites is the subject of
`../completed/test-tree-mirrors-src.md`; the scripts and the package boundary
are the part that belongs here.

**The version line disagrees with itself.** `astromech` is `0.0.1`. Every plugin
and `@astromech/schema-engine` are `0.1.0`, and all six plugins peer-depend on
`astromech`. Whatever the first published version is, they should reach it
together.

**No package declares `repository`.** npm renders no source link for any of the
eight, and `@changesets/changelog-github` reads the repo from
`.changeset/config.json`, which still holds the scaffold value
`"repo": "your-org/astromech"`. The first `pnpm run version` generates changelog
entries pointing at a repository that does not exist.

**`astromech` has no readme and neither does the repository root.** All six
plugins and `schema-engine` have one. `files` on the core package is
`["dist", "src"]`, so even if a readme existed it would not be in the tarball.

**Forty-seven runtime dependencies on the core package, several of which
describe an integration a given site does not use.** Each of these is imported
by exactly one file:

| Dependency       | The one file that imports it           |
| ---------------- | -------------------------------------- |
| `sharp`          | `media/serving/image/drivers/sharp.ts` |
| `better-auth`    | `users/auth.ts`                        |
| `@libsql/client` | `database/drivers/libsql.ts`           |
| `linkedom`       | `fields/rich-text/parse.ts`            |
| `aws4fetch`      | `storage/drivers/s3.ts`                |

`sharp` is a native binary of tens of megabytes. `apps/demo-cloudflare` installs
it and uses none of it, because edge image transforms go through the Cloudflare
driver. The drivers are already separate published subpaths
(`astromech/media/image/sharp`, `astromech/database/libsql`,
`astromech/storage/s3`), so the subpath a consumer imports already tells you
which of these they need.

**`react` and `react-dom` are dependencies, not peers.** `apps/demo` and
`apps/demo-cloudflare` both declare them directly as well, so the reference
consumers already treat them as peers. `admin/support/ui-instance-guard.ts`
exists to detect a second copy of React at runtime, which is the failure a
direct dependency makes possible. The same is true of `better-auth` and `kysely`,
which both demos also declare.

## The work

- [x] Give each of the five plugins a `test` and `test:run` script, and a
      `tests/` directory of its own. The core suite keeps only what tests the
      plugin **runtime** (`tests/plugins/runtime/`), which is core's code.
- [x] Bring `astromech` onto the same version as the rest, or move the rest onto
      its. One decision, applied to all eight.
- [x] Add `repository` (with `directory`), `homepage` and `bugs` to all eight
      package manifests, and fix the repo in `.changeset/config.json`. Add
      `keywords` and `author` where they are missing.
- [x] Write `README.md` for `packages/astromech` and for the repository root,
      and add `README.md` to core's `files`.
- [x] Decide, per dependency, which of the forty-seven are genuinely required to
      boot and which belong to a subpath a consumer opts into. The candidates
      are the five in the table above plus `react`, `react-dom`, `better-auth`
      and `kysely`. An optional peer with `peerDependenciesMeta.optional` is the
      pattern already used for `nodemailer`, `wrangler` and
      `@modelcontextprotocol/sdk`.
- [x] `pnpm run check:node-imports` has to keep passing for every subpath after
      the move, which is what proves an optional peer is genuinely reachable
      when installed.

## Why it is worth doing before anything larger

None of it changes behaviour, all of it is visible on the npm page, and the
dependency question gets harder the more consumers exist. The version decision
in particular is cheap now and irreversible later.
