import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

type BaseLayoutProps = {
    preview?: string;
    children: ReactNode;
};

export function BaseLayout({ preview, children }: BaseLayoutProps) {
    return (
        <Html lang="en">
            <Head />
            {preview !== undefined && <Preview>{preview}</Preview>}
            <Body style={{ margin: 0, padding: 0, backgroundColor: '#f4f4f5', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
                    <Section style={{ padding: '32px 40px', color: '#18181b', fontSize: '15px', lineHeight: '1.6' }}>
                        {children}
                    </Section>
                    <Section style={{ padding: '16px 40px', backgroundColor: '#f4f4f5' }}>
                        <Text style={{ color: '#71717a', fontSize: '12px', textAlign: 'center', margin: 0 }}>
                            This email was sent by Astromech CMS.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}
