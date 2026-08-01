import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config.js';
import { generateMethodManifest } from '@/codegen/method-manifest.js';
import {
    annotateManifest,
    type AnnotatedManifestMethod,
} from '@/policies/annotate-manifest.js';
import { resolveRoles } from '@/permissions/index.js';
import type { ManifestMethod, MethodManifest, ResolvedConfig } from '@/types/index.js';
import { printError } from '../output.js';

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
    },
    async run({ args }) {
        try {
            const rawConfig = await loadRawConfig(args.config);
            const resolved = await loadConfig(args.config);
            const plugins = rawConfig.plugins ?? [];
            const manifest = JSON.parse(
                generateMethodManifest(resolved, plugins)
            ) as MethodManifest;

            let methods: (ManifestMethod | AnnotatedManifestMethod)[] = manifest.methods;

            if (args.source !== undefined) {
                methods = methods.filter((m) => m.source === args.source);
            }
            if (args.filter !== undefined) {
                const f = args.filter.toLowerCase();
                methods = methods.filter((m) => m.name.toLowerCase().includes(f));
            }
            if (args.role !== undefined) {
                methods = annotateManifest(
                    methods as ManifestMethod[],
                    requireRole(resolved, args.role)
                );
            }

            if (args.json) {
                console.log(
                    JSON.stringify({ version: manifest.version, methods }, null, 2)
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
        } catch (e) {
            printError(e, { json: args.json });
        }
    },
});
