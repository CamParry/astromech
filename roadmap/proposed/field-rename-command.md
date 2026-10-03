# Renaming a field's stored values

Renaming a field in the config leaves its stored values under the old name.
`astromech validate`
(`packages/astromech/src/transport/cli/validate-stored-content.ts`) reports
them, but nothing moves them. Raised on 2026-10-03. **Target: 1.0.**

## Decided (2026-10-03)

- **The config does not migrate content.** Nothing in the config can tell a
  rename from a deletion plus a new field. Directus and Strapi know only because
  the rename happens in their admin screens. Rejected: rename detection, and a
  `renamedFrom` field option.
- **A separate command moves the values**, kept apart from the config, as
  Sanity's migrations are files run from its CLI.

## Proposal

- `astromech entries:rename-field <type> <from> <to>`, with a dry run that
  counts the rows it would change. It covers every locale, versions and staged
  changes, and the same for globals.
- The docs on fields say that renaming a field leaves its values behind, and
  point at the command.

## Open questions

- Does the command rewrite stored versions too, or leave history as it was?
- Does it cover a field nested in a group, repeater or block (a path rather
  than a name)?
- Is the relationship index rebuilt when the field is a `relationship`?
