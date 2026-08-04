# 0015 — A public subpath mirrors its source directory

**Date:** 2026-08-04
**Status:** accepted

The last two items of the naming pass, decided together because both change what
a consumer types: where a subpath comes from, and which of the two clients gets
the ergonomic name. Follows `0009-service-method-client-vocabulary.md` — one noun
per role, and the public word is the internal word.

## The rule

**A public subpath names the directory the code lives in.**

| Source                     | Subpath                   |
| -------------------------- | ------------------------- |
| `src/database/`            | `astromech/database/*`    |
| `src/storage/drivers/`     | `astromech/storage/*`     |
| `src/media/serving/image/` | `astromech/media/image/*` |

So `astromech/db/schema` became `astromech/database/schema`, `astromech/db/d1`
became `astromech/database/d1`, and `astromech/images/{sharp,cloudflare}` became
`astromech/media/image/{sharp,cloudflare}`. The export barrels under
`src/exports/` follow the convention `storage-r2.ts` already set: the subpath
with `/` replaced by `-`.

The mismatch was not an accident. `db/` → `database/` was an internal-only rename
that deliberately froze the public subpath, and `ARCHITECTURE.md` said so on the
directory-map line. That is the right call when there are consumers to protect.
There aren't any — nothing outside this repo installs `astromech`, and the same
pass had already reshaped `astromech/methods` and the root export. A subpath that
disagrees with its directory costs a reader a lookup every time, costs nothing to
fix today, and is unfixable after 1.0.

Two mismatches went with it. `images` was the only plural driver family, against
`storage` and `database`; and `image` sat two directories below `media`, so a
reader tracing `astromech/images/sharp` landed nowhere.

## Rejected: `astromech/image/{sharp,cloudflare}`

Keeping the image drivers top-level and just fixing the plural. Shorter, and it
puts the three driver families at the same depth — `astromech/storage/r2`,
`astromech/database/d1`, `astromech/image/sharp` reads well as a set.

It lost on two counts. It would sit `astromech/Image` and `astromech/image/*`
next to each other in the export map, differing only by case, on a
case-insensitive filesystem. And it would make the mirror rule carry an exception
on its first outing, which is how a rule stops being one.

## `astromech/Image` → `astromech/media/Image`

The only capitalised subpath of the twenty-four. The capital stays: it names an
Astro component, and PascalCase for a component is the ecosystem's own signal,
not a local quirk. What changed is the prefix, which now says where the file is —
`src/media/serving/image/Image.astro`.

## `astromech/ui` keeps its name

Its source is `src/admin/components/`, so the rule would make it
`astromech/admin/components`. It doesn't, and this is deliberate rather than an
oversight to be tidied up later.

`ui` is what the ecosystem calls a component kit a third party imports, and it is
what plugin authors type. `admin` names the app those components happen to be
built for; a plugin author importing a `Button` is not reaching into the admin
app, they are reaching for the kit. The rule earns exactly one exception, and it
is this one.

## The two clients: fetch takes `astromechClient`

`astromech/local` and `astromech/fetch` both exported `const Astromech:
AstromechClient`. Same identifier, same type, different capabilities — local
carries `content` and bypasses permission checks; fetch goes over the wire and
cannot.

**Fetch's named export became `astromechClient`. Local keeps `Astromech`.** Both
keep their default export, so `import Astromech from 'astromech/fetch'` is
unaffected.

The evidence is which one users type. `astromech/local` has fourteen in-repo
references: seven default imports across `apps/demo`'s Astro templates, pages and
middleware, four named imports in the `seo` and `redirects` READMEs, a seeded
demo snippet, and two docstrings. `astromech/fetch` has none outside the admin
SPA — twenty-one import sites, all inside `src/admin/`, plus four test files. The
ergonomic name belongs to the client that appears in user-facing code.

`client` is also already the assigned noun: `0009` gives it to "the assembled
object a consumer holds". `astromechClient` is that vocabulary applied, not a new
word.

The rename reads at the call site too. `astromechClient.entries.query(...)` in an
admin hook now says "this goes over the wire", which is the distinction the two
modules exist to draw.

### Rejected for the clients

**Renaming local instead.** It would cost every Astro template, both plugin
READMEs and the demo seed, and it would take the short name away from the client
users actually type — the wrong way round on both counts.

**Leaving both as `Astromech`.** Nothing imports both today, so the collision is
latent rather than live. But it is real: the two objects differ in what they can
do, and a reader moving between an admin hook and an Astro page sees the same
identifier meaning two things with no signal that it changed.

`AstromechApiError` is untouched. `0009` already settled it: it is thrown by the
fetch client on an HTTP failure, so it is genuinely an API error.
