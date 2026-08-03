/**
 * The tool surface one chat request runs against: every manifest method the
 * signed-in role may call, each dispatched through `buildScopedDispatch`.
 */

import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import {
    annotateManifest,
    buildScopedDispatch,
    getMethodManifest,
    reduceSurface,
} from 'astromech/methods';
import type { ToolDispatch } from 'astromech/methods';
import type { Role } from 'astromech';
import type { ResolvedAuthoringOptions } from '../types.js';

/** Build the runnable tools this role reaches, narrowed by the surface options. */
export function buildAuthoringTools(
    role: Role | null,
    options: ResolvedAuthoringOptions
): BetaRunnableTool[] {
    const manifest = getMethodManifest();
    if (manifest === undefined) {
        throw new Error(
            'The method manifest is only populated at runtime boot, so a missing one is a wiring bug rather than an empty tool list.'
        );
    }

    // `buildScopedDispatch` refuses every plugin method — a plugin's declared
    // `access` is enforced by the HTTP RPC route, not by dispatch — so they are
    // dropped here rather than built into a list of refusals.
    const dispatchable = manifest.methods.filter((method) => method.source !== 'plugin');

    const surface = reduceSurface(dispatchable, { readOnly: options.readOnly });

    // A size reduction, NOT a security measure: the annotation is advisory and
    // `buildScopedDispatch` is what actually refuses. `allowed === null` is an
    // input-derived permission only the scoped handle can decide, so it stays.
    const permitted = annotateManifest(surface.methods, role ?? undefined).filter(
        (method) => method.allowed !== false
    );

    const tools: BetaRunnableTool[] = [];
    for (const method of permitted) {
        const dispatch = buildScopedDispatch(method, role ?? undefined);
        if (!dispatch.ok) continue;
        tools.push(toRunnableTool(dispatch.tool));
    }
    return tools;
}

/**
 * Wrap one dispatch as a runnable tool. `betaTool` performs no runtime
 * validation of the input despite its doc comment; the service's own validation
 * pipeline runs on the way in and is what rejects a malformed argument.
 */
function toRunnableTool(tool: ToolDispatch): BetaRunnableTool {
    return betaTool({
        name: tool.toolName,
        description: tool.description,
        inputSchema: tool.inputSchema as { type: 'object' },
        run: async (input) => {
            try {
                const result = await tool.invoke(input as Record<string, unknown>);
                return JSON.stringify(result);
            } catch (error) {
                // A refused call is normal control flow the model should adapt
                // to, so the message goes back as a result — never a stack.
                return `Error: ${errorMessage(error)}`;
            }
        },
    });
}

/** The message of a thrown value, and nothing else about it. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
