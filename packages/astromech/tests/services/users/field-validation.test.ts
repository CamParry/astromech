/**
 * Integration tests for field-processing pipeline wired into the users service
 * (create + update). Validates required fields, defaults, coercion, uniqueness,
 * and self-exclusion on update.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { usersApi } from '@/users/service.js';
import type { AstromechConfig } from '@/types/index.js';

// ---------------------------------------------------------------------------
// Config with custom user fields
// ---------------------------------------------------------------------------

function makeUserFieldConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        users: {
            fields: [
                { name: 'bio', type: 'text', label: 'Bio', required: true },
                { name: 'handle', type: 'slug', label: 'Handle' },
                {
                    name: 'badge',
                    type: 'text',
                    label: 'Badge',
                    validation: [{ unique: true }],
                },
                { name: 'tier', type: 'text', label: 'Tier', defaultValue: 'free' },
            ],
        },
    };
}

function uniqueEmail(): string {
    return `user-${crypto.randomUUID()}@test.dev`;
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeUserFieldConfig());
});

// ---------------------------------------------------------------------------
// create: required field
// ---------------------------------------------------------------------------

describe('usersApi.create — required field', () => {
    it('rejects when required custom field is absent', async () => {
        await expect(
            usersApi.create({ email: uniqueEmail(), name: 'Alice', fields: {} })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { bio: ['This field is required'] },
        });
    });

    it('rejects when required custom field is empty string', async () => {
        await expect(
            usersApi.create({ email: uniqueEmail(), name: 'Alice', fields: { bio: '' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { bio: ['This field is required'] },
        });
    });
});

// ---------------------------------------------------------------------------
// create: defaultValue
// ---------------------------------------------------------------------------

describe('usersApi.create — defaultValue', () => {
    it('applies defaultValue when field is absent', async () => {
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hello' },
        });
        expect(user.fields?.tier).toBe('free');
    });

    it('does not override an explicit value with the default', async () => {
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hello', tier: 'pro' },
        });
        expect(user.fields?.tier).toBe('pro');
    });
});

// ---------------------------------------------------------------------------
// create: coercion
// ---------------------------------------------------------------------------

describe('usersApi.create — coercion', () => {
    it('coerces a slug field to slugified form', async () => {
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi', handle: 'Alice Smith' },
        });
        expect(user.fields?.handle).toBe('alice-smith');
    });
});

// ---------------------------------------------------------------------------
// create: uniqueness
// ---------------------------------------------------------------------------

describe('usersApi.create — uniqueness', () => {
    it('rejects a duplicate badge', async () => {
        await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi', badge: 'gold' },
        });
        await expect(
            usersApi.create({
                email: uniqueEmail(),
                name: 'Bob',
                fields: { bio: 'Hey', badge: 'gold' },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { badge: ['Already in use'] },
        });
    });

    it('accepts a different badge', async () => {
        await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi', badge: 'gold' },
        });
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Bob',
            fields: { bio: 'Hey', badge: 'silver' },
        });
        expect(user.fields?.badge).toBe('silver');
    });
});

// ---------------------------------------------------------------------------
// update: validation + coercion
// ---------------------------------------------------------------------------

describe('usersApi.update — validation', () => {
    it('rejects when a required field is removed on update', async () => {
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi' },
        });
        await expect(
            usersApi.update({ id: user.id, data: { fields: { bio: '' } } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { bio: ['This field is required'] },
        });
    });

    it('persists coerced values on valid update', async () => {
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi' },
        });
        const updated = await usersApi.update({
            id: user.id,
            data: {
                fields: { bio: 'Updated', handle: 'New Handle' },
            },
        });
        expect(updated.fields?.handle).toBe('new-handle');
    });
});

// ---------------------------------------------------------------------------
// update: uniqueness excludes self
// ---------------------------------------------------------------------------

describe('usersApi.update — uniqueness self-exclusion', () => {
    it('does not trip "Already in use" when the user keeps its own badge', async () => {
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi', badge: 'mycode' },
        });
        const updated = await usersApi.update({
            id: user.id,
            data: {
                fields: { bio: 'Updated', badge: 'mycode' },
            },
        });
        expect(updated.fields?.badge).toBe('mycode');
    });

    it('rejects when badge collides with a different user', async () => {
        await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi', badge: 'taken' },
        });
        const bob = await usersApi.create({
            email: uniqueEmail(),
            name: 'Bob',
            fields: { bio: 'Hey', badge: 'free' },
        });
        await expect(
            usersApi.update({
                id: bob.id,
                data: { fields: { bio: 'Hey', badge: 'taken' } },
            })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { badge: ['Already in use'] },
        });
    });
});

// ---------------------------------------------------------------------------
// update: no fields → skips validation
// ---------------------------------------------------------------------------

describe('usersApi.update — no fields key', () => {
    it('updates name without triggering field validation', async () => {
        const user = await usersApi.create({
            email: uniqueEmail(),
            name: 'Alice',
            fields: { bio: 'Hi' },
        });
        const updated = await usersApi.update({ id: user.id, data: { name: 'Alicia' } });
        expect(updated.name).toBe('Alicia');
    });
});
