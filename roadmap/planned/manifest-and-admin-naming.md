# Rename three fields that name the wrong thing

Three identifiers in the method manifest and the entries admin describe
something other than what they hold. Each is a rename plus its call sites; no
behaviour changes. The vocabulary they follow is settled (everything under
`src/` is a module, and the `PluginContext` members are not ports); only the
code work was deferred to here.

## `EntriesManifestMethod.mount` → `namespace`

`mount` holds `'root'` or the owning plugin's permission namespace
(`packages/astromech/src/types/methods.ts`). It is not a mount. The word is
already spent twice in the codebase on its ordinary meanings: attaching a
router at a URL prefix (`mountRestRoutes`, `mountedAt`, `MountedRoute`) and
mounting the admin app under `basePath`. A reader meeting a third sense has to
be taught it.

`namespace` is what the value is, and `permissionNamespace` is already the word
the manifest builder uses for it (`codegen/method-manifest.ts`).

- One consumer reads the field: the tool-name branch in
  `transport/tools/dispatch.ts`, which builds `entries_<mount>_<type>_<method>`
  for a plugin type and the bare name for a root one.
- The sibling `plugin` field stays. It carries the plugin's package name, which
  is not always its permission namespace, and the admin route uses it.
- Bump the manifest `version` to 3. Nothing validates it today, and codegen
  rewrites `.astro/astromech.methods.json` on every build, so this is a marker
  rather than a migration.

## `EntriesMount` → `EntriesBinding`

`packages/astromech/src/admin/components/entries/mount.ts` holds the parameter
object the shared entry pages take: the entries client, the wire type id, the
react-query cache scope, the single-type admin config, the link base, and a
`permissionFor(action)` resolver. It is not a mount either. Its own doc comment
says the client is "bound to" it, so `binding` is the word already in the file.

- Rename the type, the file (`mount.ts` → `binding.ts`), `buildPluginEntriesMount`
  → `buildPluginEntriesBinding`, and the `mount` prop on the four shared page
  components (list, new, edit, versions) plus the six routes that build one
  inline.
- `EntriesScope` was the runner-up and lost: "scope" is already spent on
  `scopedServices` and on the cache scope inside this very object.

## `ManifestMethodBase.domain` → `module`

The last holdout from the domains-to-modules change. `id` is `<domain>.<method>`
and three places in `transport/tools/dispatch.ts` index `CORE_SERVICES` by it,
plus one parameter each in `transport/http/client/index.ts` and
`policies/scoped-services.ts`.

The `id` format itself does not change: `users.update` stays `users.update`. Only
the field name and the local variables do.

## The work

One branch, `manifest-and-admin-naming`, in a worktree at
`../Astromech-worktrees/manifest-and-admin-naming`, one commit per rename.

- [ ] `mount` → `namespace` on the manifest, its builder, the dispatch tool-name
      branch, and the manifest version bump.
- [ ] `EntriesMount` → `EntriesBinding`, with the file rename and every call
      site.
- [ ] `domain` → `module` on the manifest base, the dispatch lookups, and the two
      parameters that carry it onward.
- [ ] Update the `Mount` entry in `TERMINOLOGY.md`, or drop it: once the manifest
      field is `namespace` and the admin type is `EntriesBinding`, "mount" means
      only the two ordinary things and needs no entry.
- [ ] Full gate, plus `pnpm run check:boot`, since codegen output and tool
      dispatch both change.

## Not changing

- The `entries_<namespace>_<type>_<method>` tool names, the `id` format, and
  every wire shape a caller sees.
- `domain` in the row-codec sense (a JS value as opposed to its storage form),
  which is a different word doing an unrelated job.
