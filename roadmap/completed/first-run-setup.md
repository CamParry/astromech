# First-run setup and closed sign-up

The authenticated pass added to `check:boot` by the test-suite trust work
walked the first-run flow for the first time, and turned up three defects. Fixing
them turned up a fourth.

## What is wrong

- **Public sign-up is open.** Better Auth's email sign-up endpoint accepts
  anyone at any time, and gives the new account the `editor` role, which holds
  `admin:access`, `entry:*`, and media upload and delete.
- **The first user is not an admin.** The setup page creates the first account
  through the same sign-up, so it gets `editor` too, and no product flow
  produces an admin.
- **The forgot-password form posted to an endpoint Better Auth does not have**
  (`forget-password`, where the installed version answers `request-password-reset`).
  It is the only way an admin-created user gets a password, so closing sign-up
  without fixing it would have locked every later user out.
- **Nothing sends a first-time visitor to setup.** On an empty database the
  admin shows the login form. The setup page is reachable only by typing its
  path.

## Decisions

- **Sign-up is closed once a user exists**, as in Payload (`first-register`)
  and Strapi (`register-admin`). Setup creates the first account with the
  `admin` role; every later account is created by an admin through the users
  service.
- **The guard sits in Better Auth's `databaseHooks.user.create.before`**, which
  every Better Auth sign-up path runs through and the users service does not
  use.

## The work

- [x] Refuse a Better Auth user create when any user exists, and give the first
      one `admin`, with tests.
- [x] The login route sends a visitor to setup while setup is needed.
- [x] `check:boot` reaches setup from the admin root and asserts that a second
      sign-up is refused.
- [x] A `DECISIONS.md` entry.
- [x] The forgot-password form posts to `request-password-reset`, and a test
      takes an admin-created user from no password to signed in.
