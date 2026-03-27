/**
 * Plugin system types — AstromechPlugin, PluginTargets, Route, Middleware
 */

import type { EntryTypeApi } from './api.js';
import type { EntryTypeConfig, ResolvedConfig } from './config.js';
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
    entryTypes: Record<string, EntryTypeApi>;
};

export type AstromechPlugin = {
    name: string;
    fieldGroups?: {
        targets: PluginTargets;
        groups: FieldGroup[];
    }[];
    entries?: Record<string, EntryTypeConfig>;
    setup?: (hooks: HookRegistry, ctx: AstromechContext) => void;
    routes?: Route[];
    middleware?: Middleware[];
};
