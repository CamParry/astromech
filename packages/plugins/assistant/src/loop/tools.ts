/**
 * The tool surface the model sees: core hands over the scoped tool definitions,
 * and this wraps each one as an AI SDK tool.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { jsonSchema, tool, type Tool, type ToolSet } from 'ai';
import type { ToolDefinition } from 'astromech';
import { errorMessage } from '../error-message.js';

/**
 * The key the search tool is registered under. The provider fixes the name the
 * model sees, and `SYSTEM_PROMPT` names it, so both spell it the same way.
 */
export const TOOL_SEARCH_KEY = 'tool_search_tool_regex';

/**
 * Wrap the definitions `ctx.methods.tools()` returned, plus the tool the model
 * searches the catalogue with. Every wrapped tool is deferred — a site
 * publishes a method set per entry type, so the catalogue passes the 30–50
 * tools where selection accuracy starts to fall.
 */
export function toToolSet(tools: ToolDefinition[]): ToolSet {
    // The search tool runs server-side and stays loaded: the request is
    // rejected if every tool in it is deferred.
    const set: ToolSet = {
        [TOOL_SEARCH_KEY]: anthropic.tools.toolSearchRegex_20251119(),
    };
    for (const definition of tools) {
        set[definition.name] = toTool(definition);
    }
    return set;
}

/**
 * Wrap one definition. A mutating tool is declared with NO `execute`, which
 * halts the loop once the model calls it — that halt is the approval gate.
 */
function toTool(definition: ToolDefinition): Tool {
    const common = {
        description: definition.description,
        inputSchema: jsonSchema(definition.inputSchema),
        providerOptions: { anthropic: { deferLoading: true } },
    };

    if (!definition.annotations.readOnlyHint) {
        return tool({ ...common, outputSchema: jsonSchema<string>({ type: 'string' }) });
    }

    return tool({
        ...common,
        execute: (input) => invokeTool(definition, input as Record<string, unknown>),
    });
}

/**
 * Run one tool and render its outcome as a result body. A refused call is
 * normal control flow the model should adapt to, so the message goes back as a
 * result — never a stack.
 */
export async function invokeTool(
    tool: ToolDefinition,
    args: Record<string, unknown>
): Promise<string> {
    try {
        return JSON.stringify(await tool.invoke(args));
    } catch (error) {
        return `Error: ${errorMessage(error)}`;
    }
}
