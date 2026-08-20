/**
 * The `--allow-remote` flag, shared by every command that opens the database.
 *
 * Its own module: the flag has one meaning across the CLI — proceed against a
 * remote database — and declaring it per command is how that drifts.
 */

import type { ArgsDef } from 'citty';

/** citty arg definitions. Spread into a command's `args`. */
export const allowRemoteArgs = {
    'allow-remote': {
        type: 'boolean',
        default: false,
        description: 'Allow the command to run against a remote database.',
    },
} satisfies ArgsDef;

/** Read `--allow-remote` off parsed citty args, as the `loadConfig` option shape. */
export function toAllowRemoteOption(args: { 'allow-remote'?: boolean | undefined }): {
    allowRemote: boolean;
} {
    return { allowRemote: args['allow-remote'] === true };
}
