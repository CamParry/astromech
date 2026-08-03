/**
 * The Anthropic side of the tool surface: core hands over scoped dispatches,
 * and this wraps each one in the shape the SDK's tool runner takes.
 */

import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import type { ToolDispatch } from 'astromech';

/** Wrap the dispatches `ctx.methods.tools()` returned as runnable tools. */
export function toRunnableTools(dispatches: ToolDispatch[]): BetaRunnableTool[] {
    return dispatches.map(toRunnableTool);
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
