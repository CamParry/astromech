# Role resolution fails open

An unrecognised `roleSlug` on a user row resolves to the **admin** role, with
`permissions: ['*']`. The fallback is in `packages/astromech/src/permissions/index.ts`:

```ts
export function resolveRole(config: ConfigWithRoles, slug: string): Role {
    const roles = resolveRoles(config);
    return (
        roles[slug] ??
        roles['admin'] ?? {
            slug: 'admin',
            name: 'Administrator',
            permissions: ['*'],
            isBuiltIn: true,
        }
    );
}
```

Nothing constrains what reaches it. `users/schema.ts` types the field as a bare
`z.string()` on both create and update, never checked against the configured
roles, and the column is `text({ notNull: true })` with no reference. So the
write side accepts any string and the read side promotes anything it does not
recognise.

`users/session.ts` is the only caller, which means the fallback decides the role
for every authenticated request.

## How it fires

- **Removing a role from `astromech.config.ts` silently promotes everyone who
  held it.** No attacker, no bad input, no error: an ordinary config edit
  escalates existing users to full access, and the only visible change is that
  they can now do more.
- **A typo in a `roleSlug` on create or update grants `*`** instead of being
  rejected.

Neither is a direct escalation path for an unprivileged user, because writing
`roleSlug` needs `users.update`, which is already privileged. The first case
needs no attacker at all, which is what makes it worth fixing.

## The fix

- [ ] `resolveRole` returns the least-privileged role, or `null`, when the slug
      is unknown. Never admin. Callers decide what an absent role means.
- [ ] Validate `roleSlug` against the configured roles on create and update,
      rejecting an unknown slug instead of storing it.
- [ ] Decide what happens to users holding a role that a later config edit
      removed. Options: refuse to resolve the config (loud, and consistent with
      the crash-loud validators already in `config/`), or resolve them to the
      lowest role and warn. It must not be silent either way.
- [ ] Test coverage for all three, including the config-edit case.

## Related

`resolveRole` also calls `resolveRoles(config)`, which rebuilds the entire role
map on every call. That is why the resolved `Role` is cached in the request
context rather than derived from `user.roleSlug` at the point of use. Computing
the map once during config resolution is part of
`roadmap/in-progress/application-instance-and-integrations.md`, and it removes the
reason the request context carries a second copy of derived state.
