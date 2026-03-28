import React from 'react';
import { Link } from '@tanstack/react-router';

type BreadcrumbItem = { label: string; to?: string };
type BreadcrumbProps = { items: BreadcrumbItem[] };

export function Breadcrumb({ items }: BreadcrumbProps): React.ReactElement {
    return (
        <nav className="am-breadcrumb" aria-label="Breadcrumb">
            <ol>
                {items.map((item, i) => (
                    <li key={i} className="am-breadcrumb-item">
                        {i > 0 && <span className="am-breadcrumb-sep" aria-hidden="true">/</span>}
                        {item.to !== undefined ? (
                            <Link to={item.to} className="am-breadcrumb-link">
                                {item.label}
                            </Link>
                        ) : (
                            <span>{item.label}</span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}

export type { BreadcrumbItem, BreadcrumbProps };
