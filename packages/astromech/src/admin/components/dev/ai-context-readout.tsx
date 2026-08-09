/**
 * Dev-only readout of the AI context message the mounted routes currently
 * assemble. It renders the formatter's own output so the assembly path stays
 * exercised until the chat drawer consumes it.
 */

import { useAIContextItems } from '@/admin/context/ai-context';
import { useLocalState } from '@/admin/hooks/use-local-state';
import { formatAIContextMessage } from '@/utilities/ai-context';
import './ai-context-readout.css';

type ReadoutState = 'open' | 'closed';

const READOUT_STATES: ReadoutState[] = ['open', 'closed'];

/** Floating toggle plus a panel showing the assembled `system` message. */
export function AIContextReadout() {
    const items = useAIContextItems();
    const message = formatAIContextMessage(items);
    const [state, setState] = useLocalState<ReadoutState>(
        'ai-context-readout',
        'closed',
        READOUT_STATES
    );
    const open = state === 'open';

    return (
        <div className="am-ai-readout">
            <button
                type="button"
                className="am-ai-readout-toggle"
                aria-expanded={open}
                onClick={() => setState(open ? 'closed' : 'open')}
            >
                {`AI context (${items.length})`}
            </button>
            {open && (
                <div className="am-ai-readout-panel">
                    {message === null ? (
                        <p className="am-ai-readout-empty">No references declared</p>
                    ) : (
                        <>
                            <p className="am-ai-readout-role">{`role: ${message.role}`}</p>
                            <pre className="am-ai-readout-content">{message.content}</pre>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
