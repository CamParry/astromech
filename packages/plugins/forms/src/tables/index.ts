/**
 * The plugin's table module — what `astromech plugin:generate` loads to diff
 * descriptors against the snapshot. It exists for that contract, not as a
 * convenience barrel: nothing inside this package imports through it, and
 * forms publishes no `./tables` subpath because no consumer needs the
 * descriptor (`@astromech/redirects` and `@astromech/backups` do, and export
 * one).
 */

export * from './submissions.js';
