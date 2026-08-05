/**
 * The assistant's panel, contributed to the admin shell's
 * `right-drawer`. It stays mounted while closed so the transcript and any
 * in-flight stream survive; the topbar button drives its open state.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, KeyboardEvent, ReactElement } from 'react';
import type { TextPart, ToolCallPart } from 'ai';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from 'astromech/ui';
import { closeDrawer, focusToggleButton, useDrawerOpen } from '../drawer-state.js';
import { useChat } from '../use-chat.js';
import type { ChatEntry, RejectedCalls } from '../use-chat.js';
import type { ApprovalDecision, ApprovalRequest, ChatMessage } from '../../types.js';
import './chat-drawer.css';

/** How far off the tail still counts as following it. */
const BOTTOM_THRESHOLD_PX = 24;

/** Tool calls the transcript must not describe as run, by `tool_use` id. */
type UnrunCalls = Record<string, 'awaiting' | 'declined'>;

/** The two part types the transcript renders. */
type RenderedPart = TextPart | ToolCallPart;

/** Stable identities: the transcript re-renders on every streamed chunk. */
const REMARK_PLUGINS = [remarkGfm];

/** Assistant links leave the admin, so they open in a new tab. */
const MARKDOWN_COMPONENTS = {
    a: (props: ComponentProps<'a'>) => (
        <a {...props} target="_blank" rel="noreferrer noopener" />
    ),
};

