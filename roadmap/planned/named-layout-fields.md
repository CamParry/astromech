# Layout fields taking a name, and `group` vs `section`

**Status:** planned, not designed. Split out of the naming pass so it survives
that spec's deletion; the vocabulary it builds on is
`decisions/0016-the-fields-module-vocabulary.md`. It is a behaviour change with
a stored-data migration, not a rename, and it needs its own session.

Today `section`, `accordion` and `tab` take a name that is inert — never a data
key. The direction worth exploring is the opposite of dropping that parameter:
**a layout field should optionally accept a name that groups its content**, so
the children it wraps nest under that key instead of staying top-level.

That makes `section` and `group` differ only by whether a name was passed, which
is most of the way to collapsing them into one type with two toggles:

- does the name nest child keys?
- is a box drawn?

`group({ boxed: false })` already occupies one corner of that 2×2, so the toggles
are real rather than hypothetical. `decisions/0016-the-fields-module-vocabulary.md`
records that the `boxed` rename is compatible with the merge either way.

## Prerequisite: `tabs()` takes no name

`fields/builder.ts` is uniform `type(name, options?)` everywhere except `tabs`,
which takes options only and hardcodes `name: 'tabs'`. It is the accidental
prototype for the question above — a layout field with no author-supplied name —
and it is also a latent bug: two `tabs()` in one entry type produce two fields
both named `tabs` (`fields/builder.ts:215-217`) — harmless while a layout
field's name is inert, and a duplicate-key bug the moment anything keys off it.
Formerly tracked in `roadmap/completed/admin-form-defects.md`; it moved here
because whatever this design decides about names on layout fields decides what
`tabs()` should look like, so the two move together.
