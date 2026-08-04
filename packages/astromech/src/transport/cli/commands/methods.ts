import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config.js';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import {
    annotateManifest,
    type AnnotatedManifestMethod,
} from '@/policies/annotate-manifest.js';
import { resolveRoles } from '@/permissions/index.js';
import { filterMethods, type ExcludedMethod } from '@/policies/method-filter.js';
import type { ManifestMethod, MethodManifest, ResolvedConfig } from '@/types/index.js';
import { printError } from '../output.js';
import { filterArgs, toMethodFilter } from '../filter-args.js';

/**
 * Resolve a role slug, rejecting one that is not configured.
 *
 * `resolveRole` falls back to the ADMIN role for an unknown slug, which would
 * silently answer "may call everything" for a typo — the opposite of the truth
 * this flag is for. So membership is checked here first.
 */
function requireRole(config: ResolvedConfig, slug: string) {
    const roles = resolveRoles(config);
    const role = roles[slug];
    if (!role) {
        throw new Error(
            `Unknown role "${slug}". Configured roles: ${Object.keys(roles).join(', ')}`
        );
    }
    return role;
}

/**
 * The trailing "n excluded" summary, one line per reason.
 *
 * Printed rather than left implicit because the alternative — a listing that is
 * simply shorter — reads as "that method does not exist" to whoever runs this to
 * find out why an MCP tool is missing, which is the exact question this command
 * answers.
 */
function printExclusionSummary(excluded: ExcludedMethod[]): void {
    if (excluded.length === 0) return;

    const counts = new Map<string, number>();
    for (const { reason } of excluded) {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    const breakdown = [...counts]
        .map(([reason, count]) => `${count} ${reason}`)
        .join('; ');
    console.log(`\n${excluded.length} excluded by surface policy: ${breakdown}`);
}

/** `allowed` rendered for a human: absent when the flag was not passed. */
function accessMarker(method: ManifestMethod | AnnotatedManifestMethod): string {
    if (!('allowed' in method)) return '';
    if (method.allowed === null) return 'depends';
    return method.allowed ? '' : 'denied';
}

export default defineCommand({
    meta: { name: 'methods', description: 'List method-manifest entries' },
    args: {
        filter: {
            type: 'string',
            description: 'Case-insensitive substring match on method name',
        },
        source: {
            type: 'string',
            description: 'Filter by source: core | entries | plugin',
        },
        role: {
            type: 'string',
            description: 'Annotate each method with whether this role may call it',
        },
        json: { type: 'boolean', default: false, description: 'Output as JSON' },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...filterArgs,
    },
    async run({ args }) {
        try {
            const rawConfig = await loadRawConfig(args.config);
            const resolved = await loadConfig(args.config);
            const plugins = rawConfig.plugins ?? [];
            const manifest = JSON.parse(
                generateMethodManifest(resolved, plugins)
            ) as MethodManifest;

            let listed: ManifestMethod[] = manifest.methods;

            if (args.source !== undefined) {
                listed = listed.filter((m) => m.source === args.source);
            }
            if (args.filter !== undefined) {
                const f = args.filter.toLowerCase();
                listed = listed.filter((m) => m.name.toLowerCase().includes(f));
            }

            // The method filter runs after the view filters, so `excluded` is
            // scoped to what was being listed rather than reporting the whole
            // manifest. The kept set is the same either way — both are
            // conjunctive — so `astromech methods --read-only` still names
            // exactly what `astromech mcp --read-only` serves.
            const filtered = filterMethods(listed, toMethodFilter(args));

            let methods: (ManifestMethod | AnnotatedManifestMethod)[] = filtered.methods;
            if (args.role !== undefined) {
                methods = annotateManifest(
                    filtered.methods,
                    requireRole(resolved, args.role)
                );
            }

            if (args.json) {
                // `excluded` travels alongside rather than being dropped: a JSON
                // consumer that cannot see what was removed cannot tell a
                // filtered-out method from a missing one.
                console.log(
                    JSON.stringify(
                        {
                            version: manifest.version,
                            methods,
                            excluded: filtered.excluded,
                        },
                        null,
                        2
                    )
                );
                return;
            }

            for (const m of methods) {
                const effects: string[] = [];
                if (m.mutates) {
                    effects.push('mutates');
                }
                if (m.destructive) {
                    effects.push('destructive');
                }
                const marker = accessMarker(m);
                if (marker) {
                    effects.push(marker);
                }
                const effectPart = effects.length > 0 ? `  [${effects.join(' ')}]` : '';

                const permission =
                    m.permission !== null
                        ? m.permission
                        : m.permissionDynamic === true
                          ? 'dynamic'
                          : 'none';

                console.log(`${m.name}${effectPart}  (permission: ${permission})`);
            }

            printExclusionSummary(filtered.excluded);
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
