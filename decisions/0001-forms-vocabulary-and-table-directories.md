# 0001 — Forms vocabulary, and `tables/` over `schema/`

**Date:** 2026-08-02
**Status:** accepted

## Merge tags, not placeholders

The `{{token}}` syntax in a form's email subject and body is a **merge tag**.

"Placeholder" was rejected because it is already taken: in a form context it
means a field's greyed-out input hint, which forms also has, stored as the
`placeholder` key on a field block. One word could not mean both.

"Merge tag" is the form world's own term — Gravity Forms, Mailchimp and
ActiveCampaign all use it. WPForms says "smart tags" and HubSpot says
"personalization tokens"; neither is as widely recognised.

## Values, not answers

A submitted field value is a **value**, not an **answer**. "Answer" implies a
question, which suits a survey but not a checkout form or a file upload. The
generic word covers every field kind.

## `tables/`, not `schema/`

A plugin's table descriptors live in `src/tables/` and publish as a `./tables`
subpath. The directory holds `definePluginTable` descriptors and nothing else,
so "tables" is literally what is in it, and "schema" in TypeScript is ambiguous
with Zod validation schemas.

"Schema" is kept where it remains accurate:

- `packages/astromech/src/<domain>/schema.ts` — genuinely mixes table
  descriptors with Zod request schemas. Renaming these would be a lie until the
  two halves are split, which is separate work.
- `astromech/db/schema` — the aggregate of every table plus the codec and
  driver.
- `@astromech/schema-engine` — diffing and rendering DDL.

`astromech plugin:generate` takes `--tables` and defaults to
`./src/tables/index.ts` to match.
