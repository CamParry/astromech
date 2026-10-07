import type {
    ValidationFinding,
    ValidationReport,
} from '@/content/validate-stored-content';
import { defineCommand } from 'citty';
import { systemAppContext } from '@/app-context/app-context';
import { validateStoredContent } from '@/content/validate-stored-content';
import { pluralise } from '@/utilities/strings';
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
        console.log(`All rows valid (${pluralise(report.rowsChecked, 'row')} checked).`);
        return;
    }

    console.error(
        `${pluralise(report.findings.length, 'validation failure')} across ` +
            `${pluralise(report.rowsChecked, 'row')} checked.`
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
    const where = [finding.locale, finding.staged ? 'staged' : null].filter(
        (part) => part !== null
    );
    const locale = where.length > 0 ? ` (${where.join(', ')})` : '';
    const path = finding.fieldPath !== null ? `${finding.fieldPath} — ` : '';
    return `${subject}${locale}: ${path}${finding.message}`;
}
