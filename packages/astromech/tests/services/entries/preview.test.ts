/**
 * Service-level tests for forward-versioning preview:
 * issuePreviewToken / revokePreviewToken + the previewToken/staged read params
 * on query() and get().
 *
 * The preview read path uses no transactions, so the harness `:memory:` db is
 * fine here (unlike the staging merge tests). Front-end preview resolves entries
 * by slug via query({ where: { slug } }), which is the path exercised below.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig, makeTestConfig } from '@tests/harness.js';
import { entries as api } from '@/entries/service.js';
import { CapabilityError } from '@/entries/errors.js';

beforeEach(async () => {
    await createTestDb();
    const cfg = makeTestConfig();
    if (cfg.entries.post) cfg.entries.post.staging = true;
    setupTestConfig(cfg);
});

// ============================================================================
// issue / revoke
// ============================================================================

describe('issuePreviewToken', () => {
    it('returns a plaintext token and requires the staging capability', async () => {
        const e = await api.create({ type: 'post', title: 'X', slug: 'x' });
        const { token } = await api.issuePreviewToken({ type: 'post', id: e.id });
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(16);

        const card = await api.create({ type: 'card', fields: { label: 'c' } });
        await expect(
            api.issuePreviewToken({ type: 'card', id: card.id })
        ).rejects.toBeInstanceOf(CapabilityError);
    });

    it('replaces the previous token (one active token per entry)', async () => {
        const e = await api.create({ type: 'post', title: 'Hidden', slug: 'hidden' });
        const { token: first } = await api.issuePreviewToken({ type: 'post', id: e.id });
        const { token: second } = await api.issuePreviewToken({ type: 'post', id: e.id });
        expect(second).not.toBe(first);

        // The old token no longer authorizes; the new one does.
        const withOld = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            previewToken: first,
            limit: 1,
        });
        expect(withOld.data).toHaveLength(0);
        const withNew = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            previewToken: second,
            limit: 1,
        });
        expect(withNew.data).toHaveLength(1);
    });
});

// ============================================================================
// query() preview by slug
// ============================================================================

describe('query() with previewToken', () => {
    it('returns an unpublished entry only with a valid token (404 semantics otherwise)', async () => {
        const e = await api.create({ type: 'post', title: 'Hidden', slug: 'hidden' });
        expect(e.status).toBe('unpublished');

        // No token → normal public behaviour → not returned.
        const anon = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            limit: 1,
        });
        expect(anon.data).toHaveLength(0);

        const { token } = await api.issuePreviewToken({ type: 'post', id: e.id });

        // Valid token → returned (publish gate bypassed).
        const ok = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            previewToken: token,
            limit: 1,
        });
        expect(ok.data.map((x) => x.id)).toEqual([e.id]);

        // Invalid token → empty.
        const bad = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            previewToken: 'not-a-real-token',
            limit: 1,
        });
        expect(bad.data).toHaveLength(0);
    });

    it('previews the staged change when staged:true', async () => {
        const canonical = await api.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
            status: 'published',
        });
        const staged = await api.createStaged({ type: 'post', id: canonical.id });
        await api.update({
            type: 'post',
            id: staged.id,
            data: { title: 'Staged title', fields: { body: 'staged body' } },
        });
        const { token } = await api.issuePreviewToken({ type: 'post', id: canonical.id });

        // staged:false → the current (published) canonical.
        const current = await api.query({
            type: 'post',
            where: { slug: 'live' },
            previewToken: token,
            limit: 1,
        });
        expect(current.data[0]?.id).toBe(canonical.id);
        expect(current.data[0]?.title).toBe('Live');

        // staged:true → the staged change.
        const stagedView = await api.query({
            type: 'post',
            where: { slug: 'live' },
            previewToken: token,
            staged: true,
            limit: 1,
        });
        expect(stagedView.data[0]?.id).toBe(staged.id);
        expect(stagedView.data[0]?.title).toBe('Staged title');
        expect(stagedView.data[0]?.fields.body).toBe('staged body');
    });

    it('returns empty for staged:true when there is no staged change', async () => {
        const e = await api.create({ type: 'post', title: 'Hidden', slug: 'hidden' });
        const { token } = await api.issuePreviewToken({ type: 'post', id: e.id });
        const res = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            previewToken: token,
            staged: true,
            limit: 1,
        });
        expect(res.data).toHaveLength(0);
    });

    it('rejects an expired token', async () => {
        const e = await api.create({ type: 'post', title: 'Hidden', slug: 'hidden' });
        const { token } = await api.issuePreviewToken({
            type: 'post',
            id: e.id,
            expiresAt: new Date(Date.now() - 60_000),
        });
        const res = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            previewToken: token,
            limit: 1,
        });
        expect(res.data).toHaveLength(0);
    });

    it('stops authorizing after revoke', async () => {
        const e = await api.create({ type: 'post', title: 'Hidden', slug: 'hidden' });
        const { token } = await api.issuePreviewToken({ type: 'post', id: e.id });
        await api.revokePreviewToken({ type: 'post', id: e.id });
        const res = await api.query({
            type: 'post',
            where: { slug: 'hidden' },
            previewToken: token,
            limit: 1,
        });
        expect(res.data).toHaveLength(0);
    });
});

// ============================================================================
// get() preview by id
// ============================================================================

describe('get() with previewToken', () => {
    it('returns the unpublished canonical only with a valid token', async () => {
        const e = await api.create({ type: 'post', title: 'Hidden', slug: 'hidden' });
        const { token } = await api.issuePreviewToken({ type: 'post', id: e.id });

        expect(await api.get({ type: 'post', id: e.id })).toBeNull(); // public → hidden
        const got = await api.get({ type: 'post', id: e.id, previewToken: token });
        expect(got?.id).toBe(e.id);
    });

    it('never previews a trashed entry', async () => {
        const e = await api.create({ type: 'post', title: 'Doomed', slug: 'doomed' });
        const { token } = await api.issuePreviewToken({ type: 'post', id: e.id });
        await api.trash({ type: 'post', id: e.id });
        expect(await api.get({ type: 'post', id: e.id, previewToken: token })).toBeNull();
    });
});
