import { defineCommand } from 'citty';
import { loadConfig, loadRawConfig } from '../config';
import { forceArgs, toForceOption } from '../force-args';
import { registerPlugins } from '@/plugins/runtime/plugin-runtime';
import { wireEntryAccess } from '@/entries/plugin-access';
import { wireNotifyAccess } from '@/notifications/plugin-access';
import {
    validateStoredContent,
    type ValidationFinding,
    type ValidationReport,
} from '@/boot/validate-stored-content';

export default defineCommand({
    meta: {
        name: 'validate',
        description: 'Report stored rows that fail the current field validation',
    },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...forceArgs,
        type: { type: 'string', description: 'Limit to one entry type' },
    },
    async run({ args }) {
        const resolved = await loadConfig(args.config, toForceOption(args));
        // `loadConfig` never touches the plugin runtime, so without this a
        // table-backed plugin entry type would resolve to the built-in storage
        // and its rows would go unread.
        const raw = await loadRawConfig(args.config);
        wireEntryAccess();
        wireNotifyAccess();
        registerPlugins(raw.plugins ?? [], resolved);

        reportFindings(await validateStoredContent(args.type ? { type: args.type } : {}));
    },
});

/** Print the findings, and fail the process only when there are some. */
function reportFindings(report: ValidationReport): void {
    if (report.findings.length === 0) {
        console.log(`All rows valid (${report.rowsChecked} rows checked).`);
        return;
    }

    console.error(
        `${report.findings.length} validation failures across ${report.rowsChecked} rows checked.`
    );
    for (const finding of report.findings) {
        console.error(`  ${describe(finding)}`);
    }
    process.exitCode = 1;
}

/** One finding on one line: which row, which field, what it says. */
function describe(finding: ValidationFinding): string {
    const subject =
        finding.type !== null
            ? `${finding.kind} ${finding.type}/${finding.id}`
            : `${finding.kind} ${finding.id}`;
    const locale = finding.locale !== null ? ` (${finding.locale})` : '';
    const path = finding.fieldPath !== null ? `${finding.fieldPath} — ` : '';
    return `${subject}${locale}: ${path}${finding.message}`;
}
