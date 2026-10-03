# Permissions

Permissions are spread across modules and named several ways. The entry and
global permission builders sit in `permissions/` while media and users write
their strings inline; one rule has three type names (`ServiceMethodAccess`,
`PermissionRule`, `PluginAccess`); the check has six verbs; and "access",
"gate", "policy" and "public" each carry several meanings. From research on
2026-10-01 against Payload v3, Strapi v5, Directus v11, WordPress and Laravel.
Paths are under `packages/astromech/src/` unless they name a package.

## Decided

- **Vocabulary:** **permission** (the string, `<kind>[:<id>]:<action>`),
  **role** (who holds permissions), **action** (the verb in the string) and
  **access** (the rule a method declares, one `AccessRule` type, and its
  check). "Policy" and "gate" are retired from authorisation: "policy" means a
  different thing in Laravel, Strapi and Directus and `policies/` is none of
  them; "gate" has seven meanings here. "Guard" stays for admin route guards
  only. "Capability" stays for entry-type features, with the WordPress
  collision (where it means a permission) recorded under "Reserved words".
- **Check verbs:** `allows`/`allowsAccess` on the server, `can(action)` in the
  admin, `hasPermission` for the bare matcher.
- **Layout:** `permissions/` keeps what no resource owns (the grammar and
  matcher, roles, `AccessRule`, `resolveAccess`, `permissionsFor`). Entries,
  globals, media and users each get a `permissions.ts` of the same shape
  (actions, builder, declarations), as Payload and WordPress keep rules beside
  the resource. `policies/` becomes `access/`; its confirmation, method filter
  and `callMethod` files move to `transport/tools/`. The catalogue moves beside
  its one consumer in `transport/cli/`.
- **An access rule sees the caller** (`{ user, role }`), as Payload's
  `({ req })` does, so a user's access to their own account lives in the method.
- **Permission strings:** `user:`, not `users:`; the full-shape read is per type,
  as globals already are.
- **Roles** become an array of `defineRole({ slug, name, permissions })`.
- **`media.access: 'private'`** requires `media:read` on the media route.
- **A `public: true` global** is readable anonymously over HTTP.
- **Write results respect read access**, as Payload's do.
- **`admin:access` stays a panel check only**, as Payload's `access.admin` is;
  record that it is deliberate.
- **The read shape keeps the name `public`.** Renaming it `published` was
  considered and rejected: the shape decides which fields a read returns
  (private fields removed), not which rows, and preview and staged reads return
  unpublished rows in that shape, so `published` would be false there. The two
  uses of "public" name one audience (anonymous visitors: what they may call,
  and what they see). Record both in `TERMINOLOGY.md`. Revisit if the shape
  and the row filter split into two options.

## Work

Groups 1 to 4 change no behaviour.

- [ ] **Docs and dead code.** Make `apps/docs/content/globals.md` say what a
      public global's read does; list all four catalogue sources in
      `apps/docs/cli.md`; correct the private-media error in
      `config/validate/media-access.ts` and `apps/docs/configuration/storage.md`;
      one "single enforcement seam" claim, not two
      (`permissions/permissions-for.ts`, `ARCHITECTURE.md`); remove
      `hasAdminAccess` and `isAdmin` (`packages/admin/src/hooks/use-permissions.ts`)
      and `defineAbsolutePermissions`; add Role, Access and Action to
      `TERMINOLOGY.md` and rewrite Permission and Policy; record "capability",
      "guard" and "policy" under "Reserved words".
- [ ] **One home and one type.** `utilities/permission-match.ts`,
      `permissions/define.ts` and the `Permission` type into
      `permissions/permission.ts`; one `AccessRule` in `permissions/access.ts`;
      delete core `can()` in `permissions/roles.ts`, and have
      `annotate-manifest.ts` use `permissionsFor`.
- [ ] **Permissions beside each resource.** `entries/permissions.ts`,
      `globals/permissions.ts`, and new `media/permissions.ts` and
      `users/permissions.ts` (moved from `core-permissions.ts`, which keeps only
      `admin:access`). This removes the upward imports from `permissions/` into
      `entries/`. The admin gets `can(action)` for media and users in place of
      the nine `canXxx` helpers. Strings unchanged.
- [ ] **One access shape in the method manifest:** `access`, `permissions[]`
      and `dynamic` for core and plugin methods alike
      (`codegen/method-manifest.ts`, `policies/annotate-manifest.ts`). The
      entry catalogue keeps every permission a method can demand, not only the
      first. Notifications declare `'authenticated'`, not `'public'`.
- [ ] **Access rules see the caller.** Move users' self-access from
      `transport/http/routes/users.ts` into `users/internal/access.ts`, so RPC,
      MCP and the AI tool loop allow what REST allows.
- [ ] **Rename `policies/` to `access/`** and stop using "gate" for
      authorisation (`gateInvoke` becomes `confirmInvoke`); update the layer map
      in `ARCHITECTURE.md`.
- [ ] **One permission grammar** (breaks role configs): `users:` to `user:`; a
      per-type full read in place of `entry:read:full`, which parses as an entry
      type named `read`; `media:upload` to `media:create`, with `replace`
      needing `update`; roles as `defineRole` objects.
- [ ] **Fixes**, in any order:
    - [ ] `entries.duplicate` demands `read` as well as `create`; other write
          results respect read and full access.
    - [ ] The cron route checks a permission, not `role.slug === 'admin'`
          (`transport/http/routes/cron.ts`).
    - [ ] A `public: true` global is readable over HTTP without a session.
    - [ ] Private media requires `media:read`.
    - [ ] The admin sidebar filters site entry types by read, as the server's
          `/entry-types` does (with the `useAdminNav()` item in
          `in-progress/module-cleanup.md`).
    - [ ] Anyone with `admin:access` sees who created and updated an entry:
          a `users.names({ ids })` method returning `{ id, name }` replaces
          `useAuthorNames`' fetch of every user
          (`packages/admin/src/hooks/author-names.ts`), and the audit trail's
          read path uses it. WordPress editors cannot list users either, but
          see author names. Remove the matching `roadmap/backlog.md` item.
    - [ ] Drop the unused `roles` table: a migration, plus a hand edit to the
          Cloudflare baseline.
