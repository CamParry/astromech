# Module Boundary Enforcement

The dependency-cruiser DAG holds the right shape, but it is written as eleven
rules that each hand-enumerate every sibling directory. The cost is not
strictness, it is maintenance per rule times number of rules — the config has
been edited 28 times, and most of those edits were mechanical follow-on from a
directory being added or renamed elsewhere.

**It has already failed open.** `notifications/` is a domain in
`ARCHITECTURE.md` and appears in zero rules. Today `notifications/` may import
`boot/`, `transport/` and `admin/` with nothing to stop it, and no capability is
prevented from importing it either. The header comment has drifted too: it lists
`cli` as a top-layer directory, but there is no `src/cli/` — the CLI lives at
`transport/cli/`.

A guardrail that silently stops covering new code is worse than a looser one
that always covers everything. Both problems have the same root: the layer model
is expressed once per rule instead of once.

## Prior art

No comparable project enforces intra-package layering with a linter. Payload,
Astro, Nuxt, n8n, better-auth and Directus ship neither dependency-cruiser nor
`eslint-plugin-boundaries`. They enforce with package splits, `exports` maps with
no wildcards, and an explicit internal subpath for cross-package-but-not-public
code (`payload/internal`; Keystone's
`___internal-do-not-use-will-break-in-patch/`). Astro and better-auth run `knip`
for dead exports.

That is not an argument for deleting the scan — it is the only mechanism that can
enforce a layering _inside_ one package, and the alternative those projects chose
(split the package) costs more. It is an argument for making the scan cheap
enough that nobody resents it.

## Change

### 1. Generate the layer rules from one table

`.dependency-cruiser.cjs` is JavaScript. Replace the hand-written `no-upward`
family with a single ordered array and a loop that emits one rule per layer:

```js
const LAYERS = [
    ['routes', 'admin', 'boot', 'codegen'],
    ['transport', 'policies'],
    ['entries', 'media', 'users', 'settings', 'notifications'],
    [
        'database',
        'storage',
        'email',
        'ai',
        'cron',
        'cloudflare',
        'request-context',
        'fields',
        'permissions',
        'plugins/runtime',
    ],
    ['types', 'utilities', 'errors'],
];
```

- [ ] Emit `no-upward` per layer from `LAYERS`, replacing `domain-no-upward`,
      `capability-no-upward`, `plugins-runtime-is-a-capability`,
      `policies-no-upward` and `transport-no-reach-boot`.
- [ ] Add a generated `directory-must-be-in-a-layer` rule: any top-level `src/`
      directory absent from `LAYERS` is an error. This is what stops the next
      `notifications/`.
- [ ] Keep the genuinely bespoke rules as explicit entries below the generated
      block: `database/schema.ts` as the table aggregator, `leaves-are-pure` with
      its two type-only exemptions, `client-is-over-the-wire`,
      `transport-server-no-reach-client-or-admin`, `no-circular`.
- [ ] Verify the generated set catches everything the eleven rules caught, by
      running `npm run lint:deps` against a temporary commit that introduces one
      deliberate violation per replaced rule.

Adding a domain then becomes one word in one array, and forgetting becomes
impossible.

### 2. Replace the admin allowlist with a naming convention

`admin-only-client-and-pure-leaves` carries a five-file `pathNot` list
(`entries/type-ids`, `entries/utils/url`, `entries/validation-stage`,
`settings/page-values`, `media/serving/image/url`). It grows every time the
browser needs to share a pure function with the server, and each addition is a
config edit.

Payload identifies browser-safe code by where it lives, not by a list:
`src/exports/shared.ts` plus the `browser` export condition.

- [ ] Adopt `*.shared.ts` as the marker for a browser-safe domain leaf, and
      rename the five allowlisted files to it.
- [ ] Collapse the `pathNot` to a single `\.shared\.(ts|tsx)$` pattern.
- [ ] Add a rule that a `*.shared.ts` file may import only pure leaves, so the
      marker cannot be applied to something that drags `virtual:astromech/config`
      into the browser bundle.

The second benefit is the one that matters more than the config saving: the
constraint becomes visible in the filename, so the
`domain-barrel-browser-boundary` class of mistake is legible at review time
without running the linter.

### 3. Separate the layer rules from the environment rules

The boundaries that have caught real defects are not layering rules. They are
runtime-environment rules: plugin code loads in Node and cannot resolve
`virtual:`, the integration loads at config time and must not reach a service,
admin code runs in a browser and must not pull the config virtual module into
the bundle. `policies-no-upward` and `transport-no-reach-boot` have no such
record.

- [ ] Split the config into two labelled blocks: generated layer rules, and
      environment rules.
- [ ] Cross-reference `check:config` and `check:node-imports` from the
      environment block, so the three read as one family rather than as unrelated
      one-offs.

## Notes / caveats

- Steps 1 and 2 are independent and can land in either order. Step 2 is the
  prerequisite for `roadmap/planned/admin-as-its-own-package.md` either way,
  since the same set of shared leaves has to be identified before the admin can
  move.
- Step 1's `directory-must-be-in-a-layer` rule and
  `roadmap/planned/domain-shape-convergence.md` close the same hole from two
  sides: `notifications/` is absent from every rule here _and_ absent from the
  method manifest there, both because it was added after the conventions were
  set. Neither fix catches the other's case.
- `roadmap/planned/domain-owned-service-contracts.md` step 0 depends on whether
  a rule here can exclude type-only edges via `dependencyTypesNot`. Answering it
  is cheap and worth doing while this config is already open.
- Migration-neutral: no runtime code changes in step 1, and step 2 is renames
  plus import updates only.
- The relaxation already recorded in the config header (domains may read one
  another) stays. The four peer-domain edges in the tree today are all one clean
  call, and forbidding them previously pushed the same work somewhere worse.
- The domains stay outside `no-circular` scope until their internal cycles are
  cleaned up. That cleanup is separate work and should not block this.