export default function ChatDrawer(): ReactElement {
    const {
        entries,
        tail,
        isStreaming,
        isRestoring,
        pending,
        rejected,
        send,
        respond,
        stop,
        newChat,
    } = useChat();
    const open = useDrawerOpen();
    const [prompt, setPrompt] = useState('');
    const [showJump, setShowJump] = useState(false);

    const promptRef = useRef<HTMLTextAreaElement | null>(null);
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    // Read on every scroll tick and every streamed chunk: in state it would
    // re-render the whole transcript on both.
    const followingRef = useRef(true);
    const calls = unrunCalls(pending, rejected);

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

    // Opening starts at the tail of the transcript, with the composer focused —
    // and answering the last held call hands focus back to it. The panel takes
    // focus itself while it is up, so nothing here may pull it away.
    useEffect(() => {
        if (!open) return;
        followingRef.current = true;
        setShowJump(false);
        if (pending.length === 0) promptRef.current?.focus();
    }, [open, pending]);

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

    function handleNewChat(): void {
        newChat();
        setPrompt('');
        followLatest();
        promptRef.current?.focus();
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
        <div className="am-assistant-panel" hidden={!open} onKeyDown={handlePanelKeyDown}>
            <div className="am-assistant-panel-header">
                <h2 className="am-assistant-panel-title">Assistant</h2>
                <div className="am-assistant-panel-actions">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isStreaming}
                        onClick={handleNewChat}
                    >
                        New chat
                    </Button>
                    <button
                        type="button"
                        className="am-assistant-close"
                        aria-label="Close the assistant"
                        onClick={handleClose}
                    >
                        <CloseIcon />
                    </button>
                </div>
            </div>

            <div className="am-assistant-body">
                <div
                    ref={transcriptRef}
                    className="am-assistant-transcript"
                    role="log"
                    aria-label="Assistant conversation"
                    // The ARIA default is `additions text`, which re-announces a
                    // garbled partial word on every streamed chunk.
                    aria-relevant="additions"
                    onScroll={handleScroll}
                >
                    {isRestoring ? (
                        <p className="am-assistant-hint" aria-busy="true">
                            Loading your conversation…
                        </p>
                    ) : null}
                    {!isRestoring && entries.length === 0 ? (
                        <p className="am-assistant-hint">
                            Ask about the content you are looking at. The assistant
                            reaches only what your role can already reach.
                        </p>
                    ) : null}
                    {entries.map((entry, index) => (
                        <Entry key={index} entry={entry} calls={calls} />
                    ))}
                    {tail !== '' ? (
                        <Turn
                            message={{
                                role: 'assistant',
                                content: [{ type: 'text', text: tail }],
                            }}
                            calls={calls}
                        />
                    ) : null}
                    {isStreaming ? (
                        <p className="am-assistant-pending">Working…</p>
                    ) : null}
                </div>

                {showJump ? (
                    <button
                        type="button"
                        className="am-assistant-jump"
                        onClick={followLatest}
                    >
                        <ArrowDownIcon />
                        Jump to latest
                    </button>
                ) : null}
            </div>

            {pending.length > 0 ? (
                <ApprovalPanel requests={pending} onRespond={respond} />
            ) : null}

            <div className="am-assistant-composer">
                <textarea
                    ref={promptRef}
                    className="am-assistant-prompt"
                    rows={1}
                    value={prompt}
                    placeholder="Ask the assistant…"
                    aria-label="Message the assistant"
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={handlePromptKeyDown}
                />
                <div className="am-assistant-composer-actions">
                    <span className="am-assistant-composer-hint">
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

/**
 * The calls held for a decision. It takes focus when it mounts, which is both
 * how a keyboard user reaches it and how a screen reader hears about it — a
 * live region here would fight the transcript's own.
 */
function ApprovalPanel({
    requests,
    onRespond,
}: {
    requests: ApprovalRequest[];
    onRespond: (decisions: ApprovalDecision[]) => void;
}): ReactElement {
    const panelRef = useRef<HTMLElement | null>(null);
    const [answers, setAnswers] = useState<Record<string, ApprovalDecision['action']>>(
        {}
    );

    useEffect(() => {
        panelRef.current?.focus();
    }, []);

    // The turn resumes on a single request carrying every answer, so a call
    // left out of it is one the server declines. Nothing is sent until each
    // held call has been answered.
    function answer(next: Record<string, ApprovalDecision['action']>): void {
        const decisions: ApprovalDecision[] = [];
        for (const request of requests) {
            const action = next[request.approvalId];
            if (action === undefined) {
                setAnswers(next);
                return;
            }
            decisions.push({ approvalId: request.approvalId, action });
        }
        onRespond(decisions);
    }

    /** Answer one call, leaving the others as they stand. */
    function answerOne(approvalId: string, action: ApprovalDecision['action']): void {
        answer({ ...answers, [approvalId]: action });
    }

    /** Answer every call still undecided, so one click can clear the panel. */
    function answerRest(action: ApprovalDecision['action']): void {
        const next = { ...answers };
        for (const request of requests) next[request.approvalId] ??= action;
        answer(next);
    }

    return (
        <section
            ref={panelRef}
            className="am-assistant-approvals"
            tabIndex={-1}
            aria-labelledby="am-assistant-approvals-title"
        >
            <h3
                id="am-assistant-approvals-title"
                className="am-assistant-approvals-title"
            >
                {requests.length === 1
                    ? 'Approval needed'
                    : `${String(requests.length)} approvals needed`}
            </h3>
            <ul className="am-assistant-approval-list">
                {requests.map((request) => (
                    <Approval
                        key={request.approvalId}
                        request={request}
                        answer={answers[request.approvalId]}
                        onAnswer={answerOne}
                    />
                ))}
            </ul>
            {requests.length > 1 ? (
                <div className="am-assistant-approval-bulk">
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                            answerRest('approve');
                        }}
                    >
                        Approve all
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            answerRest('reject');
                        }}
                    >
                        Reject all
                    </Button>
                </div>
            ) : null}
        </section>
    );
}

