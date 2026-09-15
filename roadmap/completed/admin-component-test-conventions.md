# Admin component tests follow the testing conventions

A full run of the admin component tests passes, but prints two kinds of noise
that each hide a real problem.

## What is wrong

- **Some tests make real network requests.** An `ECONNREFUSED` to port 3000
  prints between tests: a component fetches through the real client after its
  test ends, and happy-dom resolves the relative URL against its default
  `http://localhost:3000`. Nothing fails, so a test that forgot a mock passes by
  accident.
- **Tests render two ways.** 16 files mount with a hand-rolled `createRoot`
  where the `testing` skill names `@testing-library/react`, and React warns in
  each that the environment is not configured for `act(...)`.
- **There is no setup file** for the happy-dom tests, so neither rule has
  anywhere to be enforced.

## The work

- [x] A setup file for the happy-dom tests that turns on React's act
      environment and makes an unmocked request fail the test, naming its URL.
- [x] Move the 16 `createRoot` files to `@testing-library/react`.
- [x] Mock every request the setup file exposes.
- [x] The `testing` skill says where the setup file is and what it enforces.

## Outcome

`packages/astromech/tests/_support/dom-setup.ts` runs for every happy-dom file.
It turns on React's act environment, unmounts through Testing Library after
each test (vitest's `globals` is off, so Testing Library cannot register that
itself), and fails a test that makes a request it did not mock, naming the URL.
The one such request, the author-names query, is answered from a seeded cache.
A default-reporter run of the admin tests went from 559 act warnings and 55
connection errors to none.
