/**
 * The API's OpenAPI document as the app serves it, for the tests of core and
 * of each plugin that check what it says about their routes.
 */

import type { PluginDefinition } from '@/types/index';
import { makeTestConfig, setupTestConfig } from '@tests/harness';
import { vi } from 'vitest';
import { createHttpApp } from '@/transport/http/app';
import { openApiDocument } from '@/transport/http/routes/openapi-document';

/** One schema in the document, loosely: the keys the tests read. */
export type OpenApiSchema = {
    /** One type, or a type array such as `['string', 'null']`. */
    type?: string | string[];
    format?: string;
    properties?: Record<string, OpenApiSchema>;
    required?: string[];
    items?: OpenApiSchema;
    anyOf?: OpenApiSchema[];
    allOf?: OpenApiSchema[];
    additionalProperties?: boolean | OpenApiSchema;
    enum?: unknown[];
    $ref?: string;
};

/** One operation in the document. */
export type OpenApiOperation = {
    operationId?: string;
    summary?: string;
    security?: Record<string, string[]>[];
    parameters?: { name: string; in: string; schema?: OpenApiSchema }[];
    requestBody?: { content: { 'application/json': { schema: OpenApiSchema } } };
    responses: Record<
        string,
        {
            description?: string;
            content?: { 'application/json': { schema: OpenApiSchema } };
        }
    >;
};

/** The document, loosely. */
export type OpenApiDocument = {
    openapi: string;
    servers?: { url: string }[];
    security?: Record<string, string[]>[];
    paths: Record<string, Record<string, OpenApiOperation>>;
    components?: {
        schemas?: Record<string, OpenApiSchema>;
        securitySchemes?: Record<string, Record<string, unknown>>;
    };
};

/**
 * The document the app serves with `plugins` registered, the API prefix its
 * server names (each path is relative to it), and each warning building it
 * logged. Needs a test database, since the app is built over the config.
 */
export function servedDocument(plugins: PluginDefinition[]): {
    api: string;
    document: OpenApiDocument;
    warnings: string[];
} {
    const resolved = setupTestConfig({ ...makeTestConfig(), plugins });
    const api = `${resolved.basePath}/api`;
    const app = createHttpApp(resolved);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        const document = openApiDocument(app, api) as unknown as OpenApiDocument;
        const warnings = logged.mock.calls.map((call) => String(call[0]));
        return { api, document, warnings };
    } finally {
        logged.mockRestore();
    }
}
