import React, { useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import type { JSONContent, Editor } from '@tiptap/core';
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    Link as LinkIcon,
    List,
    ListOrdered,
    Quote,
    Minus,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Undo,
    Redo,
    ChevronDown,
    WrapText,
} from 'lucide-react';
import { buildRichTextExtensions, type RichTextAllow } from './rich-text-extensions.js';

// ============================================================================
// Types
// ============================================================================

export type RichTextEditorProps = {
    value?: JSONContent;
    onChange?: (value: JSONContent) => void;
    disabled?: boolean;
    allow?: RichTextAllow;
    placeholder?: string;
};

// ============================================================================
// Helpers
// ============================================================================

const on = (allow: RichTextAllow | undefined, key: keyof RichTextAllow): boolean =>
    allow === undefined || allow[key] !== false;

const BLOCK_TYPES = [
    { label: 'Paragraph', value: 'paragraph' },
    { label: 'Heading 1', value: 'heading-1' },
    { label: 'Heading 2', value: 'heading-2' },
    { label: 'Heading 3', value: 'heading-3' },
    { label: 'Heading 4', value: 'heading-4' },
    { label: 'Heading 5', value: 'heading-5' },
    { label: 'Heading 6', value: 'heading-6' },
] as const;

type BlockValue = (typeof BLOCK_TYPES)[number]['value'];

// ============================================================================
// Link popover state
// ============================================================================

type LinkPopoverState = { open: false } | { open: true; href: string; newTab: boolean };

// ============================================================================
// Toolbar button
// ============================================================================

type ToolbarButtonProps = {
    onClick: () => void;
    active: boolean | undefined;
    disabled?: boolean;
    ariaLabel: string;
    children: React.ReactNode;
};

function ToolbarButton({
    onClick,
    active,
    disabled,
    ariaLabel,
    children,
}: ToolbarButtonProps): React.ReactElement {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-pressed={active}
            className={['am-richtext-btn', active ? 'am-richtext-btn--active' : '']
                .filter(Boolean)
                .join(' ')}
        >
            {children}
        </button>
    );
}

// ============================================================================
// Block type dropdown
// ============================================================================

type BlockDropdownProps = {
    allow: RichTextAllow | undefined;
    currentBlock: BlockValue;
    onSelect: (value: BlockValue) => void;
};

