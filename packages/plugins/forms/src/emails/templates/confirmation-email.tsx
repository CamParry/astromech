import { Column, Row, Section, Text } from '@react-email/components';
import { BaseLayout } from 'astromech/email';
import type { ReactElement } from 'react';
import type { ValueRow } from '../values.js';

export type ConfirmationEmailProps = {
    formTitle: string;
    bodyHtml?: string;
    /** Included so the submitter can see what they sent. Optional. */
    rows?: ValueRow[];
};

/** The submitter's copy: the author's body, then what they sent. */
export function ConfirmationEmail({
    formTitle,
    bodyHtml,
    rows,
}: ConfirmationEmailProps): ReactElement {
    return (
        <BaseLayout preview={`Thanks for your submission — ${formTitle}`}>
            {bodyHtml !== undefined ? (
                // `bodyHtml` takes `renderRichText` output only — it is the
                // sanitization boundary for this prop.
                <div
                    style={{ margin: '0 0 16px' }}
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
            ) : (
                <Text style={{ margin: '0 0 16px' }}>
                    Thanks for your submission to {formTitle}. We&apos;ve received it and
                    will be in touch if needed.
                </Text>
            )}
            {rows !== undefined && rows.length > 0 && (
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
            )}
        </BaseLayout>
    );
}
