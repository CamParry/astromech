/**
 * The REST route table — the wire facts of the HTTP API, as data.
 *
 * A row states `(verb, base, path, method id)` plus the wire details neither
 * side can derive. `transport/http/routes/` attaches a server handler to each
 * row; `transport/http/client/` builds its URL, body and unwrapping from it.
 */

/** The verbs the table uses. */
export type HttpVerb = 'get' | 'post' | 'put' | 'delete';

/**
 * The response shapes a REST route may answer with: `{ data }`, the method's
 * own result unwrapped, `{ success: true }`, or a bodiless 204.
 */
export type ResponseEnvelope = 'data' | 'raw' | 'success' | 'empty';

/** One REST route, stated once for both halves of the transport. */
export type HttpRouteSpec = {
    verb: HttpVerb;
    /** Path within the router that serves it, as Hono matches it. */
    path: string;
    /** Manifest method id — `<domain>.<method>`. */
    id: string;
    /** Success status; 200 unless given. */
    status?: 201;
    /** `{ data }` unless given. */
    envelope?: ResponseEnvelope;
    /**
     * The argument key the request body IS, when the method takes the body as
     * one key of a larger object (`{ id, data }`). The document describes that
     * key's schema as the body, validation-error field paths are rebased onto
     * it, and the client sends it alone.
     */
    bodyKey?: string;
    /**
     * Argument key → the name the wire gives it, where the two differ. The bulk
     * routes are the case: the method takes `id` (one id or a list), the wire
     * has always called it `ids`. Read by the document, by the validation-error
     * field paths, and by the client when it builds the body.
     */
    wireNames?: Record<string, string>;
    /**
     * Argument names this route carries on the query string. `locale` is the
     * case: a content-level route addresses one locale of an entry, and that
     * addressing belongs in the URL beside `:id`. Read by the document, and by
     * the client when it decides what goes in the body of a POST or PUT.
     */
    queryArgs?: readonly string[];
    /** Marks a route whose server handler is written by hand, not generated. */
    handler?: 'bespoke';
    /**
     * How the fetch client reaches this route, when a method id has more than
     * one: `list` when the addressed argument is an array, `none` when the
     * client never uses this route at all. The unmarked row is the default.
     */
    client?: 'list' | 'none';
    /** The argument a `client: 'list'` row addresses as an array. `id` unless given. */
    listArg?: string;
};

/** A route with the mount path of the router that serves it. */
export type MountedRoute = HttpRouteSpec & { base: string };

/**
 * Every entry type is served here, addressed by the type id the entries service
 * uses, URL-encoded into the `:type` segment.
 *
 * The bulk routes take the wire's `ids` where the method takes `id`, so each
 * carries `wireNames`. Six rows are bespoke; `transport/http/routes/entries.ts`
 * records the reason against each handler.
 */
