# Settings version history, audit, and persistence convergence

**Not designed.** This file holds the pressures, the direction worth designing
against, and the open naming question. The settings/config split itself is
decided — `DECISIONS.md` — and is not
reopened here. Absorbed the former backlog line "investigate version history
for settings".

## The gap

Settings-page values (host globals pages, plugin settings pages) are KV-upsert:
`packages/astromech/src/settings/schema.ts` is key → JSON blob, and a save
overwrites the previous value with no record. Entries, meanwhile, have the full
versioning stack. Three pressures point at the same persistence decision:

- **Version history.** The first plausible demand is menus — a settings-backed
  tree an editor will eventually want to revert the way entries revert. There
  is no revision to revert to.
- **Audit.** The settings table has an `updatedBy` column that nothing
  populates (`settings/repository.ts` writes only `key` and `value`), and
  `roadmap/planned/audit-trail.md` will eventually ask who changed a setting.
- **Localisation.** Translatable pages split values across `<key>` and
  `<key>:<locale>` by partitioning top-level fields at save
  (`admin/lib/settings-page-save.ts`), a bespoke scheme the entries
  localisation model doesn't need, and one that already carries a workaround
  for `defaultLocale` being a display tag outside the locale list
  (`SettingsPageForm.tsx`).

## Direction worth designing against

The code-first CMSs store the equivalent values as documents in their content
system — Payload globals and Sanity singletons are ordinary documents with an
"exactly one" constraint, which is how versioning, drafts, localisation and
audit come free from the one pipeline that already has them.

The convergence shape for Astromech would be: values behind a settings page
become an internal singleton entry per page, riding the entries versioning,
localisation and (future) audit machinery; the KV table shrinks to what it is
genuinely good at — unstructured plugin state written without a page, schema
or migration (`plugin:backups:retention` is the live example). What must NOT
happen is a second versioning system bolted onto the KV table: two version
stacks is strictly worse than either answer.

Costs to weigh in the design, not resolved here:

- Entries carry machinery a settings blob has no use for (slug, publish
  states, trash, relationships); a singleton entry type needs those either
  disabled or harmless.
- Nothing enforces "exactly one" today; the constraint has to live somewhere
  real, not in convention.
- Plugin settings pages write through `ctx.settings` and the shared
  `SettingsPageForm`; both would need to keep working unchanged through the
  persistence move, or the move isn't behaviour-preserving.
- The naked-key class (`plugin:<ns>:<arbitrary>`, unvalidated, defensively
  parsed at read) stays KV by design — the design must say so explicitly or
  the class will get dragged along.

## The naming question — open

"Singleton" is the mechanism's name in the surveyed CMSs (Sanity, and
Payload's docs use it to describe globals), but it names the constraint, not
the thing, and a stranger doesn't guess it. The candidates in the ecosystem:

- **settings** — what the subsystem, table, service and permissions are
  already called here; instantly guessable; but the code-first ecosystem
  reserves it for operator config, which we _don't_ store.
- **globals** — Payload, Craft and Statamic's shared word for editor-owned
  site-wide content; the demo's page is already named `globals`; slightly less
  obvious to a WordPress-shaped user than "settings".
- **singleton** — precise about the persistence constraint, opaque as a
  user-facing word. Likely the right word _inside_ the repository only, if
  anywhere.

Current lean: **globals** for the user-facing word — it is the shared term
across Payload, Craft and Statamic, the demo's page already carries it, and it
avoids the collision created for "settings" (the word the code-first
ecosystem reserves for operator config, which we deliberately don't store).
"Singleton" appears, at most, as the internal persistence term. Whatever wins gets
a `TERMINOLOGY.md` entry and, since it is contested, a `DECISIONS.md` record
with this comparison — do not resolve it silently in code.

## Trigger

Do nothing until the first real demand for settings revert/history (watch
menus). Designing the convergence before then buys nothing and risks
enshrining a persistence model the audit-trail work would immediately bend.
