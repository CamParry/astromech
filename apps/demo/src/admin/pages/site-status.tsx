import React from 'react';
import { useToast } from 'astromech/ui';
import { Panel } from 'astromech/ui/layout';

export default function SiteStatusPage(): React.ReactElement {
    const { toast } = useToast();

    return (
        <div data-site-status>
            <Panel>
                <p>All systems nominal.</p>
                <p>
                    This page is a host-registered custom component — no plugin identity,
                    no managed form.
                </p>
                <button
                    type="button"
                    className="am-btn am-btn-secondary am-btn-sm"
                    onClick={() =>
                        toast({
                            message: 'Hello from a host page!',
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
