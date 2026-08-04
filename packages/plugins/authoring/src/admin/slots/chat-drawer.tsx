/**
 * The authoring assistant, contributed to the admin shell's `right-drawer`.
 * The shell renders that aside whenever a plugin fills the slot, so the drawer
 * owns its own open state and sits as a collapsed rail until it is opened.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent, ReactElement } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, useAstromechPlugin } from 'astromech/ui';
import { useChat } from './use-chat.js';
import type { ChatPart, ChatTurn } from './use-chat.js';
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
    const { turns, isStreaming, send, stop } = useChat(serviceKey);
    const [open, setOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [showJump, setShowJump] = useState(false);

    const toggleRef = useRef<HTMLButtonElement | null>(null);
    const promptRef = useRef<HTMLTextAreaElement | null>(null);
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    // Read on every scroll tick and every streamed chunk: in state it would
    // re-render the whole transcript on both.
    const followingRef = useRef(true);
    const restoreFocusRef = useRef(false);

    const closeDrawer = useCallback(() => {
        restoreFocusRef.current = true;
        setOpen(false);
    }, []);

    const followLatest = useCallback(() => {
        followingRef.current = true;
        setShowJump(false);
        const transcript = transcriptRef.current;
        if (transcript !== null) transcript.scrollTop = transcript.scrollHeight;
    }, []);

    // Focus moves into the panel on open and back to the toggle on close.
    useEffect(() => {
        if (open) {
            promptRef.current?.focus();
            return;
        }
        if (!restoreFocusRef.current) return;
        restoreFocusRef.current = false;
        toggleRef.current?.focus();
    }, [open]);

    // Stay pinned to the tail while text streams in, unless the user scrolled off it.
    useLayoutEffect(() => {
        const transcript = transcriptRef.current;
        if (transcript === null || !followingRef.current) return;
        transcript.scrollTop = transcript.scrollHeight;
    }, [open, turns, isStreaming]);

    // `field-sizing: content` is Chromium-only, so measure the box elsewhere.
    useLayoutEffect(() => {
        const textarea = promptRef.current;
        if (textarea === null || supportsFieldSizing()) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${String(textarea.scrollHeight)}px`;
    }, [open, prompt]);

    function handleToggle(): void {
        if (open) {
            closeDrawer();
            return;
        }
        followingRef.current = true;
        setShowJump(false);
        setOpen(true);
    }

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
        closeDrawer();
    }

    const toggle = (
        <button
            ref={toggleRef}
            type="button"
            className="am-authoring-toggle"
            aria-expanded={open}
            aria-label={
                open ? 'Close the authoring assistant' : 'Open the authoring assistant'
            }
            onClick={handleToggle}
        >
            <AssistantIcon />
        </button>
    );

    if (!open) {
        return <div className="am-authoring-rail">{toggle}</div>;
    }

    return (
        <div className="am-authoring-panel" onKeyDown={handlePanelKeyDown}>
            <div className="am-authoring-panel-header">
                <h2 className="am-authoring-panel-title">Assistant</h2>
                {toggle}
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
                    {turns.length === 0 ? (
                        <p className="am-authoring-hint">
                            Ask about the content you are looking at. The assistant
                            reaches only what your role can already reach.
                        </p>
                    ) : null}
                    {turns.map((turn, index) => (
                        <Turn key={index} turn={turn} />
                    ))}
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

/** One side of the conversation. An assistant turn that said nothing renders nothing. */
function Turn({ turn }: { turn: ChatTurn }): ReactElement | null {
    if (turn.parts.length === 0) return null;
    return (
        <div className={`am-authoring-turn am-authoring-turn--${turn.role}`}>
            <span className="am-authoring-turn-role">
                {turn.role === 'user' ? 'You' : 'Assistant'}
            </span>
            {turn.parts.map((part, index) => (
                <Part key={index} part={part} role={turn.role} />
            ))}
        </div>
    );
}

/**
 * Text, a marker naming a tool that ran, or an error. Only assistant text is
 * rendered as Markdown; the user's text is shown literally.
 */
function Part({ part, role }: { part: ChatPart; role: ChatTurn['role'] }): ReactElement {
    if (part.kind === 'tool') {
        return <p className="am-authoring-tool">Ran {part.name}</p>;
    }
    if (part.kind === 'error') {
        return <p className="am-authoring-error">{part.message}</p>;
    }
    if (role === 'user') {
        return <p className="am-authoring-text">{part.text}</p>;
    }
    return (
        <div className="am-authoring-markdown">
            <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
                {part.text}
            </Markdown>
        </div>
    );
}

/** Whether the browser grows a textarea from CSS alone. */
function supportsFieldSizing(): boolean {
    return typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
}

/** The drawer's glyph. Hand-drawn: this package takes no icon dependency. */
function AssistantIcon(): ReactElement {
    return (
        <svg
            className="am-authoring-toggle-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
