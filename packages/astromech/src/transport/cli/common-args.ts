/**
 * The flags every command shares, so one flag has one spelling and one meaning
 * across the CLI.
 */

import type { ArgsDef } from 'citty';

/**
 * `--config` and `--allow-remote`, for every command that loads the config. A
 * remote database is refused unless `--allow-remote` says that is intended.
 */
export const configArgs = {
    config: { type: 'string', description: 'Path to astromech.config.ts' },
    'allow-remote': {
        type: 'boolean',
        default: false,
        description: 'Allow the command to run against a remote database.',
    },
} satisfies ArgsDef;

/** `--json`, for every command that prints a result or reports an error. */
export const jsonArgs = {
    json: {
        type: 'boolean',
        default: false,
        description: 'Print the result, or the error, as JSON',
    },
} satisfies ArgsDef;

/** Read `--allow-remote` off parsed citty args, as the `loadConfig` option shape. */
export function toAllowRemoteOption(args: { 'allow-remote'?: boolean | undefined }): {
    allowRemote: boolean;
} {
    return { allowRemote: args['allow-remote'] === true };
}
