# First-user sign-up race

The first account a site creates gets the `admin` role, and every sign-up after
it is refused with `SIGN_UP_CLOSED`. The check lives in the
`databaseHooks.user.create.before` hook in
`packages/astromech/src/users/auth.ts`: it counts users, and if there are none
it lets the insert through with `role: 'admin'`.

The count and the insert are two statements, so two sign-ups that arrive
together on an empty database can both count zero, and both accounts get
`admin`. The window is only open during first-run setup, and only for
simultaneous requests, which is why it has not been fixed with the rest of the
sign-up work.

## The work

- [ ] Make the count and the insert one atomic step, or refuse the second
      account after the fact. Check what better-auth's adapter offers (a
      transaction around the hook, or an `after` hook that can undo), and what
      D1 allows, since it has no interactive transactions.
- [ ] A test that runs two sign-ups against an empty database at once and
      expects exactly one `admin`.
