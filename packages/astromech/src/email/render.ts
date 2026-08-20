import type { ReactElement } from 'react';
import { render } from '@react-email/render';

/** Render a React email element to HTML and plain text in parallel. */
export async function renderEmail(
    element: ReactElement
): Promise<{ html: string; text: string }> {
    const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
    ]);
    return { html, text };
}
