/**
 * The one mapping from an approval row to the request the drawer renders, used
 * both when a turn pauses and when a reload rebuilds the held calls from the
 * table. It stays clear of the loop so the plugin definition can reach it
 * without pulling `@anthropic-ai/sdk` into a site's config load.
 */

import type { ToolDefinition } from 'astromech';
import type { ApprovalRow } from '../tables/approvals.js';
import type { ApprovalRequest } from '../types.js';

/**
 * The wire request for one row, worded by the tool core built it from. A tool
 * the acting role can no longer call leaves the method id as the question.
 */
export function toApprovalRequest(
    row: ApprovalRow,
    tools: ToolDefinition[]
): ApprovalRequest {
    const tool = tools.find((candidate) => candidate.name === row.toolName);
    const args = row.arguments ?? {};
    return {
        approvalId: row.id,
        toolUseId: row.toolUseId,
        method: row.method,
        toolName: row.toolName,
        message: tool?.confirmMessage(args) ?? `Run "${row.method}"?`,
        destructive: row.destructive,
        arguments: args,
    };
}
