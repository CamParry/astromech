# Roadmap

One feature per file, split across three directories:

- `planned/` — not started
- `in-progress/` — started, partially done
- `completed/` — shipped

Status is encoded by the directory, so there are no status fields or emoji to go
stale. To add a feature, create a file in the right directory. To change status,
`git mv` the file — then run `npm run check:docs`, which catches anything still
pointing at the old path.

A file in `completed/` is a frozen record of what shipped. Don't accumulate new
work in it: a defect found later gets its own file in `planned/`.

`backlog.md` holds unscheduled work that belongs to no single feature. The `docs`
skill has the full contract for all of this.
