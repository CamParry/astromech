# AI content operations (P5)

In-flight design for `translate` / `transform` / `generate`. Expands the one-line
P5 section of `specs/ai-authoring-foundation.md`. Delete this file once shipped.

## Why they exist

The tool-loop does not hold alone. A model that edits content through
`entries.get` → edit → `entries.update` has to reconstruct the entire field
payload from its own context, and every reconstruction is a chance to drop a
field, mangle a rich-text tree or invent a key. Content operations remove the
round-trip: the entry data never enters the model's context as a payload it has
to rebuild. The model sees text and returns text; the operation owns the read,
the placement and the write.

This is also the answer to P4b's atomic-array consequence — "editing one item in
ten still means sending ten" is fine when the operation, not the model, is what
sends them.

## The three operations

All three take a target (`type`, `id`, optional `paths`) plus an `instruction`,
and all three write through the normal validation pipeline. They differ only in
what they do to the value they are given.

- **`translate`** — same meaning, different locale. Structure is never changed.
- **`transform`** — same locale, different wording. Structure may change.
- **`generate`** — produces a value where there was none or replaces one wholesale.

`paths` uses the existing `_id` bracket grammar (`sections[a1].items[b2].title`).
Omitted, it means every eligible field on the entry. Fields whose type is not
text-bearing — `media`, `relationship`, `number`, `boolean`, `date`, `select` —
are never sent to a model, whatever `paths` says.

## Rich text: three different problems, three different answers

`@tiptap/core` exports `generateJSON`, but it calls `elementFromString` and
throws `there is no window object available` without a DOM. Node SSR and Workers
both fail, so **HTML in is not available server-side** and a DOM shim would be a
dependency bought purely to parse model output. Nothing in `fields/rich-text/`
parses HTML in today — only out, via `renderRichText`.

- **`translate` never serializes the document.** Walk the stored ProseMirror
  tree, take each BLOCK node's inline content, and send that block's text. Put
  the translation back into the same block. Block structure is preserved by
  construction — the model cannot merge two paragraphs, invent a heading level or
  emit invalid nesting, because it never sees the structure. This is the XLIFF
  approach, and it is strictly safer than any round-trip.
