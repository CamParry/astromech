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
     * Argument names a POST or PUT carries on the query string rather than in
     * its body. `locale` is the case: a content-level route addresses one locale
     * of an entry, and that addressing belongs in the URL beside `:id`. A GET or
     * DELETE carries every argument the path does not, so it names none.
     */
    queryArgs?: readonly string[];
    /**
     * When given, a null result answers 404, naming the resource this word
     * labels and the route's last path param: `Entry 'abc' not found`.
     */
    notFound?: string;
    /**
     * A 409 the method answers for a reason neither its schemas nor its
     * `requires` state, worded for the OpenAPI document (the last admin, a
     * staged change that already exists, an entry in the trash).
     */
    refusals?: { conflict?: string };
    /** Marks a route whose server handler is written by hand, not generated. */
    handler?: 'bespoke';
    /**
     * How the fetch client reaches this route, when a method id has more than
     * one: `list` when the call passes the list argument, `none` when the
     * client never uses this route at all. The unmarked row is the default.
     */
    client?: 'list' | 'none';
    /** The argument a `client: 'list'` row addresses as an array. `ids` unless given. */
    listArg?: string;
};

/** A route with the mount path of the router that serves it. */
export type MountedRoute = HttpRouteSpec & { base: string };

/**
 * Every entry type is served here, addressed by the type id the entries service
 * uses, URL-encoded into the `:type` segment.
 *
 * Two rows are bespoke; `transport/http/routes/entries.ts` records the reason
 * against their handler.
 */
/**
 * The 409 an entry write answers when its body carries a column the type does
 * not keep (`assertWritableFields`).
 */
const UNKEPT_ENTRY_COLUMN = {
    conflict:
        'the body sets `status` or `publishedAt` on a type without `statuses`, or ' +
        '`slug` on one without `slug` (`capability_not_supported`)',
};

/** The 409 a write to an entry answers while it is in the trash. */
const ENTRY_TRASHED = {
    conflict: 'the entry is in the trash (`CONFLICT`, reason `trashed`)',
};

/** An update's 409s: a column the type does not keep, or an entry in the trash. */
const ENTRY_UPDATE_CONFLICTS = {
    conflict: `${UNKEPT_ENTRY_COLUMN.conflict}; ${ENTRY_TRASHED.conflict}`,
};

/** The 409 `restore` answers when an entry leaves the trash while it runs. */
const ENTRY_NOT_TRASHED = {
    conflict:
        'the entry left the trash while the restore ran (`CONFLICT`, reason `not-trashed`)',
};

/** The 409 `createStaged` answers when the locale already has a staged change. */
const STAGED_CHANGE_EXISTS = {
    conflict: 'the locale already has a staged change (`staged_change_exists`)',
};

/** An entry's `createStaged` 409s: a staged change already, or an entry in the trash. */
const ENTRY_STAGE_CONFLICTS = {
    conflict: `${STAGED_CHANGE_EXISTS.conflict}; ${ENTRY_TRASHED.conflict}`,
};

