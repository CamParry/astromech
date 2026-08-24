# Baseline defects

Live defects in shipped code, found by auditing `roadmap/` and `backlog.md` for
outstanding work rather than by a bug report. Each one is small and
independent; they share a file because they shared a branch, not because they
share a cause.

Two of them were invisible until something tried to assert what the code
believed. The forms rate limit is the sharper lesson: the first version keyed on
a caller-supplied field that nothing populates, so it pooled every submission on
the site into one counter while leaving an attacker who set the field unmetered.
It passed the gate. Review caught it, not the tests.

- [x] **A `null` role did not typecheck against the scoped surfaces.**
      `ctx.role` on `PluginContext` is `Role | null`, but `scopedServices`,
      `permissionsFor`, `annotateManifest`, `buildScopedTools` and scoped
      dispatch all took `Role | undefined`, so a plugin passing `ctx.role`
      straight through needed `?? undefined`. Widened to
      `Role | null | undefined`; every one of them already denied on a falsy
      role, so nothing changed at runtime.
- [x] **Duplicate data-field names silently overwrote each other.** The value
      namespace is flat — layout fields unwrap and `main`/`sidebar` concatenate —
      so `text('title')` in a tab and `text('title')` at top level both survived
      into one value object. Config resolution now rejects a duplicate across
      the whole flattened tree. Layout names stay exempt: they are inert, and
      `tabs()` hardcodes its own, so two `tabs()` in one array is legal.
      `tabs()` also dropped its `private` option on the floor; it forwards
      options like its siblings now.
- [x] **A relationship stored an id of the wrong target type.** `media` and
      `relationship` were checked for being an id and nothing more. A
      `relationship` id is now checked against its declared `target`. Existence
      is deliberately not checked — see `field-validation-coverage.md` and
      `DECISIONS.md`.
- [x] **`@astromech/forms` had no rate limit on `submit`.** The only defence was
      the optional spam-provider gate. Submissions are limited per connecting
      address, which meant giving the HTTP transport a way to hand a service
      method the address it already holds. A caller with no address — CLI, MCP,
      in-process — is not limited, because it is trusted; the first attempt
      keyed on a caller-supplied field instead, which was both spoofable and a
      site-wide denial of service, and was replaced before it shipped. **The
      limit is only effective on Workers**, where `cf-connecting-ip` cannot be
      forged; see the open item below.
- [x] **Nothing stopped the CLI or `astromech mcp` opening a production
      database.** The D1-in-Node failure that appeared to prevent it was
      accidental. Both refuse a remote database unless `--allow-remote` is
      passed. `entries:delete` and `users:delete` keep their own `--force` for
      confirmation; one flag must not mean both.
- [x] **Table-backed relationship targets accumulated dangling ids forever.**
      Write-time cleanup kept any id whose target type is table-backed, because
      an existence check against the `entries` table reports every one of them
      absent. `EntryStorage` gained an optional existence hook, so those targets
      are checked through their own storage. A target naming no configured entry
      type stays unchecked — a dropped plugin takes its types with it and there
      is no storage to ask.
- [x] **Validation was write-time only.** Tightening a rule never flagged rows
      already stored. `astromech validate` reports them; see
      `field-validation-coverage.md`.

## Deliberately not fixed here

- **There is no trustworthy connecting address on a self-hosted Node
  deployment**, so the forms rate limit does not meter HTTP submissions there.
  `cf-connecting-ip` is trustworthy only because Cloudflare rewrites it on every
  proxied request; `x-forwarded-for` is client-settable on a direct connection,
  and Astro's own `clientAddress` derives from it by default under
  `@astrojs/node`, so neither can be trusted without the site saying its proxy
  is trusted. Hono's `getConnInfo` is per-adapter and unreachable through the
  Astro route, which calls `app.fetch` with no server env. Closing this needs
  either a trusted-proxy config option or the socket address plumbed through
  from the adapter. Recorded in `backlog.md`.

- Duplicate names **inside one block type** are still undetected. The check
  covers an entry type's own field tree; descending into `blocks[].fields` also
  extends the structural `tabs`/`tab` rules into blocks, which is a behaviour
  change of its own. Recorded in `backlog.md`.
- `tabs()` hardcoding `name: 'tabs'` is untouched. It is harmless while layout
  names are inert, and `planned/named-layout-fields.md` owns the question of
  whether a layout field should take a name that means something.
