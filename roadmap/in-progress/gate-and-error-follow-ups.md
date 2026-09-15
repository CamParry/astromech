# Gate and error follow-ups

Two gaps found while the gate was being widened to the plugins.

## What is wrong

- **`check:node-imports` never loads a plugin.** It imports core's plugin-facing
  subpaths from built `dist` in plain Node, but no plugin's own built entry, so
  a plugin whose `dist` cannot load in Node passes the gate.
- **A public read of trashed entries answers 500 over RPC.** The REST routes map
  `PublicTrashedReadError` to 400 through a per-route `mapError`; the central
  error handler does not know it, so `POST /rpc/...` reaches the same error and
  answers 500.

## The work

- [ ] `check:node-imports` imports each published plugin's built entry in plain
      Node and checks what it exports.
- [ ] The central error handler answers 400 for `PublicTrashedReadError`, and
      the per-route mapping goes.
