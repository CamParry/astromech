# Content visibility — public vs full reads, field privacy, audience filtering

Generalised the disabled-item problem into one model. Two orthogonal axes, both derived from the current user + role: **shape** (`public` vs `full`, binary, role-gates `full`) and **audience** (row filter — status now, member audiences later). Field default is public; mutations always private; settings private by default with per-key public opt-in.

- [x] Public-vs-full read shapes — bare `astromech/local` defaults `public`; `ctx.entries`/admin default `full`; HTTP `full` capability-gated (`entry:read:full`)
- [x] Recursive runtime filter (`src/services/entries/visibility.ts`) — strips `_disabled` items + `_title`/`_disabled` keys, private fields, and draft/scheduled rows on public reads; composes through populate
- [x] Two derived types from one schema (`${Pascal}Fields` / `${Pascal}FieldsPublic`) + read-back guard (public-shape value can't be written back)
- [x] Settings private by default; `public` opt-in per admin page / `config.publicSettings`
- [x] Demo cleanup: dropped the redundant manual `!b._disabled` filter in demo `<Blocks>` (public read strips it upstream). Browser-verify of public-vs-admin renders still recommended.
- [ ] Future: member audiences (frontend auth), per-field audience, `preview` shape — seams built
