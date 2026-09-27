/**
 * The API's OpenAPI document: the routes the app registered (the route tables
 * and `/me`), plus one path per plugin service method, which no route table
 * describes because `POST /plugins/:name/:method` resolves the method per
 * request (`transport/http/routes/plugins.ts`).
 */

import type { AnyServiceMethod, ResolvedPluginIdentity } from '@/types/index';
import type { RouteConfig } from '@hono/zod-openapi';
import type { Env } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
    getPluginIdentities,
    getPluginServiceMethods,
} from '@/plugins/runtime/plugin-runtime';
import { log } from '@/utilities/log';
import { accessRefusals, declaresArguments, errorResponses } from './error-responses';
import { nullableAsUnion } from './rest-route';

/** The OpenAPI version and title the API's document declares. */
const DOCUMENT_CONFIG = {
    openapi: '3.0.0',
    info: {
        title: 'Astromech CMS API',
        version: '1.0.0',
        description: 'Astromech CMS REST API',
    },
} as const;

type Document = ReturnType<OpenAPIHono['getOpenAPIDocument']>;

/** Which of a plugin method's own schemas its documented route describes. */
type Described = { body: boolean; output: boolean };

/**
 * `app`'s document with each plugin service method added at
 * `POST ${pluginsBase}/<serviceKey>/<method>`. A raw route is left out: its
 * handler takes a Web `Request` and declares no schema to document it from.
 *
 * Each method is documented on its own and merged in, so one plugin's schema
 * cannot break the whole document. A schema the generator cannot write (a
 * `z.custom` with no OpenAPI type, a recursive schema with no name) is left
 * undescribed, and so is one naming a component (`.openapi('Name')`) that core
 * or another plugin names for a different schema, since the generator would
 * point both at whichever it met first. Either logs a warning.
 */
export function openApiDocument<E extends Env>(
    app: OpenAPIHono<E>,
    pluginsBase: string
): Document {
    const document = app.getOpenAPIDocument(DOCUMENT_CONFIG);
    const schemas = ((document.components ??= {}).schemas ??= {});
    const owners = new Map(Object.keys(schemas).map((name) => [name, 'core']));

    for (const identity of getPluginIdentities()) {
        const methods = getPluginServiceMethods().get(identity.namespace) ?? {};
        for (const [name, method] of Object.entries(methods)) {
            const owner = `plugin "${identity.namespace}"`;
            const own = methodDocument(identity, name, method, pluginsBase, (candidate) =>
                clashingComponent(candidate, schemas, owners, owner)
            );
            Object.assign((document.paths ??= {}), own.paths);
            for (const [component, schema] of Object.entries(
                own.components?.schemas ?? {}
            )) {
                if (owners.has(component)) continue;
                schemas[component] = schema;
                owners.set(component, owner);
            }
        }
    }
    return document;
}

/**
 * One plugin method's document, describing every schema it declares that can
 * be written without a clash, and warning about each one left out.
 */
function methodDocument(
    identity: ResolvedPluginIdentity,
    name: string,
    method: AnyServiceMethod,
    base: string,
    /** Why the document cannot be merged, or undefined when it can. */
    clash: (document: Document) => string | undefined
): Document {
    const path = `${base}/${identity.serviceKey}/${name}`;
    const declared: Described = {
        body: declaresArguments(method.input),
        output: method.output !== undefined,
    };
    const attempts: Described[] = [
        declared,
        { body: declared.body, output: false },
        { body: false, output: declared.output },
        { body: false, output: false },
    ];

    let reason = '';
    for (const described of attempts) {
        let document: Document;
        try {
            document = generate(pluginMethodRoute(path, method, described));
        } catch (error) {
            reason ||= messageOf(error);
            continue;
        }
        const clashing = clash(document);
        if (clashing !== undefined) {
            reason ||= clashing;
            continue;
        }
        const left = (['body', 'output'] as const).filter(
            (part) => declared[part] && !described[part]
        );
        if (left.length > 0) {
            log.warn(
                `The OpenAPI document leaves the ${left.join(' and ')} schema of ` +
                    `plugins.${identity.serviceKey}.${name} undescribed: ${reason}`
            );
        }
        return document;
    }
    // The last attempt names no schema of the plugin's, so it cannot fail.
    throw new Error(`Cannot document plugins.${identity.serviceKey}.${name}: ${reason}`);
}

/** What went wrong: the generator throws objects that are not `Error`s. */
function messageOf(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String(error.message);
    }
    return String(error);
}

/** The document a single route gives, generated apart from any other. */
function generate(route: RouteConfig): Document {
    const app = new OpenAPIHono();
    app.openAPIRegistry.registerPath(route);
    return app.getOpenAPIDocument(DOCUMENT_CONFIG);
}

/**
 * Why `document` cannot be merged: the first component it names that `schemas`
 * already holds as a different schema from another owner. Undefined when there
 * is none.
 */
function clashingComponent(
    document: Document,
    schemas: Record<string, unknown>,
    owners: Map<string, string>,
    owner: string
): string | undefined {
    for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
        const holder = owners.get(name);
        if (holder === undefined || holder === owner) continue;
        if (JSON.stringify(schema) === JSON.stringify(schemas[name])) continue;
        return `it names the component "${name}", which ${holder} names for a different schema`;
    }
    return undefined;
}

/**
 * One plugin method as `answerPluginMethod` serves it: the body is the argument
 * object, and a 200 answers the result bare, with no `{ data }` around it. A
 * method with no `output` answers whatever its handler returns, so its 200
 * names no schema. An unknown plugin or method is the router's 404, not a
 * method's, so none is documented here.
 */
function pluginMethodRoute(
    path: string,
    method: AnyServiceMethod,
    described: Described
): RouteConfig {
    const takesArguments = declaresArguments(method.input);
    const success = method.summary ?? 'Success';
    return {
        method: 'post',
        path,
        ...(method.summary !== undefined ? { summary: method.summary } : {}),
        request: takesArguments
            ? {
                  body: {
                      content: {
                          'application/json': {
                              schema: described.body ? method.input : { type: 'object' },
                          },
                      },
                  },
              }
            : {},
        responses: {
            200:
                described.output && method.output !== undefined
                    ? {
                          description: success,
                          content: {
                              'application/json': {
                                  schema: nullableAsUnion(method.output),
                              },
                          },
                      }
                    : { description: success },
            ...errorResponses({
                ...accessRefusals(method.access),
                input: takesArguments,
            }),
        },
    };
}
