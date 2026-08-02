import React from 'react';
import { Spinner } from './spinner';

type ChildrenProps = { children: React.ReactNode };

export function Page({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-page">{children}</div>;
}

/**
 * Sticky page header. A zero-height sentinel at the page's top edge reports
 * when the header has stuck, so it can tighten its padding without resizing.
 */
export function PageHeader({ children }: ChildrenProps): React.ReactElement {
    const sentinelRef = React.useRef<HTMLDivElement>(null);
    const [stuck, setStuck] = React.useState(false);

    React.useEffect(() => {
        const sentinel = sentinelRef.current;
        if (sentinel == null || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(([entry]) =>
            setStuck(entry != null && !entry.isIntersecting)
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    return (
        <>
            <div
                ref={sentinelRef}
                className="am-page-header-sentinel"
                aria-hidden="true"
            />
            <div className="am-page-header" data-stuck={stuck || undefined}>
                {children}
            </div>
        </>
    );
}

export function PageHeaderActions({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-page-header-actions">{children}</div>;
}

export function PageTitle({ children }: ChildrenProps): React.ReactElement {
    return <h1 className="am-page-title">{children}</h1>;
}

export function SectionTitle({ children }: ChildrenProps): React.ReactElement {
    return <h2 className="am-section-title">{children}</h2>;
}

export function FormLayout({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout">{children}</div>;
}

export function FormLayoutActions({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout-actions">{children}</div>;
}

export function FormLayoutContent({ children }: ChildrenProps): React.ReactElement {
    return <div className="am-form-layout-content">{children}</div>;
}

export function Stack({
    gap,
    children,
}: {
    gap: 5 | 8;
    children: React.ReactNode;
}): React.ReactElement {
    return <div className={`am-stack am-stack-gap-${gap}`}>{children}</div>;
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
