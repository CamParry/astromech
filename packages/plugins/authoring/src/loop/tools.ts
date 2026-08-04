/**
 * The Anthropic side of the tool surface: core hands over the scoped tool
 * definitions, and this wraps each one in the shape the SDK's tool runner takes.
 */

import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { BetaToolSearchToolRegex20251119 } from '@anthropic-ai/sdk/resources/beta';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import type { ToolDefinition } from 'astromech';
import { errorMessage } from '../error-message.js';

/**
 * The tool the model searches the catalogue with. It runs server-side and stays
 * loaded: the request is rejected if every tool in it is deferred.
 */
export const TOOL_SEARCH: BetaToolSearchToolRegex20251119 = {
    type: 'tool_search_tool_regex_20251119',
    name: 'tool_search_tool_regex',
};

/**
 * Wrap the definitions `ctx.methods.tools()` returned as runnable tools. Every
 * one is deferred — a site publishes a method set per entry type, so the
 * catalogue passes the 30–50 tools where selection accuracy starts to fall.
 */
export function toRunnableTools(tools: ToolDefinition[]): BetaRunnableTool[] {
    return tools.map(toRunnableTool);
}

/**
 * Wrap one definition as a runnable tool. `betaTool` performs no runtime
 * validation of the input despite its doc comment; the service's own validation
 * pipeline runs on the way in and is what rejects a malformed argument.
 */
function toRunnableTool(tool: ToolDefinition): BetaRunnableTool {
    return {
        ...betaTool({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as { type: 'object' },
            run: async (input) => {
                try {
                    const result = await tool.invoke(input as Record<string, unknown>);
                    return JSON.stringify(result);
                } catch (error) {
                    // A refused call is normal control flow the model should
                    // adapt to, so the message goes back as a result — never a
                    // stack.
                    return `Error: ${errorMessage(error)}`;
                }
            },
        }),
        defer_loading: true,
    };
}
