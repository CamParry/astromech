/**
 * `astromech` — the package's primary public surface. For Astro projects,
 * import from 'astromech/astro'. Every published subpath resolves to a
 * barrel here, never to a raw internal module.
 */

export * from '@/types/index';
/**
 * The application: an integration creates it, everything else reads it.
 * Config reaches the runtime through `createAstromech`, so nothing under here
 * carries a `virtual:` import and this barrel still loads in plain Node.
 */
export { createAstromech, getAstromech } from '@/astromech';
export type { Astromech } from '@/astromech';
/**
 * Model access, so a plugin can reach a configured model without taking its
 * own SDK dependency. Absent unless the site configures `ai` — hence `undefined`.
 */
export { getModel, hasModel } from '@/ai/models';
export { permissionsForBuiltInRole, BUILT_IN_ROLES } from '@/permissions/roles';
export type { BuiltInRoleSlug } from '@/permissions/roles';
export { definePermissions } from '@/permissions/define';
export type { PermissionDeclaration, PermissionDeclarations } from '@/permissions/define';
/**
 * Entry permissions are derived, never declared — a site grants a plugin's
 * entry types with these rather than reading a list off the plugin.
 */
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

/** Plugin schema authoring surface. */
export { definePluginTable } from '@/database/define-plugin-table';
export type { KyselyTableKey, PluginDB } from '@/database/define-plugin-table';
/**
 * The whole `Table` type vocabulary, not just the headline types: a plugin's
 * emitted `.d.ts` must be able to *name* the type `definePluginTable` infers,
 * which mentions `Column`/`IndexSpec` structurally — omitting them breaks the build (TS2742).
 */
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
/**
 * The `Table`-backed CRUD wrapper, alongside the `Table` vocabulary and codec
 * it's built on: a plugin composes `createRepository` inside its own
 * `createXRepository(db)` factory, same as core's domains. Types ship for TS2742.
 */
export { createRepository } from '@/database/repository/create-repository';
export type {
    CreateManyOptions,
    FindManyParams,
    GenericDb,
    KyselyHandle,
    OrderBy,
    Patch,
    Repository,
    UpsertOptions,
    Where,
} from '@/database/repository/create-repository';
export { tableRepository } from '@/entries/repository/table';
export { t } from '@/utilities/labels';
/**
 * Rich text is stored as ProseMirror JSON, rendered to sanitized HTML on
 * public reads. Exported so a plugin with a `private` richtext field can
 * render it without reimplementing the sanitizer; `parseRichText` is the inverse.
 */
export { renderRichText } from '@/fields/rich-text/render';
export { parseRichText } from '@/fields/rich-text/parse';
/**
 * The relationships index is derived from field data, so anything writing
 * entries outside the normal operations (a seed, a rebuild) needs the same
 * pure traversal core uses rather than a second, drifting copy of it.
 */
export {
    collectRelationshipEdges,
    collectRelationshipSchemaPaths,
} from '@/fields/relationship-edges';
export type { RelationshipEdge, TargetKind } from '@/fields/relationship-edges';
/**
 * The AI context formatter ships from the plugin-authoring surface as well
 * as `astromech/methods`: a plugin building a chat request needs it, and
 * this is the only barrel it may import.
 */
export { formatAiContextMessage } from '@/utilities/ai-context';

export { defineConfig } from '@/config/define-config';
export { defineAdminPage } from '@/config/define-admin-page';
export { defineEntryType } from '@/entries/define-entry-type';
export { definePlugin } from '@/plugins/define-plugin';
export { defineServiceMethod, noInput } from '@/plugins/define-service-method';
export { defineHook } from '@/plugins/define-hook';

/**
 * Zod, re-exported so a plugin can declare a service method's `input` schema
 * without a `zod` dependency of its own — and without risking a second copy,
 * since the manifest generator's `instanceof` checks run against this instance.
 */
export { z } from 'zod';
