# The content operations return

`src/content/` was deleted: the `translate`, `transform` and `generate` methods,
the never-implemented `ContentProvider` port, and their routes, permissions and
types. They were discoverable as tools yet failed at runtime, and their shape
depends on a UI that has not been designed. Removing them also dissolved the
layer model's one cross-module import exception, which should not be reopened
casually.

They come back only with all of this:

- [ ] Each operation owns the whole job: the read, the selection, the placement
      and the write. A method that returns a string for someone else to place is
      what failed before.
- [ ] Output lands staged, for human review, never straight onto a live entry.
- [ ] A designed editor surface exists first. The method shape follows the UI,
      not the other way round.
- [ ] The permission question is settled. It leans toward folding into the
      target resource's own `update` rather than a new verb, but it is open.
- [ ] No new cross-module import exception, or an explicit argument for one.

The AI capability they would build on is in place: `getAiModels()` in `src/ai/`,
and the assistant's approval gate as the worked example of a mutating call that
pauses for a human.
