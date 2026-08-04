/**
 * Content operations — `translate` / `transform` / `generate`.
 *
 * Downstream of `entries`: each reads an entry at full shape, rewrites its
 * text-bearing fields through the registered `ContentProvider`, and writes the
 * result back through the normal validation pipeline. Nothing is written until
 * every field has been rewritten and validated, and nothing is ever published.
 */

import config from 'virtual:astromech/config';
import { getCurrentUser } from '@/request-context/index.js';
import { ValidationError } from '@/errors/index.js';
import { getDocumentValidator } from '@/fields/document-validators.js';
import { fieldNameToLabel, flattenEntryFields } from '@/fields/helpers.js';
import { processFields } from '@/fields/pipeline.js';
import {
    applyRichTextSegments,
    extractRichTextSegments,
} from '@/fields/rich-text/segments.js';
import { docToMarkdown, markdownToDoc } from '@/fields/rich-text/markdown.js';
import { assertCapability } from '@/entries/internal/type-config.js';
import { UnknownEntryTypeError } from '@/entries/errors.js';
import { createEntryScopedReads } from '@/entries/reads.js';
import { getEntryStorage } from '@/entries/storage/registry.js';
import { resolveEntryType } from '@/entries/type-ids.js';
import { entryValidationStage } from '@/entries/validation-stage.js';
import { resolveEntryUrl } from '@/entries/utils/url.js';
import { create } from '@/entries/operations/create.js';
import { get } from '@/entries/operations/get.js';
import { update } from '@/entries/operations/update.js';
import { createStaged } from '@/entries/operations/staging/create.js';
import { deleteStaged } from '@/entries/operations/staging/delete.js';
import { issuePreviewToken } from '@/entries/operations/preview/token.js';
import { getContentProvider } from './provider.js';
import { ContentOperationError, ContentProviderContractError } from './errors.js';
import { collectRewriteTargets, type RewriteTarget } from './internal/eligibility.js';
import { mapWithConcurrency } from './internal/batch.js';
import type { JSONContent } from '@tiptap/core';
import type { ContentProvider } from './provider.js';
import type {
    ContentApi,
    ContentFieldSummary,
    ContentOperationResult,
    ContentTarget,
    Entry,
    JsonObject,
    ResolvedEntryTypeConfig,
} from '@/types/index.js';
import type { FieldDefinition } from '@/types/fields.js';

/** How many fields may be in flight with the provider at once. */
const CONCURRENCY = 4;

/**
 * Same meaning, different locale. Structure is never changed: a rich-text field
 * goes out block by block and comes back into the same blocks. An existing
 * target locale is staged for review; a new one becomes an unpublished sibling
 * in the source's `localeGroup`.
 */
export async function translate(
    params: ContentTarget & { locale: string; instruction?: string }
): Promise<ContentOperationResult> {
    return runOperation('translate', {
        ...params,
        instruction:
            params.instruction ??
            `Translate into ${params.locale}, preserving meaning, tone and formatting.`,
    });
}

/** Same locale, different wording. Rich text may be restructured. */
export async function transform(
    params: ContentTarget & { instruction: string }
): Promise<ContentOperationResult> {
    return runOperation('transform', params);
}

/** Produce a value where there was none, or replace one wholesale. */
export async function generate(
    params: ContentTarget & { instruction: string }
): Promise<ContentOperationResult> {
    return runOperation('generate', params);
}

export const contentApi: ContentApi = { translate, transform, generate };

// ============================================================================
// Orchestration
// ============================================================================

type Mode = 'translate' | 'transform' | 'generate';

type Destination =
    | { kind: 'staged'; entry: Entry }
    | { kind: 'created'; locale: string; source: Entry };

/** One field's provider call plus how its reply lands back in the working copy. */
type RewriteJob = {
    target: RewriteTarget;
    inputs: string[];
    format: 'text' | 'markdown';
    apply: (outputs: string[]) => void;
};

/**
 * The shared spine: read, decide where the output lands, rewrite every eligible
 * field, validate, then write once. The destination is resolved before the
 * provider is called so an operation that cannot land costs no model call.
 */
