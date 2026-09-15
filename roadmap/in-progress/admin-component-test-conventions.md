# Admin component tests follow the testing conventions

A full run of the admin component tests passes, but prints two kinds of noise
that each hide a real problem.

## What is wrong

- **Some tests make real network requests.** An `ECONNREFUSED` to port 3000
  prints between tests: a component fetches through the real client after its
  test ends, and happy-dom resolves the relative URL against its default
  `http://localhost:3000`. Nothing fails, so a test that forgot a mock passes by
  accident.
- **Tests render two ways.** 25 files mount with a hand-rolled `createRoot`
  where the `testing` skill names `@testing-library/react`, and React warns in
  each that the environment is not configured for `act(...)`.
- **There is no setup file** for the happy-dom tests, so neither rule has
  anywhere to be enforced.

## The work

- [ ] A setup file for the happy-dom tests that turns on React's act
      environment and makes an unmocked request fail the test, naming its URL.
- [ ] Move the 25 `createRoot` files to `@testing-library/react`.
- [ ] Mock every request the setup file exposes.
- [ ] The `testing` skill says where the setup file is and what it enforces.
