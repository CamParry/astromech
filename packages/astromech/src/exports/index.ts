/**
 * `astromech` — the package's primary public surface. For Astro projects,
 * import the integration from 'astromech/astro'.
 *
 * Part of the curated `exports/` layer: every published subpath resolves to a
 * barrel in this directory, never to a raw internal module. Internals may move
 * freely as long as these barrels keep re-exporting the same surface.
 */

export * from '@/types/index';
// The application: an integration creates it, everything else reads it. Config
// reaches the runtime through `createAstromech`, so nothing under here carries a
// `virtual:` import and this barrel still loads in plain Node.
export { createAstromech, getAstromech } from '@/astromech';
export type { Astromech } from '@/astromech';
// Model access, so a plugin can reach a configured model without taking its own
// SDK dependency. Absent unless the site configures `ai` — hence `undefined`.
export { getModel, hasModel } from '@/ai/index';
export { permissionsForBuiltInRole, BUILT_IN_ROLES } from '@/permissions/index';
export type { BuiltInRoleSlug } from '@/permissions/index';
export { definePermissions } from '@/permissions/define';
export type { PermissionDeclaration, PermissionDeclarations } from '@/permissions/define';
// Entry permissions are derived, never declared — a site grants a plugin's entry
// types with these rather than reading a list off the plugin.
export {
    type EntryAction,
    entryPermission,
    entryPermissions,
} from '@/permissions/entry-permission';
export { withDefaults } from '@/utilities/options';
export { resolveEntryUrl, resolveEntryPath } from '@/entries/entry-url.shared';
export type { UrlEntry } from '@/entries/entry-url.shared';
export { defaultImageWidths } from '@/media/image-widths.shared';
export { buildImageAttrs } from '@/media/serving/image/build-image-attrs';
export type {
    ImageAttrs,
    ImageAttrsContext,
    ImageAttrsInput,
    ImageAttrsOptions,
} from '@/media/serving/image/build-image-attrs';

// Plugin schema authoring surface.
export { definePluginTable } from '@/database/define-plugin-table';
export type { KyselyTableKey, PluginDB } from '@/database/define-plugin-table';
// The whole `Table` type vocabulary, not just the headline types: a plugin's
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
    Table,
    TableInsert,
    TableOptions,
    TableSelect,
    TableUpdate,
} from '@/database/define-table';
export { decodeWith, encodeWith, encodePatchWith } from '@/database/codec';
// The `Table`-backed CRUD wrapper, on the same surface as the `Table`
// vocabulary and the codec it is built on: a plugin holding a `definePluginTable`
// table composes `createStorage` inside its own `createXStorage(db)` factory
// exactly as core's domains do, and then never spells the table name or reaches
// for a codec again. Its public types ship with it for the TS2742 reason above —
// a plugin's `.d.ts` has to be able to *name* what the factory returns.
export { createStorage } from '@/database/storage/create-storage';
export type {
    FindManyParams,
    GenericDb,
    OrderBy,
    Patch,
    QueryHandle,
    Storage,
    UpsertOptions,
    Where,
} from '@/database/storage/create-storage';
export { tableStorage } from '@/entries/storage/table';
export { t } from '@/utilities/labels';
// Rich text is stored as ProseMirror JSON and rendered to sanitized HTML on
// public reads. A plugin holding richtext that is `private` — and so absent
// from the public shape — has no read to get HTML from, and must render it
// itself. Exported so that never means reimplementing the sanitizer.
// `parseRichText` is the inverse, for anything holding HTML that has to become
// a stored document.
export { parseRichText, renderRichText } from '@/fields/rich-text/index';
// The relationships index is derived from field data, so anything writing
// entries outside the normal operations (a seed, a rebuild) needs the same pure
// traversal core uses rather than a second, drifting copy of it.
export {
    collectRelationshipEdges,
    collectRelationshipSchemaPaths,
} from '@/fields/relationship-edges';
export type { RelationshipEdge, TargetKind } from '@/fields/relationship-edges';
// The AI context formatter ships from the plugin-authoring surface as well as
// `astromech/methods`: a plugin building a chat request needs it, and this is
// the only barrel it may import.
export { formatAiContextMessage } from '@/utilities/ai-context';

export { defineConfig } from '@/config/define-config';
export { defineAdminPage } from '@/config/define-admin-page';
export { defineEntryType } from '@/entries/define-entry-type';
export { definePlugin } from '@/plugins/define-plugin';
export { defineServiceMethod, noInput } from '@/plugins/define-service-method';
export { defineHook } from '@/plugins/define-hook';

/**
 * Zod, re-exported so a plugin can declare a service method's `input` schema
 * without adding a `zod` dependency of its own — and, more to the point, without
 * risking a SECOND copy. `z.toJSONSchema` and every `instanceof` check inside
 * the manifest generator work on the core's instance; a plugin schema built by a
 * different copy would silently fail to serialise.
 *
 * A method with no `input` cannot be projected as an MCP tool at all, so this is
 * what makes plugin methods reachable from the AI/MCP surface.
 */
export { z } from 'zod';
