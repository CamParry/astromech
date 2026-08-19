/**
 * The middleware every configured model is wrapped with at boot.
 *
 * Day one is logging only: one line per call carrying the model, the duration
 * and the token usage.
 */

import type { WrappedAIConfig } from '@/ai/registry';
import type { AIConfig } from '@/types/index';
import type {
    LanguageModelV4,
    LanguageModelV4StreamPart,
    LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';

/**
 * Wrap the configured models with core's middleware, keyed by name. `ai` is
 * imported dynamically so a site that configures no model never pulls the
 * package into its module graph.
 */
export async function buildAIConfig(config: AIConfig): Promise<WrappedAIConfig> {
    const { wrapLanguageModel } = await import('ai');
    const model = wrapLanguageModel({
        model: config.model,
        middleware: logging('default'),
    });
    const models: Record<string, LanguageModelV4> = {};
    for (const [name, instance] of Object.entries(config.models ?? {})) {
        models[name] = wrapLanguageModel({
            model: instance,
            middleware: logging(name),
        });
    }
    return { model, models };
}

/**
 * Middleware logging one line per call under the configured model name — the
 * closest thing to a consumer identity available at this seam.
 */
function logging(name: string): LanguageModelMiddleware {
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
