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

`useAIContext` comes from `astromech/ui/app`. It declares the reference for as long
as the component is mounted and withdraws it on unmount:

```tsx
import { useAIContext } from 'astromech/ui/app';

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

`useAIContextItems`, also from `astromech/ui/app`, returns the current items —
each an `AIContextItem`, `{ reference, depth, order }` — in registration order.
`formatAIContextMessage` from `astromech` turns them into the message:

```ts
import { formatAIContextMessage } from 'astromech';

const message = formatAIContextMessage(items);
// { role: 'system', content: 'The user is currently viewing, from least to most specific:\n1. …' }
```

It returns `null` when nothing is declared, so the caller omits the message
entirely rather than sending an empty one. A single item renders as:

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

- It **cannot be `messages[0]`**, and it must never sit between a tool call and
  its result — the pair has to stay adjacent.
- **Not every model honours it.** One that doesn't falls back to the top-level
  `system` field, which is the behaviour this design exists to avoid, and it
  does so quietly. A sender cannot take the model as a free-form string and
  assume the placement holds.

`@astromech/assistant` sends these through the AI SDK, which needs
`allowSystemInMessages: true` before it will pass a system message inside
`messages[]` at all. `@ai-sdk/anthropic` then hoists the _first_ system block it
sees into the top-level prompt and emits any later one inline, adding the
`mid-conversation-system-2026-04-07` beta itself. Since a top-level system
prompt is always sent, the AI context message stays where it was put.

That is also why the plugin checks `model.provider` rather than holding a list
of model ids: a provider check answers the same question and doesn't go stale
when a new model ships.

`formatAIContextMessage` sanitizes every value it interpolates — control
characters and backticks stripped, whitespace collapsed, length clamped — and
the message it builds says in its own last line that the quoted values are
user-supplied data rather than instructions. An entry's `label` is an
author-controlled title, and system content carries operator-level authority, so
neither guard is optional.

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
own view of the items, so the whole assembly path stays exercised while there
is no other consumer — and so what you read there is exactly what would be
sent.