async function runOperation(
    mode: Mode,
    params: ContentTarget & { instruction: string; locale?: string }
): Promise<ContentOperationResult> {
    const { type, id, instruction } = params;
    const provider = getContentProvider();

    const typeConfig = resolveEntryType(config, type);
    if (typeConfig === undefined) throw new UnknownEntryTypeError(type);
    if (mode === 'translate') assertCapability(type, 'translatable');

    const source = await loadEntry(type, id);
    const destination = await resolveDestination(mode, source, params.locale);
    if (destination.kind === 'staged') assertCapability(type, 'staging');

    const fieldDefs = flattenEntryFields(typeConfig.fields);
    const working = structuredClone(source.fields) as Record<string, unknown>;
    const targets = collectRewriteTargets(working, fieldDefs, {
        paths: params.paths,
        skipNonTranslatable: mode === 'translate',
    });

    const jobs = targets
        .map((target) => buildJob(mode, target))
        .filter((job): job is RewriteJob => job !== null);
    if (jobs.length === 0) {
        throw new ContentOperationError(
            `Entry '${id}' has no eligible text fields for ${mode}` +
                (params.paths === undefined ? '' : ` under ${params.paths.join(', ')}`)
        );
    }

    const summaries = await mapWithConcurrency(jobs, CONCURRENCY, (job) =>
        runJob(provider, job, { type, instruction, locale: params.locale })
    );

    return destination.kind === 'created'
        ? writeTranslation(type, typeConfig, destination, working, summaries)
        : writeStaged(type, typeConfig, destination.entry, working, jobs, summaries);
}

/**
 * Where the output lands. Editing live content is staged; a translation into a
 * locale that does not exist yet becomes a new sibling instead, because an
 * unpublished row nobody can see is already a review gate.
 */
async function resolveDestination(
    mode: Mode,
    source: Entry,
    locale: string | undefined
): Promise<Destination> {
    if (mode !== 'translate') return { kind: 'staged', entry: source };
    if (locale === undefined || locale === '') {
        throw new ContentOperationError('translate requires a target `locale`');
    }
    const siblingId = source.locales[locale];
    if (siblingId === undefined) return { kind: 'created', locale, source };
    return {
        kind: 'staged',
        entry: siblingId === source.id ? source : await loadEntry(source.type, siblingId),
    };
}

/** Send one field to the provider and apply its reply to the working copy. */
async function runJob(
    provider: ContentProvider,
    job: RewriteJob,
    scope: { type: string; instruction: string; locale: string | undefined }
): Promise<ContentFieldSummary> {
    const outputs = await provider.rewrite({
        instruction: scope.instruction,
        inputs: job.inputs,
        format: job.format,
        ...(scope.locale === undefined ? {} : { locale: scope.locale }),
        context: { entryType: scope.type, fieldLabel: labelOf(job.target.field) },
    });

    // Core enforces the contract the provider declares — one output per input.
    if (outputs.length !== job.inputs.length) {
        throw new ContentProviderContractError({
            path: job.target.path,
            expected: job.inputs.length,
            received: outputs.length,
        });
    }

    job.apply(outputs);
    return {
        path: job.target.path,
        fieldType: job.target.field.type,
        inputs: job.inputs.length,
        changed: outputs.some((output, index) => output !== job.inputs[index]),
    };
}

/**
 * Build the provider call for one field, or null when there is nothing to send.
 * `translate` segments a rich-text document instead of serializing it, so the
 * model never sees the block structure it could otherwise damage.
 */
function buildJob(mode: Mode, target: RewriteTarget): RewriteJob | null {
    const { field, scope, value } = target;

    if (field.type === 'richtext') {
        if (mode === 'translate') {
            const doc = asDocument(value);
            if (doc === null) return null;
            const segments = extractRichTextSegments(doc, field.allow);
            if (segments.length === 0) return null;
            return {
                target,
                inputs: segments.map((segment) => segment.text),
                format: 'markdown',
                apply: (outputs) => {
                    scope[field.name] = applyRichTextSegments(doc, outputs, field.allow);
                },
            };
        }

        const markdown = docToMarkdown(asDocument(value), field.allow);
        if (mode === 'transform' && markdown === '') return null;
        return {
            target,
            inputs: [markdown],
            format: 'markdown',
            apply: (outputs) => {
                scope[field.name] = markdownToDoc(outputs[0] ?? '', field.allow);
            },
        };
    }

    const text = typeof value === 'string' ? value : '';
    if (mode !== 'generate' && text === '') return null;
    return {
        target,
        inputs: [text],
        format: 'text',
        apply: (outputs) => {
            scope[field.name] = outputs[0] ?? '';
        },
    };
}

// ============================================================================
// Writes
// ============================================================================

/**
 * Stage the rewrite on an existing entry and hand back a preview link. The
 * staged row is removed again if the write is rejected, so a failure leaves no
 * row blocking the next attempt.
 */
