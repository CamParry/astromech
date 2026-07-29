import { Column, Heading, Hr, Row, Section, Text } from '@react-email/components';
import { BaseLayout } from 'astromech/email';
import type { ReactElement } from 'react';
import type { AnswerRow } from './answers.js';

export type NotificationEmailProps = {
    formTitle: string;
    /** Author's custom body, already rendered to sanitized HTML. Optional. */
    bodyHtml?: string;
    rows: AnswerRow[];
    submittedAt: string;
};

export function NotificationEmail({
    formTitle,
    bodyHtml,
    rows,
    submittedAt,
}: NotificationEmailProps): ReactElement {
    return (
        <BaseLayout preview={`New submission: ${formTitle}`}>
            <Heading as="h2" style={{ margin: '0 0 16px', fontSize: '18px' }}>
                New submission — {formTitle}
            </Heading>
            {bodyHtml !== undefined && (
                // The sanitization boundary is core's `renderRichText` (see
                // `entries/visibility.ts`). No unsanitized string may ever be
                // passed to `bodyHtml` — that is the whole contract of this prop.
                <div
                    style={{ margin: '0 0 16px' }}
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
            )}
            <Hr style={{ margin: '16px 0', borderColor: '#e4e4e7' }} />
            <Section>
                {rows.map((row) => (
                    <Row key={row.label} style={{ margin: '0 0 8px' }}>
                        <Column
                            style={{ width: '35%', color: '#71717a', fontSize: '13px' }}
                        >
                            {row.label}
                        </Column>
                        <Column style={{ fontSize: '14px' }}>{row.value}</Column>
                    </Row>
                ))}
            </Section>
            <Hr style={{ margin: '16px 0', borderColor: '#e4e4e7' }} />
            <Text style={{ margin: '0', color: '#71717a', fontSize: '12px' }}>
                Submitted {submittedAt}
            </Text>
        </BaseLayout>
    );
}
