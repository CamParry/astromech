/**
 * The `--force` flag, shared by every command that opens the database.
 *
 * Its own module, like `filter-args.ts` and `confirm-args.ts`: the flag has one
 * meaning across the whole CLI — proceed against a remote database — and
 * declaring it per command is how the wording and the default drift apart.
 */

import type { ArgsDef } from 'citty';

/** citty arg definitions. Spread into a command's `args`. */
export const forceArgs = {
    force: {
        type: 'boolean',
        default: false,
        description: 'Allow the command to run against a remote database.',
    },
} satisfies ArgsDef;

/** Read `--force` off parsed citty args, as the `loadConfig` option shape. */
export function toForceOption(args: { force?: boolean | undefined }): {
    allowRemote: boolean;
} {
    return { allowRemote: args.force === true };
}
