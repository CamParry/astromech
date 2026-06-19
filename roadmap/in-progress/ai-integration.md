# AI integration

Builds on the services/transport seam. Method manifest (the discovery linchpin)
shipped first — see `completed/method-manifest.md`; CLI/MCP/confirm-gate/authoring
all read it.

Workstreams (spec §7), in order:

- [x] **UI-slot injection** — named admin-shell slots (`global-overlay`,
      `right-drawer`, `toolbar`) that plugins contribute components into. Prerequisite
      for the chat drawer; generalises to all plugins.
- [x] **CLI rebuild** — entry create/update/publish/unpublish + JSON output, plus
      a `methods` command that reflects the manifest. Trusted transport (no eval).
- [x] **MCP server** — dev-only in-tree transport (`transport/mcp`, `astromech mcp`);
      projects manifest methods as MCP tools over stdio (core + 7 entry actions in v1;
      plugin methods / media upload / entries long-tail backlogged).
- [ ] **Confirm gate** — deterministic propose→preview→approve→execute, keyed off
      `mutates`/`destructive`.
- [ ] **Context bus** — ambient-context contributors; routes publish a typed
      reference for deixis ("this page").
- [ ] **Authoring plugin** — Claude adapter + tool-loop over the manifest + chat
      drawer (needs UI-slot injection, confirm gate, context bus).
