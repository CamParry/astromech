import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';

export type RichTextEditorProps = {
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
};

export function RichTextEditor({ value = '', onChange, disabled }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [StarterKit],
        content: value,
        editable: !disabled,
        editorProps: {
            attributes: {
                class: 'am-richtext-content',
            },
        },
    });

    useEffect(() => {
        if (!editor) return;
        const handleUpdate = () => onChange?.(editor.getHTML());
        editor.on('update', handleUpdate);
        return () => { editor.off('update', handleUpdate); };
    }, [editor, onChange]);

    if (!editor) return null;

    return (
        <div className="am-richtext">
            {!disabled && (
                <div className="am-richtext-toolbar">
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={editor.isActive('bold') ? 'am-richtext-btn-active' : ''}
                        aria-label="Bold"
                    >
                        B
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={editor.isActive('italic') ? 'am-richtext-btn-active' : ''}
                        aria-label="Italic"
                    >
                        I
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={editor.isActive('heading', { level: 2 }) ? 'am-richtext-btn-active' : ''}
                        aria-label="Heading 2"
                    >
                        H2
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        className={editor.isActive('heading', { level: 3 }) ? 'am-richtext-btn-active' : ''}
                        aria-label="Heading 3"
                    >
                        H3
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={editor.isActive('bulletList') ? 'am-richtext-btn-active' : ''}
                        aria-label="Bullet List"
                    >
                        UL
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={editor.isActive('orderedList') ? 'am-richtext-btn-active' : ''}
                        aria-label="Ordered List"
                    >
                        OL
                    </button>
                </div>
            )}
            <EditorContent editor={editor} />
        </div>
    );
}