export const ENTRIES_ROUTE_SPECS = [
    { verb: 'get', path: '/:type', id: 'entries.query', envelope: 'raw', client: 'none' },
    { verb: 'get', path: '/:type/:id', id: 'entries.get' },
    { verb: 'post', path: '/:type/query', id: 'entries.query', envelope: 'raw' },
    {
        verb: 'post',
        path: '/query',
        id: 'entries.query',
        envelope: 'raw',
        handler: 'bespoke',
        client: 'list',
        listArg: 'type',
    },
    {
        verb: 'post',
        path: '/:type',
        id: 'entries.create',
        status: 201,
        bodyKey: 'data',
        handler: 'bespoke',
    },
    {
        verb: 'post',
        path: '/:type/bulk-update',
        id: 'entries.update',
        wireNames: { id: 'ids' },
        queryArgs: ['locale', 'staged'],
        handler: 'bespoke',
        client: 'list',
    },
    {
        verb: 'put',
        path: '/:type/:id',
        id: 'entries.update',
        bodyKey: 'data',
        queryArgs: ['locale', 'staged'],
        handler: 'bespoke',
    },
    {
        verb: 'post',
        path: '/:type/bulk-trash',
        id: 'entries.trash',
        envelope: 'success',
        wireNames: { id: 'ids' },
        client: 'list',
    },
    {
        verb: 'post',
        path: '/:type/bulk-delete',
        id: 'entries.delete',
        envelope: 'success',
        wireNames: { id: 'ids' },
        client: 'list',
    },
    {
        verb: 'post',
        path: '/:type/bulk-restore',
        id: 'entries.restore',
        wireNames: { id: 'ids' },
        client: 'list',
    },
    {
        verb: 'post',
        path: '/:type/bulk-publish',
        id: 'entries.publish',
        wireNames: { id: 'ids' },
        queryArgs: ['locale'],
        client: 'list',
    },
    {
        verb: 'post',
        path: '/:type/bulk-unpublish',
        id: 'entries.unpublish',
        wireNames: { id: 'ids' },
        queryArgs: ['locale'],
        client: 'list',
    },
    {
        verb: 'post',
        path: '/:type/bulk-schedule',
        id: 'entries.schedule',
        wireNames: { id: 'ids' },
        queryArgs: ['locale'],
        client: 'list',
    },
    { verb: 'post', path: '/:type/:id/restore', id: 'entries.restore' },
    {
        verb: 'post',
        path: '/:type/:id/duplicate',
        id: 'entries.duplicate',
        status: 201,
        bodyKey: 'overrides',
    },
    {
        verb: 'delete',
        path: '/:type/trash',
        id: 'entries.emptyTrash',
        envelope: 'success',
    },
    {
        verb: 'delete',
        path: '/:type/:id',
        id: 'entries.trash',
        envelope: 'success',
        handler: 'bespoke',
    },
    {
        verb: 'delete',
        path: '/:type/:id/force',
        id: 'entries.delete',
        envelope: 'success',
    },
    {
        verb: 'post',
        path: '/:type/:id/publish',
        id: 'entries.publish',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:type/:id/unpublish',
        id: 'entries.unpublish',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:type/:id/schedule',
        id: 'entries.schedule',
        queryArgs: ['locale'],
    },
    {
        verb: 'get',
        path: '/:type/:id/versions',
        id: 'entries.versions',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:type/:id/versions/:versionId/restore',
        id: 'entries.restoreVersion',
        queryArgs: ['locale'],
    },
    {
        verb: 'get',
        path: '/:type/:id/incoming-relationships',
        id: 'entries.incomingRelationships',
    },
    {
        verb: 'post',
        path: '/:type/:id/staged',
        id: 'entries.createStaged',
        status: 201,
        queryArgs: ['locale'],
        handler: 'bespoke',
    },
    {
        verb: 'get',
        path: '/:type/:id/staged',
        id: 'entries.getStaged',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:type/:id/staged/merge',
        id: 'entries.mergeStaged',
        queryArgs: ['locale'],
    },
    {
        verb: 'delete',
        path: '/:type/:id/staged',
        id: 'entries.deleteStaged',
        envelope: 'success',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:type/:id/preview-token',
        id: 'entries.issuePreviewToken',
        status: 201,
    },
    {
        verb: 'delete',
        path: '/:type/:id/preview-token',
        id: 'entries.revokePreviewToken',
        envelope: 'success',
    },
] as const satisfies readonly HttpRouteSpec[];

/**
 * Every global is served here, addressed by the key the globals service uses —
 * bare for a host global, `<namespace>/<key>` for a plugin's, URL-encoded into
 * the `:key` segment.
 *
 * Two rows are bespoke; `transport/http/routes/globals.ts` records the reason
 * against each handler.
 */
