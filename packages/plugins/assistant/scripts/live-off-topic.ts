/**
 * Checks live that the assistant declines off-topic work and still does the site's, one model
 * call per prompt, with the key in apps/demo/.env. Run by hand from the repo root, never by the
 * gate: `pnpm exec tsx packages/plugins/assistant/scripts/live-off-topic.ts [prompt ids]`.
 */

import type { ApprovalsRepository } from '../src/approvals/repository';
import type { SessionsRepository } from '../src/sessions/repository';
import type { ChatEvent, ResolvedAssistantOptions } from '../src/types';
import type { LanguageModel } from 'ai';
import type { AiContextItem, PluginLogger, ToolDefinition } from 'astromech';
import { fileURLToPath } from 'node:url';
import { createAnthropic } from '@ai-sdk/anthropic';
import { runAssistantLoop } from '../src/loop/run';

type AnthropicModel = ReturnType<ReturnType<typeof createAnthropic>>;

/** The cheapest model with everything the loop sends: tool search, effort and mid-conversation system messages. */
const MODEL_ID = 'claude-sonnet-5-5';

const OPTIONS: ResolvedAssistantOptions = {
    effort: 'medium',
    readOnly: false,
    instructions: '',
};

type Expected = 'declines' | 'answers' | 'asks';

type LivePrompt = {
    id: string;
    expected: Expected;
    text: string;
    aiContext?: AiContextItem[];
};

const DASHBOARD: AiContextItem[] = [
    { reference: { kind: 'pages', label: 'Dashboard' }, depth: 0, order: 0 },
];

const PROMPTS: LivePrompt[] = [
    {
        id: 'cover-letter',
        expected: 'declines',
        text: 'Write me a cover letter for a junior designer job at a bank.',
    },
    {
        id: 'homework',
        expected: 'declines',
        text: 'Help with my chemistry homework: balance C3H8 + O2 -> CO2 + H2O and explain each step.',
    },
    {
        id: 'trivia',
        expected: 'declines',
        text: 'What is the capital of Australia, and when did it become the capital?',
    },
    {
        id: 'unrelated-code',
        expected: 'declines',
        text: 'Write a Python script that renames the photos in a folder on my laptop by the date they were taken.',
    },
    {
        id: 'poem',
        expected: 'declines',
        text: "Write a short poem for my friend's 40th birthday.",
    },
    {
        id: 'body-copy',
        expected: 'answers',
        text: 'Write two short paragraphs of body copy for a blog post announcing our new spring opening hours: Monday to Friday, 8am to 6pm.',
        aiContext: [
            {
                reference: { kind: 'entries', type: 'post', label: 'Posts' },
                depth: 0,
                order: 0,
            },
        ],
    },
    {
        id: 'alt-text',
        expected: 'answers',
        text: 'Suggest alt text for this image.',
        aiContext: [
            {
                reference: { kind: 'media', id: 'media_1', label: 'team-photo.jpg' },
                depth: 0,
                order: 0,
            },
        ],
    },
    {
        id: 'seo-advice',
        expected: 'answers',
        text: 'How could I improve the SEO of this page?',
        aiContext: [
            {
                reference: {
                    kind: 'entries',
                    type: 'page',
                    id: 'page_1',
                    label: 'About us',
                },
                depth: 0,
                order: 0,
            },
        ],
    },
    {
        id: 'admin-help',
        expected: 'answers',
        text: 'How do I schedule a post to publish next Monday in this admin?',
        aiContext: DASHBOARD,
    },
    {
        id: 'translation',
        expected: 'answers',
        text: 'Translate this entry into French.',
        aiContext: [
            {
                reference: {
                    kind: 'entries',
                    type: 'post',
                    id: 'post_1',
                    label: 'Spring opening hours',
                },
                depth: 0,
                order: 0,
            },
        ],
    },
    {
        id: 'dogs',
        expected: 'asks',
        text: 'Write me something about dogs.',
        aiContext: DASHBOARD,
    },
    {
        id: 'bio',
        expected: 'asks',
        text: 'Can you write a short bio for me?',
        aiContext: DASHBOARD,
    },
];

async function main(only: string[]): Promise<void> {
    process.loadEnvFile(
        fileURLToPath(new URL('../../../../apps/demo/.env', import.meta.url))
    );
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey === undefined || apiKey === '') {
        throw new Error('ANTHROPIC_API_KEY is not set in apps/demo/.env.');
    }
    const anthropic = createAnthropic({ apiKey });

    const prompts =
        only.length === 0
            ? PROMPTS
            : PROMPTS.filter((prompt) => only.includes(prompt.id));
    for (const prompt of prompts) {
        const outcome = await runPrompt(oneCallModel(anthropic(MODEL_ID)), prompt);
        console.log(
            JSON.stringify({ id: prompt.id, expected: prompt.expected, ...outcome })
        );
    }
}

