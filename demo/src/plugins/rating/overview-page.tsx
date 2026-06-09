import React from 'react';
import { useAstromechPlugin } from 'astromech/ui';
import { Panel } from 'astromech/ui/layout';

export default function RatingsOverviewPage(): React.ReactElement {
    if (new URLSearchParams(window.location.search).get('boom') === '1') {
        throw new Error('deliberate crash for error-boundary testing');
    }

    const { plugin, currentUser, toast } = useAstromechPlugin();

    return (
        <div data-ratings-overview>
            <Panel>
                <p>Average content quality across all pages, at a glance.</p>
                <p data-plugin-context>
                    Plugin: {plugin} · Viewer: {currentUser?.name ?? 'unknown'}
                </p>
                <button
                    type="button"
                    className="am-btn am-btn-secondary am-btn-sm"
                    onClick={() =>
                        toast({
                            message: 'Hello from a plugin page!',
                            variant: 'success',
                        })
                    }
                >
                    Test toast
                </button>
            </Panel>
        </div>
    );
}
