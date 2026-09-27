/**
 * Preview reads (forward versioning): with a valid token, a read sees the entry
 * past the publish gate, or its staged change, in the public shape; with none or
 * a bad one it finds nothing. Also mints and hashes the token.
 */

import type { EntryResource } from '../repository/types';
import type { AudienceContext } from '@/content/visibility';
import type { EntryQueryParams, Field, QueryResult, ResolvedConfig } from '@/types/index';
import { applyVisibility } from '@/content/visibility';
import { resolveEntryType } from '@/entries/entry-types';
import { flattenEntryFields } from '@/fields/flatten';
import { entryRepository } from '../repository/entries-table';

/**
 * Preview list read by filters. Returns an empty result when the token or type
 * is absent, or when no canonical passes the token check; with `staged`, swaps
 * each match for its staged change or skips it.
 */
export async function queryPreviewEntries(
    config: ResolvedConfig,
    params: EntryQueryParams & { type: string | readonly string[] }
): Promise<QueryResult<EntryResource>> {
    const perPage = typeof params.limit === 'number' ? params.limit : 20;
    const empty: QueryResult<EntryResource> = {
        data: [],
        pagination:
            params.limit === 'all'
                ? null
                : { page: params.page ?? 1, limit: perPage, total: 0, pages: 0 },
    };

    const token = params.previewToken;
    const typeParam = params.type;
    const type = Array.isArray(typeParam) ? typeParam[0] : (typeParam as string);
    if (!token || !type) return empty;

    const entryTypeCfg = resolveEntryType(config, type);
    const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

    const page = params.page ?? 1;
    const limit = params.limit ?? 1;
    const rows = await entryRepository.findMany({
        type,
        locale: params.locale,
        where: params.where,
        sort: params.sort,
        ...(limit === 'all' ? {} : { limit, offset: (page - 1) * limit }),
    });

    const out: EntryResource[] = [];
    for (const canonical of rows) {
        if (!(await verifyPreviewToken(canonical.id, token))) continue;

        let target = canonical;
        if (params.staged) {
            const staged = await entryRepository.staging.findOne({
                id: canonical.id,
                locale: canonical.locale,
            });
            if (!staged) continue;
            target = staged;
        }

        const projected = projectPreview(target, fields);
        if (projected !== null) out.push(projected);
    }

    if (params.limit === 'all') return { data: out, pagination: null };
    return {
        data: out,
        pagination: {
            page: params.page ?? 1,
            limit: perPage,
            total: out.length,
            pages: out.length > 0 ? 1 : 0,
        },
    };
}

/** Preview single read by canonical id (see queryPreviewEntries). */
export async function getPreviewEntry(
    config: ResolvedConfig,
    params: {
        type: string;
        id: string;
        locale?: string | undefined;
        previewToken?: string | undefined;
        staged?: boolean | undefined;
    }
): Promise<EntryResource | null> {
    const { type, id } = params;
    const token = params.previewToken;
    if (!token) return null;

    // Excludes trashed. The token authorizes every locale, so this reads the
    // one asked for and verifies against the entry.
    const canonical = await entryRepository.findOne({ type, id, locale: params.locale });
    if (!canonical) return null;
    if (!(await verifyPreviewToken(canonical.id, token))) return null;

    let target = canonical;
    if (params.staged) {
        const staged = await entryRepository.staging.findOne({
            id: canonical.id,
            locale: canonical.locale,
        });
        if (!staged) return null;
        target = staged;
    }

    const entryTypeCfg = resolveEntryType(config, type);
    const fields = entryTypeCfg ? flattenEntryFields(entryTypeCfg.fields) : [];

    return projectPreview(target, fields);
}

/** SHA-256 hex of a token (crypto.subtle, so Workers-safe). */
export async function hashPreviewToken(plaintext: string): Promise<string> {
    const bytes = new TextEncoder().encode(plaintext);
    const buffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Generate a high-entropy preview token secret (32 random bytes, hex). */
export function generatePreviewSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

/** True if `token` is a current preview token for the canonical `entryId`. */
async function verifyPreviewToken(entryId: string, token: string): Promise<boolean> {
    const record = await entryRepository.previewToken.findByHash(
        await hashPreviewToken(token)
    );
    if (!record || record.id !== entryId) return false;
    return record.expiresAt === null || record.expiresAt.getTime() > Date.now();
}

/** The audience a preview is filtered for: anonymous, as of now. */
function previewAudience(): AudienceContext {
    return { now: new Date() };
}

/** Apply the preview projection (public shape, publish-gate bypassed). */
function projectPreview(entry: EntryResource, fields: Field[]): EntryResource | null {
    return applyVisibility(entry, {
        shape: 'public',
        preview: true,
        fields,
        audience: previewAudience(),
    });
}
