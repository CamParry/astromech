/**
 * Service-method descriptors — the self-description a service method carries so
 * the manifest, MCP projection, CLI and authoring AI can all deal in one unit.
 * Identical shape for core and plugin methods (see specs/ai-integration.md §2–§6).
 */

import type { z } from '@hono/zod-openapi';
import type { Permission } from './domain.js';

/**
 * MCP-aligned effect hints (ai-integration §3.6). `mutates` is the query/command
 * split; `destructive`/`idempotent` are the small editorial layer over it.
 */
export type ServiceMethodEffect = {
    /** Command (true) vs query (false): does the method change persisted state? */
    mutates: boolean;
    /** Irreversible or data-losing (delete entry/user, unpublish). MCP destructiveHint. */
    destructive?: boolean;
    /** Repeating the call lands the same end-state. MCP idempotentHint. */
    idempotent?: boolean;
};

/**
 * A method's declared permission: either a fixed permission string, or one
 * resolved from the call input (e.g. entries, where the permission depends on
 * the target entry type). Absent ⇒ the method is not permission-gated.
 */
export type PermissionRule<Input = unknown> =
    | Permission
    | ((input: Input) => Permission);

/**
 * A service method's descriptor. Authored once (via `defineServiceMethod` for
 * plugin methods, or a service's descriptor catalogue for core methods); the
 * single declaration the `withPermissions` policy enforces and the manifest reads.
 */
export type ServiceMethodDescriptor<Input = unknown, Output = unknown> = {
    /** Dotted method id, e.g. `entries.create`, `plugins.redirects.lookup`. */
    name?: string;
    /** One-line summary for humans / the AI tool-loop. */
    summary?: string;
    /** Zod schema for the call input (the "method schema" — how to call it). */
    input?: z.ZodType<Input>;
    /** Zod schema for the result, where worth declaring. */
    output?: z.ZodType<Output>;
    /** The permission this method requires; absent ⇒ no permission gate. */
    permission?: PermissionRule<Input>;
} & ServiceMethodEffect;
