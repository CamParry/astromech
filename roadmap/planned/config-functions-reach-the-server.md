# Config Functions Reach the Server

Any function an author writes in `astromech.config.ts` is silently dropped before the
running server sees it. Found 2026-08-02 while building the document-level `validate`
hook, which would have shipped inert for exactly this reason.

**Status:** filed, not started. The resource-validator work routed around it with a
boot-time registry (`fields/resource-validators.ts`); this item is about closing the
hole generally.

## The mechanism

`boot/astro.ts` serves the server's config as a JSON literal:

```js
load(id) {
    if (id === '\0virtual:astromech/config') {
        return `export default ${JSON.stringify(resolvedConfig)};`;
    }
}
```

`entries/operations/create.ts` and every other domain operation import exactly that
module. `JSON.stringify({ custom: fn })` is `{}` — not a dropped rule, an EMPTY one — so
`runRule` falls through every branch and returns `null`. No throw, no log.

## What it costs today

- **`{ custom: FieldValidator }` never runs under `astro dev` / `astro build`.** It is a
  documented part of `ValidationRule` and the only escape hatch for a rule the
  declarative set can't express.
- Any future function-valued config option inherits the same failure, silently.

## Why the tests don't catch it

Three config paths, and only the one that ships loses functions:

| Path                | How `virtual:astromech/config` resolves             | Functions |
| ------------------- | --------------------------------------------------- | --------- |
| Astro (dev + build) | `JSON.stringify(resolvedConfig)`                    | **lost**  |
| CLI                 | live Proxy (`transport/cli/virtual-config-shim.ts`) | kept      |
| vitest              | aliased to a live module                            | kept      |

So `packages/astromech/tests/fields/pipeline.test.ts` exercises `custom` rules
extensively and they all pass. The suite is testing a configuration the product never
runs in.

## Directions (none locked)

1. **Registry per function-valued slot**, as the resource validator now does — boot walks
   the live `resolvedConfig` (`initRuntime` gets it before serialisation) and registers
   functions under a stable key. Proven, but it is one registry per slot and each new
   slot is a chance to forget.
2. **Address field validators by path** through one registry: `entry:post` +
   `body[<id>].url` + rule index. Generalises (1) to `custom` without a registry per
   slot; the addressing has to survive container recursion, and `fields/field-path.ts`
   already owns that grammar.
3. **Stop serialising the server config.** Emit `virtual:astromech/config` as a real
   re-export of the author's module rather than a JSON literal. Removes the class of bug
   outright. Needs an answer for why `storage` is stripped today, for whether the config
   module is safe to evaluate in every server context, and for what it does to bundling.

Option 3 is the one that makes the others unnecessary — grill it first.

## Adjacent

- The admin config (`virtual:astromech/admin-config`) is JSON by DESIGN and should stay
  that way; the browser cannot be handed server functions. The client-side validation
  work already accounts for that: `custom` and `unique` are skipped in the browser on
  purpose. This item is only about the SERVER config.
- Worth a check while in here: whether anything else in `AstromechConfig` is
  function-valued and quietly suffering the same fate.