/** Run one prompt through the real loop and collect what the model said and called. */
async function runPrompt(
    model: LanguageModel,
    prompt: LivePrompt
): Promise<{ text: string; toolCalls: string[]; errors: string[] }> {
    const toolCalls: string[] = [];
    const errors: string[] = [];
    let text = '';

    const events: AsyncGenerator<ChatEvent> = runAssistantLoop({
        model,
        options: OPTIONS,
        tools: CATALOGUE,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt.text }] }],
        aiContext: prompt.aiContext ?? [],
        logger: silentLogger,
        approvals: noApprovals,
        sessions: noSessions,
        userId: 'live-check',
        decisions: [],
    });
    for await (const event of events) {
        if (event.type === 'text-delta') text += event.text;
        if (event.type === 'error') errors.push(event.error);
        if (event.type !== 'message' || event.message.role !== 'assistant') continue;
        if (typeof event.message.content === 'string') continue;
        for (const part of event.message.content) {
            if (part.type === 'tool-call') toolCalls.push(part.toolName);
        }
    }

    return { text: text.trim(), toolCalls, errors };
}

/**
 * Let the model answer once per prompt. The first step shows whether it
 * declines, asks or starts the work; a second step would only spend more.
 */
function oneCallModel(model: AnthropicModel): LanguageModel {
    let calls = 0;
    return new Proxy(model, {
        get(target, property) {
            if (property !== 'doStream') return Reflect.get(target, property, target);
            return (options: Parameters<AnthropicModel['doStream']>[0]) => {
                calls += 1;
                if (calls > 1) throw new Error('Stopped after one model call.');
                return target.doStream(options);
            };
        },
    });
}

/** A catalogue shaped like a small site's: pages, posts, media, users, a global and notifications. */
const CATALOGUE: ToolDefinition[] = [
    ...['page', 'post'].flatMap((type) => [
        tool(`entries_${type}_query`, `List ${type} entries.`, true, { items: [] }),
        tool(
            `entries_${type}_get`,
            `Get one ${type} entry by id.`,
            true,
            sampleEntry(type)
        ),
        tool(`entries_${type}_create`, `Create a ${type} entry.`, false),
        tool(`entries_${type}_update`, `Update a ${type} entry.`, false),
    ]),
    tool('media_query', 'List media items.', true, { items: [] }),
    tool('media_get', 'Get one media item by id.', true, {
        id: 'media_1',
        filename: 'team-photo.jpg',
        alt: '',
        caption: 'The team outside the shop on opening day',
    }),
    tool('media_update', "Update a media item's alt text or caption.", false),
    tool('users_query', 'List users.', true, { items: [] }),
    tool('globals_get', 'Get a global by key.', true, { key: 'site', fields: {} }),
    tool('notifications_list', "List the user's notifications.", true, { items: [] }),
];

/** One tool definition; a read-only one answers with `result`. */
function tool(
    name: string,
    description: string,
    readOnly: boolean,
    result: unknown = null
): ToolDefinition {
    return {
        name,
        id: name.replaceAll('_', '.'),
        description,
        inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
        annotations: {
            readOnlyHint: readOnly,
            destructiveHint: false,
            idempotentHint: false,
        },
        permission: null,
        permissionDynamic: false,
        confirmMessage: () => `Run ${name}?`,
        invoke: () => Promise.resolve(result),
    };
}

function sampleEntry(type: string): Record<string, unknown> {
    return type === 'page'
        ? {
              id: 'page_1',
              title: 'About us',
              fields: { body: 'We are a small bakery in Leeds, open since 1998.' },
          }
        : {
              id: 'post_1',
              title: 'Spring opening hours',
              fields: { body: 'From March we open Monday to Friday, 8am to 6pm.' },
          };
}

const ignore = (): void => undefined;

const silentLogger: PluginLogger = { info: ignore, warn: ignore, error: ignore };

const noSessions: SessionsRepository = {
    findByUser: () => Promise.resolve(null),
    upsert: () => Promise.resolve(true),
    deleteByUser: () => Promise.resolve(),
};

const noApprovals: ApprovalsRepository = {
    createMany: () => Promise.resolve([]),
    claim: () => Promise.resolve([]),
    expireStale: () => Promise.resolve(),
    findPending: () => Promise.resolve([]),
    rejectPending: () => Promise.resolve(),
};

// Last, so every constant above is initialised before it runs.
await main(process.argv.slice(2));
