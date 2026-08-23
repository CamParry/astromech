/**
 * The logging middleware every configured model is wrapped with at boot: one
 * line per call carrying the model, the duration and the token usage.
 */

import type {
    LanguageModelV4,
    LanguageModelV4StreamPart,
    LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';

/**
 * Middleware logging one line per call under the configured model name — the
 * closest thing to a consumer identity available at this seam.
 */
export function logging(name: string): LanguageModelMiddleware {
    return {
        wrapGenerate: async ({ doGenerate, model }) => {
            const startedAt = Date.now();
            const result = await doGenerate();
            log(name, model, 'generate', Date.now() - startedAt, result.usage);
            return result;
        },
        wrapStream: async ({ doStream, model }) => {
            const startedAt = Date.now();
            const { stream, ...rest } = await doStream();
            let usage: LanguageModelV4Usage | undefined;
            const piped = stream.pipeThrough(
                new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>(
                    {
                        transform(chunk, controller) {
                            if (chunk.type === 'finish') usage = chunk.usage;
                            controller.enqueue(chunk);
                        },
                        flush() {
                            log(name, model, 'stream', Date.now() - startedAt, usage);
                        },
                    }
                )
            );
            return { ...rest, stream: piped };
        },
    };
}

const TAG = '[astromech:ai]';

/** Emit the single per-call log line. */
function log(
    name: string,
    model: LanguageModelV4,
    operation: 'generate' | 'stream',
    ms: number,
    usage: LanguageModelV4Usage | undefined
): void {
    const input = usage?.inputTokens.total ?? '?';
    const output = usage?.outputTokens.total ?? '?';
    console.info(
        `${TAG} ${name} ${model.provider}/${model.modelId} ${operation} ${ms}ms in=${input} out=${output}`
    );
}
