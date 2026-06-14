/**
 * `astromech/fields` — field & layout factories plus the `t` label descriptor.
 *
 * Pure functions only (no module singletons), so importing via this dedicated
 * tsup entry is safe across chunks. Supports both named imports and
 * `import * as f from 'astromech/fields'`.
 */

export * from '@/builders/fields.js';
