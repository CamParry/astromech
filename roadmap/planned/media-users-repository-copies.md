# Media and users repository copies

`packages/astromech/src/media/repository.ts` and
`packages/astromech/src/users/repository.ts` repeat four blocks: the list
filter, `findByLocale`, the chunked id lookup, and the update and delete
members. `pnpm run report:drift` lists them. They predate
`completed/output-schemas.md`, which only renamed them.

- [x] Share the four blocks through the content repository, or record why each
      one differs.

The content repository now holds the list filter's default-locale pin
(`whereDefaultLocale`), `findByLocale` and the chunked id lookup
(`findResourceRows`). Four parts stay per resource:

- `delete`: entries drop their relationship rows at their three service call
  sites rather than in the repository, so moving the drop into the content
  repository's `delete` changes entries too. That is a separate change.
- `updateFile` and `updateUserRow`: each narrows the patch to its own columns
  over one `createRepository` call, which is already shared.
- The hand-picked content members: `DECISIONS.md`, "Resource repositories do
  not extend a base".
- `findOne`: the fallback differs, since a user falls back to any locale.
