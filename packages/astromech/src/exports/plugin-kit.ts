/**
 * `astromech/plugin-kit` — the supported plugin-authoring API.
 *
 * Surfaces the small set of core internals a plugin package needs that aren't
 * part of the general public surface: identity derivation (so a package can
 * compute its own permission namespace from its `package` name) and entry-URL
 * resolution (so a plugin can turn an entry ref into a front-end URL). Kept
 * deliberately narrow — extend it only when a first-party package needs more.
 */

export {
    derivePluginName,
    sanitisePackage,
    pluginTablePrefix,
} from '@/plugins/runtime/plugin-identity.js';
export { resolveEntryUrl, resolveEntryPath } from '@/entries/utils/url.js';
export { tableStorage } from '@/entries/storage/table.js';
export { t } from '@/utilities/labels.js';
