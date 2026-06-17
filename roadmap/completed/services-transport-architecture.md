# Services / transport architecture

Reshaped `src/sdk` + dissolved `src/core` into the locked layer model — `storage → services → policies → transport → Client`, assembled at the `kernel`. Merged 2026-06-17 (`acf0804`); behaviour-preserving, public surface (`astromech/local`, `/fetch`, `/astro`, `bin`) unchanged.

- [x] Stages 0–7: dependency-direction lint guardrail (`.dependency-cruiser.cjs`); dissolved `core/`; extracted `services/{entries,media,users,settings}`; relocated transports (`api/`→`transport/http`, `cli/`→`transport/cli`); `sdk/fetch`→`client/`; scaffolding barrels torn down (no cross-layer re-exports survive)
- [x] `withPermissions(principal)` composable policy + `defineServiceMethod` descriptors (Stages 4–5; the seam the AI work builds on)
- [x] Stage 6 cleanup: visibility co-located per-feature (`services/<feature>/visibility.ts`) — not a policy (arch Decision 8), `services-no-import-policies` lint now `error`; retired vocabulary purged; astro boot/compose extracted to `kernel/` (`boot`, `admin-config`, plugin-client-manifest codegen)
