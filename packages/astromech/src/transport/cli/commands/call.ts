/**
 * `astromech call <method-id> --args <json|@file>` — one command over the whole
 * service surface. The manifest resolves the id, `buildDispatch` supplies the
 * call, and the contract's own schema validates the arguments, so a method needs
 * no command of its own to be reachable from a shell.
 *
 * `buildDispatch` is the trusted, unscoped path — the CLI has no signed-in user
 * and no role — so a `sessionScoped` method is refused with the reason it
 * declares rather than called on a guessed subject.
 */

import { defineCommand } from 'citty';
import { z } from 'zod';
import { loadConfig, loadRawConfig } from '../config';
import { forceArgs, toForceOption } from '../force-args';
import { generateMethodManifest } from '@/codegen/method-manifest';
import { buildDispatch, dispatchArgs } from '@/transport/tools/dispatch';
import type { ManifestMethod, MethodManifest, ToolDefinition } from '@/types/index';
import { parseJsonArg, printError } from '../output';

export default defineCommand({
    meta: { name: 'call', description: 'Call a method-manifest entry by id' },
    args: {
        id: {
            type: 'positional',
            required: true,
            description: 'Method id, as `astromech methods` prints it',
        },
        args: { type: 'string', description: 'Arguments as inline JSON or @file' },
        json: { type: 'boolean', default: false, description: 'Report errors as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...forceArgs,
    },
    async run({ args }) {
        try {
            const rawConfig = await loadRawConfig(args.config);
            const resolved = await loadConfig(args.config, toForceOption(args));
            const manifest = JSON.parse(
                generateMethodManifest(resolved, rawConfig.plugins ?? [])
            ) as MethodManifest;

            const { method, tool } = resolveCallable(manifest.methods, args.id);
            const input = dispatchArgs(method, await callArguments(args.args));

            // The manifest carries the contract's input as JSON Schema, so it is
            // read back into Zod to parse with rather than restated here.
            const parsed = z.fromJSONSchema(tool.inputSchema).safeParse(input);
            if (!parsed.success) {
                throw new Error(`Invalid arguments:\n${z.prettifyError(parsed.error)}`);
            }

            const result = await tool.invoke(parsed.data as Record<string, unknown>);
            // Always JSON: an arbitrary method's result has no human shape to
            // render it in.
            console.log(JSON.stringify(result ?? null, null, 2));
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});

/**
 * The manifest method `id` names and the tool that calls it. A method the
 * dispatcher refuses fails with the reason it declared, not a generic error.
 */
export function resolveCallable(
    methods: ManifestMethod[],
    id: string
): { method: ManifestMethod; tool: ToolDefinition } {
    const method = methods.find((entry) => entry.id === id);
    if (method === undefined) {
        throw new Error(
            `Unknown method "${id}". Run \`astromech methods\` to list them.`
        );
    }

    const dispatch = buildDispatch(method);
    if (!dispatch.ok) {
        throw new Error(`Method "${id}" is not callable: ${dispatch.reason}`);
    }
    return { method, tool: dispatch.tool };
}

/** The argument object off the command line — inline JSON, `@file`, or none. */
async function callArguments(
    value: string | undefined
): Promise<Record<string, unknown>> {
    if (value === undefined) return {};
    const parsed = await parseJsonArg(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('--args must be a JSON object.');
    }
    return parsed as Record<string, unknown>;
}
