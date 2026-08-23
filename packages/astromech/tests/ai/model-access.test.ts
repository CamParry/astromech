import type {
    LanguageModelV4,
    LanguageModelV4GenerateResult,
    LanguageModelV4StreamPart,
    LanguageModelV4StreamResult,
    LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModel, hasModel } from '@/ai/index';
import { buildAiModels } from '@/ai/models';
import { setAiModels } from '@/ai/registry';

beforeEach(() => {
    globalThis.__astromech = undefined;
    vi.restoreAllMocks();
});

describe('getModel / hasModel', () => {
    it('reports nothing when no model is configured', () => {
        expect(getModel()).toBeUndefined();
        expect(getModel('assistant')).toBeUndefined();
        expect(hasModel()).toBe(false);
    });

    it('hands back the default model once configured', async () => {
        setAiModels(await buildAiModels({ model: fakeModel('test-default') }));

        expect(getModel()?.modelId).toBe('test-default');
        expect(hasModel()).toBe(true);
    });

    it('falls back to the default model for an unconfigured name', async () => {
        setAiModels(await buildAiModels({ model: fakeModel('test-default') }));

        expect(getModel('missing')?.modelId).toBe('test-default');
        expect(hasModel('missing')).toBe(true);
    });

    it('hands back a named model rather than the default', async () => {
        setAiModels(
            await buildAiModels({
                model: fakeModel('test-default'),
                models: { cheap: fakeModel('test-cheap') },
            })
        );

        expect(getModel('cheap')?.modelId).toBe('test-cheap');
        expect(getModel()?.modelId).toBe('test-default');
    });
});

describe('logging middleware', () => {
    it('reaches the underlying model and logs one line per generate', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const underlying = fakeModel('test-cheap');
        setAiModels(
            await buildAiModels({
                model: fakeModel('test-default'),
                models: { cheap: underlying },
            })
        );

        const result = await getModel('cheap')!.doGenerate(callOptions());

        expect(result.content).toEqual([{ type: 'text', text: 'from test-cheap' }]);
        expect(info).toHaveBeenCalledTimes(1);
        const line = info.mock.calls[0]![0] as string;
        expect(line).toContain('[astromech:ai] cheap test/test-cheap generate');
        expect(line).toContain('in=11 out=22');
    });

    it('passes every stream chunk through unchanged and logs once on flush', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        setAiModels(await buildAiModels({ model: fakeModel('test-default') }));

        const { stream } = await getModel()!.doStream(callOptions());
        const chunks: LanguageModelV4StreamPart[] = [];
        const reader = stream.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        expect(chunks).toEqual(streamParts());
        expect(info).toHaveBeenCalledTimes(1);
        const line = info.mock.calls[0]![0] as string;
        expect(line).toContain('[astromech:ai] default test/test-default stream');
        expect(line).toContain('in=11 out=22');
    });
});

const usage: LanguageModelV4Usage = {
    inputTokens: { total: 11, noCache: 11, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 22, text: 22, reasoning: 0 },
};

/** The stream parts every fake model emits, in order. */
function streamParts(): LanguageModelV4StreamPart[] {
    return [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'hello' },
        { type: 'text-end', id: '1' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
    ];
}

/** A minimal LanguageModelV4 whose calls resolve without a provider. */
function fakeModel(modelId: string): LanguageModelV4 {
    return {
        specificationVersion: 'v4',
        provider: 'test',
        modelId,
        supportedUrls: {},
        async doGenerate(): Promise<LanguageModelV4GenerateResult> {
            return {
                content: [{ type: 'text', text: `from ${modelId}` }],
                finishReason: { unified: 'stop', raw: undefined },
                usage,
                warnings: [],
            };
        },
        async doStream(): Promise<LanguageModelV4StreamResult> {
            return {
                stream: new ReadableStream<LanguageModelV4StreamPart>({
                    start(controller) {
                        for (const part of streamParts()) controller.enqueue(part);
                        controller.close();
                    },
                }),
            };
        },
    };
}

/** The call options a V4 model requires; only `prompt` matters to the fakes. */
function callOptions(): Parameters<LanguageModelV4['doGenerate']>[0] {
    return {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    };
}