export const GLOBALS_ROUTE_SPECS = [
    { verb: 'get', path: '/:key', id: 'globals.get', handler: 'bespoke' },
    {
        verb: 'put',
        path: '/:key',
        id: 'globals.update',
        bodyKey: 'data',
        queryArgs: ['locale', 'staged'],
    },
    { verb: 'post', path: '/:key/publish', id: 'globals.publish', queryArgs: ['locale'] },
    {
        verb: 'post',
        path: '/:key/unpublish',
        id: 'globals.unpublish',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:key/schedule',
        id: 'globals.schedule',
        queryArgs: ['locale'],
    },
    {
        verb: 'get',
        path: '/:key/versions',
        id: 'globals.versions',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:key/versions/:versionId/restore',
        id: 'globals.restoreVersion',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:key/staged',
        id: 'globals.createStaged',
        status: 201,
        queryArgs: ['locale'],
        handler: 'bespoke',
    },
    {
        verb: 'get',
        path: '/:key/staged',
        id: 'globals.getStaged',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:key/staged/merge',
        id: 'globals.mergeStaged',
        queryArgs: ['locale'],
    },
    {
        verb: 'delete',
        path: '/:key/staged',
        id: 'globals.deleteStaged',
        envelope: 'success',
        queryArgs: ['locale'],
    },
] as const satisfies readonly HttpRouteSpec[];

export const USERS_ROUTE_SPECS = [
    { verb: 'get', path: '/', id: 'users.query', envelope: 'raw' },
    { verb: 'post', path: '/', id: 'users.create', status: 201, bodyKey: 'data' },
    { verb: 'get', path: '/:id', id: 'users.get', handler: 'bespoke' },
    {
        verb: 'put',
        path: '/:id',
        id: 'users.update',
        bodyKey: 'data',
        handler: 'bespoke',
    },
    {
        verb: 'delete',
        path: '/:id',
        id: 'users.delete',
        envelope: 'success',
        handler: 'bespoke',
    },
] as const satisfies readonly HttpRouteSpec[];

/**
 * `POST /media/upload` and `POST /media/:id/replace` are absent by design: their
 * body is multipart and a `File` has no JSON representation, so there is no
 * schema to document and no body the generic client could build.
 */
export const MEDIA_ROUTE_SPECS = [
    { verb: 'get', path: '/', id: 'media.query', envelope: 'raw' },
    { verb: 'get', path: '/:id', id: 'media.get' },
    { verb: 'put', path: '/:id', id: 'media.update', bodyKey: 'data' },
    { verb: 'delete', path: '/:id', id: 'media.delete', envelope: 'success' },
    { verb: 'get', path: '/:id/usage', id: 'media.usedBy', handler: 'bespoke' },
    {
        verb: 'get',
        path: '/:id/versions',
        id: 'media.versions',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:id/versions/:versionId/restore',
        id: 'media.restoreVersion',
        queryArgs: ['locale'],
    },
] as const satisfies readonly HttpRouteSpec[];

export const SETTINGS_ROUTE_SPECS = [
    { verb: 'get', path: '/', id: 'settings.all' },
    { verb: 'put', path: '/:key', id: 'settings.set' },
    { verb: 'get', path: '/:key', id: 'settings.get', handler: 'bespoke' },
] as const satisfies readonly HttpRouteSpec[];

export const NOTIFICATIONS_ROUTE_SPECS = [
    { verb: 'get', path: '/', id: 'notifications.list' },
    { verb: 'delete', path: '/', id: 'notifications.dismissAll', envelope: 'empty' },
    { verb: 'delete', path: '/:id', id: 'notifications.dismiss', envelope: 'empty' },
    { verb: 'get', path: '/count', id: 'notifications.count', handler: 'bespoke' },
] as const satisfies readonly HttpRouteSpec[];

/** `specs`, each carrying the mount path of the router that serves it. */
function mountedAt(base: string, specs: readonly HttpRouteSpec[]): MountedRoute[] {
    return specs.map((spec) => ({ ...spec, base }));
}

/** Every REST route the fetch client can reach, across all six domains. */
export const HTTP_ROUTES: readonly MountedRoute[] = [
    ...mountedAt('/entries', ENTRIES_ROUTE_SPECS),
    ...mountedAt('/globals', GLOBALS_ROUTE_SPECS),
    ...mountedAt('/users', USERS_ROUTE_SPECS),
    ...mountedAt('/media', MEDIA_ROUTE_SPECS),
    ...mountedAt('/settings', SETTINGS_ROUTE_SPECS),
    ...mountedAt('/notifications', NOTIFICATIONS_ROUTE_SPECS),
];
