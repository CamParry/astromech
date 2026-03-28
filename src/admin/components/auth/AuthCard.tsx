/**
 * AuthCard — shared layout wrapper for all auth pages.
 * Renders the full-page centred shell and the card with brand, title, and body.
 */

import React from 'react';

type AuthCardProps = {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
};

export function AuthCard({ title, subtitle, children }: AuthCardProps): React.ReactElement {
    return (
        <div className="am-auth">
            <div className="am-auth-card">
                <div className="am-auth-brand">
                    <span className="am-auth-logo">Astromech</span>
                </div>
                <div className="am-auth-header">
                    <h1 className="am-auth-title">{title}</h1>
                    {subtitle !== undefined && (
                        <p className="am-auth-subtitle">{subtitle}</p>
                    )}
                </div>
                <div className="am-auth-body">
                    {children}
                </div>
            </div>
        </div>
    );
}
