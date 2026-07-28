/**
 * `astromech/plugin-kit` — the supported plugin-authoring API.
 *
 * Surfaces the small set of core internals a plugin package needs that aren't
 * part of the general public surface: identity derivation (so a package can
 * compute its own namespace from its `package` name), schema authoring
 * (`definePluginTable` and the row types its descriptors yield), the row codec
 * helpers those descriptors drive, and entry-URL resolution (so a plugin can
 * turn an entry ref into a front-end URL). Kept deliberately narrow — extend it
 * only when a first-party package needs more.
 */

export {
    pluginNamespace,
    pluginServiceKey,
    pluginTablePrefix,
} from '@/plugins/runtime/plugin-identity.js';
export type { PluginNamespace } from '@/plugins/runtime/plugin-identity.js';
export { definePluginTable } from '@/database/define-plugin-table.js';
export type { KyselyTableKey, PluginDB } from '@/database/define-plugin-table.js';
// The whole descriptor type vocabulary, not just the headline types: a plugin's
// emitted `.d.ts` has to be able to *name* the type `definePluginTable` infers,
// and that mentions `Column`/`IndexSpec` structurally. Without them on this
// public surface, a plugin build fails with TS2742 ("inferred type cannot be
// named without a reference to <hashed dts chunk>").
export type {
    AnyCols,
    ColFactory,
    Column,
    ColumnKind,
    ColumnRuntime,
    IndexFactory,
    IndexSpec,
    KyselyOf,
    OnDelete,
    ReferenceSpec,
    ReferenceTarget,
    TableDescriptor,
    TableInsert,
    TableSelect,
    TableUpdate,
} from '@/database/define-table.js';
export { decodeWith, encodeWith, encodePatchWith } from '@/database/codec.js';
export { resolveEntryUrl, resolveEntryPath } from '@/entries/utils/url.js';
export { tableStorage } from '@/entries/storage/table.js';
export { t } from '@/utilities/labels.js';
