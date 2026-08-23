import type {
    ValidationFinding,
    ValidationReport,
} from '@/transport/cli/validate-stored-content';
import { defineCommand } from 'citty';
import { createAstromech } from '@/astromech';
import { validateStoredContent } from '@/transport/cli/validate-stored-content';
import { loadConfig, loadRawConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: {
        name: 'validate',
        description: 'Report stored rows that fail the current field validation',
    },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
        type: { type: 'string', description: 'Limit to one entry type' },
    },
    async run({ args }) {
        // `loadConfig` guards the database and fills the config shim; the
        // application registers the plugin runtime. Without it a table-backed
        // plugin entry type resolves to the built-in repository and its rows go
        // unread.
        await loadConfig(args.config, toAllowRemoteOption(args));
        await createAstromech({ config: await loadRawConfig(args.config) });

        reportFindings(
            await validateStoredContent(
                args.type !== undefined ? { type: args.type } : {}
            )
        );
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
