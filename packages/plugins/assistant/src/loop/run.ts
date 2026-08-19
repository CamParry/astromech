import type { ApprovalsRepository } from '../approvals/repository';
import type { SessionsRepository } from '../sessions/repository';
import type {
    ApprovalDecision,
    ChatEvent,
    ChatMessage,
    ResolvedAssistantOptions,
} from '../types';
import type { LanguageModel, ToolCallPart } from 'ai';
import type { AiContextItem, PluginLogger, ToolDefinition } from 'astromech';
import { stepCountIs, streamText } from 'ai';
import { errorMessage } from '../error-message';
import { answerUnansweredCalls, pauseForApproval, resumePausedTurn } from './approvals';
import { buildRequest } from './request';
import { toToolSet } from './tools';

/**
 * The server-side model loop: assembles one request, runs the model, and yields
 * the chat events the SSE route writes to the browser.
 */

/** Bounded so a looping model cannot spend a request forever. */
const MAX_STEPS = 12;

/** Run one chat turn, yielding text as it streams and the tools that ran. */
export async function* runAssistantLoop(input: {
    model: LanguageModel;
    options: ResolvedAssistantOptions;
    tools: ToolDefinition[];
    messages: ChatMessage[];
    aiContext: AiContextItem[];
    logger: PluginLogger;
    approvals: ApprovalsRepository;
    sessions: SessionsRepository;
    userId: string;
    decisions: ApprovalDecision[];
}): AsyncGenerator<ChatEvent> {
    // Every completed turn is appended here and the whole thing is stored, so
    // what comes back on a reload is what the drawer would have posted.
    const turns = [...input.messages];

    /** Store the transcript as it stands. A failed write must not kill the turn. */
    async function persist(): Promise<void> {
        try {
            const stored = await input.sessions.save(input.userId, turns);
            if (!stored) {
                input.logger.warn(
                    'Chat session past its size cap — this conversation will not survive a reload.'
                );
            }
        } catch (error) {
            input.logger.error('Could not store the chat session.', error);
        }
    }

    try {
        const tools = toToolSet(input.tools);
        input.logger.info(
            `Chat request running against ${input.tools.length} tools, found by search`
        );

        // A transcript ending on unanswered calls is a paused turn, and every
        // one of them is answered before a new request is built.
        const resumed = await resumePausedTurn({
            messages: turns,
            tools: input.tools,
            decisions: input.decisions,
            approvals: input.approvals,
            userId: input.userId,
        });
        if (resumed !== null) {
            turns.push(resumed);
            await persist();
            yield { type: 'message', message: resumed };
        }

        const { system, messages } = buildRequest(
            answerUnansweredCalls(turns),
            input.aiContext
        );

        // The `finish-step` stream part omits `messages`, so completed steps
        // are queued here and drained as the stream reaches each one.
        const completed: ChatMessage[][] = [];

        // No `experimental_transform`: smoothStream drops a reasoning part's
        // signature, and it runs upstream of the recorder, so the loss would
        // land in storage rather than in one request.
        const result = streamText({
            model: input.model,
            system,
            messages,
            tools,
            stopWhen: stepCountIs(MAX_STEPS),
            allowSystemInMessages: true,
            providerOptions: { anthropic: { effort: input.options.effort } },
            onStepEnd: (step) => {
                completed.push(step.response.messages as ChatMessage[]);
            },
        });

        let held: ToolCallPart[] = [];

        /** Append, store and announce every step that has finished. */
        async function* drain(): AsyncGenerator<ChatEvent> {
            while (completed.length > 0) {
                const stepMessages = completed.shift() ?? [];
                for (const message of stepMessages) {
                    turns.push(message);
                    await persist();
                    yield { type: 'message', message };
                }
                held = unexecutedCalls(stepMessages);
            }
        }

        for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
                yield { type: 'text-delta', text: part.text };
                continue;
            }
            if (part.type === 'finish-step') yield* drain();
        }
        yield* drain();

        // The loop halts on a mutating call because its tool has no `execute`,
        // so the gate sits where the model stopped rather than in front of a
        // runner. Nothing mutating has run by the time this mints the rows.
        const requests = await pauseForApproval({
            calls: held,
            tools: input.tools,
            approvals: input.approvals,
            userId: input.userId,
        });
        if (requests.length > 0) yield { type: 'approval-required', requests };
    } catch (error) {
        yield { type: 'error', error: errorMessage(error) };
    }
    yield { type: 'done' };
}

/**
 * The calls a step left unanswered — the ones whose tool declined to run.
 * Provider-executed calls are skipped: the provider runs and answers those
 * itself, so they are never waiting on an approval.
 */
function unexecutedCalls(messages: ChatMessage[]): ToolCallPart[] {
    const answered = new Set<string>();
    const calls: ToolCallPart[] = [];

    for (const message of messages) {
        if (message.role === 'tool') {
            for (const part of message.content) {
                if (part.type === 'tool-result') answered.add(part.toolCallId);
            }
            continue;
        }
        if (message.role !== 'assistant' || typeof message.content === 'string') {
            continue;
        }
        for (const part of message.content) {
            if (part.type === 'tool-call' && part.providerExecuted !== true) {
                calls.push(part);
            }
        }
    }

    return calls.filter((call) => !answered.has(call.toolCallId));
}
