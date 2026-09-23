import type {
    ValidationFinding,
    ValidationReport,
} from '@/transport/cli/validate-stored-content';
import { defineCommand } from 'citty';
import { systemAppContext } from '@/app-context/app-context';
import { validateStoredContent } from '@/transport/cli/validate-stored-content';
import { configArgs } from '../common-args';
import { withApplication } from '../config';

export default defineCommand({
    meta: {
        name: 'validate',
        description: 'Report stored rows that fail the current field validation',
    },
    args: {
        ...configArgs,
        type: { type: 'string', description: 'Limit to one entry type' },
    },
    run: ({ args }) =>
        withApplication(args, async () => {
            // Booted, so the plugin runtime is registered: without it a custom-table
            // plugin entry type resolves to the entries-table repository and its rows
            // go unread.
            reportFindings(
                await validateStoredContent(
                    systemAppContext(),
                    args.type !== undefined ? { type: args.type } : {}
                )
            );
        }),
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
