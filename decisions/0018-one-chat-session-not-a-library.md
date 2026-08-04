# 0018 — The assistant keeps one session per user, not a library of them

**Date:** 2026-08-04
**Status:** accepted

The authoring drawer persists a conversation so it survives a reload. It keeps
exactly one per user, replaced when the user starts a new one. There is no list
of past conversations to reopen, rename or delete. This record is why the smaller
half was built and the larger one was not.

## Two features wearing one name

"Persisted chat sessions" bundles two things that were worth separating before
anything was built.

The first is **reload survival**. Six turns into getting a page's copy right, a
refresh or a dev-server restart takes the whole thread, the model's accumulated
context with it, and there is no way back. The loss is real and the fix is one
row.

The second is a **session library** — a browsable list of past conversations. It
carries a table that grows without bound, a retention policy, a decision about
whether an admin may read an editor's transcript, and a second panel state in the
drawer.

## Why the library does not earn its keep here

The artefact decides it. On a general assistant the conversation _is_ the
product, so a thread is worth returning to because the thinking lives in it. In a
CMS the product is the entry. Once the page is translated the transcript is
scaffolding — the output is already in the content, and nobody reopens "translate
this page to French" from three days ago to read it again.

The one genuine reason to want an old thread is "what did the assistant actually
do to my site". That is an audit trail, and an audit trail belongs in core at the
`scopedServices` choke point, covering the CLI and the MCP server too, holding
method, target and outcome rather than a full copy of the content. Reading a
transcript to answer it is simultaneously wider (it quotes content) and narrower
(it only sees the drawer) than the thing actually wanted.

## What one row per user buys

Storage is bounded by user count instead of by usage, so there is no archive to
grow and no retention policy to invent.

The cross-user question disappears rather than being answered. Nothing is
browsable, so nobody has to decide whether an admin may read someone else's
transcript — and "an admin can read everything" is the answer that ships by
default when that decision is left unmade.

The disclosure surface narrows to one conversation, whose only reader is the
person who had it.

It also holds a line worth holding. The tool loop, the approval gate and the
permission scope are load-bearing for CMS work. A session list is the first step
across into chat-product features, and once it exists, search, pinning, branching
and export are all reasonable asks against a CMS that has no business answering
them.

## Rejected: storing the acting role on the session row

Considered as a guard, so a transcript quoting a `private: true` field could be
dropped when its owner was demoted. Rejected twice over.

`scopedServices` resolves the acting role per request and fails closed, so
execution is already live and a stored copy would be a second source of truth for
something that has exactly one — sitting there inviting a future reader to trust
it.

And the control is theatre. The reader of a session is the person who had it, and
they already saw whatever it quotes. Hiding it afterwards conceals a disclosure
that has happened, which is not a boundary.

## What this leaves open

Multi-session, a retained limit, or read-only history can all be added later on
the same table. Deleting a library that has shipped cannot. The upgrade path runs
one way, which is the direction to start from.

Retention still has no answer for the single row itself: it is replaced, never
aged out. A conversation nobody returns to sits there until its owner starts
another one.

## See also

- `decisions/0020-approval-as-a-server-held-row.md` — the approvals table this
  reuses, and why an approval is a row rather than a value in the transcript.
- `roadmap/in-progress/ai-integration.md` — P9 as built, and P10 for the audit
  trail this deliberately defers to.
