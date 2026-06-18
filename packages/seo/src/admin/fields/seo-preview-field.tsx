/**
 * Renderer for the presentational `seo-preview` field: a search-result (SERP)
 * mock that reads its sibling `title`/`description` values via `useFieldValue`.
 * Stores no data of its own. Composes public `astromech/ui` only (spec §8).
 */

import React from 'react';
import type { BaseFieldProps } from 'astromech';
import { useAstromechPlugin, useFieldValue } from 'astromech/ui';
import { SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from '../../utilities/length.js';
import './seo-preview-field.css';

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export default function SeoPreviewField(_props: BaseFieldProps): React.ReactElement {
    const { t } = useAstromechPlugin();
    const title = asString(useFieldValue('title'));
    const description = asString(useFieldValue('description'));

    return (
        <div className="am-seo-preview" aria-hidden="true">
            <p
                className={[
                    'am-seo-preview-title',
                    title ? '' : 'am-seo-preview--placeholder',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                {truncate(
                    title || t('field.previewTitlePlaceholder'),
                    SEO_TITLE_RANGE.max
                )}
            </p>
            <p
                className={[
                    'am-seo-preview-description',
                    description ? '' : 'am-seo-preview--placeholder',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                {truncate(
                    description || t('field.previewDescriptionPlaceholder'),
                    SEO_DESCRIPTION_RANGE.max
                )}
            </p>
        </div>
    );
}
