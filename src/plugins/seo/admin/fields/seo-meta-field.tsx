/**
 * Renderer for the `seo-meta` field type: meta title + description with
 * length counters, non-AI length recommendations, and a search-result
 * preview. Composes the public `astromech/ui` atoms only (spec §8).
 */

import React from 'react';
import type { BaseFieldProps } from 'astromech';
import { Input, Textarea, useAstromechPlugin } from 'astromech/ui';
import type { LengthRange } from '../../shared.js';
import {
    SEO_DESCRIPTION_RANGE,
    SEO_TITLE_RANGE,
    lengthStatus,
    parseSeoMetaValue,
} from '../../shared.js';
import './seo-meta-field.css';

function SubFieldHeader({
    id,
    label,
    length,
    range,
}: {
    id: string;
    label: string;
    length: number;
    range: LengthRange;
}): React.ReactElement {
    const { t } = useAstromechPlugin();
    const status = lengthStatus(length, range);
    return (
        <div className="am-seo-meta-header">
            <label className="am-seo-meta-label" htmlFor={id}>
                {label}
            </label>
            <span
                className={`am-seo-meta-counter am-seo-meta-counter--${status}`}
                title={t(`field.status.${status}`, { min: range.min, max: range.max })}
            >
                {t('field.counter', { length, max: range.max })}
            </span>
        </div>
    );
}

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function SeoMetaField({
    name,
    value,
    onChange,
    disabled,
}: BaseFieldProps): React.ReactElement {
    const { t } = useAstromechPlugin();
    const meta = parseSeoMetaValue(value);
    const title = meta.title ?? '';
    const description = meta.description ?? '';

    function handleChange(key: 'title' | 'description', next: string): void {
        onChange(name, { ...meta, [key]: next });
    }

    function hintFor(length: number, range: LengthRange): string | null {
        const status = lengthStatus(length, range);
        if (status === 'good' || status === 'empty') return null;
        return t(`field.status.${status}`, { min: range.min, max: range.max });
    }

    const titleHint = hintFor(title.length, SEO_TITLE_RANGE);
    const descriptionHint = hintFor(description.length, SEO_DESCRIPTION_RANGE);

    return (
        <div className="am-seo-meta">
            <div className="am-seo-meta-sub">
                <SubFieldHeader
                    id={`${name}-title`}
                    label={t('field.titleLabel')}
                    length={title.length}
                    range={SEO_TITLE_RANGE}
                />
                <Input
                    id={`${name}-title`}
                    type="text"
                    name={`${name}-title`}
                    value={title}
                    disabled={disabled}
                    onChange={(e) => handleChange('title', e.target.value)}
                />
                {titleHint !== null && <p className="am-seo-meta-hint">{titleHint}</p>}
            </div>

            <div className="am-seo-meta-sub">
                <SubFieldHeader
                    id={`${name}-description`}
                    label={t('field.descriptionLabel')}
                    length={description.length}
                    range={SEO_DESCRIPTION_RANGE}
                />
                <Textarea
                    id={`${name}-description`}
                    name={`${name}-description`}
                    value={description}
                    rows={3}
                    disabled={disabled}
                    onChange={(e) => handleChange('description', e.target.value)}
                />
                {descriptionHint !== null && (
                    <p className="am-seo-meta-hint">{descriptionHint}</p>
                )}
            </div>

            <div className="am-seo-meta-preview" aria-hidden="true">
                <p className="am-seo-meta-preview-caption">{t('field.previewCaption')}</p>
                <p
                    className={[
                        'am-seo-meta-preview-title',
                        title ? '' : 'am-seo-meta-preview--placeholder',
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
                        'am-seo-meta-preview-description',
                        description ? '' : 'am-seo-meta-preview--placeholder',
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
        </div>
    );
}

export function validate(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
        return 'SEO metadata must be an object with title and description.';
    }
    return undefined;
}
