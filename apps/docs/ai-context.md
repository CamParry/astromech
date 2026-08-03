# AI context

An admin route can declare a typed reference to **what the user is currently
looking at**, so that a model asked about "this page" or "this field" has
something to resolve those words against. A route states its subject; whatever
sends a message to a model collects the current set and renders it into the
request.

`TERMINOLOGY.md` carries the term itself, and
`decisions/0005-ai-context-naming.md` records why it is not called a "context
bus" — in web development "bus" means _event bus_, and this has one consumer,
no events, and is pulled at send time rather than broadcast.

## The reference

A route declares an `AIContextReference` (exported from `astromech`):

```ts
type AIContextReference = {
    kind: 'entries' | 'media' | 'users' | 'settings' | 'pages';
    type?: string;
    id?: string;
    label: string;
};
```

- **`kind`** is the domain. Those five words are the method manifest's own
  catalogue names, taken verbatim rather than coined for this feature, so there
  is one vocabulary for the domains and not a second one here. They stay plural
  even though a reference usually names a single item.
- **`type`** is the entry type id, and applies to `kind: 'entries'` only. It is
  the **qualified** id — `redirects/redirect` for a plugin's type, `post` for a
  root-config one — carried verbatim, so it is the same string the entries
  service, the HTTP API and the manifest all use.
- **`id`** identifies the single item in view. Absent on list and index
  screens, which is how the two are told apart.
- **`label`** is the human name, already resolved by the route: an entry's
  title, a media item's filename, a user's name.

## Declaring one

`useAIContext` comes from `astromech/ui`. It declares the reference for as long
as the component is mounted and withdraws it on unmount:

```tsx
import { useAIContext } from 'astromech/ui';

function MediaDetailPage() {
    const { id } = Route.useParams();
    const { data: item } = useMediaItem(id);

    // `null` until it loads, so no placeholder label is ever declared.
    useAIContext(item != null ? { kind: 'media', id, label: item.filename } : null, {
        depth: 1,
    });
}
```

Passing `null` declares nothing. That is what makes the hook callable
unconditionally while data loads — the alternative is a conditional hook, which
React does not allow, or a reference labelled "Loading…".

A list screen declares the same way, with no `id`:

```tsx
useAIContext({ kind: 'entries', type, label: entryType.plural }, { depth: 0 });
```

### Depth

References are an ordered list, not a flat set: a layout, its route and (in
time) a focused field editor can all contribute at once, and the order decides
what "this" refers to. `depth` places a reference in that order — **0** for a
list or index screen, **1** for a single item — and lower is less specific.

Depth is explicit rather than inferred from registration order because
**React runs effects child-first**. A focused field editor would register
_before_ the route that contains it, so insertion order would silently invert
exactly the case the ordering exists for. Stating the depth costs one option
and removes a class of bug that produces no error.

The store assigns each declaration an `order` once, when it first registers, so
re-rendering with a changed label cannot reshuffle a route against its
siblings.

The hooks read a store installed on the admin's `_protected` layout, which does
not remount on navigation, and they throw outside it.

## Reading it

`useAIContextEntries`, also from `astromech/ui`, returns the current entries —
each an `{ reference, depth, order }` — in registration order.
`formatAIContextMessage` from `astromech` turns them into the message:

```ts
import { formatAIContextMessage } from 'astromech';

const message = formatAIContextMessage(entries);
// { role: 'system', content: 'The user is currently viewing, from least to most specific:\n1. …' }
```

It returns `null` when nothing is declared, so the caller omits the message
entirely rather than sending an empty one. A single entry renders as:

```
The user is currently viewing, from least to most specific:
1. Entry `Hello world` (type `post`, id `01H8X4QK7V`)
```

**Sorting lives in the formatter and nowhere else.** The store hands back what
it holds, in registration order; the sort by depth, then by order, happens
once, inside `formatAIContextMessage`. Duplicating it in the store would give
one fact two sources of truth.

## Why a `role: 'system'` message

The message goes inside `messages[]`, not into the top-level `system` field.
Changing `system` invalidates the cached prefix for everything after it, and
this value changes on every navigation — so putting it there would throw away
the prompt cache each time the user clicked a link. A system-role message
placed mid-conversation does not.

Two constraints come with that placement, and both are on the sender:

- It **cannot be `messages[0]`**, and it must never sit between a `tool_use`
  block and its `tool_result` — the pair has to stay adjacent.
- It is supported on **Opus 5, Opus 4.8, Fable 5 and Mythos 5 only**. On
  Sonnet 5 a system-role message inside `messages[]` silently falls back to the
  top-level `system` field, which is the behaviour this design exists to avoid.
  Whatever sends the request therefore cannot take the model as a free-form
  string and assume this works.

> **Not yet safe to send.** `formatAIContextMessage` interpolates `label`
> verbatim, and for an entry that label is an author-controlled title. System
> content carries operator-level authority and must not hold text that came
> from outside the conversation, so `label` needs sanitizing first — newlines
> and control characters stripped, length clamped. Nothing sends one today;
> until that sanitizing exists, treat the formatter's output as something to
> look at, not something to transmit.

## What does not declare yet

- **Entry creation (`new.tsx`) and version-history routes.** A reference with a
  `type` and no `id` renders as "Entry list for type X", which would describe a
  creation screen as a list — worse than saying nothing. Both need either a new
  `kind` or an extra wording branch in the formatter first.
- **Modal-driven detail views.** Opening a media item from the library still
  reports only the library, because the route has not changed. A modal is the
  first case where what is in view and what the route says diverge.
- **Fields.** Depth 1 is the deepest anything declares, so "this field" has
  nothing to resolve against yet.

`roadmap/backlog.md` tracks all three.

## The dev readout

The admin ships a panel, gated on `import.meta.env.DEV`, that shows the
assembled message: the role, the content, and a count of the declared
references. It renders `formatAIContextMessage`'s own output rather than its
own view of the entries, so the whole assembly path stays exercised while there
is no other consumer — and so what you read there is exactly what would be
sent.
