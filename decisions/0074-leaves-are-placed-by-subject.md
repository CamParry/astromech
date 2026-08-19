# 0074 — Files leave the layer-word buckets for their subject, and a leaf may sit above its caller

**Date:** 2026-08-19
**Status:** accepted

`utilities/`, `admin/lib/`, `admin/support/` and `entries/utils/` were four
buckets named after a layer rather than a subject. Three are dissolved and the
fourth keeps only what is genuinely miscellaneous.

## The moves

| From                                 | To                                      |
| ------------------------------------ | --------------------------------------- |
| `utilities/registry.ts`              | `registry.ts` (source root)             |
| `utilities/image-drivers.ts`         | `media/image-drivers.ts`                |
| `utilities/image-widths.ts`          | `media/image-widths.shared.ts`          |
| `utilities/entry-capabilities.ts`    | `entries/capabilities.ts`               |
| `utilities/entry-type-ids.ts`        | `entries/type-ids.shared.ts`            |
| `admin/lib/settings-page-save.ts`    | `admin/components/pages/`               |
| `admin/support/ui-instance-guard.ts` | `admin/components/ui/instance-guard.ts` |
| `entries/utils/url.shared.ts`        | `entries/entry-url.shared.ts`           |

`registry.ts` goes to the source root because it is the dependency-injection
primitive every subsystem's registry is built on, and the composition root next
to it is its principal caller. It was never a utility in the sense the other
files in that directory are.

`utilities/` survives holding `bytes`, `strings`, `dates`, `locale`, `options`,
`values-equal`, `labels`, `log`, `permission-match`, `plugin-namespace`,
`with-default-shape` and `ai-context`. That is a real miscellany bucket: each is
a pure helper with no subject to belong to. The rule the moves follow is that a
file belongs in the bucket only when no subject claims it, not when the subject
is merely inconvenient to reach.

## A leaf may sit above its caller

Four of the moved files are imported from below. `config/validate/media-access.ts`
reads `image-drivers.ts`; `config/admin-config.ts` reads `image-widths`;
`config/resolve.ts`, `config/entry-types.ts` and `config/plugin-entries.ts` read
`entries/capabilities.ts`; `config/validate/relationships.ts` and
`permissions/entry-permission.ts` read `entries/type-ids`. `config` and
`permissions` are capabilities, which sit below domains, so each of those is now
an upward import.

They are accepted, and `ARCHITECTURE.md` names them.

The layer rule exists to stop a lower layer pulling a higher layer's _machinery_
in behind it: a capability that imports a domain service drags that service's
database access, its hooks and its config into whatever loads the capability.
None of these files is machinery. Every one is a constant, a type alias or a
pure function over its arguments, with no import of its own beyond the leaves.
`entries/capabilities.ts` is a string-union type and a frozen array;
`image-drivers.ts` is one string constant. Importing them costs a caller
nothing, whatever direction the arrow points.

The alternative was keeping them in `utilities/` so the arrows stayed tidy, and
that is what produced the bucket. A file was placed by what could import it
rather than by what it is about, and the result was a directory of unrelated
things that a reader has to search rather than navigate. Subject placement is
worth more than arrow direction for a leaf, because the arrow direction is only
a proxy for the coupling cost, and for a leaf that cost is zero.

The rule this leaves: **a pure leaf is placed by subject, and may be imported
from any layer. Everything else points down.** A file claiming the exception has
to be a constant, a type, or a function over its arguments, importing nothing
but other leaves. Anything with a driver, a database handle or a service behind
it does not qualify, and the layer list governs it as before.

## `*.shared.ts` where the browser reaches

`image-widths` and `entries/type-ids` take the `*.shared.ts` suffix because the
admin bundle holds them: four admin modules import the type-id helpers directly,
and `media/serving/image/url.shared.ts` imports the width helpers, which puts
them in the client graph transitively. The suffix already means what is wanted
here, and `ARCHITECTURE.md` was describing `entries/type-ids.shared.ts` as an
example of the pattern before the file existed at that path.

`image-drivers.ts` and `entries/capabilities.ts` take no suffix. Nothing in the
admin imports them, and the marker states an allowance rather than a property,
so applying it where the browser has no claim would weaken what it tells a
reader.
