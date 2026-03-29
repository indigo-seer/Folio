import { type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'

interface FloatingToolbarProps {
    editor: Editor
}

export function FloatingToolbar({ editor }: FloatingToolbarProps) {
    return (
        <BubbleMenu
            editor={editor}
            pluginKey="textFormattingToolbar"
            shouldShow={({ editor: currentEditor, state }) => {
                const { empty } = state.selection
                if (empty) return false
                return !currentEditor.isActive('table')
            }}
        >
            <div className="floating-toolbar">
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={editor.isActive('bold') ? 'is-active' : ''}
                    title="Bold (Ctrl+B)"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                        <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                    </svg>
                </button>

                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={editor.isActive('italic') ? 'is-active' : ''}
                    title="Italic (Ctrl+I)"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="4" x2="10" y2="4" />
                        <line x1="14" y1="20" x2="5" y2="20" />
                        <line x1="15" y1="4" x2="9" y2="20" />
                    </svg>
                </button>

                <button
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={editor.isActive('strike') ? 'is-active' : ''}
                    title="Strikethrough"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6" />
                        <path d="M8 20h7a3 3 0 0 0 3-3v0a3 3 0 0 0-3-3H6" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                    </svg>
                </button>

                <button
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    className={editor.isActive('highlight') ? 'is-active' : ''}
                    title="Highlight"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 18H21" />
                        <path d="m16 5.5 2.5 2.5" />
                        <path d="m5.5 16 11-11" />
                        <path d="m4.5 17.5 2 2" />
                        <path d="M6 14 3.5 11.5a2.12 2.12 0 0 1 3-3L9 11" />
                        <path d="m11 11 5 5-2.5 2.5" />
                    </svg>
                </button>

                <div className="w-px h-5 bg-folio-border dark:bg-folio-dark-border mx-0.5" />

                <button
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={editor.isActive('code') ? 'is-active' : ''}
                    title="Inline Code"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                    </svg>
                </button>

                <button
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={editor.isActive('blockquote') ? 'is-active' : ''}
                    title="Blockquote"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                        <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
                    </svg>
                </button>
            </div>
        </BubbleMenu>
    )
}
