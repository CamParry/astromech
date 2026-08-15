# Roadmap

One feature per file, split across three directories:

- `planned/` — not started
- `in-progress/` — started, partially done
- `completed/` — shipped

Status is encoded by the directory, so there are no status fields or emoji to go
stale. To add a feature, create a file in the right directory. To change status,
`git mv` the file — then run `pnpm run check:docs` and fix what it names.

`check:docs` catches a **markdown link** to the old path from anywhere. It does
not catch a **backticked path**, because those go unchecked in `specs/`,
`roadmap/planned/`, `roadmap/completed/` and `decisions/` — planned work names
files that do not exist yet, and the frozen trees were accurate when written. So
after a `git mv`, grep for the old path as well. A reference in `completed/` or
`decisions/` is history and should be left alone; one in a live document should
be repointed.

A file in `completed/` is a frozen record of what shipped. Don't accumulate new
work in it: a defect found later gets its own file in `planned/`.

`backlog.md` holds unscheduled work that belongs to no single feature. The `docs`
skill has the full contract for all of this.
