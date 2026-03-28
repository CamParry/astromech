import { Button, Text } from '@react-email/components';
import { BaseLayout } from './base-layout.js';

type PasswordResetEmailProps = {
    url: string;
};

export function PasswordResetEmail({ url }: PasswordResetEmailProps) {
    return (
        <BaseLayout preview="Reset your password">
            <Text style={{ margin: '0 0 16px' }}>Hi,</Text>
            <Text style={{ margin: '0 0 16px' }}>
                We received a request to reset your password. Click the button below to choose a new
                one. This link expires in 1 hour.
            </Text>
            <Button
                href={url}
                style={{
                    display: 'inline-block',
                    margin: '24px 0',
                    padding: '12px 24px',
                    backgroundColor: '#18181b',
                    color: '#ffffff',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                }}
            >
                Reset password
            </Button>
            <Text style={{ margin: '0' }}>
                If you did not request a password reset, you can safely ignore this email.
            </Text>
        </BaseLayout>
    );
}