async function writeStaged(
    type: string,
    typeConfig: ResolvedEntryTypeConfig,
    canonical: Entry,
    working: Record<string, unknown>,
    jobs: RewriteJob[],
    fields: ContentFieldSummary[]
): Promise<ContentOperationResult> {
    // Only the roots a rewrite actually touched: a full replacement would
    // re-coerce every stored value the operation never looked at.
    const patch: JsonObject = {};
    for (const job of jobs) {
        patch[job.target.root] = working[job.target.root] as JsonObject[string];
    }

    await assertValid({
        type,
        typeConfig,
        values: { ...canonical.fields, ...patch },
        operation: 'update',
        record: canonical,
        locale: canonical.locale,
        excludeId: [canonical.id],
    });

    const staged = await createStaged({ type, id: canonical.id });
    try {
        await update({ type, id: staged.id, data: { fields: patch } });
    } catch (error) {
        await deleteStaged({ type, id: canonical.id });
        throw error;
    }

    const { token } = await issuePreviewToken({ type, id: canonical.id });
    return {
        id: staged.id,
        type,
        outcome: 'staged',
        previewUrl: previewUrl(typeConfig.url, canonical, token),
        previewToken: token,
        fields,
    };
}

/**
 * Create the translation as an unpublished sibling in the source's
 * `localeGroup`. `create` (not `createStaged`, which mints a fresh group) is
 * what keeps it in the group and inherits the non-translatable fields.
 */
async function writeTranslation(
    type: string,
    typeConfig: ResolvedEntryTypeConfig,
    destination: { locale: string; source: Entry },
    working: Record<string, unknown>,
    fields: ContentFieldSummary[]
): Promise<ContentOperationResult> {
    const { locale, source } = destination;

    await assertValid({
        type,
        typeConfig,
        values: working,
        operation: 'create',
        record: null,
        locale,
    });

    const created = await create({
        type,
        title: source.title,
        ...(source.slug === null ? {} : { slug: source.slug }),
        locale,
        localeGroup: source.localeGroup,
        fields: working as JsonObject,
        status: 'unpublished',
    });

    return {
        id: created.id,
        type,
        outcome: 'created',
        previewUrl: null,
        fields,
    };
}

/**
 * Run the field pipeline over the rewritten document before anything is
 * written, so a rejected reply costs no staged row — the same ordering
 * `mergeStaged` uses. Both destinations land on an unpublished row.
 */
async function assertValid(params: {
    type: string;
    typeConfig: ResolvedEntryTypeConfig;
    values: Record<string, unknown>;
    operation: 'create' | 'update';
    record: Entry | null;
    locale: string;
    excludeId?: string[];
}): Promise<void> {
    const { type, typeConfig } = params;
    const documentValidate = getDocumentValidator(`entry:${type}`) ?? typeConfig.validate;
    const processed = await processFields(
        structuredClone(params.values),
        flattenEntryFields(typeConfig.fields),
        {
            operation: params.operation,
            stage: entryValidationStage({
                status: 'unpublished',
                hasStatuses: typeConfig.capabilities.statuses !== false,
            }),
            host: { kind: 'entry', record: params.record },
            user: getCurrentUser(),
            reads: createEntryScopedReads(getEntryStorage(type), {
                type,
                locale: params.locale,
                ...(params.excludeId === undefined
                    ? {}
                    : { excludeId: params.excludeId }),
            }),
            ...(documentValidate ? { documentValidate } : {}),
        }
    );
    if (Object.keys(processed.errors).length > 0 || processed.form.length > 0) {
        throw ValidationError.fromFieldErrors(processed.errors, processed.form);
    }
}

// ============================================================================
// Helpers
// ============================================================================

/** Load an entry at full shape, failing loudly rather than rewriting nothing. */
async function loadEntry(type: string, id: string): Promise<Entry> {
    const entry = await get({ type, id, full: true });
    if (entry === null) throw new ContentOperationError(`Entry '${id}' not found`);
    return entry;
}

/** The reviewer's link: the entry's own page, opened against the staged copy. */
function previewUrl(
    template: string | undefined,
    entry: Entry,
    token: string
): string | null {
    if (template === undefined) return null;
    const url = resolveEntryUrl(template, { slug: entry.slug, fields: entry.fields });
    return `${url}?preview=${encodeURIComponent(token)}&staged=1`;
}

/** A plain-string label for the provider's context; i18n keys fall back. */
function labelOf(field: FieldDefinition): string {
    return typeof field.label === 'string' ? field.label : fieldNameToLabel(field.name);
}

/** Narrow a stored rich-text value to a ProseMirror document. */
function asDocument(value: unknown): JSONContent | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as JSONContent;
}
