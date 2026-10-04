/**
 * Better Auth's routes for the API's OpenAPI document, from the schema its
 * `openAPI` plugin generates: each path under `/auth`, each component named
 * apart from core's, and each operation's security the session it needs.
 */

import type { Auth, BetterAuthOptions } from 'better-auth';
import {
    freshSessionMiddleware,
    requestOnlySessionMiddleware,
    sensitiveSessionMiddleware,
    sessionMiddleware,
} from 'better-auth/api';
import { getAuth } from '@/auth/better-auth';

/** The paths and components Better Auth adds to the document. */
export type AuthDocument = {
    paths: Record<string, Record<string, Record<string, unknown>>>;
    schemas: Record<string, unknown>;
};

/** What `generateOpenAPISchema` answers, loosely: the keys this file reads. */
type GeneratedSchema = {
    paths: Record<string, Record<string, Record<string, unknown>>>;
    components?: { schemas?: Record<string, unknown> };
};

/** The middlewares an endpoint runs when it refuses a request with no session. */
const SESSION_MIDDLEWARES: readonly unknown[] = [
    sessionMiddleware,
    sensitiveSessionMiddleware,
    freshSessionMiddleware,
    requestOnlySessionMiddleware,
];

/** Prefixed to each Better Auth component, since core names a `User` too. */
const COMPONENT_PREFIX = 'Auth';

/**
 * Better Auth's document, its paths under `prefix` (the auth mount, relative
 * to the API) and each operation needing `sessionScheme` only where the route
 * refuses a request with no session.
 */
export async function authDocument(
    prefix: string,
    sessionScheme: string
): Promise<AuthDocument> {
    const auth = getAuth();
    const generated = await generateSchema(auth);
    const renamed = renameComponents(withNullTypes(generated) as GeneratedSchema);
    const sessionPaths = sessionRequiringPaths(auth);

    const paths: AuthDocument['paths'] = {};
    for (const [path, operations] of Object.entries(renamed.paths)) {
        const needsSession = sessionPaths.has(path);
        paths[`${prefix}${path}`] = Object.fromEntries(
            Object.entries(operations).map(([verb, operation]) => [
                verb,
                {
                    ...operation,
                    operationId: `auth.${operationName(operation, path, verb)}`,
                    security: needsSession ? [{ [sessionScheme]: [] }] : [],
                },
            ])
        );
    }
    return { paths, schemas: renamed.components?.schemas ?? {} };
}

/** The schema the `openAPI` plugin generates, called on the server, not over HTTP. */
async function generateSchema(auth: Auth<BetterAuthOptions>): Promise<GeneratedSchema> {
    const api: Record<string, unknown> = auth.api;
    const generate = api['generateOpenAPISchema'];
    if (typeof generate !== 'function') {
        throw new Error('Better Auth is built without its openAPI plugin.');
    }
    return (generate as () => Promise<GeneratedSchema>)();
}

/**
 * `value` with each OpenAPI 3.0 `nullable: true` written as 3.1 writes it,
 * null as one of the schema's types (and of its `enum`, when it has one).
 */
function withNullTypes(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withNullTypes);
    if (typeof value !== 'object' || value === null) return value;
    const { nullable, ...rest } = value as Record<string, unknown>;
    const schema = Object.fromEntries(
        Object.entries(rest).map(([key, inner]) => [key, withNullTypes(inner)])
    );
    if (nullable !== true) return schema;
    const types = schema['type'] === undefined ? [] : [schema['type']].flat();
    if (types.length === 0) return { anyOf: [schema, { type: 'null' }] };
    const { enum: values } = schema;
    return {
        ...schema,
        type: [...types, 'null'],
        ...(Array.isArray(values) ? { enum: [...values, null] } : {}),
    };
}

/**
 * `schema` with every component renamed `Auth<Name>`, and each reference to
 * one with it.
 */
function renameComponents(schema: GeneratedSchema): GeneratedSchema {
    const json = JSON.stringify(schema).replace(
        /"#\/components\/schemas\/([^"]+)"/g,
        (_match, name: string) => `"#/components/schemas/${COMPONENT_PREFIX}${name}"`
    );
    const renamed = JSON.parse(json) as GeneratedSchema;
    const schemas = renamed.components?.schemas ?? {};
    return {
        paths: renamed.paths,
        components: {
            schemas: Object.fromEntries(
                Object.entries(schemas).map(([name, value]) => [
                    `${COMPONENT_PREFIX}${name}`,
                    value,
                ])
            ),
        },
    };
}

/** The OpenAPI paths of the endpoints that refuse a request with no session. */
function sessionRequiringPaths(auth: Auth<BetterAuthOptions>): Set<string> {
    const paths = new Set<string>();
    for (const endpoint of Object.values(auth.api)) {
        const { path, options } = endpoint;
        const use: readonly unknown[] =
            'use' in options && Array.isArray(options.use) ? options.use : [];
        if (path === undefined || !use.some((m) => SESSION_MIDDLEWARES.includes(m))) {
            continue;
        }
        paths.add(path.replace(/:([A-Za-z0-9_]+)/g, '{$1}'));
    }
    return paths;
}

/**
 * The operation's own id, or one built from its path and verb where Better
 * Auth gives none: `/delete-user/callback` as `deleteUserCallbackGet`.
 */
function operationName(
    operation: Record<string, unknown>,
    path: string,
    verb: string
): string {
    const own = operation['operationId'];
    if (typeof own === 'string' && own !== '') return own;
    const words = path
        .split('/')
        .filter((segment) => segment !== '' && !segment.startsWith('{'))
        .flatMap((segment) => segment.split('-'));
    return [...words, verb]
        .map((word, index) =>
            index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join('');
}
