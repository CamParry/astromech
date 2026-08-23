import type { DriftReport } from '@/transport/cli/relationship-index';
import { defineCommand } from 'citty';
import { createAstromech } from '@/astromech';
import {
    checkRelationshipIndex,
    rebuildRelationshipIndex,
} from '@/transport/cli/relationship-index';
import { loadConfig, loadRawConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: {
        name: 'index:rebuild',
        description: 'Rebuild the relationships index from field data',
    },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
        type: { type: 'string', description: 'Limit to one entry type' },
        check: {
            type: 'boolean',
            default: false,
            description: 'Report drift without writing; exits 1 when any is found',
        },
    },
    async run({ args }) {
        // `loadConfig` guards the database and fills the config shim; the
        // application registers the plugin runtime. Without it a table-backed
        // plugin entry type resolves to the built-in repository, its rows go
        // unread, and a rebuild deletes every edge it has.
        await loadConfig(args.config, toAllowRemoteOption(args));
        await createAstromech({ config: await loadRawConfig(args.config) });

        const scope = args.type ? { type: args.type } : {};

        if (args.check) {
            const report = await checkRelationshipIndex(scope);
            reportDrift(report);
            return;
        }

        const report = await rebuildRelationshipIndex(scope);
        console.log(
            `Rebuilt the relationships index: ${report.sourcesScanned} sources scanned, ` +
                `${report.rowsWritten} rows written, ` +
                `${report.orphanRowsRemoved} orphan rows removed.`
        );
    },
});

/** Print the diff, and fail the process only when there is one. */
function reportDrift(report: DriftReport): void {
    const total =
        report.missing.length + report.unexpected.length + report.mismatched.length;
    if (total === 0) {
        console.log(
            `Relationships index is in sync (${report.sourcesScanned} sources scanned).`
        );
        return;
    }

    console.error(
        `Relationships index drift across ${report.sourcesScanned} sources: ` +
            `${report.missing.length} missing, ${report.unexpected.length} unexpected, ` +
            `${report.mismatched.length} mismatched.`
    );
    for (const row of report.missing) {
        console.error(`  missing     ${describe(row)}`);
    }
    for (const row of report.unexpected) {
        console.error(`  unexpected  ${describe(row)}`);
    }
    for (const { stored, computed } of report.mismatched) {
        console.error(`  mismatched  ${describe(stored)} -> ${describe(computed)}`);
    }
    console.error('Run `astromech index:rebuild` to repair.');
    process.exitCode = 1;
}

/** One drift row on one line: which source, which path, which target. */
function describe(row: {
    sourceKind: string;
    sourceType: string | null;
    sourceId: string;
    instancePath: string;
    targetKind: string;
    targetId: string;
    sourceStaged: boolean;
}): string {
    const source = row.sourceType ?? row.sourceKind;
    const staged = row.sourceStaged ? ' (staged)' : '';
    return `${source} ${row.sourceId}${staged} ${row.instancePath} -> ${row.targetKind} ${row.targetId}`;
}
