import React from 'react';

export default function RatingsOverviewPage(): React.ReactElement {
    if (new URLSearchParams(window.location.search).get('boom') === '1') {
        throw new Error('deliberate crash for error-boundary testing');
    }
    return (
        <div data-ratings-overview>
            <p>Average content quality across all pages, at a glance.</p>
        </div>
    );
}
