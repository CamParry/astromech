# The gate covers the plugins

Three checks stop short of the plugin packages and the repo scripts, so errors
there reach a commit or sit on main unnoticed.

## What is wrong

- **Plugin tests are never typechecked.** Each plugin's `tsconfig.json`
  includes `src` (and `migrations`) only, so a type error in a plugin test fails
  nothing.
- **`pnpm run lint` covers two packages.** It lints the core and schema-engine
  sources. Plugin sources are linted only by the pre-commit hook, on the files a
  commit touches, and `scripts/` is linted by nothing: two errors sat in
  `scripts/check-boot.mjs` until the test-suite trust work found them.
- **The plugin migration indexes break the lint rule on import extensions.**
  Each `migrations/index.ts` imports its baseline with a `.js` extension, which
  the rule for `moduleResolution: "bundler"` refuses. The files are generated,
  so the generator needs the fix too.

## The work

- [x] Typecheck each plugin's tests, the way core's `tsconfig.test.json` does,
      and fix what that surfaces.
- [x] `pnpm run lint` covers every published package's sources and tests, and
      `scripts/`.
- [x] Drop the `.js` extensions from the plugin migration indexes. The generator
      already wrote none; the four files had not been regenerated since.

## Found on the way

Typechecking the assistant's tests showed they still used Anthropic's raw
message formats, which the loop stopped sending when `ChatMessage` moved to the
`ai` SDK's types. Rewriting them showed that after an approval the AI context
moved into the system prompt, changing the head of the cached prefix on every
later request. `buildRequest` now appends it after a tool turn as it does after
a user turn, and a test checks the request body the Anthropic provider sends.
