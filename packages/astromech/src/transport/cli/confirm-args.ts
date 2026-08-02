/**
 * The `--confirm [mode]` flag for `astromech mcp`.
 *
 * Its own module rather than part of `surface-args.ts`: the surface flags are
 * shared with `astromech methods` because that command exists to show what `mcp`
 * will serve, and confirmation changes nothing about what is served.
 *
 * DEFAULT OFF, deliberately. An MCP client already prompts its user before it
 * runs a tool, so gating by default would make every write a double prompt and
 * add no safety — the second prompt would be answered by the same person who
 * just answered the first. The flag is for callers that are NOT a prompting
 * client, chiefly the in-process tool-loop, where the gate is the only stop
 * between the model deciding and the write landing.
 */

import type { ArgsDef } from 'citty';
import type { ConfirmOptions, ConfirmTrigger } from '@/policies/confirm-gate.js';

/** citty arg definition. Spread into a command's `args`. */
export const confirmArgs = {
    confirm: {
        type: 'string',
        description:
            'Require a confirmation round trip before a call runs. Modes: mutating (default), destructive.',
    },
} satisfies ArgsDef;

/**
 * Read `--confirm` off parsed citty args. Undefined ⇒ off.
 *
 * Typed `unknown` because citty's runtime value disagrees with its declared
 * type: a `string` arg passed bare (`--confirm`) arrives as boolean `true`, not
 * as the empty string the type promises.
 */
export function toConfirmOptions(value: unknown): ConfirmOptions | undefined {
    if (value === undefined || value === false) return undefined;
    // Bare `--confirm` — take the default mode.
    if (value === true || value === '') return { trigger: 'mutating' };
    if (value === 'mutating' || value === 'destructive') {
        return { trigger: value satisfies ConfirmTrigger };
    }
    throw new Error(
        `Unknown --confirm mode "${String(value)}". Expected "mutating" or "destructive".`
    );
}
