# Method file consistency

Every service method file takes one shape, set in the `code` skill under
"Service method files": the declaration's key order, inline `input`, a
permission string or a `<resource>Access` rule, the handler's order (inputs,
load and check, prepare, before hook, writes, after hook, return), and comments
only on the declaration and on code that would otherwise read as wrong.

The pass runs in groups small enough to hold in view at once. The first is the
reference: the shape is reviewed there before the rest follow it.

- [x] Users: `users/methods/` and `users/internal/`.
- [x] Media and notifications: `media/methods/`, `media/internal/`,
      `notifications/methods/`.
- [x] Globals: `globals/methods/` and `globals/internal/`; `gate` becomes
      `globalAccess` and `readGate` `globalGetAccess`. After `publish-defects` merges.
- [x] Entry writes: `create`, `update`, `delete`, `duplicate`, and
      `entries/internal/update-batch.ts` and `delete-batch.ts`; `entryGate`
      becomes `entryAccess`. After `publish-defects` merges.
- [x] Effect hints agree across the four resources: a version restore saves a
      version each call, so no `restoreVersion` is `idempotent`; a
      `deleteStaged` discards unmerged edits, so each is `destructive`.
- [ ] Entry reads and status: `get`, `query`, `status`, `trash`, `restore`,
      `used-by`, `preview/`.
- [ ] Entry staging and versions, with the catalogue: building each type's
      input from the method's own `input` removes the 26 `*Input` builders
      (the catalogue item in `in-progress/module-cleanup.md`).
- [ ] Plugin service methods (`packages/plugins/*/src/service/`). A plugin
      keeps its methods as keys of one service object, so only the declaration
      and handler rules apply.
