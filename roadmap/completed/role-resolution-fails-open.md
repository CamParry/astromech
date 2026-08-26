# Role resolution fails open

An unrecognised `roleSlug` on a user row resolved to the **admin** role, with
`permissions: ['*']`. The fallback was in `packages/astromech/src/permissions/roles.ts`:

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

- [x] `resolveRole` returns `null` for an unknown slug, with no fallback of any
      kind. Not the least-privileged role either: answering with a role means
      picking one, and a lesser role changes what a user may do just as quietly
      as a greater one grants too much.
- [x] `requireRole` is the write-path form. `usersService.create` and `.update`
      call it, so an unknown slug is a 422 naming the configured roles and is
      never stored.
- [x] A user holding a role a later config edit removed is refused a session,
      with a warning naming the user and the slug. Refusing the config outright
      was the louder option and was rejected: config is code and users are data,
      so boot cannot check one against the other without a query, and one stale
      row would take the whole site down. Being logged out is visible to exactly
      the people affected.
- [x] `tests/permissions/role-resolution.test.ts` covers the lookup and
      `tests/services/users/role-validation.test.ts` covers all three callers,
      including a real signup whose role is removed underneath it.

## Related

`resolveRole` also calls `resolveRoles(config)`, which rebuilds the entire role
map on every call. That is why the resolved `Role` is cached in the request
context rather than derived from `user.roleSlug` at the point of use. Computing
the map once during config resolution is part of
`roadmap/completed/application-instance-and-integrations.md`, and it removes the
reason the request context carries a second copy of derived state.
