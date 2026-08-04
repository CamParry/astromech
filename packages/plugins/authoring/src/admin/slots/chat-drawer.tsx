/**
 * The authoring assistant's panel, contributed to the admin shell's
 * `right-drawer`. It stays mounted while closed so the transcript and any
 * in-flight stream survive; the topbar button drives its open state.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent, ReactElement } from 'react';
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, useAstromechPlugin } from 'astromech/ui';
import { closeDrawer, focusToggleButton, useDrawerOpen } from '../drawer-state.js';
import { useChat } from '../use-chat.js';
import type { ChatEntry } from '../use-chat.js';
import type { ChatMessage } from '../../types.js';
import './chat-drawer.css';

/** How far off the tail still counts as following it. */
const BOTTOM_THRESHOLD_PX = 24;

/** Stable identities: the transcript re-renders on every streamed chunk. */
const REMARK_PLUGINS = [remarkGfm];

/** Assistant links leave the admin, so they open in a new tab. */
const MARKDOWN_COMPONENTS = {
    a: (props: ComponentProps<'a'>) => (
        <a {...props} target="_blank" rel="noreferrer noopener" />
    ),
};

export default function ChatDrawer(): ReactElement {
    const { serviceKey } = useAstromechPlugin();
    const { entries, tail, isStreaming, send, stop } = useChat(serviceKey);
    const open = useDrawerOpen();
    const [prompt, setPrompt] = useState('');
    const [showJump, setShowJump] = useState(false);

    const promptRef = useRef<HTMLTextAreaElement | null>(null);
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    // Read on every scroll tick and every streamed chunk: in state it would
    // re-render the whole transcript on both.
    const followingRef = useRef(true);

    const handleClose = useCallback(() => {
        closeDrawer();
        focusToggleButton();
    }, []);

    const followLatest = useCallback(() => {
        followingRef.current = true;
        setShowJump(false);
        const transcript = transcriptRef.current;
        if (transcript !== null) transcript.scrollTop = transcript.scrollHeight;
    }, []);

    // Opening starts at the tail of the transcript, with the composer focused.
    useEffect(() => {
        if (!open) return;
        followingRef.current = true;
        setShowJump(false);
        promptRef.current?.focus();
    }, [open]);

    // Stay pinned to the tail while text streams in, unless the user scrolled off it.
    useLayoutEffect(() => {
        const transcript = transcriptRef.current;
        if (transcript === null || !followingRef.current) return;
        transcript.scrollTop = transcript.scrollHeight;
    }, [open, entries, tail, isStreaming]);

    // `field-sizing: content` is Chromium-only, so measure the box elsewhere.
    useLayoutEffect(() => {
        const textarea = promptRef.current;
        if (textarea === null || supportsFieldSizing()) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${String(textarea.scrollHeight)}px`;
    }, [open, prompt]);

    function handleScroll(): void {
        const transcript = transcriptRef.current;
        if (transcript === null) return;
        const distance =
            transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
        const atBottom = distance <= BOTTOM_THRESHOLD_PX;
        followingRef.current = atBottom;
        setShowJump(!atBottom);
    }

    function handleSend(): void {
        if (isStreaming || prompt.trim() === '') return;
        send(prompt);
        setPrompt('');
        followLatest();
    }

    function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
        if (event.key !== 'Enter' || event.shiftKey) return;
        // React's composition state lags the native flag by a tick on some
        // IMEs, which sends half a word.
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        handleSend();
    }

    function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        handleClose();
    }

    return (
        <div className="am-authoring-panel" hidden={!open} onKeyDown={handlePanelKeyDown}>
            <div className="am-authoring-panel-header">
                <h2 className="am-authoring-panel-title">Assistant</h2>
                <button
                    type="button"
                    className="am-authoring-close"
                    aria-label="Close the authoring assistant"
                    onClick={handleClose}
                >
                    <CloseIcon />
                </button>
            </div>

            <div className="am-authoring-body">
                <div
                    ref={transcriptRef}
                    className="am-authoring-transcript"
                    role="log"
                    aria-label="Assistant conversation"
                    // The ARIA default is `additions text`, which re-announces a
                    // garbled partial word on every streamed chunk.
                    aria-relevant="additions"
                    onScroll={handleScroll}
                >
                    {entries.length === 0 ? (
                        <p className="am-authoring-hint">
                            Ask about the content you are looking at. The assistant
                            reaches only what your role can already reach.
                        </p>
                    ) : null}
                    {entries.map((entry, index) => (
                        <Entry key={index} entry={entry} />
                    ))}
                    {tail !== '' ? (
                        <Turn
                            message={{
                                role: 'assistant',
                                content: [{ type: 'text', text: tail }],
                            }}
                        />
                    ) : null}
                    {isStreaming ? (
                        <p className="am-authoring-pending">Working…</p>
                    ) : null}
                </div>

                {showJump ? (
                    <button
                        type="button"
                        className="am-authoring-jump"
                        onClick={followLatest}
                    >
                        <ArrowDownIcon />
                        Jump to latest
                    </button>
                ) : null}
            </div>

            <div className="am-authoring-composer">
                <textarea
                    ref={promptRef}
                    className="am-authoring-prompt"
                    rows={1}
                    value={prompt}
                    placeholder="Ask the assistant…"
                    aria-label="Message the assistant"
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={handlePromptKeyDown}
                />
                <div className="am-authoring-composer-actions">
                    <span className="am-authoring-composer-hint">
                        Enter to send, Shift+Enter for a new line
                    </span>
                    {isStreaming ? (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={stop}
                        >
                            Stop
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            size="sm"
                            disabled={prompt.trim() === ''}
                            onClick={handleSend}
                        >
                            Send
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

/** One row of the transcript: a turn, or an error the model never saw. */
function Entry({ entry }: { entry: ChatEntry }): ReactElement | null {
    if (entry.kind === 'error') {
        return <p className="am-authoring-error">{entry.error}</p>;
    }
    return <Turn message={entry.message} />;
}

/**
 * One side of the conversation. A turn with nothing to show renders nothing —
 * a user turn carrying only tool results is plumbing, not conversation.
 */
function Turn({ message }: { message: ChatMessage }): ReactElement | null {
    const blocks = message.content.filter(isRenderedBlock);
    if (blocks.length === 0) return null;
    return (
        <div className={`am-authoring-turn am-authoring-turn--${message.role}`}>
            <span className="am-authoring-turn-role">
                {message.role === 'user' ? 'You' : 'Assistant'}
            </span>
            {blocks.map((block, index) => (
                <Block key={index} block={block} role={message.role} />
            ))}
        </div>
    );
}

/**
 * Text, or a marker naming a tool the model called. Only assistant text is
 * rendered as Markdown; the user's text is shown literally.
 */
function Block({
    block,
    role,
}: {
    block: BetaContentBlockParam;
    role: ChatMessage['role'];
}): ReactElement | null {
    if (block.type === 'tool_use') {
        return <p className="am-authoring-tool">Ran {block.name}</p>;
    }
    if (block.type !== 'text') return null;
    if (role === 'user') {
        return <p className="am-authoring-text">{block.text}</p>;
    }
    return (
        <div className="am-authoring-markdown">
            <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
                {block.text}
            </Markdown>
        </div>
    );
}

/** The block types the drawer shows. Everything else, `thinking` included, is carried but hidden. */
function isRenderedBlock(block: BetaContentBlockParam): boolean {
    return block.type === 'text' || block.type === 'tool_use';
}

/** Whether the browser grows a textarea from CSS alone. */
function supportsFieldSizing(): boolean {
    return typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
}

/** The panel's close glyph. */
function CloseIcon(): ReactElement {
    return (
        <svg
            className="am-authoring-close-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </svg>
    );
}

/** The jump-to-latest glyph. */
function ArrowDownIcon(): ReactElement {
    return (
        <svg
            className="am-authoring-jump-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
        </svg>
    );
}
