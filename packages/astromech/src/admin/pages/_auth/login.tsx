/**
 * Login page for the Astromech admin SPA.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/admin/components/auth/AuthCard';
import { Button } from '@/admin/components/ui/button';
import { Input } from '@/admin/components/ui/input';
import { useAuth } from '@/admin/context/auth';

function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            await login(email, password);
            await navigate({ to: '/' });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('auth.loginFailed'));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <AuthCard title="Sign in">
            <form onSubmit={handleSubmit}>
                <div className="am-auth-fields">
                    <Input
                        label="Email address"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Input
                        label="Password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                {error !== null && <p className="am-auth-error">{error}</p>}
                <div className="am-auth-actions">
                    <Button
                        type="submit"
                        variant="primary"
                        className="am-btn-full"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Signing in…' : 'Sign in'}
                    </Button>
                    <p className="am-auth-footer-link">
                        <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
                    </p>
                </div>
            </form>
        </AuthCard>
    );
}

export const Route = createFileRoute('/_auth/login')({
    component: LoginPage,
});
