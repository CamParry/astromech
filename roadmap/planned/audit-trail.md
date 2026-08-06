# Audit trail

A record of which service method ran, with which arguments, for which user, with
what outcome. Split out of `roadmap/in-progress/ai-integration.md` on 2026-08-06,
where it was P10 and where P9 deferred it; it is core work across every
transport, not assistant work, so it outlived the feature that raised it.

The assistant is the forcing function, not the scope. The CLI, the MCP server and
the admin's own routes raise the same question, and answering it inside the chat
drawer leaves every other caller silent.

## What exists already

`@astromech/assistant`'s approval rows survive their decision, so an approved or
rejected **write in the drawer** is on record with who, when and what method
(`decisions/0020-approval-as-a-server-held-row.md`). Nothing else is: a read, an
ungated call, and every transport other than the drawer are all silent.

That row also sets the precedent for what a record keeps. It drops the arguments
when it resolves and holds method, target, decision, who and when.

## The work

- [ ] **Log dispatch through `scopedServices`.** It is the choke point every
      untrusted caller already shares and the place the acting identity is known.
- [ ] **Decide what a row holds.** Method id, target ids and outcome are cheap
      and answer most questions. Full payloads make the log a second uncontrolled
      copy of the content, with `decisions/0018-one-chat-session-not-a-library.md`'s
      disclosure problem attached — an update carries a field's new value, and
      that field can be `private: true`.
- [ ] **Decide whether core's log absorbs the approval rows or references them.**
      Two records of one decision that can disagree is the outcome to avoid.
- [ ] **Decide where the model-call logs land.** The AI middleware writes one
      console line per completed call, tagged `[astromech:ai]`, and
      `roadmap/completed/ai-capability.md` leaves its relationship to this trail
      open. Same rule: one record, not two that can disagree.

## Boundaries

**Not versions.** `@astromech/backups` already keeps versions of an entry. A
version answers what the row used to look like; this answers who changed it and
through what.

**Not the plugin.** `@astromech/activity-log` in
`roadmap/planned/additional-first-party-plugins.md` is a presentation surface
over this data, and must not become a second place the recording happens.
