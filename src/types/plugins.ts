/**
 * Plugin system types — AstromechPlugin, PluginTargets, Route, Middleware
 */

import type { CollectionApi } from './api.js';
import type { CollectionConfig, ResolvedConfig } from './config.js';
import type { FieldGroup } from './fields.js';
import type { HookRegistry } from './hooks.js';

// ============================================================================
// Plugin Types
// ============================================================================

export type PluginTargets = string[] | '*' | { include?: string[]; exclude?: string[] };

export type Route = {
    path: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    handler: (request: Request, context: unknown) => Promise<Response> | Response;
};

export type Middleware = {
    name?: string;
    order?: 'pre' | 'post';
    handler: (
        request: Request,
        context: unknown,
        next: () => Promise<Response>
    ) => Promise<Response>;
};

export type AstromechContext = {
    config: ResolvedConfig;
    db: unknown;
    collections: Record<string, CollectionApi>;
};

export type AstromechPlugin = {
    name: string;
    fieldGroups?: {
        targets: PluginTargets;
        groups: FieldGroup[];
    }[];
    collections?: Record<string, CollectionConfig>;
    setup?: (hooks: HookRegistry, ctx: AstromechContext) => void;
    routes?: Route[];
    middleware?: Middleware[];
};
