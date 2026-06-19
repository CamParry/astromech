/**
 * Unit tests for buildTools — pure function, no I/O, no service invocation.
 */

import { describe, it, expect } from 'vitest';
import { buildTools } from '@/transport/mcp/tools.js';

// ============================================================================
// Sample manifest
// ============================================================================

const sampleManifest = {
    version: 1,
    methods: [
        // core — users
        {
            name: 'users.create',
            summary: 'Create a new CMS user.',
            source: 'core' as const,
            mutates: true,
            destructive: false,
            idempotent: false,
        },
        {
            name: 'users.get',
            summary: 'Read one user by id.',
            source: 'core' as const,
            mutates: false,
            destructive: false,
            idempotent: false,
        },
        // core — settings
        {
            name: 'settings.set',
            summary: 'Write a setting.',
            source: 'core' as const,
            mutates: true,
            destructive: false,
            idempotent: true,
        },
        // entries — post
        {
            name: 'entries.create',
            summary: 'Create a "post" entry.',
            source: 'entries' as const,
            entryType: 'post',
            mount: 'root',
            mutates: true,
            destructive: false,
            idempotent: false,
        },
        {
            name: 'entries.delete',
            summary: 'Delete a "post" entry.',
            source: 'entries' as const,
            entryType: 'post',
            mount: 'root',
            mutates: true,
            destructive: true,
            idempotent: false,
        },
        {
            name: 'entries.get',
            summary: 'Get a "post" entry.',
            source: 'entries' as const,
            entryType: 'post',
            mount: 'root',
            mutates: false,
            destructive: false,
            idempotent: false,
        },
        {
            name: 'entries.publish',
            summary: 'Publish a "post" entry.',
            source: 'entries' as const,
            entryType: 'post',
            mount: 'root',
            mutates: true,
            destructive: false,
            idempotent: false,
        },
        // plugin — should be skipped
        {
            name: 'plugins.foo.bar',
            summary: 'A plugin method.',
            source: 'plugin' as const,
            plugin: 'foo',
            mutates: true,
            destructive: false,
            idempotent: false,
        },
        // media.upload — no adapter → skipped
        {
            name: 'media.upload',
            summary: 'Upload a file.',
            source: 'core' as const,
            mutates: true,
            destructive: false,
            idempotent: false,
        },
    ],
};

// ============================================================================
// Tests
// ============================================================================

describe('buildTools', () => {
    it('returns tools + dispatch + skipped', () => {
        const result = buildTools(sampleManifest);
        expect(result).toHaveProperty('tools');
        expect(result).toHaveProperty('dispatch');
        expect(result).toHaveProperty('skipped');
    });

    it('sanitizes tool names (dots → underscores)', () => {
        const { tools } = buildTools(sampleManifest);
        const names = tools.map((t) => t.name);
        expect(names).toContain('users_create');
        expect(names).toContain('entries_post_create');
        expect(names).toContain('entries_post_delete');
        // No dots in any name
        for (const name of names) {
            expect(name).not.toContain('.');
        }
    });

    it('puts plugin + media.upload in skipped, not in tools', () => {
        const { tools, skipped } = buildTools(sampleManifest);
        const toolNames = tools.map((t) => t.name);

        // Plugin method should be skipped
        const skippedNames = skipped.join(' ');
        expect(skippedNames).toContain('plugins.foo.bar');

        // media.upload should be skipped (no adapter)
        expect(skippedNames).toContain('media.upload');

        // Neither should appear as a tool
        expect(toolNames).not.toContain('plugins_foo_bar');
        expect(toolNames).not.toContain('media_upload');
    });

    it('annotations: users_create → readOnlyHint:false', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'users_create');
        expect(tool).toBeDefined();
        expect(tool?.annotations.readOnlyHint).toBe(false);
    });

    it('annotations: users_get → readOnlyHint:true', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'users_get');
        expect(tool).toBeDefined();
        expect(tool?.annotations.readOnlyHint).toBe(true);
    });

    it('annotations: entries_post_delete → destructiveHint:true', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'entries_post_delete');
        expect(tool).toBeDefined();
        expect(tool?.annotations.destructiveHint).toBe(true);
    });

    it('annotations: settings_set → idempotentHint:true', () => {
        const { tools } = buildTools(sampleManifest);
        const tool = tools.find((t) => t.name === 'settings_set');
        expect(tool).toBeDefined();
        expect(tool?.annotations.idempotentHint).toBe(true);
    });

    it('each tool has an object inputSchema', () => {
        const { tools } = buildTools(sampleManifest);
        for (const tool of tools) {
            expect(typeof tool.inputSchema).toBe('object');
            expect(tool.inputSchema).not.toBeNull();
        }
    });

    it('entries get/publish/delete tools require id in inputSchema.required', () => {
        const { tools } = buildTools(sampleManifest);

        for (const toolName of [
            'entries_post_get',
            'entries_post_publish',
            'entries_post_delete',
        ]) {
            const tool = tools.find((t) => t.name === toolName);
            expect(tool).toBeDefined();
            const required = (tool?.inputSchema as { required?: string[] }).required;
            expect(required).toContain('id');
        }
    });

    it('dispatch map contains entries for all non-skipped tools', () => {
        const { tools, dispatch } = buildTools(sampleManifest);
        for (const tool of tools) {
            expect(dispatch.has(tool.name)).toBe(true);
        }
    });

    it('entries tool with non-root mount uses mount in name', () => {
        const manifestWithMount = {
            version: 1,
            methods: [
                {
                    name: 'entries.get',
                    summary: 'Get a "redirect" entry.',
                    source: 'entries' as const,
                    entryType: 'redirect',
                    mount: 'redirects',
                    mutates: false,
                    destructive: false,
                    idempotent: false,
                },
            ],
        };
        const { tools } = buildTools(manifestWithMount);
        expect(tools[0]?.name).toBe('entries_redirects_redirect_get');
    });
});
