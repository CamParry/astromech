# Content module symmetry

`ARCHITECTURE.md` describes five content modules as siblings, each with a
`service.ts`, a `tables.ts`, a contract catalogue and a `schema.ts`. They are
siblings in that outline and five different shapes underneath it. This file is
about deciding which of those differences are the design and which are just
where each module stopped, before the answer becomes a breaking change.

## What the five actually have

|                      | `entries`              | `media`         | `users`         | `settings`      | `notifications` |
| -------------------- | ---------------------- | --------------- | --------------- | --------------- | --------------- |
| `service.ts`         | yes                    | yes             | yes             | yes             | yes             |
| `tables.ts`          | yes                    | yes             | yes             | yes             | yes             |
| `schema.ts`          | yes                    | yes             | yes             | yes             | **no**          |
| contract catalogue   | `methods.ts`           | `contract.ts`   | `contract.ts`   | `contract.ts`   | `contract.ts`   |
| `operations/` files  | 13                     | 7               | 5               | 0               | 0               |
| repository           | `repository/`, 7 files | `repository.ts` | `repository.ts` | `repository.ts` | `repository.ts` |
| swappable repository | **yes**                | no              | no              | no              | no              |
| `capabilities.ts`    | yes                    | no              | no              | no              | no              |
| `visibility.ts`      | yes                    | no              | no              | yes             | no              |
| `errors.ts`          | yes                    | no              | no              | no              | no              |

Some of that is honest size. `settings` and `notifications` have no
`operations/` because their services are small enough to read in one file, which
is what `ARCHITECTURE.md` already says should happen. `capabilities.ts` and
`errors.ts` are about entry types, which the other four do not have.

## The one that is a design question

**Only entries has a swappable repository.** `defineEntryType({ repository })`
is public API, it reaches `setEntryRepository` through `astromech.ts`, and two
shipped plugins already use it: `@astromech/forms` backs submissions with
`tableRepository(submissionsTable)`, and `@astromech/redirects` does the same
for redirects. The other four modules read and write their own tables directly.

So a third party can put entries behind storage core knows nothing about, and
cannot do the same for users. That is either deliberate (entries is the
extension point, the rest is the framework) or unfinished (the seam was built
where it was needed first). Nobody has written down which, and the answer
decides whether an external identity provider or an external media library is
something Astromech supports.

`ARCHITECTURE.md` cannot record it either way until it is decided, because a map
of the present has nowhere to say "and this is on purpose".

## The smaller ones

- **`entries/methods.ts` against four `contract.ts` files.** `ARCHITECTURE.md`
  documents the exception rather than resolving it, which is the documentation
  absorbing an inconsistency instead of the code losing one.
- **`notifications` has no `schema.ts`.** Every other content module validates
  its input with zod at the module edge. Either notifications takes no untrusted
  input, in which case say so, or it is missing the check.
- **`notifications/current-user-service.ts`** has no counterpart anywhere and no
  obvious layer. Worth a look on its own.
- **Transactions.** `users` and `media` still hand-thread a `db` handle, which
  `flatten-user-and-media-operations.md` covers. That file is the work; the
  reason it is listed here is that it is the same question in another form:
  entries got a shape and the others have not been brought onto it.

## The work

- [ ] Settle the repository seam. Either extend it to `users`, `media`,
      `settings` and `notifications`, or write in `DECISIONS.md` that entries is
      the only pluggable one and what that beat.
- [ ] Pick one name for the contract catalogue and rename the odd one out. The
      four-to-one split says `contract.ts`.
- [ ] Decide whether `notifications` needs a `schema.ts` and add it or record
      why not.
- [ ] Find `current-user-service.ts` a home, or fold it into `service.ts`.
- [ ] Once the shapes agree, `ARCHITECTURE.md`'s content-module paragraph loses
      its two parenthetical exceptions.

## Why it is worth doing before 1.0

Three of the five bullets change a public surface: the repository seam, the
catalogue name, and anything a schema newly rejects. All of them are cheap while
nothing is published.