/** One held call: core's question, and the two ways to answer it. */
function Approval({
    request,
    answer,
    onAnswer,
}: {
    request: ApprovalRequest;
    answer: ApprovalDecision['action'] | undefined;
    onAnswer: (approvalId: string, action: ApprovalDecision['action']) => void;
}): ReactElement {
    const className = [
        'am-assistant-approval',
        request.destructive ? 'am-assistant-approval--destructive' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <li className={className}>
            <p className="am-assistant-approval-message">{request.message}</p>
            {answer === undefined ? (
                <div className="am-assistant-approval-actions">
                    <Button
                        type="button"
                        variant={request.destructive ? 'danger' : 'primary'}
                        size="sm"
                        onClick={() => {
                            onAnswer(request.approvalId, 'approve');
                        }}
                    >
                        Approve
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            onAnswer(request.approvalId, 'reject');
                        }}
                    >
                        Reject
                    </Button>
                </div>
            ) : (
                <p className="am-assistant-approval-answer">
                    {answer === 'approve' ? 'Approved' : 'Rejected'}
                </p>
            )}
        </li>
    );
}

/** One row of the transcript: a turn, or an error the model never saw. */
function Entry({
    entry,
    calls,
}: {
    entry: ChatEntry;
    calls: UnrunCalls;
}): ReactElement | null {
    if (entry.kind === 'error') {
        return <p className="am-assistant-error">{entry.error}</p>;
    }
    return <Turn message={entry.message} calls={calls} />;
}

/**
 * One side of the conversation. A turn with nothing to show renders nothing —
 * a user turn carrying only tool results is plumbing, not conversation.
 */
function Turn({
    message,
    calls,
}: {
    message: ChatMessage;
    calls: UnrunCalls;
}): ReactElement | null {
    const parts = renderedParts(message);
    if (parts.length === 0) return null;
    return (
        <div className={`am-assistant-turn am-assistant-turn--${message.role}`}>
            <span className="am-assistant-turn-role">
                {message.role === 'user' ? 'You' : 'Assistant'}
            </span>
            {parts.map((part, index) => (
                <Part key={index} part={part} role={message.role} calls={calls} />
            ))}
        </div>
    );
}

/**
 * Text, or a marker naming a tool the model called. Only assistant text is
 * rendered as Markdown; the user's text is shown literally.
 */
function Part({
    part,
    role,
    calls,
}: {
    part: RenderedPart;
    role: ChatMessage['role'];
    calls: UnrunCalls;
}): ReactElement | null {
    if (part.type === 'tool-call') {
        return (
            <p className="am-assistant-tool">
                {toolCallLabel(part.toolName, calls[part.toolCallId])}
            </p>
        );
    }
    if (role === 'user') {
        return <p className="am-assistant-text">{part.text}</p>;
    }
    return (
        <div className="am-assistant-markdown">
            <Markdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
                {part.text}
            </Markdown>
        </div>
    );
}

/** What the transcript says about one tool call. */
function toolCallLabel(name: string, state: UnrunCalls[string] | undefined): string {
    if (state === 'awaiting') return `Awaiting your approval for ${name}`;
    if (state === 'declined') return `Declined ${name}`;
    return `Ran ${name}`;
}

/** The calls the transcript may not call run: those held, and those turned down. */
function unrunCalls(pending: ApprovalRequest[], rejected: RejectedCalls): UnrunCalls {
    const calls: UnrunCalls = {};
    for (const toolUseId of Object.keys(rejected)) calls[toolUseId] = 'declined';
    for (const request of pending) calls[request.toolUseId] = 'awaiting';
    return calls;
}

/**
 * The parts the drawer shows. Everything else — reasoning included — is carried
 * through the transcript untouched but never rendered. A tool turn has nothing
 * to show at all: results are plumbing, not conversation.
 */
function renderedParts(message: ChatMessage): RenderedPart[] {
    if (message.role === 'tool' || typeof message.content === 'string') return [];
    return message.content.filter(
        (part): part is RenderedPart => part.type === 'text' || part.type === 'tool-call'
    );
}

/** Whether the browser grows a textarea from CSS alone. */
function supportsFieldSizing(): boolean {
    return typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
}

/** The panel's close glyph. */
function CloseIcon(): ReactElement {
    return (
        <svg
            className="am-assistant-close-icon"
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
            className="am-assistant-jump-icon"
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