export const ENTRIES_ROUTE_SPECS = [
    { verb: 'get', path: '/:type', id: 'entries.query', envelope: 'raw', client: 'none' },
    { verb: 'get', path: '/:type/:id', id: 'entries.get', notFound: 'Entry' },
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
    { verb: 'post', path: '/count', id: 'entries.count', handler: 'bespoke' },
    {
        verb: 'post',
        path: '/:type',
        id: 'entries.create',
        status: 201,
        bodyKey: 'data',
        refusals: UNKEPT_ENTRY_COLUMN,
    },
    {
        verb: 'post',
        path: '/:type/bulk-update',
        id: 'entries.update',
        queryArgs: ['locale', 'staged'],
        client: 'list',
        refusals: ENTRY_UPDATE_CONFLICTS,
    },
    {
        verb: 'put',
        path: '/:type/:id',
        id: 'entries.update',
        bodyKey: 'data',
        queryArgs: ['locale', 'staged'],
        refusals: ENTRY_UPDATE_CONFLICTS,
    },
    {
        verb: 'post',
        path: '/:type/bulk-trash',
        id: 'entries.trash',
        envelope: 'success',
        client: 'list',
    },
    {
        verb: 'post',
        path: '/:type/bulk-delete',
        id: 'entries.delete',
        envelope: 'success',
        client: 'list',
    },
    {
        verb: 'post',
        path: '/:type/bulk-restore',
        id: 'entries.restore',
        client: 'list',
        refusals: ENTRY_NOT_TRASHED,
    },
    {
        verb: 'post',
        path: '/:type/bulk-publish',
        id: 'entries.publish',
        queryArgs: ['locale'],
        client: 'list',
        refusals: ENTRY_TRASHED,
    },
    {
        verb: 'post',
        path: '/:type/bulk-unpublish',
        id: 'entries.unpublish',
        queryArgs: ['locale'],
        client: 'list',
        refusals: ENTRY_TRASHED,
    },
    {
        verb: 'post',
        path: '/:type/bulk-schedule',
        id: 'entries.schedule',
        queryArgs: ['locale'],
        client: 'list',
        refusals: ENTRY_TRASHED,
    },
    {
        verb: 'post',
        path: '/:type/:id/trash',
        id: 'entries.trash',
        envelope: 'success',
    },
    {
        verb: 'post',
        path: '/:type/:id/restore',
        id: 'entries.restore',
        refusals: ENTRY_NOT_TRASHED,
    },
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
    // After `/:type/trash`, which Hono would otherwise match as an id.
    { verb: 'delete', path: '/:type/:id', id: 'entries.delete', envelope: 'success' },
    {
        verb: 'post',
        path: '/:type/:id/publish',
        id: 'entries.publish',
        queryArgs: ['locale'],
        refusals: ENTRY_TRASHED,
    },
    {
        verb: 'post',
        path: '/:type/:id/unpublish',
        id: 'entries.unpublish',
        queryArgs: ['locale'],
        refusals: ENTRY_TRASHED,
    },
    {
        verb: 'post',
        path: '/:type/:id/schedule',
        id: 'entries.schedule',
        queryArgs: ['locale'],
        refusals: ENTRY_TRASHED,
    },
    {
        verb: 'get',
        path: '/:type/:id/versions',
        id: 'entries.versions',
    },
    {
        verb: 'get',
        path: '/:type/:id/versions/:version',
        id: 'entries.getVersion',
        notFound: 'Version',
    },
    {
        verb: 'post',
        path: '/:type/:id/versions/:version/restore',
        id: 'entries.restoreVersion',
        queryArgs: ['locale'],
        refusals: ENTRY_TRASHED,
    },
    { verb: 'get', path: '/:type/:id/used-by', id: 'entries.usedBy' },
    {
        verb: 'post',
        path: '/:type/:id/staged',
        id: 'entries.createStaged',
        status: 201,
        queryArgs: ['locale'],
        refusals: ENTRY_STAGE_CONFLICTS,
    },
    {
        verb: 'get',
        path: '/:type/:id/staged',
        id: 'entries.getStaged',
    },
    {
        verb: 'post',
        path: '/:type/:id/staged/merge',
        id: 'entries.mergeStaged',
        queryArgs: ['locale'],
        refusals: ENTRY_TRASHED,
    },
    {
        verb: 'delete',
        path: '/:type/:id/staged',
        id: 'entries.deleteStaged',
        envelope: 'success',
    },
    {
        verb: 'post',
        path: '/:type/:id/preview-token',
        id: 'entries.issuePreviewToken',
        status: 201,
        refusals: ENTRY_TRASHED,
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
 */
export const GLOBALS_ROUTE_SPECS = [
    {
        verb: 'get',
        path: '/:key',
        id: 'globals.get',
        notFound: 'Global',
        refusals: {
            conflict:
                '`staged` on a global without `staging` (`capability_not_supported`)',
        },
    },
    {
        verb: 'put',
        path: '/:key',
        id: 'globals.update',
        bodyKey: 'data',
        queryArgs: ['locale', 'staged'],
        refusals: {
            conflict:
                '`staged` on a global without `staging`, or `status` or `publishedAt` ' +
                'on one without `statuses` (`capability_not_supported`)',
        },
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
    },
    {
        verb: 'get',
        path: '/:key/versions/:version',
        id: 'globals.getVersion',
        notFound: 'Version',
    },
    {
        verb: 'post',
        path: '/:key/versions/:version/restore',
        id: 'globals.restoreVersion',
        queryArgs: ['locale'],
    },
    {
        verb: 'post',
        path: '/:key/staged',
        id: 'globals.createStaged',
        status: 201,
        queryArgs: ['locale'],
        refusals: STAGED_CHANGE_EXISTS,
    },
    {
        verb: 'get',
        path: '/:key/staged',
        id: 'globals.getStaged',
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
    },
] as const satisfies readonly HttpRouteSpec[];

export const USERS_ROUTE_SPECS = [
    { verb: 'get', path: '/', id: 'users.query', envelope: 'raw' },
    { verb: 'post', path: '/', id: 'users.create', status: 201, bodyKey: 'data' },
    {
        verb: 'get',
        path: '/:id',
        id: 'users.get',
        notFound: 'User',
        handler: 'bespoke',
    },
    {
        verb: 'put',
        path: '/:id',
        id: 'users.update',
        bodyKey: 'data',
        handler: 'bespoke',
        queryArgs: ['locale'],
        refusals: {
            conflict:
                'the new `role` leaves the site with no admin (`CONFLICT`, reason `last-admin`)',
        },
    },
    {
        verb: 'delete',
        path: '/:id',
        id: 'users.delete',
        envelope: 'success',
        refusals: {
            conflict: 'the user is the last admin (`CONFLICT`, reason `last-admin`)',
        },
    },
    {
        verb: 'get',
        path: '/:id/versions',
        id: 'users.versions',
    },
    {
        verb: 'get',
        path: '/:id/versions/:version',
        id: 'users.getVersion',
        notFound: 'Version',
    },
    {
        verb: 'post',
        path: '/:id/versions/:version/restore',
        id: 'users.restoreVersion',
        queryArgs: ['locale'],
    },
] as const satisfies readonly HttpRouteSpec[];

/**
 * `POST /media` and `POST /media/:id/replace` are absent by design: their
 * body is multipart, which no generic client body can build, so
 * `transport/http/routes/media.ts` serves and documents them by hand.
 */
export const MEDIA_ROUTE_SPECS = [
    { verb: 'get', path: '/', id: 'media.query', envelope: 'raw' },
    { verb: 'get', path: '/:id', id: 'media.get', notFound: 'Media' },
    {
        verb: 'put',
        path: '/:id',
        id: 'media.update',
        bodyKey: 'data',
        queryArgs: ['locale'],
    },
    { verb: 'delete', path: '/:id', id: 'media.delete', envelope: 'success' },
    { verb: 'get', path: '/:id/used-by', id: 'media.usedBy' },
    {
        verb: 'get',
        path: '/:id/versions',
        id: 'media.versions',
    },
    {
        verb: 'get',
        path: '/:id/versions/:version',
        id: 'media.getVersion',
        notFound: 'Version',
    },
    {
        verb: 'post',
        path: '/:id/versions/:version/restore',
        id: 'media.restoreVersion',
        queryArgs: ['locale'],
    },
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

/** Every REST route the fetch client can reach, across all five domains. */
export const HTTP_ROUTES: readonly MountedRoute[] = [
    ...mountedAt('/entries', ENTRIES_ROUTE_SPECS),
    ...mountedAt('/globals', GLOBALS_ROUTE_SPECS),
    ...mountedAt('/users', USERS_ROUTE_SPECS),
    ...mountedAt('/media', MEDIA_ROUTE_SPECS),
    ...mountedAt('/notifications', NOTIFICATIONS_ROUTE_SPECS),
];
