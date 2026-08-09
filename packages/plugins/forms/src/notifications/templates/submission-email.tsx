import { Column, Hr, Row, Section, Text } from '@react-email/components';
import { BaseLayout } from 'astromech/email';
import type { ReactElement } from 'react';
import type { ValueRow } from '../../utilities/values';

export type SubmissionEmailProps = {
    /** Inbox preview text — the resolved subject line. */
    preview: string;
    /** Author's body, already rendered to sanitized HTML. Optional. */
    bodyHtml?: string;
    rows: ValueRow[];
    submittedAt: string;
};

/**
 * The one email an `email` notification sends, to the site or the submitter:
 * the author's body, then the submitted values.
 */
export function SubmissionEmail({
    preview,
    bodyHtml,
    rows,
    submittedAt,
}: SubmissionEmailProps): ReactElement {
    return (
        <BaseLayout preview={preview}>
            {bodyHtml !== undefined && (
                // `bodyHtml` takes `renderRichText` output only — it is the
                // sanitization boundary for this prop.
                <div
                    style={{ margin: '0 0 16px' }}
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
            )}
            {rows.length > 0 && (
                <>
                    <Hr style={{ margin: '16px 0', borderColor: '#e4e4e7' }} />
                    <Section>
                        {rows.map((row) => (
                            <Row key={row.label} style={{ margin: '0 0 8px' }}>
                                <Column
                                    style={{
                                        width: '35%',
                                        color: '#71717a',
                                        fontSize: '13px',
                                    }}
                                >
                                    {row.label}
                                </Column>
                                <Column style={{ fontSize: '14px' }}>{row.value}</Column>
                            </Row>
                        ))}
                    </Section>
                </>
            )}
            <Hr style={{ margin: '16px 0', borderColor: '#e4e4e7' }} />
            <Text style={{ margin: '0', color: '#71717a', fontSize: '12px' }}>
                Submitted {submittedAt}
            </Text>
        </BaseLayout>
    );
}
