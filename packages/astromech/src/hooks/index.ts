/**
 * The hook runner leaf: `addHook`/`runHook`/`hasHook` over the event → payload
 * map in `@/types/hooks`. A pure leaf — imports nothing above `types/` and
 * `@/registry` (`decisions/0081-one-hook-runner-a-throw-propagates.md`).
 */

export type { HookCallback } from './hooks';
export { addHook, clearHooks, hasHook, runHook } from './hooks';
