/**
 * `astromech` — the package's primary public surface.
 *
 * Part of the curated `exports/` layer: every published subpath resolves to a
 * barrel in this directory, never to a raw internal module. Internals may move
 * freely as long as these barrels keep re-exporting the same surface.
 */

export * from '@/index.js';
