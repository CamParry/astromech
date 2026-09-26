# Media and users repository copies

`packages/astromech/src/media/repository.ts` and
`packages/astromech/src/users/repository.ts` repeat four blocks: the list
filter, `findByLocale`, the chunked id lookup, and the update and delete
members. `pnpm run report:drift` lists them. They predate
`completed/output-schemas.md`, which only renamed them.

- [ ] Share the four blocks through the content repository, or record why each
      one differs.
