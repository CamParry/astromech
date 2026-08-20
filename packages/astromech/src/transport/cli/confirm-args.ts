/**
 * The `--confirm [mode]` flag for `astromech mcp`.
 *
 * Off by default: an MCP client already prompts before running a tool, so
 * gating here would double-prompt the same person. For a non-prompting caller
 * (the in-process tool loop), this is the only stop before a write lands.
 */

import type { ConfirmOptions, ConfirmTrigger } from '@/policies/confirmation';
import type { ArgsDef } from 'citty';

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
