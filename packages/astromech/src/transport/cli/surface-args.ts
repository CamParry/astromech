/**
 * The `--read-only` / `--include` / `--exclude` flag trio, shared by `astromech
 * mcp` and `astromech methods`.
 *
 * Shared rather than declared twice so the two commands cannot drift: `methods`
 * exists to let a human see exactly what `mcp` will serve, and that only holds
 * if both parse the same flags into the same options.
 */

import type { ArgsDef } from 'citty';
import type { SurfaceOptions } from '@/policies/tool-surface.js';

/** citty arg definitions. Spread into a command's `args`. */
export const surfaceArgs = {
    'read-only': {
        type: 'boolean',
        default: false,
        description: 'Expose only non-mutating tools. Overrides --include.',
    },
    include: {
        type: 'string',
        description: 'Comma-separated method ids/names to keep. `*` suffix allowed.',
    },
    exclude: {
        type: 'string',
        description: 'Comma-separated method ids/names to drop. `*` suffix allowed.',
    },
} satisfies ArgsDef;

/** Split a comma-separated flag, dropping empties so `a,,b` and a trailing comma are harmless. */
function parseList(value: string | undefined): string[] {
    if (value === undefined) return [];
    return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

/** Read the flag trio off parsed citty args. */
export function toSurfaceOptions(args: {
    'read-only'?: boolean | undefined;
    include?: string | undefined;
    exclude?: string | undefined;
}): SurfaceOptions {
    return {
        readOnly: args['read-only'] === true,
        include: parseList(args.include),
        exclude: parseList(args.exclude),
    };
}
