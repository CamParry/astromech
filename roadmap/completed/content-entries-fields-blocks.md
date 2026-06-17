# Content — Entries, Fields & Blocks

- [x] Field library: Text, URL, Password, Email, Textarea, Number, Boolean, Date, Datetime, Color, Select, Multiselect, Media, Relation, Repeater, Slug, Richtext (TipTap), JSON, Group, Checkbox Group, Radio Group, Range, Link, Key-Value; Accordion/Tab visual containers
- [x] Blocks field — block-picker dropdown, collapsible panels, `@dnd-kit` drag-reorder, per-block controls (disable/duplicate/delete/collapse), type generation
- [x] Repeater ↔ blocks UI parity — repeater gains a drag handle + `@dnd-kit` drag-reorder and collapsible/delete controls matching blocks (single-type vs multi-type the only difference)
- [x] Underscore-namespaced reserved instance keys — stored block/repeater items use `_type`/`_disabled` (collision-safe against user field names; `_disabled` is default-by-absence) and a **persisted** `_id` UUID for stable item identity (better diffs/versioning). Author-facing `BlockDefinition.type` unchanged
- [x] Entries terminology: `defineEntryType`, `AstromechConfig.entries`, singular slugs, `Entry.type`, `/entries/:type` routes, `/admin/entries/:type` URLs
- [x] Entry-schema authoring redesign: POJO field-settings factories (`text('from', { required: true })`), single recursive `fields` tree with layout containers, `astromech/fields` subpath; flat `fields` shortcut; `defineHook` (event-inferred payloads) + `defineSdkMethod` with plugin self-augmentation
- [x] Abstract entry capabilities + `titleField` with boot validation; titleless / statuses-off types supported
