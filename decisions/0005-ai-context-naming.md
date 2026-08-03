# 0005 — "AI context", and the names rejected on the way

**Date:** 2026-08-03
**Status:** accepted

Renames the feature `roadmap/in-progress/ai-integration.md` had carried as
**P6 — context bus** since the 2026-07-30 audit. Nothing was built under the old
name; this record exists because the reasoning generalises past this one feature.

## The feature

Admin routes declare a typed reference to what the user is currently looking at.
A later chat drawer assembles those references into a `role: 'system'` message
inside `messages[]` so the model can resolve deixis — "this page", "this field".

```ts
useAIContext({ kind: 'entries', type: 'pages', id, label: 'About' });
```

The type is `AIContextReference`. References are held in an ordered list, so a
layout, its route and a focused field editor can each contribute and order
decides what "this" refers to.

`kind` is `entries | media | users | settings | pages` — the domain names the
codebase already uses, taken verbatim from the method manifest's catalogue list
rather than coined afresh. They stay plural even though each reference usually
names one item, because the alternative is a second, singular vocabulary for
domains that are already named everywhere else in the plural. Naming the domain
and identifying the item within it via `id` keeps one set of words, not two.

## Why not "bus"

In web development "bus" is, in practice, always _event bus_ — a broadcast
channel with `emit` and `subscribe`, many-to-many, fire-and-forget, where
subscribers react to events. This has none of those properties. There are many
contributors and exactly one consumer; nothing is emitted; nothing reacts. The
consumer pulls the current set once, when a message is sent.

So the word does not merely fail to help — it sends a reader looking for an API
that does not exist. It was reached for because "bus" gestures at _decoupled
many-to-one_, but decoupling is not the interesting property here.

`publish` was rejected for the same reason a step later: it is pub/sub
vocabulary, and it re-imports the association the rename was removing. A route
is not broadcasting to unknown listeners. It is stating what it is about.

## Why not "ambient", "awareness" or "insight"

- **Ambient context** — accurate but weak. "Ambient" names a _quality_ of the
  thing (it is implicit, nobody asked for it) rather than the thing. Qualities
  make poor names: they read as flourish and they date as soon as the behaviour
  shifts slightly. The property is worth stating in prose, not in the name.
- **UI context** — considered seriously, and better than "ambient" because it
  says where the data comes from. Rejected on the collision: in a React admin,
  `useUIContext()` reads as a React context consumer. It also points the wrong
  way — a route _declares_ this, it does not read it.
- **AI awareness** — "awareness" is a system state, not a value. It cannot be
  returned or typed. It describes an outcome, and outcome-names go stale.
- **AI insight** — backwards. Insight is what comes _out_ of a model; this is
  input going _in_.

## Why "AI context" wins

The qualifier says who the data is _for_ rather than where it is from, which is
the distinction that matters: this exists only because a model reads it. "AI"
front-loads a different domain firmly enough that `useAIContext` does not read
as React's `useContext`. And "context" is literal rather than decorative — in
the LLM sense this is exactly the thing occupying the context window.

Its one weakness is breadth: the system prompt and tool results are also context
the model sees. Usage scopes it — at this surface it is the only context a route
contributes — and `AIContextReference` carries the precision the hook name drops.

## The general rule this is an instance of

**Prefer established web-ecosystem vocabulary over invented or evocative terms,
and check what a word already means to a reader in this space before adopting
it.** Astromech should be legible to someone who has used Payload, Strapi,
Astro, TanStack or Hono without first learning a private dialect.

Three failure modes, all of which produced a rejected candidate above:

1. **The word is already taken in-domain.** "Bus" means event bus; "context"
   alone means React context. A term that collides costs a reader more than a
   plainer one, because they arrive with the wrong model and have to unlearn it.
2. **The word names a quality or a vibe, not the thing.** "Ambient",
   "awareness", "insight". These sound technical without carrying information,
   and they are the names most likely to be reached for when the thing itself is
   not yet clearly understood.
3. **The word is ours alone.** Any coinage becomes vocabulary every future
   reader and contributor must be taught. Invented terminology earns its place
   only when no established term fits — and then it gets a `TERMINOLOGY.md`
   entry saying what it means and what it was chosen over.

`TERMINOLOGY.md`'s existing "Why driver and not adapter?" note is the pattern:
the ecosystem uses both, one was picked for a stated reason, and the note exists
so nobody re-opens it. Prefer that shape — pick the common word, record the
comparison — over minting a new one.
