import React from 'react';
import { Spinner } from './spinner';

type ChildrenProps = { children: React.ReactNode };

export function Page({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-page">{children}</div>;
}

export function PageHeader({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-page__header">{children}</div>;
}

export function PageTitle({ children }: ChildrenProps): React.ReactElement {
    return <h1 className="am-page__title">{children}</h1>;
}

export function SectionTitle({ children }: ChildrenProps): React.ReactElement {
    return <h2 className="am-section-title">{children}</h2>;
}

export function FormLayout({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout">{children}</div>;
}

export function FormLayoutActions({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout__actions">{children}</div>;
}

export function FormLayoutContent({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout__content">{children}</div>;
}

export function FormLayoutMain({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout__main">{children}</div>;
}

export function FormLayoutSidebar({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout__sidebar">{children}</div>;
}

export function ButtonGroup({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-btn-group">{children}</div>;
}

export function PageContent({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-page-content">{children}</div>;
}

export function PageLoading(): React.ReactElement {
    return (
        <div className="am-loading">
            <Spinner size="lg" />
        </div>
    );
}
