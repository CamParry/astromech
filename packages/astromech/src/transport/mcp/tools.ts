/**
 * MCP Tool List Builder
 *
 * Pure function — takes the parsed method manifest and returns the MCP tool
 * list plus a dispatch map keyed by tool name. No I/O; unit-testable.
 */
import type { ConfirmOptions } from '@/policies/confirmation';
import type { DispatchResult, ToolAnnotations } from '@/transport/tools/dispatch';
import type { JsonSchemaObject, ManifestMethod, MethodManifest } from '@/types/index';
import {
    CONFIRM_KEY,
    evaluateConfirmation,
    triggersConfirmation,
} from '@/policies/confirmation';
import { buildDispatch } from '@/transport/tools/dispatch';

// ============================================================================
// Types
// ============================================================================

/** Shape of one tool as returned to the MCP client's ListTools response. */
export type McpToolDef = {
    name: string;
    description: string;
    inputSchema: JsonSchemaObject;
    annotations: ToolAnnotations;
};

/**
 * A manifest method that produced no tool, and why. The reason is the point:
 * with one generic dispatcher, every remaining skip is either a method that
 * declared itself uncallable or a real gap, and a bare list of ids cannot tell
 * the two apart.
 */
export type SkippedMethod = { id: string; reason: string };

type Invoke = (args: Record<string, unknown>) => Promise<unknown>;

type BuildToolsResult = {
    tools: McpToolDef[];
    dispatch: Map<string, Invoke>;
    skipped: SkippedMethod[];
};

// ============================================================================
// Confirmation
// ============================================================================

/**
 * The gate is not a filter, so it lives on the INVOKE rather than on the tool
 * list: a gated method is still offered, still described, and still callable —
 * it just costs a round trip. Its outcome is returned as an ordinary tool
 * result, never thrown, because a model has to be able to read
 * `status: 'input_required'`, see the message and re-issue the call with an
 * answer. An error would read to most clients as "that tool is broken".
 *
 * Wrapped even when no trigger is configured, with a predicate that never
 * fires, so the reserved key is stripped on every path — see
 * `evaluateConfirmation`.
 */
function gateInvoke(
    method: ManifestMethod,
    invoke: Invoke,
    options: ConfirmOptions
): Invoke {
    return async (args) => {
        const decision = evaluateConfirmation(method, args, options);
        if (!decision.proceed) return decision.outcome;
        return invoke(decision.args);
    };
}

/** A trigger that gates nothing — the shape "confirmation is off" takes here. */
const NEVER_CONFIRM: ConfirmOptions = { trigger: () => false };

/**
 * The JSON Schema for the answer, appended to a gated tool's input schema.
 *
 * Without this the server would advertise `additionalProperties: false` on a
 * tool whose only route forward is an extra property, and a client validating
 * against the published schema could never send it.
 */
const CONFIRM_PROPERTY_SCHEMA = {
    type: 'object',
    description:
        'Answer to a prior `input_required` result for this call. Omit on the first attempt.',
    properties: {
        action: { type: 'string', enum: ['accept', 'decline', 'cancel'] },
    },
    required: ['action'],
    additionalProperties: false,
} as const;

/** `schema` with the reserved confirm key declared as an optional property. */
function withConfirmProperty(schema: JsonSchemaObject): JsonSchemaObject {
    const properties = schema['properties'];
    const existing =
        typeof properties === 'object' && properties !== null
            ? (properties as Record<string, unknown>)
            : {};
    return {
        ...schema,
        properties: { ...existing, [CONFIRM_KEY]: CONFIRM_PROPERTY_SCHEMA },
    };
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build the MCP tool list and dispatch map from the method manifest.
 *
 * Duplicate tool names are deduplicated by keeping the first occurrence; the
 * second is recorded as skipped. `skipped` reports method IDs, not names —
 * `entries.create` alone names every entry type's create.
 *
 * @param confirm Confirmation policy, or undefined for off (the default —
 * `runMcpServer` explains why).
 */
export function buildTools(
    manifest: MethodManifest,
    confirm?: ConfirmOptions | undefined
): BuildToolsResult {
    const tools: McpToolDef[] = [];
    const dispatch = new Map<
        string,
        (args: Record<string, unknown>) => Promise<unknown>
    >();
    const skipped: SkippedMethod[] = [];
    const seenToolNames = new Set<string>();
    const confirmOptions = confirm ?? NEVER_CONFIRM;

    for (const method of manifest.methods) {
        let result: DispatchResult;
        try {
            result = buildDispatch(method);
        } catch (err) {
            skipped.push({
                id: method.id,
                reason: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        if (!result.ok) {
            skipped.push({ id: method.id, reason: result.reason });
            continue;
        }

        const { name, description, inputSchema, annotations, invoke } = result.tool;

        // Sanitize: names must match ^[a-zA-Z0-9_-]{1,128}$. A plugin's service
        // key is author-supplied, so this is not merely belt-and-braces.
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');

        if (seenToolNames.has(safeName)) {
            skipped.push({ id: method.id, reason: `duplicate tool name: ${safeName}` });
            continue;
        }

        const gated = triggersConfirmation(method, confirmOptions);

        seenToolNames.add(safeName);
        tools.push({
            name: safeName,
            description,
            inputSchema: gated ? withConfirmProperty(inputSchema) : inputSchema,
            annotations,
        });
        dispatch.set(safeName, gateInvoke(method, invoke, confirmOptions));
    }

    return { tools, dispatch, skipped };
}