function BlockDropdown({
    allow,
    currentBlock,
    onSelect,
}: BlockDropdownProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const handleSelect = useCallback(
        (value: BlockValue) => {
            onSelect(value);
            setOpen(false);
        },
        [onSelect]
    );

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
    }, []);

    const available = BLOCK_TYPES.filter((bt) => {
        if (bt.value === 'paragraph') return true;
        return on(allow, 'heading');
    });

    const current = BLOCK_TYPES.find((bt) => bt.value === currentBlock) ??
        BLOCK_TYPES[0] ?? { label: 'Paragraph', value: 'paragraph' as const };

    return (
        <div className="am-richtext-block-dropdown" ref={ref} onKeyDown={handleKeyDown}>
            <button
                type="button"
                aria-label="Block type"
                aria-haspopup="listbox"
                aria-expanded={open}
                className="am-richtext-block-trigger"
                onClick={() => {
                    setOpen((v) => !v);
                }}
            >
                <span>{current.label}</span>
                <ChevronDown size={14} aria-hidden="true" />
            </button>
            {open && (
                <ul
                    role="listbox"
                    aria-label="Block type"
                    className="am-richtext-block-list"
                >
                    {available.map((bt) => (
                        <li
                            key={bt.value}
                            role="option"
                            aria-selected={bt.value === currentBlock}
                            className={[
                                'am-richtext-block-option',
                                bt.value === currentBlock
                                    ? 'am-richtext-block-option--selected'
                                    : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            tabIndex={0}
                            onClick={() => {
                                handleSelect(bt.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleSelect(bt.value);
                                }
                            }}
                        >
                            {bt.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ============================================================================
// Link popover
// ============================================================================

type LinkPopoverProps = {
    state: LinkPopoverState;
    onApply: (href: string, newTab: boolean) => void;
    onRemove: () => void;
    onClose: () => void;
};

function LinkPopover({
    state,
    onApply,
    onRemove,
    onClose,
}: LinkPopoverProps): React.ReactElement | null {
    const [href, setHref] = useState(state.open ? state.href : '');
    const [newTab, setNewTab] = useState(state.open ? state.newTab : false);

    if (!state.open) return null;

    const handleSubmit = (e: React.FormEvent): void => {
        e.preventDefault();
        onApply(href, newTab);
    };

    return (
        <div className="am-richtext-link-popover" role="dialog" aria-label="Edit link">
            <form onSubmit={handleSubmit} className="am-richtext-link-form">
                <input
                    type="url"
                    value={href}
                    onChange={(e) => {
                        setHref(e.target.value);
                    }}
                    placeholder="https://…"
                    className="am-richtext-link-input"
                    aria-label="Link URL"
                    autoFocus
                />
                <label className="am-richtext-link-newtab">
                    <input
                        type="checkbox"
                        checked={newTab}
                        onChange={(e) => {
                            setNewTab(e.target.checked);
                        }}
                        aria-label="Open in new tab"
                    />
                    New tab
                </label>
                <button
                    type="submit"
                    className="am-richtext-link-apply"
                    aria-label="Apply link"
                >
                    Apply
                </button>
                {state.href !== '' && (
                    <button
                        type="button"
                        className="am-richtext-link-remove"
                        onClick={onRemove}
                        aria-label="Remove link"
                    >
                        Remove
                    </button>
                )}
                <button
                    type="button"
                    className="am-richtext-link-cancel"
                    onClick={onClose}
                    aria-label="Cancel"
                >
                    Cancel
                </button>
            </form>
        </div>
    );
}

// ============================================================================
// Editor component
// ============================================================================

export function RichTextEditor({
    value,
    onChange,
    disabled,
    allow,
    placeholder,
}: RichTextEditorProps): React.ReactElement | null {
    const [linkPopover, setLinkPopover] = useState<LinkPopoverState>({ open: false });

    const editorOptions = {
        extensions: buildRichTextExtensions(allow, placeholder),
        editable: !disabled,
        immediatelyRender: false as const,
        shouldRerenderOnTransaction: true,
        editorProps: {
            attributes: {
                class: 'am-richtext-content',
            },
        },
        onUpdate: ({ editor: ed }: { editor: Editor }) => {
            onChange?.(ed.getJSON());
        },
        ...(value !== undefined ? { content: value } : {}),
    };

    const editor = useEditor(editorOptions);

    // Isolated state reads — avoid full re-render on every transaction.
    const editorState = useEditorState({
        editor,
        selector: (ctx) => {
            const ed = ctx.editor;
            if (!ed) {
                return {
                    isBold: false,
                    isItalic: false,
                    isUnderline: false,
                    isStrike: false,
                    isCode: false,
                    isLink: false,
                    isBullet: false,
                    isOrdered: false,
                    isBlockquote: false,
                    isAlignLeft: false,
                    isAlignCenter: false,
                    isAlignRight: false,
                    isAlignJustify: false,
                    isBalance: false,
                    canUndo: false,
                    canRedo: false,
                    currentBlock: 'paragraph' as BlockValue,
                    linkHref: '',
                    linkTarget: '',
                };
            }
            let currentBlock: BlockValue = 'paragraph';
            for (let i = 1; i <= 6; i++) {
                if (ed.isActive('heading', { level: i })) {
                    currentBlock = `heading-${i}` as BlockValue;
                    break;
                }
            }
            const blockType = ed.isActive('heading') ? 'heading' : 'paragraph';
            return {
                isBold: ed.isActive('bold'),
                isItalic: ed.isActive('italic'),
                isUnderline: ed.isActive('underline'),
                isStrike: ed.isActive('strike'),
                isCode: ed.isActive('code'),
                isLink: ed.isActive('link'),
                isBullet: ed.isActive('bulletList'),
                isOrdered: ed.isActive('orderedList'),
                isBlockquote: ed.isActive('blockquote'),
                isAlignLeft: ed.isActive({ textAlign: 'left' }),
                isAlignCenter: ed.isActive({ textAlign: 'center' }),
                isAlignRight: ed.isActive({ textAlign: 'right' }),
                isAlignJustify: ed.isActive({ textAlign: 'justify' }),
                isBalance: ed.getAttributes(blockType)['balance'] === true,
                canUndo: ed.can().undo(),
                canRedo: ed.can().redo(),
                currentBlock,
                linkHref: (ed.getAttributes('link')['href'] as string | undefined) ?? '',
                linkTarget:
                    (ed.getAttributes('link')['target'] as string | undefined) ?? '',
            };
        },
    });

    if (!editor) return null;

    const handleBlockSelect = (blockValue: BlockValue): void => {
        if (blockValue === 'paragraph') {
            editor.chain().focus().setParagraph().run();
        } else {
            const level = parseInt(blockValue.replace('heading-', ''), 10) as
                | 1
                | 2
                | 3
                | 4
                | 5
                | 6;
            editor.chain().focus().toggleHeading({ level }).run();
        }
    };

    const handleLinkOpen = (): void => {
        setLinkPopover({
            open: true,
            href: editorState?.linkHref ?? '',
            newTab: editorState?.linkTarget === '_blank',
        });
    };

    const handleLinkApply = (href: string, newTab: boolean): void => {
        if (href === '') {
            editor.chain().focus().unsetLink().run();
        } else {
            editor
                .chain()
                .focus()
                .setLink({
                    href,
                    target: newTab ? '_blank' : null,
                    rel: newTab ? 'noopener noreferrer' : null,
                })
                .run();
        }
        setLinkPopover({ open: false });
    };

    const handleLinkRemove = (): void => {
        editor.chain().focus().unsetLink().run();
        setLinkPopover({ open: false });
    };

    return (
        <div className="am-richtext">
            {!disabled && (
                <div
                    className="am-richtext-toolbar"
                    role="toolbar"
                    aria-label="Text formatting"
                >
                    <BlockDropdown
                        allow={allow}
                        currentBlock={editorState?.currentBlock ?? 'paragraph'}
                        onSelect={handleBlockSelect}
                    />

                    <div className="am-richtext-toolbar-sep" role="separator" />

                    {on(allow, 'bold') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleBold().run();
                            }}
                            active={editorState?.isBold}
                            ariaLabel="Bold"
                        >
                            <Bold size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'italic') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleItalic().run();
                            }}
                            active={editorState?.isItalic}
                            ariaLabel="Italic"
                        >
                            <Italic size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'underline') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleUnderline().run();
                            }}
                            active={editorState?.isUnderline}
                            ariaLabel="Underline"
                        >
                            <Underline size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'strike') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleStrike().run();
                            }}
                            active={editorState?.isStrike}
                            ariaLabel="Strikethrough"
                        >
                            <Strikethrough size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'code') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleCode().run();
                            }}
                            active={editorState?.isCode}
                            ariaLabel="Inline code"
                        >
                            <Code size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'link') && (
                        <ToolbarButton
                            onClick={handleLinkOpen}
                            active={editorState?.isLink}
                            ariaLabel="Link"
                        >
                            <LinkIcon size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    <div className="am-richtext-toolbar-sep" role="separator" />

                    {on(allow, 'bulletList') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleBulletList().run();
                            }}
                            active={editorState?.isBullet}
                            ariaLabel="Bullet list"
                        >
                            <List size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'orderedList') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleOrderedList().run();
                            }}
                            active={editorState?.isOrdered}
                            ariaLabel="Ordered list"
                        >
                            <ListOrdered size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'blockquote') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().toggleBlockquote().run();
                            }}
                            active={editorState?.isBlockquote}
                            ariaLabel="Blockquote"
                        >
                            <Quote size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'horizontalRule') && (
                        <ToolbarButton
                            onClick={() => {
                                editor.chain().focus().setHorizontalRule().run();
                            }}
                            active={false}
                            ariaLabel="Horizontal rule"
                        >
                            <Minus size={16} aria-hidden="true" />
                        </ToolbarButton>
                    )}

                    {on(allow, 'textAlign') && (
                        <>
                            <div className="am-richtext-toolbar-sep" role="separator" />
                            <ToolbarButton
                                onClick={() => {
                                    editor.chain().focus().setTextAlign('left').run();
                                }}
                                active={editorState?.isAlignLeft}
                                ariaLabel="Align left"
                            >
                                <AlignLeft size={16} aria-hidden="true" />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => {
                                    editor.chain().focus().setTextAlign('center').run();
                                }}
                                active={editorState?.isAlignCenter}
                                ariaLabel="Align center"
                            >
                                <AlignCenter size={16} aria-hidden="true" />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => {
                                    editor.chain().focus().setTextAlign('right').run();
                                }}
                                active={editorState?.isAlignRight}
                                ariaLabel="Align right"
                            >
                                <AlignRight size={16} aria-hidden="true" />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => {
                                    editor.chain().focus().setTextAlign('justify').run();
                                }}
                                active={editorState?.isAlignJustify}
                                ariaLabel="Align justify"
                            >
                                <AlignJustify size={16} aria-hidden="true" />
                            </ToolbarButton>
                        </>
                    )}

                    <div className="am-richtext-toolbar-sep" role="separator" />

                    <ToolbarButton
                        onClick={() => {
                            editor.chain().focus().toggleTextBalance().run();
                        }}
                        active={editorState?.isBalance}
                        ariaLabel="Balance text wrapping"
                    >
                        <WrapText size={16} aria-hidden="true" />
                    </ToolbarButton>

                    <div className="am-richtext-toolbar-sep" role="separator" />

                    <ToolbarButton
                        onClick={() => {
                            editor.chain().focus().undo().run();
                        }}
                        active={false}
                        disabled={!editorState?.canUndo}
                        ariaLabel="Undo"
                    >
                        <Undo size={16} aria-hidden="true" />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => {
                            editor.chain().focus().redo().run();
                        }}
                        active={false}
                        disabled={!editorState?.canRedo}
                        ariaLabel="Redo"
                    >
                        <Redo size={16} aria-hidden="true" />
                    </ToolbarButton>
                </div>
            )}

            {linkPopover.open && (
                <LinkPopover
                    state={linkPopover}
                    onApply={handleLinkApply}
                    onRemove={handleLinkRemove}
                    onClose={() => {
                        setLinkPopover({ open: false });
                    }}
                />
            )}

            <EditorContent editor={editor} />
        </div>
    );
}
