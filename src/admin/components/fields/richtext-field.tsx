import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import { formatValueForInput } from '@/utils/field-formatters';
import './richtext-field.css';

export function RichtextField({ name, value, field, required, onChange, disabled }: BaseFieldProps) {
  const stringValue = formatValueForInput(value, 'richtext');
  const [content, setContent] = useState(stringValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: stringValue,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'am-richtext__content',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const html = editor.getHTML();
      setContent(html);
      if (inputRef.current) {
        inputRef.current.value = html;
      }
      onChange(name, html);
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, name, onChange]);

  if (!editor) {
    return null;
  }

  return (
    <div className="am-richtext">
      {!disabled && <div className="am-richtext__toolbar">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'am-richtext__btn--active' : ''}
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'am-richtext__btn--active' : ''}
          aria-label="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'am-richtext__btn--active' : ''}
          aria-label="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'am-richtext__btn--active' : ''}
          aria-label="Heading 3"
        >
          H3
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'am-richtext__btn--active' : ''}
          aria-label="Bullet List"
        >
          UL
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'am-richtext__btn--active' : ''}
          aria-label="Ordered List"
        >
          OL
        </button>
      </div>}
      <EditorContent editor={editor} />
      <input
        ref={inputRef}
        type="hidden"
        name={name}
        value={content}
        onChange={() => {}}
        required={required}
      />
    </div>
  );
}
