/**
 * The `astromech/methods` barrel.
 *
 * An external plugin reaches the dispatch and policy seams only through this
 * file, so a dropped re-export is a broken package, not a broken import here.
 */

import { describe, expect, it } from 'vitest';
import * as methods from '@/exports/methods';
import { buildDispatch, buildScopedDispatch } from '@/transport/tools/dispatch';
import { buildScopedTools } from '@/transport/tools/scoped-tools';
import { filterMethods } from '@/policies/method-filter';
import { annotateManifest } from '@/policies/annotate-manifest';
import { scopedServices } from '@/policies/scoped-services';
import {
    CONFIRM_KEY,
    evaluateConfirmation,
    triggersConfirmation,
} from '@/policies/confirmation';
import { getMethodManifest } from '@/codegen/manifest-registry';
import { formatAIContextMessage } from '@/utilities/ai-context';

// Types, asserted structurally: an unexported one fails the typecheck, not this.
import type {
    ConfirmDecision,
    ConfirmOptions,
    ConfirmOutcome,
    ConfirmRequest,
    DispatchResult,
    ScopedServices,
    ToolDefinition,
} from '@/exports/methods';

export type Exported = [
    ConfirmDecision,
    ConfirmOptions,
    ConfirmOutcome,
    ConfirmRequest,
    DispatchResult,
    ScopedServices,
    ToolDefinition,
];

describe('astromech/methods', () => {
    it('re-exports every seam it claims, unwrapped', () => {
        expect(methods.getMethodManifest).toBe(getMethodManifest);
        expect(methods.buildDispatch).toBe(buildDispatch);
        expect(methods.buildScopedDispatch).toBe(buildScopedDispatch);
        expect(methods.buildScopedTools).toBe(buildScopedTools);
        expect(methods.filterMethods).toBe(filterMethods);
        expect(methods.annotateManifest).toBe(annotateManifest);
        expect(methods.scopedServices).toBe(scopedServices);
        expect(methods.evaluateConfirmation).toBe(evaluateConfirmation);
        expect(methods.triggersConfirmation).toBe(triggersConfirmation);
        expect(methods.CONFIRM_KEY).toBe(CONFIRM_KEY);
        expect(methods.formatAIContextMessage).toBe(formatAIContextMessage);
    });

    it('exports nothing beyond that surface', () => {
        expect(Object.keys(methods).sort()).toEqual([
            'CONFIRM_KEY',
            'annotateManifest',
            'buildDispatch',
            'buildScopedDispatch',
            'buildScopedTools',
            'evaluateConfirmation',
            'filterMethods',
            'formatAIContextMessage',
            'getMethodManifest',
            'scopedServices',
            'triggersConfirmation',
        ]);
    });
});
