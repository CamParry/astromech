/**
 * `parseMethodOutput`: the one place a service method's `output` schema is
 * applied. Every call path runs it after the handler, so an in-process caller
 * gets the public shape exactly as an HTTP one does.
 */

import type { OutputSubject } from '@/errors/output-validation';
import { z } from 'zod';
import { describeSubject, OutputValidationError } from '@/errors/output-validation';
import { countFallbacks } from '@/services/fallback';
import { log } from '@/utilities/log';

/**
 * `result` through `method.output`, named after the method in a warning or an
 * error. A method with no `output` answers its result unparsed.
 */
export function parseMethodOutput(
    method: { name: string; output?: z.ZodType | undefined },
    result: unknown
): unknown {
    if (method.output === undefined) return result;
    return parseOutput(method.output, result, `The result of ${method.name}`);
}

/**
 * Parse `value` against an output schema. Unknown keys are stripped; a key
 * with a fallback that fails takes the fallback, logged once for the call; any
 * other failure throws `OutputValidationError`. `source` names the value.
 */
export function parseOutput<T>(schema: z.ZodType<T>, value: unknown, source: string): T {
    const { result, fallbacks } = countFallbacks(() => schema.safeParse(value));
    if (!result.success) {
        throw new OutputValidationError(source, subjectOf(value), result.error);
    }
    if (fallbacks > 0) {
        log.warn(
            `${source} fell back to defaults for values its output schema refuses` +
                `${describeSubject(subjectOf(value))}: ${fallbackPaths(schema, value).join(', ')}`
        );
    }
    return result.data;
}

/** The id and locale a result carries at its top level, when it has them. */
function subjectOf(value: unknown): OutputSubject {
    if (typeof value !== 'object' || value === null) return {};
    const { id, locale } = value as { id?: unknown; locale?: unknown };
    return {
        ...(typeof id === 'string' ? { id } : {}),
        ...(typeof locale === 'string' ? { locale } : {}),
    };
}

/**
 * The schema definitions the walk below descends through, by `type`. Every
 * other type (`string`, `date`, …) is a leaf the walk stops at.
 */
type WalkedDef =
    | { type: 'catch' | 'optional' | 'nullable'; innerType: z.core.$ZodType }
    | { type: 'object'; shape: Record<string, z.core.$ZodType> }
    | { type: 'array'; element: z.core.$ZodType }
    | { type: 'union'; options: readonly z.core.$ZodType[] }
    | { type: 'leaf' };

/**
 * The path of every `.catch` in `schema` whose inner schema refuses its part of
 * `value`, which is where the parse fell back. Walked only after a successful
 * parse counted a fallback, so every part already has its schema's shape.
 */
function fallbackPaths(schema: z.core.$ZodType, value: unknown): string[] {
    const found: string[] = [];
    const walk = (
        node: z.core.$ZodType,
        part: unknown,
        path: readonly (string | number)[],
        id: string | undefined
    ): void => {
        const def = node._zod.def as WalkedDef;
        if (def.type === 'catch') {
            if (succeeds(def.innerType, part)) walk(def.innerType, part, path, id);
            else found.push(formatPath(path, id));
        } else if (def.type === 'optional' || def.type === 'nullable') {
            if (part !== undefined && part !== null) walk(def.innerType, part, path, id);
        } else if (def.type === 'object') {
            const record = part as Record<string, unknown>;
            // The root's id is already in the message; a list item's is not.
            const ownId =
                path.length > 0 && typeof record['id'] === 'string' ? record['id'] : id;
            for (const [key, child] of Object.entries(def.shape)) {
                walk(child, record[key], [...path, key], ownId);
            }
        } else if (def.type === 'array') {
            for (const [index, item] of (part as unknown[]).entries()) {
                walk(def.element, item, [...path, index], id);
            }
        } else if (def.type === 'union') {
            // The parse succeeded, so an option accepts `part`: the first one did.
            for (const option of def.options) {
                if (succeeds(option, part)) {
                    walk(option, part, path, id);
                    break;
                }
            }
        }
    };
    walk(schema, value, [], undefined);
    return found;
}

/** Whether `schema` accepts `value`, fallbacks included. */
function succeeds(schema: z.core.$ZodType, value: unknown): boolean {
    return z.safeParse(schema, value).success;
}

/** `image`, or `data.3.image (id 8f2c…)` inside a list item that has an id. */
function formatPath(path: readonly (string | number)[], id: string | undefined): string {
    const dotted = path.join('.');
    return id === undefined ? dotted : `${dotted} (id ${id})`;
}