- **Inline marks survive as inline Markdown.** Segmenting at the text-node level
  would split "very **bold** text" into three fragments and translate each blind
  to the others, which is how machine translation produces nonsense. So a block's
  inline content is serialized to Markdown (`**`, `_`, `` ` ``, `[]()` — the
  closed set the allow-list permits) and the reply is parsed back into inline
  nodes. The converter is small and its input alphabet is fixed.
- **`transform` and `generate` do restructure**, so they get full Markdown, block
  level included. Same inline converter, plus block mapping for paragraph,
  heading, list, blockquote and code. Restricted to what `allow` permits, so the
  parser's output cannot fail `validateRichText` for containing a node type the
  field forbids.

Every write still goes through P4a's `validateRichText`. A model that returns
something unmappable fails as a validation error on a staged entry — never as
corruption of live content.

## Where the output lands

No new review mechanism. Layer 3 of the confirm gate already settled this:
staged entries plus preview tokens ARE the out-of-band approval channel.

- **Editing existing live content** (`transform`, `generate`, and `translate`
  into a locale that already exists) stages the change on the target entry and
  returns a preview link. A human opens it in admin and merges. Requires the
  `staging` capability.
- **Translating into a locale that does not exist yet** creates a new sibling in
  the same `localeGroup` with `status: 'unpublished'`. That is already a review
  gate — the content is not live until someone publishes it — so staging a row
  that nobody can see yet would be ceremony. Note `createStaged` deliberately
  mints a FRESH `localeGroup`, so it is the wrong tool for this case; the sibling
  is created through `create` with the source's `localeGroup`, which is also what
  makes it inherit non-translatable fields.

The operation returns the target id, the preview URL where one applies, and a
per-field summary of what changed. It never publishes.

## The model seam

Core defines the interface and holds no model SDK. One method, because the
operations only ever need one thing:

```ts
type ContentProvider = {
    /**
     * Rewrite each input independently under one instruction.
     * Returns exactly one output per input, in order.
     */
    rewrite(request: {
        instruction: string;
        inputs: string[];
        format: 'text' | 'markdown';
        locale?: string;
        context?: { entryType: string; fieldLabel: string };
    }): Promise<string[]>;
};
```

The provider owns model choice, retries and whatever structured-output mechanism
guarantees the array shape. **Core enforces the invariant it declares**: if
`outputs.length !== inputs.length` the whole operation fails before anything is
written. A provider that cannot hold that contract is a broken provider, not a
case for core to paper over.

Registration copies `utilities/registry.ts` (`defineRegistry`), not a
module-level singleton — tsup emits several entry chunks and a value set in
Astro's `config:setup` is invisible to the Vite SSR context at request time
unless it lives on `globalThis`.

**The registry is the only path — there is no config fallback, and there cannot
be one.** A provider is a function and `virtual:astromech/config` is
`JSON.stringify`'d, so it can never arrive through config; the escape hatch that
works for authored validators does not work here. (An earlier draft of this
section said "registry first, live config second". That was wrong.)

What the registry must therefore survive is the lifecycle: `initRuntime` runs
inside `config:setup`, which is build/config time and does not re-run per request
in a deployed Worker — the same trap the Astro lifecycle seeding note records. So
registration must be idempotent and safe to call again from a request-time boot
path. A plugin registering through `setup()` at boot is the fast path, not the
only one, and `set` being a plain slot assignment is what makes that free.

The Claude adapter lives in the authoring plugin with a BYO key via
`requiredEnv`, read from `ctx.env`. Secrets do not go near
`virtual:astromech/config` (which is `JSON.stringify`'d) and the browser gets
`virtual:astromech/admin-config`, a whitelist projection, so a key on a plugin
definition is not exposed unless deliberately added there.

Core ships no provider. Tests use a fake one, so the suite makes no network call.

## Execution

Operations block. One `rewrite` call per field — batching that field's blocks as
`inputs` — with fields running concurrently, capped at a small fixed width so a
twenty-field entry does not open twenty connections. The repo has no concurrency
limiter and no dependency for one; a fixed-width batch loop is a few lines.

Failure is all-or-nothing: every field is rewritten and validated before anything
is written, matching `mergeStaged`, which validates before opening its
transaction so a rejection costs no backup version. A partial translation is
worse than none — it leaves an entry half in one language with no record of which
half.

## Wiring

New core domain `content/`, laid out like `settings/`: `service.ts`,
`descriptors.ts`, `index.ts`, plus pure leaves for the segment walk and the
Markdown converters. Registered in the local client and given an HTTP router.

Consequences to get right, none of them optional:

- `.dependency-cruiser.cjs` rules name domains explicitly. A new domain path must
  be added to `domain-no-peer-imports` and `domain-no-upward` or it gets no
  enforcement at all. `content/` cannot import `entries/` directly — it goes
  through the same seam any other consumer does.
- The permission keys must be added to `CORE_PERMISSIONS` in `permissions/index.ts`.
  A key used only in a descriptor enforces but is ungrantable and invisible to
  the roles UI and the `permissions` CLI. Decide whether `editor` gets them;
  `admin`'s `*` covers itself.
- A descriptor with `summary`, `input`, `permission`, `mutates` is the whole path
  to the manifest and therefore to MCP — P1's dispatcher is generic. Adding the
  domain to the manifest generator's catalogue list is one line.
- These are mutating methods, so the confirm gate covers them under its
  `mutating` preset with no special-casing.

## Verify

- A translate of an entry with a rich-text field preserves the block structure
  exactly — same node types, same order, same nesting — with only text changed.
- Inline marks survive a translate: bold stays bold, a link keeps its href.
- A field the type marks non-translatable is not sent to the provider and is not
  written.
- A provider returning the wrong number of outputs fails the operation and leaves
  the entry untouched.
- Translating into an existing locale produces a staged entry and a preview
  token; translating into a new one produces an unpublished sibling in the same
  `localeGroup`.
- A model reply that maps to a node type outside the field's `allow` list fails
  validation on the staged entry, and the live entry is unchanged.
- Nothing in the suite makes a network call.
