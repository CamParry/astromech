/**
 * The typed-global narrowing surface — the generated global map the codegen
 * augments, and the field lookup layered over it.
 */

/**
 * Open interface augmented by generated types (`.astro/astromech.d.ts`). Each
 * global's shape: `{ fields }`, keyed by the global's addressable id.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
export interface AstromechGlobalTypes {}

/** Resolves to the field type for global `K`. */
export type GlobalFieldsFor<K extends keyof AstromechGlobalTypes> =
    AstromechGlobalTypes[K] extends { fields: infer F } ? F : never;
