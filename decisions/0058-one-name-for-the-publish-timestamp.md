# 0058 — One name for the publish timestamp: `publishedAt` on the way in and on the way out

**Date:** 2026-08-17
**Status:** accepted

`entries.published_at` is one column. Until now it was exposed under two names:
every input said `publishAt` — the service params, the Zod schemas, the CLI
flag, the HTTP body, the admin form state — while the stored row, the `Entry`
type and the hook contexts said `publishedAt`. The two were reconciled by hand
in the middle of the write.

The input alias is removed. `publishedAt` is the name at every layer.

## Why

The translation was hand-written and unenforced.
`packages/astromech/src/entries/operations/create.ts` read `validated.publishAt`
and assigned it to a local `publishedAt` that went into the row;
`packages/astromech/src/entries/operations/update.ts` did the same. Nothing
checked that the two sides stayed in step, and they did not: the
`entry:beforeUpdate` context in `packages/astromech/src/types/hooks.ts`
described the row it hands a plugin using the input name, so a handler reading
`data.publishAt` was reading a key the row does not have. That drift produced no
type error, because `runBeforeHooks` takes `unknown`.

An alias whose only enforcement is a person remembering it is a defect waiting
for its second occurrence.

## `published` is a participle, not a past tense

The objection to `publishedAt` is that a scheduled entry's timestamp has not
happened yet, so the past tense lies. It does not: `published` here is a past
participle, and a participle carries no tense of its own. It takes one from its
auxiliary — "the post _was_ published", "the post _will be_ published", "the
post _is_ published on this date". Only the auxiliary moves. So `publishedAt`
never made a claim about the past, and there is no lie to trade away.

That also explains why the alias read worse rather than better. Bare `publish`
is the active verb, so `publishAt` phrases a field as an instruction — publish
this at that time. Instructions belong in method names. The participle is
adjectival, which is what a column value should be. schema.org reaches for the
same construction in `datePublished`.

Every comparable system uses the participle, and none of them adds a second
name.

- **Ghost** stores `published_at` alongside a `status` enum that contains
  `scheduled`. You schedule a post by setting `status: 'scheduled'` and
  `published_at` to a future datetime; Ghost flips the status when that time
  arrives and leaves the timestamp alone.
  <https://docs.ghost.org/admin-api/posts/scheduling-a-post>
- **Strapi** uses `publishedAt`, with null meaning draft.
  <https://docs.strapi.io/cms/features/draft-and-publish>
- **Contentful** exposes `sys.publishedAt`.

In all three, `status` supplies the auxiliary the participle is waiting for:
`scheduled` means _will be_ published at this time, `published` means _was_.
Ghost is a near-exact structural match to Astromech: the same enum, the same
single column, the same flip-on-schedule behaviour.

Naming that avoids the participle is the other established answer. **WordPress** pairs
`post_date` with `post_status = 'future'`; **Craft** derives a `pending` status
from `postDate` and `expiryDate`; RSS has `pubDate`; schema.org has
`datePublished`.
<https://wordpress.org/documentation/article/post-status/> ·
<https://craftcms.com/glossary/status>

What no surveyed system does is give one column two names. Where an
instruction-shaped name does appear it marks a genuinely separate field: **Drupal**'s Scheduler
module adds `publish_on`/`unpublish_on` beside the node's own timestamps, and
Strapi's Publisher plugin adds `publishAt`/`unpublishAt` beside `publishedAt`.
In both, the instruction-shaped name is a scheduling instruction distinct from
the publication timestamp, and both names are stored.
<https://market.strapi.io/plugins/strapi-plugin-publisher>

Astromech has one column, so `publishAt` was never a second concept. It was a
second spelling.

## Rejected: dropping the participle

`publishDate` or `postDate`, Craft's answer, and the strongest alternative.

It loses on three counts. Its advantage was supposed to be that it sidesteps a
false tense claim, and there is no false claim to sidestep. It is a larger
rename, touching the stored side, the `Entry` type, the hook contexts and the
column, rather than only the inputs. And
it gives up the recognition a Strapi or Contentful user arrives with: they know
what `publishedAt` on a CMS entry means and they guess it correctly on first
read.

## Rejected: keeping the alias and documenting it

The drifted hook context is the argument against. A documented alias is still an
alias; it survives only as long as every future edit remembers to translate.

## Consequences

The verbs live in the method names, where they belong, not in the field name:
`publish()`, `unpublish()` and `schedule()` in
`packages/astromech/src/entries/operations/status.ts`. `schedule({ publishedAt })`
reads correctly — you are scheduling the entry, and this is the date it will be
published on.

The field's semantics are still worth stating once, since a reader who has only
seen published entries may assume the value is always historical. A docblock on
`Entry.publishedAt` in `packages/astromech/src/types/domain.ts` records that the
field is the publication gate rather than a record of publication, that
`packages/astromech/src/entries/visibility.ts` compares it against the clock to
decide public visibility, and that null means no gate is set.

Two names moved with the rename rather than through it. The shared Zod fragment
in `packages/astromech/src/entries/schema.ts` was `publishAtField`, but
`previewTokenSchema` also uses it for `expiresAt`, so it is now `optionalDate`,
which describes what it is. The admin's i18n key `entries.publishAtField` became
`entries.publishedAtField`, and its English string changed from "Publish at" to
**"Publish date"**. Identifier and UI copy answer to different readers: the
control is a `datetime-local` input shown only while the entry is scheduled, and
"Published at" labels it as a value already set rather than one being chosen.
"Publish date" is Ghost's own wording in the same position.
